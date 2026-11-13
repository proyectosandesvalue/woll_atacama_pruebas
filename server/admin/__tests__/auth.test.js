import { test } from "node:test";
import assert from "node:assert/strict";

import {
  _resetLoginLimiterForTests,
  base32Decode,
  base32Encode,
  checkLoginAllowed,
  clearLoginFailures,
  createSession,
  generateTotp,
  generateTotpSecret,
  hashPassword,
  parseCookies,
  recordLoginFailure,
  serializeSessionCookie,
  verifyPassword,
  verifySession,
  verifyTotp,
} from "../auth.js";

test("hashPassword verifica el password correcto y rechaza el incorrecto", () => {
  const stored = hashPassword("admin_local_2026");
  assert.match(stored, /^scrypt\$/);
  assert.equal(verifyPassword("admin_local_2026", stored), true);
  assert.equal(verifyPassword("otro", stored), false);
  assert.equal(verifyPassword("admin_local_2026", "basura"), false);
});

test("base32 encode/decode es reversible", () => {
  const buffer = Buffer.from("woll-atacama");
  assert.deepEqual(base32Decode(base32Encode(buffer)), buffer);
  assert.throws(() => base32Decode("no-base32!"));
});

test("TOTP genera y verifica con ventana de reloj", () => {
  const secret = generateTotpSecret();
  const now = 1_760_000_000_000;
  const code = generateTotp(secret, now);

  assert.match(code, /^\d{6}$/);
  assert.equal(verifyTotp(secret, code, { now }), true);
  assert.equal(verifyTotp(secret, code, { now: now + 30_000 }), true);
  assert.equal(verifyTotp(secret, code, { now: now + 120_000 }), false);
  assert.equal(verifyTotp(secret, "000000", { now }), false);
  assert.equal(verifyTotp(secret, "abc", { now }), false);
});

test("createSession/verifySession firma y detecta manipulación", () => {
  const secret = "x".repeat(48);
  const session = createSession({ user: "admin", secret, now: 1_760_000_000_000 });

  const payload = verifySession(session.token, secret, 1_760_000_000_000);
  assert.equal(payload.sub, "admin");
  assert.equal(payload.csrf, session.csrf);

  assert.equal(verifySession(session.token, "y".repeat(48)), null);
  assert.equal(verifySession(session.token + "x", secret), null);
  assert.equal(verifySession(session.token, secret, 1_760_000_000_000 + 9 * 3600_000), null);
});

test("parseCookies y serializeSessionCookie son compatibles", () => {
  const cookie = serializeSessionCookie("abc.def", { secure: true });
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.deepEqual(parseCookies(cookie), { woll_admin: "abc.def" });
});

test("el rate limit bloquea tras 5 fallos y se limpia al éxito", () => {
  _resetLoginLimiterForTests();
  const key = "127.0.0.1|admin";
  const now = 1_760_000_000_000;

  for (let i = 0; i < 5; i += 1) {
    assert.equal(checkLoginAllowed(key, now).allowed, true);
    recordLoginFailure(key, now);
  }

  const blocked = checkLoginAllowed(key, now + 1000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfter > 0);

  clearLoginFailures(key);
  assert.equal(checkLoginAllowed(key, now + 1000).allowed, true);
});
