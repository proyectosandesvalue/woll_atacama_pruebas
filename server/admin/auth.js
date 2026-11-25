/**
 * Autenticación del panel admin: password scrypt, sesión firmada y TOTP
 * reutilizable para flujos sensibles.
 *
 * No usa dependencias externas. El secreto TOTP y la clave de sesión viven en
 * variables de entorno, nunca en la base.
 *
 * Sprint 15 (ADR 007, docs/specs/14-15-panel-admin.md).
 */

import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

export const SESSION_COOKIE = "woll_admin";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

// ── Password (scrypt) ──────────────────────────────────────

/**
 * @param {string} password
 * @returns {string} `scrypt$N$r$p$salt$hash`
 */
export function hashPassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("El password debe tener al menos 8 caracteres.");
  }
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");
}

/**
 * @param {string} password
 * @param {string} stored
 * @returns {boolean}
 */
export function verifyPassword(password, stored) {
  if (typeof password !== "string" || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, saltB64, hashB64] = parts;
  const N = Number.parseInt(n, 10);
  const R = Number.parseInt(r, 10);
  const P = Number.parseInt(p, 10);
  if (![N, R, P].every((value) => Number.isInteger(value) && value > 0)) {
    return false;
  }

  const salt = Buffer.from(saltB64, "base64url");
  const expected = Buffer.from(hashB64, "base64url");
  if (expected.length === 0) return false;

  try {
    const actual = scryptSync(password, salt, expected.length, {
      N,
      r: R,
      p: P,
      maxmem: 64 * 1024 * 1024,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ── TOTP (RFC 6238, SHA-1) ─────────────────────────────────

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * @param {string} input
 * @returns {Buffer}
 */
export function base32Decode(input) {
  const clean = String(input)
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/=+$/g, "");
  if (!clean) throw new Error("Secreto TOTP vacío.");

  let bits = 0;
  let value = 0;
  const output = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Secreto TOTP no es base32 válido.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
      value &= (1 << bits) - 1;
    }
  }
  return Buffer.from(output);
}

/**
 * @param {string} secret base32
 * @param {number} [now] ms
 * @param {number} [step] segundos
 * @param {number} [digits]
 * @returns {string}
 */
export function generateTotp(secret, now = Date.now(), step = 30, digits = 6) {
  const counter = Math.floor(now / 1000 / step);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(code % 10 ** digits).padStart(digits, "0");
}

/**
 * Verifica con ventana ±1 paso (tolera desfase de reloj).
 *
 * @param {string} secret
 * @param {string} token
 * @param {{now?: number, step?: number, window?: number}} [opts]
 * @returns {boolean}
 */
export function verifyTotp(secret, token, opts = {}) {
  const { now = Date.now(), step = 30, window = 1 } = opts;
  const candidate = String(token ?? "").trim();
  if (!/^\d{6}$/.test(candidate)) return false;

  const expected = Buffer.from(candidate);
  for (let offset = -window; offset <= window; offset += 1) {
    const code = generateTotp(secret, now + offset * step * 1000, step);
    if (timingSafeEqual(Buffer.from(code), expected)) return true;
  }
  return false;
}

/**
 * Genera un secreto base32 nuevo para enrolamiento.
 * @param {number} [bytes]
 * @returns {string}
 */
export function generateTotpSecret(bytes = 20) {
  return base32Encode(randomBytes(bytes));
}

// ── Sesión firmada ─────────────────────────────────────────

function sign(body, secret) {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function getSessionSecret(env = process.env) {
  const secret = env.ADMIN_SESSION_SECRET;
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error(
      "ADMIN_SESSION_SECRET debe existir y tener al menos 32 caracteres."
    );
  }
  return secret;
}

/**
 * @param {{
 *   user: string,
 *   secret: string,
 *   csrf?: string,
 *   ttlSeconds?: number,
 *   now?: number
 * }} opts
 * @returns {{token: string, csrf: string, expiresAt: number}}
 */
export function createSession(opts) {
  const {
    user,
    secret,
    csrf = randomBytes(24).toString("base64url"),
    ttlSeconds = SESSION_TTL_SECONDS,
    now = Date.now(),
  } = opts;
  const expiresAt = Math.floor(now / 1000) + ttlSeconds;
  const payload = Buffer.from(
    JSON.stringify({ sub: user, exp: expiresAt, csrf })
  ).toString("base64url");
  return {
    token: `${payload}.${sign(payload, secret)}`,
    csrf,
    expiresAt: expiresAt * 1000,
  };
}

/**
 * @param {string} token
 * @param {string} secret
 * @param {number} [now]
 * @returns {{sub: string, exp: number, csrf: string}|null}
 */
export function verifySession(token, secret, now = Date.now()) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data || typeof data.sub !== "string") return null;
    if (!Number.isInteger(data.exp) || data.exp * 1000 <= now) return null;
    if (typeof data.csrf !== "string" || data.csrf.length < 16) return null;
    return data;
  } catch {
    return null;
  }
}

