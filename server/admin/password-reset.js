/**
 * Recuperación de contraseña (Sprint 26-M).
 *
 * Token opaco de 32 bytes con formato `id.token`; en la base solo su HMAC.
 * Expira en 30 minutos y se usa una vez. El envío tiene límite por correo/IP.
 */
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export const RESET_TTL_SECONDS = 30 * 60;
export const RESET_COOLDOWN_MS = 60 * 1000;
export const RESET_MAX_PER_HOUR = 3;

/**
 * @param {{ id: string, token: string, secret: string }} opts
 * @returns {string}
 */
export function hashResetToken({ id, token, secret }) {
  return createHmac("sha256", secret).update(`reset:${id}:${token}`).digest("hex");
}

function matches(actual, expected) {
  if (typeof expected !== "string" || expected.length === 0) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * @param {{
 *   db: {query: Function},
 *   username: string,
 *   secret: string,
 *   ipHash?: string|null
 * }} opts
 */
export async function createResetToken({ db, username, secret, ipHash = null }) {
  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken({ id, token, secret });
  await db.query(
    `INSERT INTO admin.password_resets (id, username, token_hash, expires_at, ip_hash)
     VALUES ($1, $2, $3, now() + make_interval(secs => $4), $5)`,
    [id, username, tokenHash, RESET_TTL_SECONDS, ipHash]
  );
  return { value: `${id}.${token}`, expiresInSeconds: RESET_TTL_SECONDS };
}

/**
 * @param {{
 *   db: {query: Function},
 *   value: string,
 *   secret: string,
 *   now?: number
 * }} opts
 * @returns {Promise<{ok: true, id: string, username: string}|{ok: false, reason: string}>}
 */
export async function verifyResetToken({ db, value, secret, now = Date.now() }) {
  const raw = String(value || "");
  const index = raw.indexOf(".");
  if (index <= 0) return { ok: false, reason: "format" };
  const id = raw.slice(0, index);
  const token = raw.slice(index + 1);
  if (!token) return { ok: false, reason: "format" };

  const rows = await db.query(
    `SELECT id, username, token_hash, expires_at, used_at
       FROM admin.password_resets WHERE id = $1`,
    [id]
  );
  const row = Array.isArray(rows) ? rows[0] : rows?.rows?.[0];
  if (!row) return { ok: false, reason: "not_found" };
  if (row.used_at) return { ok: false, reason: "used" };
  if (new Date(row.expires_at).getTime() <= now) {
    return { ok: false, reason: "expired" };
  }

  const expected = hashResetToken({ id, token, secret });
  if (!matches(expected, row.token_hash)) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, id, username: row.username };
}

export async function markResetUsed(db, id) {
  await db.query(
    "UPDATE admin.password_resets SET used_at = now() WHERE id = $1",
    [id]
  );
}

// ── Límite de solicitudes ─────────────────────────────────
const requests = new Map();

/**
 * @param {string} key
 * @param {number} [now]
 */
export function checkResetRequestAllowed(key, now = Date.now()) {
  const stamps = (requests.get(key) || []).filter(
    (at) => now - at < 60 * 60_000
  );
  if (stamps.length >= RESET_MAX_PER_HOUR) {
    return { allowed: false, retryAfter: 60 };
  }
  const last = stamps[stamps.length - 1] || 0;
  if (last && now - last < RESET_COOLDOWN_MS) {
    return {
      allowed: false,
      retryAfter: Math.ceil((RESET_COOLDOWN_MS - (now - last)) / 1000),
    };
  }
  return { allowed: true, retryAfter: 0 };
}

/**
 * @param {string} key
 * @param {number} [now]
 */
export function recordResetRequest(key, now = Date.now()) {
  const stamps = (requests.get(key) || []).filter(
    (at) => now - at < 60 * 60_000
  );
  stamps.push(now);
  requests.set(key, stamps);
}

export function _resetResetLimiterForTests() {
  requests.clear();
}
