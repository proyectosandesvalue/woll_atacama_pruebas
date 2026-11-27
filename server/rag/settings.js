/**
 * Settings del bloque documental (Sprint 18-F).
 *
 * Fuente: `admin.settings` (`chat.documents.*`), con prioridad de variables
 * de entorno y fallback INV-5. La lectura se cachea 5 min para no sumar tres
 * RPCs a cada consulta.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;

export const DOCUMENT_SETTINGS_DEFAULTS = Object.freeze({
  enabled: true,
  minScore: 0.62,
  topK: 5,
});

let _cache = { value: null, time: 0 };

function toBool(value, fallback) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (/^(1|true|yes|on)$/i.test(value)) return true;
    if (/^(0|false|no|off)$/i.test(value)) return false;
  }
  return fallback;
}

function toNumber(value, fallback, min, max) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/**
 * @param {{
 *   db?: { rpc: (name: string, params?: object) => Promise<any> } | null,
 *   env?: NodeJS.ProcessEnv,
 *   force?: boolean
 * }} [options]
 * @returns {Promise<{enabled: boolean, minScore: number, topK: number}>}
 */
export async function getDocumentSettings(options = {}) {
  const { db = null, env = process.env, force = false } = options;
  const now = Date.now();
  if (!force && _cache.value && now - _cache.time < CACHE_TTL_MS) {
    return _cache.value;
  }

  const envEnabled = env.CHAT_DOCUMENTS_ENABLED;
  const envMinScore = env.RAG_MIN_SCORE;
  const envTopK = env.RAG_TOP_K;

  let enabled =
    envEnabled !== undefined
      ? toBool(envEnabled, DOCUMENT_SETTINGS_DEFAULTS.enabled)
      : DOCUMENT_SETTINGS_DEFAULTS.enabled;
  let minScore = toNumber(
    envMinScore,
    DOCUMENT_SETTINGS_DEFAULTS.minScore,
    0,
    1
  );
  let topK = toNumber(
    envTopK,
    DOCUMENT_SETTINGS_DEFAULTS.topK,
    1,
    8
  );

  if (db && typeof db.rpc === "function") {
    try {
      const [dbEnabled, dbMinScore, dbTopK] = await Promise.all([
        db.rpc("chat_get_setting", {
          p_key: "chat.documents.enabled",
          p_default: DOCUMENT_SETTINGS_DEFAULTS.enabled,
        }),
        db.rpc("chat_get_setting", {
          p_key: "chat.documents.min_score",
          p_default: DOCUMENT_SETTINGS_DEFAULTS.minScore,
        }),
        db.rpc("chat_get_setting", {
          p_key: "chat.documents.top_k",
          p_default: DOCUMENT_SETTINGS_DEFAULTS.topK,
        }),
      ]);

      if (envEnabled === undefined) {
        enabled = toBool(dbEnabled, enabled);
      }
      if (envMinScore === undefined) {
        minScore = toNumber(dbMinScore, minScore, 0, 1);
      }
      if (envTopK === undefined) {
        topK = Math.round(toNumber(dbTopK, topK, 1, 8));
      }
    } catch {
      // INV-5: la BD no responde; quedan env/default.
    }
  }

  _cache = {
    value: { enabled, minScore, topK: Math.round(topK) },
    time: now,
  };
  return _cache.value;
}

/** Solo para tests. */
export function _resetDocumentSettingsCache() {
  _cache = { value: null, time: 0 };
}
