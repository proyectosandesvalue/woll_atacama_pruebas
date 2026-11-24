/**
 * Contexto de request para logs de acceso (Sprint 31-A).
 *
 * Garantías:
 *   - `request_id` siempre presente y saneado.
 *   - La IP nunca se registra en claro: solo un hash con sal.
 *   - La línea de log no incluye query string, cuerpo ni cabeceras.
 */
import crypto from "node:crypto";

const REQUEST_ID_RE = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Usa el `x-request-id` entrante solo si es seguro; si no, genera uno.
 *
 * @param {string|string[]|undefined} headerValue
 * @returns {string}
 */
export function resolveRequestId(headerValue) {
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (REQUEST_ID_RE.test(trimmed)) return trimmed;
  }
  return crypto.randomUUID();
}

/**
 * Crea una función que hashea IPs con una sal.
 *
 * Si no hay `LOG_IP_SALT`, usa una sal aleatoria por proceso: los hashes no
 * son correlacionables entre reinicios, que es el comportamiento seguro por
 * defecto.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {(ip?: string) => string|null}
 */
export function createIpHasher(env = process.env) {
  const configured = String(env.LOG_IP_SALT || "").trim();
  const salt = configured || crypto.randomBytes(16).toString("hex");
  return (ip) => {
    if (!ip) return null;
    return crypto
      .createHash("sha256")
      .update(`${salt}:${ip}`)
      .digest("hex")
      .slice(0, 16);
  };
}

/**
 * Construye la línea JSON de acceso. No recibe cuerpo ni query.
 *
 * @param {{
 *   requestId: string,
 *   method: string,
 *   path: string,
 *   status: number,
 *   durationMs: number,
 *   ipHash?: string|null,
 *   country?: string|null
 * }} entry
 * @returns {string}
 */
export function buildAccessLogLine({
  requestId,
  method,
  path,
  status,
  durationMs,
  ipHash = null,
  country = null,
}) {
  return JSON.stringify({
    level: status >= 500 ? "error" : "info",
    event: "http.request",
    request_id: requestId,
    method,
    path,
    status,
    duration_ms: Math.max(0, Math.round(durationMs)),
    ip_hash: ipHash,
    country,
    ts: new Date().toISOString(),
  });
}
