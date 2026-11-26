import { test } from "node:test";
import assert from "node:assert/strict";

import {
  _resetLoginLimiterForTests,
  hashPassword,
  loginFailureBurst,
  recordLoginFailure,
} from "../../admin/auth.js";
import { _resetSendLimiterForTests } from "../../admin/challenges.js";
import { createOrRotateDevice } from "../../admin/devices.js";
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
  const devices = new Map();
  const audits = [];
  return {
    pool: { query: async () => [] },
    challenges,
    devices,
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
      if (sql.includes("insert into admin.trusted_devices")) {
        const [id, username, tokenHash, prefixHash, agentHash, expiresAt] = params;
        devices.set(id, {
          id,
          username,
          token_hash: tokenHash,
          ip_prefix_hash: prefixHash,
          user_agent_hash: agentHash,
          expires_at: expiresAt,
          revoked_at: null,
        });
        return [];
      }
      if (sql.includes("from admin.trusted_devices")) {
        const row = devices.get(params[0]);
        return row ? [row] : [];
      }
      if (sql.includes("update admin.trusted_devices set token_hash")) {
        const row = devices.get(params[0]);
        if (row) {
          row.token_hash = params[1];
          row.ip_prefix_hash = params[2];
          row.user_agent_hash = params[3];
          row.expires_at = params[4];
          row.revoked_at = null;
        }
        return [];
      }
      if (sql.includes("update admin.trusted_devices set last_seen")) return [];
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
  const cookies = [].concat(verify.headers["Set-Cookie"]).join("; ");
  assert.match(cookies, /HttpOnly/);
  assert.match(cookies, /woll_device=/);
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

test("un dispositivo válido evita el código; otro user-agent lo exige", async () => {
  _resetLoginLimiterForTests();
  _resetSendLimiterForTests();
  const db = makeDB(user2fa());
  const device = await createOrRotateDevice({
    db,
    req: { headers: {} },
    username: "dueno@example.com",
    ip: "203.0.113.9",
    userAgent: "UA-A",
    secret: ENV.ADMIN_SESSION_SECRET,
  });
  let sent = 0;
  const res = await handleAdminLogin(
    {
      body: { username: "dueno@example.com", password: PASSWORD },
      env: ENV,
      ip: "203.0.113.9",
      country: "CL",
      req: {
        headers: {
          cookie: `woll_device=${device.id}.${device.token}`,
          "user-agent": "UA-A",
        },
      },
    },
    { getDB: async () => db, sendEmailImpl: async () => { sent += 1; } }
  );
  assert.equal(res.status, 200);
  assert.equal(sent, 0);

  const changed = await handleAdminLogin(
    {
      body: { username: "dueno@example.com", password: PASSWORD },
      env: ENV,
      ip: "203.0.113.9",
      country: "CL",
      req: {
        headers: {
          cookie: `woll_device=${device.id}.${device.token}`,
          "user-agent": "UA-B",
        },
      },
    },
    { getDB: async () => db, sendEmailImpl: async () => { sent += 1; } }
  );
  assert.equal(changed.status, 202);
  assert.equal(sent, 1);
});
