/**
 * Utilidades de request compartidas por los endpoints del backend.
 */

const DEBUG = /^(1|true|yes)$/i.test(process.env.ORCHESTRATOR_DEBUG || "");

/**
 * Devuelve la IP del cliente contando desde la derecha de
 * `x-forwarded-for` según `TRUST_PROXY_HOPS` (Vercel: 2).
 *
 * @param {{headers?: Record<string, any>}} req
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|undefined}
 */
export function getClientIp(req, env = process.env) {
  const headers = req?.headers || {};
  const hops = Number(env.TRUST_PROXY_HOPS) || 2;

  const forwarded = headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    const parts = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (parts.length > 0) {
      const index = Math.max(0, parts.length - 1 - hops + 1);
      const ip = parts[index];
      if (ip) {
        if (DEBUG) console.log(`[request] IP real (hops=${hops}, index=${index}) = ${ip}`);
        return ip;
      }
    }
  }

  const real = headers["x-real-ip"];
  if (typeof real === "string" && real.length > 0) {
    if (DEBUG) console.log(`[request] IP de x-real-ip = ${real.trim()}`);
    return real.trim();
  }

  return undefined;
}

// Alias histórico usado por el chat.
export const getIpFromRequest = getClientIp;
