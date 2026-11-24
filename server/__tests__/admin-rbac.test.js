import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createApp } from "../app.js";
import { createSession, SESSION_COOKIE } from "../admin/auth.js";
import { requiredAdminRole, roleAllows } from "../admin/roles.js";

const SECRET = "x".repeat(40);
const servers = [];

const routes = [
  {
    method: "GET",
    path: "/api/admin/audit",
    handler: async () => ({ status: 200, body: { ok: "audit" } }),
  },
  {
    method: "GET",
    path: "/api/admin/rag/jobs",
    handler: async () => ({ status: 200, body: { ok: "rag" } }),
  },
  {
    method: "GET",
    path: "/api/admin/taxonomy",
    handler: async () => ({ status: 200, body: { ok: "taxonomy" } }),
  },
  {
    method: "POST",
    path: "/api/admin/taxonomy/publish",
    handler: async () => ({ status: 200, body: { ok: "publish" } }),
  },
  {
    method: "GET",
    path: "/api/admin/desconocido",
    handler: async () => ({ status: 200, body: { ok: "unknown" } }),
  },
];

function fakeDB(users) {
  return {
    query: async (sql, params) => {
      const username = params?.[0];
      const user = users[username];
      return { rows: user ? [user] : [] };
    },
  };
}

async function startApp(users) {
  const app = createApp({
    routes,
    getDB: async () => fakeDB(users),
    env: { ADMIN_SESSION_SECRET: SECRET, LOG_REQUESTS: "0" },
    logger: { error() {}, warn() {} },
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

function cookieFor(user) {
  const { token } = createSession({ user, secret: SECRET });
  return `${SESSION_COOKIE}=${token}`;
}

after(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise((resolve) => {
          server.close(resolve);
        })
    )
  );
});

test("el mapa de rutas clasifica owner, editor y deniega por defecto", () => {
  assert.equal(requiredAdminRole("GET", "/api/admin/login"), null);
  assert.equal(requiredAdminRole("GET", "/api/admin/session"), null);
  assert.equal(requiredAdminRole("GET", "/api/api/config"), null);
  assert.equal(requiredAdminRole("GET", "/api/admin/audit"), "owner");
  assert.equal(requiredAdminRole("GET", "/api/admin/apis"), "owner");
  assert.equal(requiredAdminRole("POST", "/api/admin/prompts"), "owner");
  assert.equal(requiredAdminRole("GET", "/api/admin/rag/jobs"), "editor");
  assert.equal(requiredAdminRole("GET", "/api/admin/taxonomy"), "editor");
  assert.equal(
    requiredAdminRole("POST", "/api/admin/taxonomy/publish"),
    "owner"
  );
  assert.equal(requiredAdminRole("GET", "/api/admin/nuevo"), "owner");
});

test("roleAllows respeta la jerarquía", () => {
  assert.equal(roleAllows("owner", "owner"), true);
  assert.equal(roleAllows("editor", "owner"), false);
  assert.equal(roleAllows("owner", "editor"), true);
  assert.equal(roleAllows("editor", "editor"), true);
  assert.equal(roleAllows(undefined, "editor"), false);
});

test("sin cookie responde 401", async () => {
  const base = await startApp({});
  const res = await fetch(`${base}/api/admin/audit`);
  assert.equal(res.status, 401);
});

test("editor no puede entrar a auditoría (403)", async () => {
  const base = await startApp({
    editor: { username: "editor", role: "editor", activo: true },
  });
  const res = await fetch(`${base}/api/admin/audit`, {
    headers: { cookie: cookieFor("editor") },
  });
  assert.equal(res.status, 403);
});

test("owner entra a auditoría (200)", async () => {
  const base = await startApp({
    dueno: { username: "dueno", role: "owner", activo: true },
  });
  const res = await fetch(`${base}/api/admin/audit`, {
    headers: { cookie: cookieFor("dueno") },
  });
  assert.equal(res.status, 200);
});

test("editor entra a RAG y taxonomía (200), pero no publica (403)", async () => {
  const base = await startApp({
    editor: { username: "editor", role: "editor", activo: true },
  });
  const headers = { cookie: cookieFor("editor") };

  const rag = await fetch(`${base}/api/admin/rag/jobs`, { headers });
  assert.equal(rag.status, 200);

  const tax = await fetch(`${base}/api/admin/taxonomy`, { headers });
  assert.equal(tax.status, 200);

  const publish = await fetch(`${base}/api/admin/taxonomy/publish`, {
    method: "POST",
    headers,
  });
  assert.equal(publish.status, 403);
});

test("usuario inactivo responde 401 aunque tenga cookie", async () => {
  const base = await startApp({
    baja: { username: "baja", role: "owner", activo: false },
  });
  const res = await fetch(`${base}/api/admin/audit`, {
    headers: { cookie: cookieFor("baja") },
  });
  assert.equal(res.status, 401);
});

test("una ruta admin no clasificada queda solo para owner", async () => {
  const base = await startApp({
    editor: { username: "editor", role: "editor", activo: true },
    dueno: { username: "dueno", role: "owner", activo: true },
  });
  const editor = await fetch(`${base}/api/admin/desconocido`, {
    headers: { cookie: cookieFor("editor") },
  });
  assert.equal(editor.status, 403);
  const owner = await fetch(`${base}/api/admin/desconocido`, {
    headers: { cookie: cookieFor("dueno") },
  });
  assert.equal(owner.status, 200);
});

test("acepta el driver que devuelve filas como array", async () => {
  const app = createApp({
    routes,
    getDB: async () => ({
      query: async () => [
        { username: "dueno", role: "owner", activo: true },
      ],
    }),
    env: { ADMIN_SESSION_SECRET: SECRET, LOG_REQUESTS: "0" },
    logger: { error() {}, warn() {} },
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/admin/audit`, {
    headers: { cookie: cookieFor("dueno") },
  });
  assert.equal(res.status, 200);
});
