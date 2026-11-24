import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createApp } from "../app.js";
import {
  buildAccessLogLine,
  createIpHasher,
  resolveRequestId,
} from "../utils/request-context.js";

const servers = [];

async function startApp({ env = {}, accessLog } = {}) {
  const app = createApp({
    routes: [
      {
        method: "GET",
        path: "/ping",
        handler: async () => ({ status: 200, body: { ok: true } }),
      },
    ],
    getDB: async () => ({ ping: async () => true }),
    env: {
      TRUST_PROXY_HOPS: "1",
      LOG_IP_SALT: "sal-de-prueba",
      ...env,
    },
    logger: { error() {}, warn() {} },
    accessLog,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
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

test("resolveRequestId conserva un id válido y reemplaza uno inválido", () => {
  assert.equal(resolveRequestId("abc-123_DEF.456"), "abc-123_DEF.456");
  assert.notEqual(resolveRequestId("id con espacios"), "id con espacios");
  assert.match(resolveRequestId(""), /^[0-9a-f-]{36}$/);
  assert.match(resolveRequestId(undefined), /^[0-9a-f-]{36}$/);
  assert.match(resolveRequestId("x"), /^[0-9a-f-]{36}$/);
});

test("createIpHasher es determinista con la misma sal y distinto con otra", () => {
  const a = createIpHasher({ LOG_IP_SALT: "s1" });
  const b = createIpHasher({ LOG_IP_SALT: "s1" });
  const c = createIpHasher({ LOG_IP_SALT: "s2" });
  assert.equal(a("1.2.3.4"), b("1.2.3.4"));
  assert.notEqual(a("1.2.3.4"), c("1.2.3.4"));
  assert.equal(a("1.2.3.4").length, 16);
  assert.equal(a(null), null);
});

test("buildAccessLogLine no incluye query ni datos de usuario", () => {
  const line = buildAccessLogLine({
    requestId: "abc-123-def",
    method: "POST",
    path: "/api/chat",
    status: 200,
    durationMs: 12.6,
    ipHash: "0123456789abcdef",
    country: "CL",
  });
  const parsed = JSON.parse(line);
  assert.equal(parsed.event, "http.request");
  assert.equal(parsed.path, "/api/chat");
  assert.equal(parsed.duration_ms, 13);
  assert.equal(parsed.ip_hash, "0123456789abcdef");
  assert.equal(parsed.level, "info");
  assert.ok(!line.includes("?"));
});

test("el request deja una línea con request_id y sin IP ni query", async () => {
  const lines = [];
  const base = await startApp({ accessLog: (line) => lines.push(line) });

  const res = await fetch(`${base}/ping?q=texto-secreto`, {
    headers: {
      "x-request-id": "pedido-12345678",
      "x-forwarded-for": "203.0.113.9",
    },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-request-id"), "pedido-12345678");

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.request_id, "pedido-12345678");
  assert.equal(entry.path, "/ping");
  assert.equal(entry.status, 200);
  assert.equal(entry.country, null);
  assert.notEqual(entry.ip_hash, "203.0.113.9");
  assert.equal(entry.ip_hash.length, 16);
  assert.ok(!lines[0].includes("texto-secreto"));
  assert.ok(!lines[0].includes("203.0.113.9"));
});

test("un x-request-id inválido se reemplaza y no se refleja", async () => {
  const lines = [];
  const base = await startApp({ accessLog: (line) => lines.push(line) });
  const res = await fetch(`${base}/ping`, {
    headers: { "x-request-id": "id con espacios y <script>" },
  });
  const header = res.headers.get("x-request-id");
  assert.match(header, /^[0-9a-f-]{36}$/);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(JSON.parse(lines[0]).request_id, header);
});
