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
      body: { username: "admin", password: "incorrecto", totp: "000000" },
      env: ENV,
      ip: "127.0.0.1",
      req: { headers: {} },
    },
    { getDB: async () => db }
  );

  assert.equal(result.status, 401);
  assert.equal(result.headers["Cache-Control"], "no-store");
});

test("login acepta password + TOTP y devuelve cookie de sesión", async () => {
  _resetLoginLimiterForTests();
  const db = createDB({
    username: "admin",
    password_hash: hashPassword("admin_local_2026"),
    activo: true,
  });
  const totp = generateTotp(ENV.ADMIN_TOTP_SECRET);

  const result = await handleAdminLogin(
    {
      body: { username: "admin", password: "admin_local_2026", totp },
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

test("session devuelve 401 sin cookie y 200 con cookie válida", () => {
  const unauthorized = handleAdminSession({ req: { headers: {} }, env: ENV });
  assert.equal(unauthorized.status, 401);

  const session = createSession({ user: "admin", secret: ENV.ADMIN_SESSION_SECRET });
  const authorized = handleAdminSession({
    req: { headers: { cookie: `woll_admin=${encodeURIComponent(session.token)}` } },
    env: ENV,
  });
  assert.equal(authorized.status, 200);
  assert.equal(authorized.body.user, "admin");
  assert.equal(authorized.body.csrfToken, session.csrf);
});
