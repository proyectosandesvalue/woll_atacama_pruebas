/**
 * Rate limiter in-memory.
 *
 * Limita peticiones por IP en dos ventanas simultáneas:
 *   - Ventana principal: 60 segundos.
 *   - Ventana de ráfaga: 10 segundos.
 *
 * Diseño:
 *   - Sin dependencias (Map nativo).
 *   - Síncrono.
 *   - Fail-open si algo va mal (mejor dejar pasar que bloquear a un usuario legítimo).
 *
 * LIMITACIÓN CONOCIDA:
 *   En Vercel, cada invocación de Function puede vivir en un proceso distinto.
 *   El estado en memoria NO es compartido entre lambdas. Si Vercel reutiliza el
 *   proceso, el estado persiste; si no, se resetea en cada cold start.
 *
 *   Esto significa que el rate limiting real puede ser más permisivo que la
 *   configuración teórica. Con el tráfico actual (<100 req/día) es aceptable.
 *
 *   Cuando el tráfico crezca, migrar a Upstash Redis o similar.
 */

const WINDOW_MS = 60 * 1000;        // ventana principal: 60s
const BURST_WINDOW_MS = 10 * 1000;  // ventana de ráfaga: 10s

/** @type {Map<string, {count: number, windowStart: number, burstTimestamps: number[]}>} */
const stores = new Map();

/**
 * Limpia entradas viejas para no acumular memoria indefinidamente.
 * Se llama cada vez que se consulta el limiter, pero solo hace trabajo
 * si hay entradas muy viejas.
 */
function maybeGc(now) {
  if (stores.size < 1000) return; // threshold bajo, no hacemos GC hasta que crezca
  for (const [key, entry] of stores) {
    if (now - entry.windowStart > WINDOW_MS * 5) {
      stores.delete(key);
    }
  }
}

/**
 * Verifica si una IP puede hacer una request.
 *
 * @param {string} ip
 * @param {number} maxPerMinute - límite de la ventana principal.
 * @param {number} maxPerBurst - límite de la ventana de ráfaga.
 * @returns {{ok: true} | {ok: false, retryAfterSeconds: number}}
 */
export function checkRateLimit(ip, maxPerMinute, maxPerBurst) {
  if (!ip || typeof ip !== "string") {
    // Sin IP no podemos limitar. Fail-open.
    return { ok: true };
  }

  const now = Date.now();
  maybeGc(now);

  let entry = stores.get(ip);
  if (!entry) {
    entry = { count: 0, windowStart: now, burstTimestamps: [] };
    stores.set(ip, entry);
  }

  // Resetear ventana principal si expiró
  if (now - entry.windowStart > WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }

  // Limpiar timestamps de ráfaga viejos
  entry.burstTimestamps = entry.burstTimestamps.filter(
    (t) => now - t < BURST_WINDOW_MS
  );

  // Verificar ventana de ráfaga
  if (entry.burstTimestamps.length >= maxPerBurst) {
    const oldest = entry.burstTimestamps[0];
    const retryAfter = Math.ceil((oldest + BURST_WINDOW_MS - now) / 1000);
    return { ok: false, retryAfterSeconds: Math.max(1, retryAfter) };
  }

  // Verificar ventana principal
  if (entry.count >= maxPerMinute) {
    const retryAfter = Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000);
    return { ok: false, retryAfterSeconds: Math.max(1, retryAfter) };
  }

  // Pasar: incrementar contadores
  entry.count += 1;
  entry.burstTimestamps.push(now);

  return { ok: true };
}

/**
 * Reset del estado. Solo para tests.
 */
export function _resetRateLimiter() {
  stores.clear();
}

export const RATE_LIMITS = {
  WINDOW_MS,
  BURST_WINDOW_MS,
};