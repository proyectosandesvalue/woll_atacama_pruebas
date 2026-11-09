/**
 * CORS compartido por los endpoints públicos.
 *
 * El origen se refleja solo si está en la allowlist; si no, no se emite
 * `Access-Control-Allow-Origin` y el navegador bloquea la lectura.
 */

export const DEFAULT_ALLOWED_ORIGINS = [
  "https://wollatacamapruebas.vercel.app",
  "https://wollatacama.vercel.app",
  "http://localhost:8099",
  "http://localhost:3000",
];

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export function getAllowedOrigins(env = process.env) {
  const raw = env.ALLOWED_ORIGINS;
  if (typeof raw === "string" && raw.length > 0) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return DEFAULT_ALLOWED_ORIGINS;
}

/**
 * @param {{headers?: Record<string, any>}} req
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null}
 */
export function getOriginHeader(req, env = process.env) {
  const origin = req?.headers?.origin;
  if (typeof origin !== "string" || origin.length === 0) return null;
  return getAllowedOrigins(env).includes(origin) ? origin : null;
}

/**
 * Aplica CORS a un response estilo Vercel.
 *
 * @param {{headers?: Record<string, any>}} req
 * @param {{setHeader: Function}} res
 * @param {{methods?: string, headers?: string, maxAge?: number, env?: NodeJS.ProcessEnv}} [opts]
 * @returns {string|null} origen permitido (o null)
 */
export function applyCors(req, res, opts = {}) {
  const {
    methods = "GET, OPTIONS",
    headers = "Content-Type",
    maxAge = 86400,
    env = process.env,
  } = opts;

  const allowedOrigin = getOriginHeader(req, env);
  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  }
  // Vary siempre: la respuesta cambia según el Origin y puede cachearse.
  res.setHeader("Vary", "Origin");

  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", headers);
  res.setHeader("Access-Control-Max-Age", String(maxAge));

  return allowedOrigin;
}
