import { test } from "node:test";
import assert from "node:assert/strict";

import {
  _resetLoginLimiterForTests,
  createSession,
  generateTotp,
  generateTotpSecret,
  hashPassword,
} from "../../admin/auth.js";
import {
  handleAdminLogin,
  handleAdminSession,
} from "../admin.js";

const ENV = {
  NODE_ENV: "development",
  ADMIN_SESSION_SECRET: "s".repeat(48),
  ADMIN_TOTP_SECRET: generateTotpSecret(),
};

function createDB(user) {
  return {
    pool: { query: async () => [] },
    calls: [],
    query: async (sql, params = []) => {
      if (sql.includes("FROM admin.admin_users")) return user ? [user] : [];
      return [];
    },
  };
}

test("login rechaza credenciales incorrectas y audita", async () => {
  _resetLoginLimiterForTests();
  const db = createDB({
    username: "admin",
    password_hash: hashPassword("admin_local_2026"),
    activo: true,
  });

  const result = await handleAdminLogin(
    {
      body: { username: "admin", password: "incorrecto" },
      env: ENV,
      ip: "127.0.0.1",
      req: { headers: {} },
    },
    { getDB: async () => db }
  );

  assert.equal(result.status, 401);
  assert.equal(result.headers["Cache-Control"], "no-store");
});

test("login acepta usuario y contraseña sin TOTP", async () => {
  _resetLoginLimiterForTests();
  const db = createDB({
    username: "admin",
    password_hash: hashPassword("admin_local_2026"),
    activo: true,
  });

  const result = await handleAdminLogin(
    {
      body: { username: "admin", password: "admin_local_2026" },
      env: ENV,
      ip: "127.0.0.1",
      req: { headers: {} },
    },
    { getDB: async () => db }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.user, "admin");
  assert.ok(result.body.csrfToken);
  assert.match(result.headers["Set-Cookie"], /HttpOnly/);
  assert.match(result.headers["Set-Cookie"], /SameSite=Strict/);
});

test("login exige TOTP si ADMIN_TOTP_REQUIRED=1", async () => {
  _resetLoginLimiterForTests();
  const db = createDB({
    username: "admin",
    password_hash: hashPassword("admin_local_2026"),
    activo: true,
  });
  const env = { ...ENV, ADMIN_TOTP_REQUIRED: "1" };

  const withoutTotp = await handleAdminLogin(
    {
      body: { username: "admin", password: "admin_local_2026" },
      env,
      ip: "127.0.0.1",
      req: { headers: {} },
    },
    { getDB: async () => db }
  );
  assert.equal(withoutTotp.status, 400);

  _resetLoginLimiterForTests();
  const totp = generateTotp(env.ADMIN_TOTP_SECRET);
  const withTotp = await handleAdminLogin(
    {
      body: { username: "admin", password: "admin_local_2026", totp },
      env,
      ip: "127.0.0.1",
      req: { headers: {} },
    },
    { getDB: async () => db }
  );
  assert.equal(withTotp.status, 200);
});

test("session devuelve 401 sin cookie y 200 con cookie válida", async () => {
  const unauthorized = await handleAdminSession({
    req: { headers: {} },
    env: ENV,
    getDB: async () => ({ query: async () => [] }),
  });
  assert.equal(unauthorized.status, 401);

  const session = createSession({ user: "admin", secret: ENV.ADMIN_SESSION_SECRET });
  const authorized = await handleAdminSession({
    req: { headers: { cookie: `woll_admin=${encodeURIComponent(session.token)}` } },
    env: ENV,
    getDB: async () => ({
      query: async () => [{ username: "admin", role: "owner", activo: true }],
    }),
  });
  assert.equal(authorized.status, 200);
  assert.equal(authorized.body.user, "admin");
  assert.equal(authorized.body.role, "owner");
  assert.equal(authorized.body.csrfToken, session.csrf);
});

test("session devuelve editor cuando el rol no es owner", async () => {
  const session = createSession({ user: "editor", secret: ENV.ADMIN_SESSION_SECRET });
  const res = await handleAdminSession({
    req: { headers: { cookie: `woll_admin=${encodeURIComponent(session.token)}` } },
    env: ENV,
    getDB: async () => ({
      query: async () => [{ username: "editor", role: "editor", activo: true }],
    }),
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.role, "editor");
});
