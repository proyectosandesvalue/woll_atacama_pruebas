/**
 * Rate limiting en memoria para `/api/proxy`.
 *
 * Protege la cuota de los servicios externos (Copernicus: 10.000
 * requests/mes, 300/min) de un uso accidental o abusivo.
 *
 * Limitación conocida: en Vercel el estado es por instancia, no
 * distribuido. En el VPS se puede sustituir por Redis o por el
 * `limit_req` de Nginx (Sprint 26-D). Mientras tanto, es una barrera
 * razonable, no una garantía global.
 */

const WINDOW_MS = 60_000;
const BURST_WINDOW_MS = 10_000;

/** @type {Map<string, {count:number, windowStart:number, burst:number[]}>} */
const stores = new Map();

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function maybeGc(now) {
  if (stores.size < 5000) return;
  for (const [key, entry] of stores) {
    if (now - entry.windowStart > WINDOW_MS * 5) stores.delete(key);
  }
}

/**
 * @param {string|undefined} ip
 * @param {{maxPerMinute?:number, maxBurst?:number, env?:NodeJS.ProcessEnv, now?:number}} [opts]
 * @returns {{ok:true} | {ok:false, retryAfterSeconds:number}}
 */
export function checkProxyRateLimit(ip, opts = {}) {
  const env = opts.env || process.env;
  const maxPerMinute = opts.maxPerMinute ?? positiveInt(env.PROXY_RATE_LIMIT_PER_MIN, 600);
  const maxBurst = opts.maxBurst ?? positiveInt(env.PROXY_RATE_LIMIT_BURST, 120);
  const now = opts.now ?? Date.now();

  if (!ip || typeof ip !== "string") return { ok: true };

  maybeGc(now);

  let entry = stores.get(ip);
  if (!entry) {
    entry = { count: 0, windowStart: now, burst: [] };
    stores.set(ip, entry);
  }

  if (now - entry.windowStart > WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }

  entry.burst = entry.burst.filter((t) => now - t < BURST_WINDOW_MS);

  if (entry.burst.length >= maxBurst) {
    const retryAfter = Math.ceil((entry.burst[0] + BURST_WINDOW_MS - now) / 1000);
    return { ok: false, retryAfterSeconds: Math.max(1, retryAfter) };
  }

  if (entry.count >= maxPerMinute) {
    const retryAfter = Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000);
    return { ok: false, retryAfterSeconds: Math.max(1, retryAfter) };
  }

  entry.count += 1;
  entry.burst.push(now);
  return { ok: true };
}

export function _resetProxyRateLimiter() {
  stores.clear();
}

export const PROXY_RATE_LIMITS = { WINDOW_MS, BURST_WINDOW_MS };
