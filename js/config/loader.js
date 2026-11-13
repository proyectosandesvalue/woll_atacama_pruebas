/**
 * Carga de la configuración del visor.
 *
 * Orden:
 *   1. `GET /api/config` (snapshot activo en `admin.config_snapshots`).
 *   2. Fallback a `js/config/allTemasConfig.js` si la API falla, tarda o
 *      devuelve un payload inválido (INV-5).
 *
 * `initTemasConfig()` es idempotente: la primera llamada resuelve y las
 * siguientes devuelven la misma promesa. `getTemasConfig()` está disponible
 * después de inicializar; antes devuelve el fallback local.
 *
 * Sprint 14 (docs/specs/14-15-panel-admin.md).
 */

import fallbackConfig from "./allTemasConfig.js";

const DEFAULT_TIMEOUT_MS = 3000;

let _config = fallbackConfig;
let _meta = { source: "fallback", version: null, checksum: null };
let _promise = null;

function isConfig(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Configuración activa. Antes de `initTemasConfig()` devuelve el fallback.
 * @returns {object}
 */
export function getTemasConfig() {
  return _config;
}

/**
 * Metadatos de la configuración cargada.
 * @returns {{source: "api"|"fallback", version: number|null, checksum: string|null}}
 */
export function getTemasConfigMeta() {
  return { ..._meta };
}

/**
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number,
 *   url?: string
 * }} [opts]
 * @returns {Promise<object>}
 */
export function initTemasConfig(opts = {}) {
  if (_promise) return _promise;

  const {
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    url = "/api/config",
  } = opts;

  if (typeof fetchImpl !== "function") {
    _meta = { source: "fallback", version: null, checksum: null };
    _promise = Promise.resolve(_config);
    return _promise;
  }

  _promise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetchImpl(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const payload = await res.json();
      if (!payload || !isConfig(payload.config)) {
        throw new Error("Payload de configuración inválido.");
      }

      _config = payload.config;
      _meta = {
        source: "api",
        version: Number.isInteger(payload.version) ? payload.version : null,
        checksum: payload.checksum || null,
      };
      return _config;
    } catch (err) {
      console.warn(
        "[config] no se pudo cargar /api/config; se usa el fallback local:",
        err?.message || err
      );
      _config = fallbackConfig;
      _meta = { source: "fallback", version: null, checksum: null };
      return _config;
    } finally {
      clearTimeout(timer);
    }
  })();

  return _promise;
}

/**
 * Solo para tests: vuelve al estado inicial.
 */
export function _resetTemasConfigForTests() {
  _config = fallbackConfig;
  _meta = { source: "fallback", version: null, checksum: null };
  _promise = null;
}
