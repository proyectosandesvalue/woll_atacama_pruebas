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
 *   - Killswitch: si CHAT_ENABLED=0, no aplica rate limit.
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

import { isLatam } from "./geo-filter.js";

const WINDOW_MS = 60 * 1000;        // ventana principal: 60s
const BURST_WINDOW_MS = 10 * 1000;  // ventana de ráfaga: 10s

/** @type {Map<string, {count: number, windowStart: number, burstTimestamps: number[]}>} */
const stores = new Map();

/**
 * Killswitch: si CHAT_ENABLED=0, no se aplica rate limit.
 */
function isChatEnabled() {
  return !/^(0|false|no)$/i.test(process.env.CHAT_ENABLED || "1");
}

/**
 * Limpia entradas viejas para no acumular memoria indefinidamente.
 */
function maybeGc(now) {
  if (stores.size < 1000) return;
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
  // Killswitch: si el chat está apagado, no aplicar rate limit.
  if (!isChatEnabled()) {
    return { ok: true };
  }

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
 * Límites del chat para 20-50 usuarios concurrentes.
 *
 * - IP: generoso para NAT institucional (20-50 usuarios pueden compartir IP).
 * - Sesión: más estricto, pero el sessionId es generado por el cliente y
 *   puede rotarse; la IP y el tope global siguen siendo la defensa real.
 */
export const CHAT_RATE_LIMITS = {
  latam: { perMinute: 120, perBurst: 30 },
  nonLatam: { perMinute: 30, perBurst: 5 },
  session: { perMinute: 12, perBurst: 4 },
};

/**
 * Rate limit en capas: IP + sesión.
 *
 * @param {{ip: string, sessionId?: string|null, country?: string}} opts
 * @returns {{ok: true} | {ok: false, retryAfterSeconds: number}}
 */
export function checkChatRateLimit({ ip, sessionId, country }) {
  const limits = isLatam(country)
    ? CHAT_RATE_LIMITS.latam
    : CHAT_RATE_LIMITS.nonLatam;

  const ipResult = checkRateLimit(
    `ip:${ip}`,
    limits.perMinute,
    limits.perBurst
  );

  let sessionResult = { ok: true };
  if (sessionId) {
    const key = `session:${String(sessionId).slice(0, 80)}`;
    sessionResult = checkRateLimit(
      key,
      CHAT_RATE_LIMITS.session.perMinute,
      CHAT_RATE_LIMITS.session.perBurst
    );
  }

  if (ipResult.ok && sessionResult.ok) return { ok: true };

  return {
    ok: false,
    retryAfterSeconds: Math.max(
      ipResult.ok ? 0 : ipResult.retryAfterSeconds || 1,
      sessionResult.ok ? 0 : sessionResult.retryAfterSeconds || 1
    ),
  };
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