/**
 * Control de costos del chat IA.
 *
 * Responsabilidades:
 *   - Killswitch `CHAT_ENABLED`: si está apagado, el chat responde 503
 *     sin llamar al LLM.
 *   - Tope diario `LLM_DAILY_REQUEST_CAP`: si se alcanza, el chat
 *     responde 503 sin llamar al LLM. Se resetea a las 00:00 UTC.
 *
 * Diseño:
 *   - Contador en memoria (misma limitación que rate-limiter: en Vercel
 *     cada lambda tiene su propio estado). Con el tráfico actual es
 *     aceptable. Cuando crezca, migrar a Redis (Sprint 31).
 *   - Síncrono.
 *   - Fail-open si algo va mal (si el contador falla, no bloquea).
 *
 * Uso en handleChat:
 *   const guard = checkCostGuard();
 *   if (!guard.ok) return { status: 503, body: { error: guard.message } };
 *   // ... llamar al LLM ...
 *   recordLLMCall();
 */

const DEBUG = /^(1|true|yes)$/i.test(process.env.ORCHESTRATOR_DEBUG || "");
function dbg(...args) {
  if (DEBUG) console.log("[cost-guard]", ...args);
}

/**
 * Devuelve true si el chat está encendido.
 * `CHAT_ENABLED=0`, `false` o `no` → apagado.
 */
function isChatEnabled() {
  return !/^(0|false|no)$/i.test(process.env.CHAT_ENABLED || "1");
}

/**
 * Devuelve el tope diario de requests al LLM.
 * 0 = sin tope (no recomendado en producción).
 */
function getDailyCap() {
  const n = Number(process.env.LLM_DAILY_REQUEST_CAP);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// ── Estado del contador ─────────────────────────────────────
// `_dailyCount`: requests al LLM en el día actual.
// `_dayKey`: string "YYYY-MM-DD" en UTC para detectar cambio de día.
let _dailyCount = 0;
let _dayKey = todayKey();

function todayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function maybeResetDaily() {
  const key = todayKey();
  if (key !== _dayKey) {
    dbg(`Nuevo día (${key}), reseteando contador (antes: ${_dailyCount})`);
    _dailyCount = 0;
    _dayKey = key;
  }
}

/**
 * Verifica si el chat puede hacer una llamada al LLM.
 *
 * Devuelve:
 *   - `{ ok: true }` si puede.
 *   - `{ ok: false, status: 503, message: string }` si no puede.
 *
 * No incrementa el contador. Se llama antes de cada request al LLM.
 * El contador se incrementa con `recordLLMCall()` después de la llamada.
 *
 * @returns {{ok: true} | {ok: false, status: number, message: string}}
 */
export function checkCostGuard() {
  if (!isChatEnabled()) {
    dbg("CHAT_ENABLED=0, chat apagado");
    return {
      ok: false,
      status: 503,
      message:
        "El chat está temporalmente deshabilitado. " +
        "El visor sigue funcionando. Intentá de nuevo más tarde.",
    };
  }

  maybeResetDaily();

  const cap = getDailyCap();
  if (cap > 0 && _dailyCount >= cap) {
    dbg(`Tope diario alcanzado (${_dailyCount}/${cap})`);
    return {
      ok: false,
      status: 503,
      message:
        "El chat alcanzó su límite diario de consultas. " +
        "Se renueva a las 00:00 UTC. El visor sigue funcionando.",
    };
  }

  return { ok: true };
}

/**
 * Registra una llamada al LLM.
 * Se llama después de cada `classifyDomain()` o `runOrchestrator()`.
 */
export function recordLLMCall() {
  maybeResetDaily();
  _dailyCount += 1;
  dbg(`Request al LLM registrado: ${_dailyCount}`);
}

/**
 * Devuelve el estado actual del contador (para debugging / panel admin).
 */
export function getCostStats() {
  maybeResetDaily();
  return {
    dayKey: _dayKey,
    dailyCount: _dailyCount,
    dailyCap: getDailyCap(),
    enabled: isChatEnabled(),
  };
}

/**
 * Reset del contador. Solo para tests.
 */
export function _resetCostGuard() {
  _dailyCount = 0;
  _dayKey = todayKey();
}

export const COST_CONFIG = {
  isChatEnabled,
  getDailyCap,
};