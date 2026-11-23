/**
 * Carga de la configuración del visor.
 *
 * Orden:
 *   1. `GET /api/taxonomy` si el feature flag de cliente está activo.
 *   2. `GET /api/config` (snapshot activo en `admin.config_snapshots`).
 *   3. Fallback a `js/config/allTemasConfig.js` si ambas APIs fallan (INV-5).
 *
 * Feature flag de cliente: `?taxonomy=1` en la URL o
 * `globalThis.WOLL_TAXONOMY_API = true`. El servidor debe tener
 * `TAXONOMY_API_ENABLED=1`; si no, `/api/taxonomy` devuelve 404 y se usa
 * `/api/config`.
 *
 * `initTemasConfig()` es idempotente: la primera llamada resuelve y las
 * siguientes devuelven la misma promesa. `getTemasConfig()` está disponible
 * después de inicializar; antes devuelve el fallback local.
 *
 * Sprint 14 / Sprint 46-C.
 */

import fallbackConfig from "./allTemasConfig.js";

const DEFAULT_TIMEOUT_MS = 3000;

let _config = fallbackConfig;
let _meta = { source: "fallback", version: null, checksum: null };
let _promise = null;

function isConfig(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function taxonomyEnabled(opts = {}) {
  if (typeof opts.useTaxonomy === "boolean") return opts.useTaxonomy;
  if (typeof globalThis.WOLL_TAXONOMY_API === "boolean") {
    return globalThis.WOLL_TAXONOMY_API;
  }
  try {
    const search = globalThis.location?.search || "";
    return new URLSearchParams(search).get("taxonomy") === "1";
  } catch {
    return false;
  }
}

async function fetchPayload(fetchImpl, url, timeoutMs) {
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
    return payload;
  } finally {
    clearTimeout(timer);
  }
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
 * @returns {{source: "taxonomy"|"api"|"fallback", version: number|null, checksum: string|null}}
 */
export function getTemasConfigMeta() {
  return { ..._meta };
}

/**
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number,
 *   url?: string,
 *   useTaxonomy?: boolean
 * }} [opts]
 * @returns {Promise<object>}
 */
export function initTemasConfig(opts = {}) {
  if (_promise) return _promise;

  const {
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    url = null,
    useTaxonomy = taxonomyEnabled(opts),
  } = opts;

  if (typeof fetchImpl !== "function") {
    _meta = { source: "fallback", version: null, checksum: null };
    _promise = Promise.resolve(_config);
    return _promise;
  }

  const urls = url
    ? [url]
    : useTaxonomy
      ? ["/api/taxonomy", "/api/config"]
      : ["/api/config"];

  _promise = (async () => {
    let lastError = null;
    for (const endpoint of urls) {
      try {
        const payload = await fetchPayload(fetchImpl, endpoint, timeoutMs);
        _config = payload.config;
        _meta = {
          source: endpoint.includes("taxonomy") ? "taxonomy" : "api",
          version: Number.isInteger(payload.version) ? payload.version : null,
          checksum: payload.checksum || null,
        };
        return _config;
      } catch (err) {
        lastError = err;
      }
    }

    console.warn(
      "[config] no se pudo cargar la configuración remota; se usa el fallback local:",
      lastError?.message || lastError
    );
    _config = fallbackConfig;
    _meta = { source: "fallback", version: null, checksum: null };
    return _config;
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