// ── Cookies ────────────────────────────────────────────────

/**
 * @param {string} header
 * @returns {Record<string, string>}
 */
export function parseCookies(header) {
  const cookies = {};
  if (typeof header !== "string" || header.length === 0) return cookies;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) continue;
    // Ignorar atributos del Set-Cookie (Path, Max-Age, HttpOnly, etc.).
    if (/^(path|domain|expires|max-age|samesite|secure|httponly)$/i.test(name)) {
      continue;
    }
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

/**
 * @param {string} token
 * @param {{secure?: boolean, maxAge?: number}} [opts]
 * @returns {string}
 */
export function serializeSessionCookie(token, opts = {}) {
  const { secure = false, maxAge = SESSION_TTL_SECONDS } = opts;
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearSessionCookie(opts = {}) {
  return serializeSessionCookie("", { ...opts, maxAge: 0 });
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {string} secret
 * @returns {{sub: string, exp: number, csrf: string}|null}
 */
export function getSession(req, secret) {
  const cookies = parseCookies(req?.headers?.cookie);
  return verifySession(cookies[SESSION_COOKIE], secret);
}

// ── Rate limit de login ────────────────────────────────────

const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 60_000;
const BLOCK_MS = 15 * 60_000;
const attempts = new Map();
const recentFailures = [];

/**
 * @param {string} key
 * @param {number} [now]
 * @returns {{allowed: boolean, retryAfter: number}}
 */
export function checkLoginAllowed(key, now = Date.now()) {
  const entry = attempts.get(key);
  if (!entry) return { allowed: true, retryAfter: 0 };
  if (entry.blockedUntil > now) {
    return {
      allowed: false,
      retryAfter: Math.ceil((entry.blockedUntil - now) / 1000),
    };
  }
  return { allowed: true, retryAfter: 0 };
}

/**
 * @param {string} key
 * @param {number} [now]
 */
export function recordLoginFailure(key, now = Date.now()) {
  recentFailures.push(now);
  while (recentFailures.length > 0 && now - recentFailures[0] > 60 * 60_000) {
    recentFailures.shift();
  }
  const entry = attempts.get(key) || { failures: [], blockedUntil: 0 };
  entry.failures = entry.failures.filter((at) => now - at < FAILURE_WINDOW_MS);
  entry.failures.push(now);
  if (entry.failures.length >= MAX_FAILURES) {
    entry.blockedUntil = now + BLOCK_MS;
    entry.failures = [];
  }
  attempts.set(key, entry);
}

export function clearLoginFailures(key) {
  attempts.delete(key);
}

/**
 * Cuenta fallos globales recientes (cualquier IP/usuario), para detectar
 * ráfagas distribuidas.
 *
 * @param {number} [now]
 * @param {number} [windowMs]
 * @param {number} [threshold]
 * @returns {{count: number, burst: boolean}}
 */
export function loginFailureBurst(
  now = Date.now(),
  windowMs = 15 * 60_000,
  threshold = 10
) {
  const count = recentFailures.filter((at) => now - at < windowMs).length;
  return { count, burst: count >= threshold };
}

export function _resetLoginLimiterForTests() {
  attempts.clear();
  recentFailures.length = 0;
}

// ── Auditoría ──────────────────────────────────────────────

/**
 * Hash corto de IP para auditoría (no se guarda la IP en claro).
 * @param {string} ip
 * @returns {string}
 */
export function hashIp(ip) {
  return createHash("sha256").update(String(ip || "")).digest("hex").slice(0, 16);
}

/**
 * @param {object} db
 * @param {{
 *   actor?: string|null,
 *   action: string,
 *   target?: string|null,
 *   result: "ok"|"fail",
 *   ip?: string,
 *   detail?: object
 * }} event
 */
export async function recordAudit(db, event) {
  if (!db || typeof db.query !== "function") return;
  try {
    await db.query(
      `INSERT INTO admin.audit_log (actor, action, target, result, ip_hash, detail)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        event.actor || null,
        event.action,
        event.target || null,
        event.result,
        hashIp(event.ip),
        JSON.stringify(event.detail || {}),
      ]
    );
  } catch (err) {
    console.error("[admin] no se pudo escribir auditoría:", err?.message || err);
  }
}
