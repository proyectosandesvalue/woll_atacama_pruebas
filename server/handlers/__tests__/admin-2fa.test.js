import { test } from "node:test";
import assert from "node:assert/strict";

import {
  _resetLoginLimiterForTests,
  hashPassword,
  loginFailureBurst,
  recordLoginFailure,
} from "../../admin/auth.js";
import { _resetSendLimiterForTests } from "../../admin/challenges.js";
import {
  _resetBurstNotifierForTests,
  handleAdminLogin,
  handleAdminLoginVerify,
} from "../admin.js";

const PASSWORD = "clave_de_prueba_2026";
const ENV = {
  NODE_ENV: "development",
  ADMIN_SESSION_SECRET: "s".repeat(48),
  EMAIL_PROVIDER: "console",
};

function makeDB(user) {
  const challenges = new Map();
  const audits = [];
  return {
    pool: { query: async () => [] },
    challenges,
    audits,
    query: async (sql, params = []) => {
      if (sql.includes("FROM admin.admin_users")) return user ? [user] : [];
      if (sql.includes("INSERT INTO admin.login_challenges")) {
        const [id, username, codeHash, ttl, maxAttempts, ipHash] = params;
        challenges.set(id, {
          username,
          code_hash: codeHash,
          expires_at: new Date(Date.now() + ttl * 1000),
          attempts: 0,
          max_attempts: maxAttempts,
          consumed_at: null,
          ip_hash: ipHash,
        });
        return [];
      }
      if (sql.includes("FROM admin.login_challenges")) {
        const row = challenges.get(params[0]);
        return row ? [row] : [];
      }
      if (sql.includes("UPDATE admin.login_challenges SET attempts")) {
        const row = challenges.get(params[0]);
        if (row) row.attempts += 1;
        return [];
      }
      if (sql.includes("UPDATE admin.login_challenges SET consumed_at")) {
        const row = challenges.get(params[0]);
        if (row) row.consumed_at = new Date();
        return [];
      }
      if (sql.includes("UPDATE admin.admin_users SET last_login_at")) return [];
      if (sql.includes("INSERT INTO admin.audit_log")) {
        audits.push({ sql, params });
        return [];
      }
      return [];
    },
  };
}

function user2fa() {
  return {
    username: "dueno@example.com",
    password_hash: hashPassword(PASSWORD),
    activo: true,
    role: "owner",
    email: "dueno@example.com",
    two_factor: "email",
  };
}

function ctxLogin(db, body, sendEmailImpl) {
  return {
    ctx: {
      body,
      env: ENV,
      ip: "203.0.113.9",
      country: "CL",
      req: { headers: {} },
    },
    opts: { getDB: async () => db, sendEmailImpl },
  };
}

test("login con 2FA envía código y no crea sesión", async () => {
  _resetLoginLimiterForTests();
  _resetSendLimiterForTests();
  _resetBurstNotifierForTests();
  const db = makeDB(user2fa());
  let sent = null;
  const { ctx, opts } = ctxLogin(
    db,
    { username: "dueno@example.com", password: PASSWORD },
    async (message) => {
      sent = message;
    }
  );

  const res = await handleAdminLogin(ctx, opts);
  assert.equal(res.status, 202);
  assert.equal(res.body.two_factor_required, true);
  assert.equal(res.headers["Set-Cookie"], undefined);
  assert.equal(sent.template, "login-code");
  assert.match(sent.data.code, /^\d{6}$/);
  assert.equal(sent.to, "dueno@example.com");
  assert.equal(db.challenges.size, 1);
});

test("verify con el código correcto crea sesión y consume el desafío", async () => {
  _resetLoginLimiterForTests();
  _resetSendLimiterForTests();
  const db = makeDB(user2fa());
  let code = null;
  let challengeId = null;
  const { ctx, opts } = ctxLogin(
    db,
    { username: "dueno@example.com", password: PASSWORD },
    async (message) => {
      code = message.data.code;
      challengeId = [...db.challenges.keys()][0];
    }
  );
  const login = await handleAdminLogin(ctx, opts);
  assert.equal(login.status, 202);
  assert.ok(challengeId);

  const verify = await handleAdminLoginVerify(
    {
      body: { challenge_id: challengeId, code },
      env: ENV,
      ip: "203.0.113.9",
      req: { headers: {} },
    },
    { getDB: async () => db }
  );
  assert.equal(verify.status, 200);
  assert.equal(verify.body.role, "owner");
  assert.ok(verify.body.csrfToken);
  assert.match(verify.headers["Set-Cookie"], /HttpOnly/);
  assert.ok(db.challenges.get(challengeId).consumed_at);
});

test("verify con código incorrecto falla y no crea sesión", async () => {
  _resetLoginLimiterForTests();
  _resetSendLimiterForTests();
  const db = makeDB(user2fa());
  let challengeId = null;
  const { ctx, opts } = ctxLogin(
    db,
    { username: "dueno@example.com", password: PASSWORD },
    async () => {
      challengeId = [...db.challenges.keys()][0];
    }
  );
  await handleAdminLogin(ctx, opts);

  const verify = await handleAdminLoginVerify(
    {
      body: { challenge_id: challengeId, code: "000000" },
      env: ENV,
      ip: "203.0.113.9",
      req: { headers: {} },
    },
    { getDB: async () => db }
  );
  assert.equal(verify.status, 401);
  assert.equal(db.challenges.get(challengeId).attempts, 1);
  assert.equal(db.challenges.get(challengeId).consumed_at, null);
});

test("un desafío expirado no se puede usar", async () => {
  _resetLoginLimiterForTests();
  _resetSendLimiterForTests();
  const db = makeDB(user2fa());
  let challengeId = null;
  const { ctx, opts } = ctxLogin(
    db,
    { username: "dueno@example.com", password: PASSWORD },
    async () => {
      challengeId = [...db.challenges.keys()][0];
    }
  );
  await handleAdminLogin(ctx, opts);
  db.challenges.get(challengeId).expires_at = new Date(Date.now() - 1000);

  const verify = await handleAdminLoginVerify(
    {
      body: { challenge_id: challengeId, code: "123456" },
      env: ENV,
      ip: "203.0.113.9",
      req: { headers: {} },
    },
    { getDB: async () => db }
  );
  assert.equal(verify.status, 401);
});

test("la ráfaga se detecta a nivel global", () => {
  _resetLoginLimiterForTests();
  _resetSendLimiterForTests();
  for (let i = 0; i < 10; i++) recordLoginFailure(`ip-${i}`);
  const burst = loginFailureBurst();
  assert.equal(burst.burst, true);
  assert.ok(burst.count >= 10);
});
