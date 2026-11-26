/**
 * Dispositivos de confianza del panel (Sprint 26-M, fase 4).
 *
 * La cookie `woll_device` contiene `id.token`; el token se guarda como HMAC.
 * Se considera confiable si coinciden usuario, token, prefijo de red y
 * user-agent, y no está expirado ni revocado.
 */
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { parseCookies } from "./auth.js";

export const DEVICE_COOKIE = "woll_device";
export const DEVICE_TTL_DAYS = 30;
export const DEVICE_TTL_SECONDS = DEVICE_TTL_DAYS * 24 * 60 * 60;

/**
 * Prefijo de red estable para comparar ubicaciones sin guardar la IP.
 *
 * @param {string|undefined} ip
 * @returns {string}
 */
export function ipPrefix(ip) {
  const value = String(ip || "").trim();
  if (!value) return "unknown";
  if (value.includes(":")) {
    const parts = value.split(":").filter(Boolean);
    if (parts.length >= 4) return `${parts.slice(0, 4).join(":")}::/64`;
    return "unknown";
  }
  const parts = value.split(".");
  if (parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part))) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  return "unknown";
}

/**
 * @param {string} value
 * @param {string} secret
 * @returns {string}
 */
export function hashValue(value, secret) {
  return createHmac("sha256", secret).update(String(value)).digest("hex");
}

/**
 * @param {string} token
 * @param {string} stored
 * @returns {boolean}
 */
function tokenMatches(token, stored) {
  if (typeof stored !== "string" || stored.length === 0) return false;
  const actual = Buffer.from(token);
  const expected = Buffer.from(stored);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @returns {{id: string, token: string}|null}
 */
export function getDeviceCookie(req) {
  const cookies = parseCookies(req?.headers?.cookie);
  const raw = cookies[DEVICE_COOKIE];
  if (typeof raw !== "string") return null;
  const index = raw.indexOf(".");
  if (index <= 0) return null;
  const id = raw.slice(0, index);
  const token = raw.slice(index + 1);
  if (!id || !token) return null;
  return { id, token };
}

/**
 * @param {{id: string, token: string}} device
 * @param {{secure?: boolean, maxAge?: number}} [opts]
 * @returns {string}
 */
export function serializeDeviceCookie(device, opts = {}) {
  const { secure = false, maxAge = DEVICE_TTL_SECONDS } = opts;
  return [
    `${DEVICE_COOKIE}=${encodeURIComponent(`${device.id}.${device.token}`)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/**
 * Crea o rota el dispositivo tras un login con código.
 *
 * @param {{
 *   db: {query: Function},
 *   req: import("node:http").IncomingMessage,
 *   username: string,
 *   ip?: string,
 *   userAgent?: string,
 *   secret: string,
 *   now?: number
 * }} opts
 */
export async function createOrRotateDevice({
  db,
  req,
  username,
  ip,
  userAgent,
  secret,
  now = Date.now(),
}) {
  const current = getDeviceCookie(req);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashValue(token, secret);
  const prefixHash = hashValue(ipPrefix(ip), secret);
  const agentHash = hashValue(String(userAgent || ""), secret);
  const expiresAt = new Date(now + DEVICE_TTL_SECONDS * 1000).toISOString();

  if (current) {
    const rows = await db.query(
      "select id from admin.trusted_devices where id = $1 and username = $2 and revoked_at is null",
      [current.id, username]
    );
    const existing = Array.isArray(rows) ? rows[0] : rows?.rows?.[0];
    if (existing) {
      await db.query(
        `update admin.trusted_devices
            set token_hash = $2, ip_prefix_hash = $3, user_agent_hash = $4,
                expires_at = $5, last_seen_at = now(), revoked_at = null
          where id = $1`,
        [current.id, tokenHash, prefixHash, agentHash, expiresAt]
      );
      return { id: current.id, token };
    }
  }

  const id = randomUUID();
  await db.query(
    `insert into admin.trusted_devices
       (id, username, token_hash, ip_prefix_hash, user_agent_hash, expires_at)
     values ($1, $2, $3, $4, $5, $6)`,
    [id, username, tokenHash, prefixHash, agentHash, expiresAt]
  );
  return { id, token };
}

/**
 * @param {{
 *   db: {query: Function},
 *   req: import("node:http").IncomingMessage,
 *   username: string,
 *   ip?: string,
 *   userAgent?: string,
 *   secret: string,
 *   now?: number
 * }} opts
 * @returns {Promise<{ok: boolean, deviceId?: string}>}
 */
export async function findValidDevice({
  db,
  req,
  username,
  ip,
  userAgent,
  secret,
  now = Date.now(),
}) {
  const current = getDeviceCookie(req);
  if (!current) return { ok: false };

  const rows = await db.query(
    `select id, username, token_hash, ip_prefix_hash, user_agent_hash,
            expires_at, revoked_at
       from admin.trusted_devices
      where id = $1`,
    [current.id]
  );
  const row = Array.isArray(rows) ? rows[0] : rows?.rows?.[0];
  if (!row) return { ok: false };
  if (row.username !== username) return { ok: false };
  if (row.revoked_at) return { ok: false };
  if (new Date(row.expires_at).getTime() <= now) return { ok: false };

  const tokenHash = hashValue(current.token, secret);
  if (!tokenMatches(tokenHash, row.token_hash)) return { ok: false };
  if (row.ip_prefix_hash !== hashValue(ipPrefix(ip), secret)) return { ok: false };
  if (row.user_agent_hash !== hashValue(String(userAgent || ""), secret)) {
    return { ok: false };
  }

  await db.query(
    "update admin.trusted_devices set last_seen_at = now() where id = $1",
    [current.id]
  );
  return { ok: true, deviceId: current.id };
}

export async function revokeUserDevices(db, username) {
  await db.query(
    "update admin.trusted_devices set revoked_at = now() where username = $1 and revoked_at is null",
    [username]
  );
}
