import { test } from "node:test";
import assert from "node:assert/strict";

import {
  handlePasswordForgot,
  handlePasswordReset,
} from "../admin-password.js";
import {
  _resetResetLimiterForTests,
  hashResetToken,
} from "../../admin/password-reset.js";
import { _resetLoginLimiterForTests, verifyPassword } from "../../admin/auth.js";

const ENV = {
  NODE_ENV: "development",
  ADMIN_SESSION_SECRET: "s".repeat(48),
  PUBLIC_BASE_URL: "https://visor.example.com",
  EMAIL_PROVIDER: "console",
};

function makeDB(user) {
  const resets = new Map();
  const state = { passwordHash: user.password_hash, devicesRevoked: 0, audits: [] };
  return {
    pool: { query: async () => [] },
    resets,
    state,
    query: async (sql, params = []) => {
      if (sql.includes("FROM admin.admin_users") && sql.includes("lower(username)")) {
        return [user];
      }
      if (sql.includes("FROM admin.admin_users")) return [user];
      if (sql.includes("INSERT INTO admin.password_resets")) {
        const [id, username, tokenHash, ttl, ipHash] = params;
        resets.set(id, {
          id,
          username,
          token_hash: tokenHash,
          expires_at: new Date(Date.now() + ttl * 1000),
          used_at: null,
          ip_hash: ipHash,
        });
        return [];
      }
      if (sql.includes("FROM admin.password_resets")) {
        const row = resets.get(params[0]);
        return row ? [row] : [];
      }
      if (sql.includes("UPDATE admin.password_resets SET used_at")) {
        if (sql.includes("WHERE id = $1")) {
          const row = resets.get(params[0]);
          if (row) row.used_at = new Date();
        } else {
          for (const row of resets.values()) row.used_at = new Date();
        }
        return [];
      }
      if (sql.includes("UPDATE admin.admin_users") && sql.includes("password_hash")) {
        state.passwordHash = params[1];
        return [];
      }
      if (sql.includes("trusted_devices")) {
        state.devicesRevoked += 1;
        return [];
      }
      if (sql.includes("INSERT INTO admin.audit_log")) {
        state.audits.push(params);
        return [];
      }
      return [];
    },
  };
}

function user() {
  return {
    username: "dueno@example.com",
    email: "dueno@example.com",
    password_hash: "scrypt$16384$8$1$c2FsdA$aGFzaA",
    activo: true,
    role: "owner",
  };
}

test("forgot responde 202 genérico y envía enlace si existe", async () => {
  _resetResetLimiterForTests();
  const db = makeDB(user());
  let sent = null;
  const res = await handlePasswordForgot(
    {
      body: { email: "dueno@example.com" },
      env: ENV,
      ip: "203.0.113.9",
      req: { headers: {} },
    },
    {
      getDB: async () => db,
      sendEmailImpl: async (message) => {
        sent = message;
      },
    }
  );
  assert.equal(res.status, 202);
  assert.equal(sent.template, "password-reset");
  assert.match(sent.data.link, /^https:\/\/visor\.example\.com\/admin\.html\?reset=/);
  assert.equal(db.resets.size, 1);
});

test("forgot no revela si el correo no existe", async () => {
  _resetResetLimiterForTests();
  const db = makeDB(user());
  db.query = async (sql) => (sql.includes("FROM admin.admin_users") ? [] : []);
  let sent = false;
  const res = await handlePasswordForgot(
    { body: { email: "nadie@example.com" }, env: ENV, ip: "203.0.113.9" },
    { getDB: async () => db, sendEmailImpl: async () => { sent = true; } }
  );
  assert.equal(res.status, 202);
  assert.equal(sent, false);
});

test("reset cambia la contraseña, consume el token y revoca dispositivos", async () => {
  _resetResetLimiterForTests();
  _resetLoginLimiterForTests();
  const db = makeDB(user());
  let link = null;
  await handlePasswordForgot(
    { body: { email: "dueno@example.com" }, env: ENV, ip: "203.0.113.9" },
    { getDB: async () => db, sendEmailImpl: async (m) => { link = m.data.link; } }
  );
  const token = decodeURIComponent(link.split("reset=")[1]);

  const res = await handlePasswordReset(
    {
      body: { token, password: "nueva_clave_larga_2026" },
      env: ENV,
      ip: "203.0.113.9",
    },
    { getDB: async () => db }
  );
  assert.equal(res.status, 200);
  assert.equal(db.state.devicesRevoked, 1);
  assert.ok(verifyPassword("nueva_clave_larga_2026", db.state.passwordHash));
  const row = [...db.resets.values()][0];
  assert.ok(row.used_at);
});

test("reset rechaza token inválido y contraseña corta", async () => {
  _resetResetLimiterForTests();
  _resetLoginLimiterForTests();
  const db = makeDB(user());
  const short = await handlePasswordReset(
    { body: { token: "x", password: "corta" }, env: ENV, ip: "203.0.113.9" },
    { getDB: async () => db }
  );
  assert.equal(short.status, 400);

  const invalid = await handlePasswordReset(
    { body: { token: "00000000-0000-0000-0000-000000000000.abc", password: "clave_larga_2026" }, env: ENV, ip: "203.0.113.9" },
    { getDB: async () => db }
  );
  assert.equal(invalid.status, 400);
});

test("el token expirado no sirve", async () => {
  _resetResetLimiterForTests();
  _resetLoginLimiterForTests();
  const db = makeDB(user());
  const id = "11111111-1111-1111-1111-111111111111";
  const token = "abc";
  const hash = hashResetToken({ id, token, secret: ENV.ADMIN_SESSION_SECRET });
  db.resets.set(id, {
    id,
    username: "dueno@example.com",
    token_hash: hash,
    expires_at: new Date(Date.now() - 1000),
    used_at: null,
  });
  const res = await handlePasswordReset(
    { body: { token: `${id}.${token}`, password: "clave_larga_2026" }, env: ENV, ip: "203.0.113.9" },
    { getDB: async () => db }
  );
  assert.equal(res.status, 400);
});
