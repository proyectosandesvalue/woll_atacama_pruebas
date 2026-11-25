/**
 * Desafíos de login por email (Sprint 26-M, fase 3).
 *
 * El código de 6 dígitos se guarda como HMAC con el secreto de sesión; nunca
 * en claro. Expira en 10 minutos, es de un solo uso y admite 5 intentos.
 */
import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

export const CHALLENGE_TTL_SECONDS = 10 * 60;
export const CHALLENGE_MAX_ATTEMPTS = 5;

/**
 * @returns {string} código de 6 dígitos con ceros a la izquierda
 */
export function generateLoginCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * @param {{ id: string, code: string, secret: string }} opts
 * @returns {string}
 */
export function hashCode({ id, code, secret }) {
  return createHmac("sha256", secret)
    .update(`${id}:${code}`)
    .digest("hex");
}

/**
 * Comparación en tiempo constante.
 *
 * @param {{ id: string, code: string, secret: string, hash: string }} opts
 * @returns {boolean}
 */
export function verifyCodeHash({ id, code, secret, hash }) {
  if (typeof hash !== "string" || hash.length === 0) return false;
  const actual = Buffer.from(hashCode({ id, code, secret }));
  const expected = Buffer.from(hash);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/**
 * Crea un desafío y devuelve el código en claro solo para enviarlo por email.
 *
 * @param {{
 *   db: {query: Function},
 *   username: string,
 *   secret: string,
 *   ipHash?: string|null,
 *   now?: number
 * }} opts
 */
export async function createChallenge({
  db,
  username,
  secret,
  ipHash = null,
  now = Date.now(),
}) {
  const id = randomUUID();
  const code = generateLoginCode();
  const codeHash = hashCode({ id, code, secret });
  const ttl = CHALLENGE_TTL_SECONDS;
  await db.query(
    `INSERT INTO admin.login_challenges
       (id, username, code_hash, expires_at, max_attempts, ip_hash)
     VALUES ($1, $2, $3, now() + make_interval(secs => $4), $5, $6)`,
    [id, username, codeHash, ttl, CHALLENGE_MAX_ATTEMPTS, ipHash]
  );
  return { id, code, expiresInSeconds: ttl, createdAt: now };
}

/**
 * Verifica y consume el desafío.
 *
 * @param {{
 *   db: {query: Function},
 *   id: string,
 *   code: string,
 *   secret: string,
 *   now?: number
 * }} opts
 * @returns {Promise<{ok: true, username: string}|{ok: false, reason: string}>}
 */
export async function verifyChallenge({ db, id, code, secret, now = Date.now() }) {
  const rows = await db.query(
    `SELECT username, code_hash, expires_at, attempts, max_attempts, consumed_at
       FROM admin.login_challenges
      WHERE id = $1`,
    [id]
  );
  const row = Array.isArray(rows) ? rows[0] : rows?.rows?.[0];
  if (!row) return { ok: false, reason: "not_found" };
  if (row.consumed_at) return { ok: false, reason: "used" };

  const expiresAt = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    return { ok: false, reason: "expired" };
  }
  if (Number(row.attempts) >= Number(row.max_attempts)) {
    return { ok: false, reason: "locked" };
  }

  const valid = verifyCodeHash({
    id,
    code: String(code || ""),
    secret,
    hash: row.code_hash,
  });

  if (!valid) {
    await db.query(
      "UPDATE admin.login_challenges SET attempts = attempts + 1 WHERE id = $1",
      [id]
    );
    return { ok: false, reason: "invalid" };
  }

  await db.query(
    "UPDATE admin.login_challenges SET consumed_at = now() WHERE id = $1",
    [id]
  );
  return { ok: true, username: row.username };
}

// ── Límite de envíos ───────────────────────────────────────
const sends = new Map();
export const SEND_WINDOW_MS = 15 * 60_000;
export const MAX_SENDS = 3;

/**
 * @param {string} username
 * @param {number} [now]
 * @returns {{allowed: boolean, retryAfter: number}}
 */
export function checkSendAllowed(username, now = Date.now()) {
  const stamps = (sends.get(username) || []).filter(
    (at) => now - at < SEND_WINDOW_MS
  );
  if (stamps.length < MAX_SENDS) return { allowed: true, retryAfter: 0 };
  const retryAfter = Math.ceil((SEND_WINDOW_MS - (now - stamps[0])) / 1000);
  return { allowed: false, retryAfter: Math.max(1, retryAfter) };
}

/**
 * @param {string} username
 * @param {number} [now]
 */
export function recordSend(username, now = Date.now()) {
  const stamps = (sends.get(username) || []).filter(
    (at) => now - at < SEND_WINDOW_MS
  );
  stamps.push(now);
  sends.set(username, stamps);
}

export function _resetSendLimiterForTests() {
  sends.clear();
}
