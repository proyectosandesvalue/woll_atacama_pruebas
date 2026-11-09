/**
 * Registro de servicios externos permitidos por `/api/proxy`.
 *
 * El proxy NO acepta URLs arbitrarias: cada entrada define una URL base
 * fija, los parámetros que se pueden reenviar y sus límites. Esto evita
 * SSRF y convierte el endpoint en un proxy cerrado.
 *
 * Para agregar un servicio:
 *   1. Agregar una entrada a `SERVICES`.
 *   2. Definir `buildUrl(env)`, `params`, `defaults` y `validate`.
 *   3. Agregar tests en `__tests__/services.test.js`.
 */

import { ProxyError } from "./errors.js";
import { validateRequest } from "./validate.js";

const COPERNICUS_OGC = "https://sh.dataspace.copernicus.eu/ogc";
const WORLDVIEW_SNAPSHOT = "https://wvs.earthdata.nasa.gov/api/v1/snapshot";

const OGC_COMMON = [
  "SERVICE",
  "VERSION",
  "REQUEST",
  "TIME",
  "MAXCC",
  "PRIORITY",
];

const WMS_PARAMS = new Set([
  ...OGC_COMMON,
  "LAYERS",
  "QUERY_LAYERS",
  "STYLES",
  "CRS",
  "SRS",
  "BBOX",
  "WIDTH",
  "HEIGHT",
  "FORMAT",
  "TRANSPARENT",
  "BGCOLOR",
  "INFO_FORMAT",
  "I",
  "J",
  "X",
  "Y",
  "FEATURE_COUNT",
  "EVALSCRIPT",
  "EVALSCRIPTURL",
  "GEOMETRY",
  "QUALITY",
  "UPSAMPLING",
  "DOWNSAMPLING",
  "WARNINGS",
  "SHOWLOGO",
  "NICENAME",
  "EXCEPTIONS",
]);

const WFS_PARAMS = new Set([
  ...OGC_COMMON,
  "TYPENAMES",
  "TYPENAME",
  "SRSNAME",
  "BBOX",
  "MAXFEATURES",
  "FEATURE_OFFSET",
  "STARTINDEX",
  "COUNT",
  "OUTPUTFORMAT",
  "FILTER",
  "PROPERTYNAME",
  "CQL_FILTER",
  "RESOURCEID",
  "RESULT_TYPE",
]);

const WMTS_PARAMS = new Set([
  ...OGC_COMMON,
  "LAYER",
  "STYLE",
  "FORMAT",
  "TILEMATRIXSET",
  "TILEMATRIX",
  "TILEROW",
  "TILECOL",
]);

const WORLDVIEW_PARAMS = new Set([
  "REQUEST",
  "LAYERS",
  "CRS",
  "BBOX",
  "WIDTH",
  "HEIGHT",
  "TIME",
  "FORMAT",
  "RESOLUTION",
  "AUTOSCALE",
  "PADDING",
  "COORDINATES",
  "WORLD_FILE",
  "COLOR_SCALE",
  "OPACITIES",
  "STYLE",
]);

/**
 * Acepta tanto COPERNICUS_INSTANCE_ID como INSTANCE_ID (compatibilidad
 * con la configuración local ya creada).
 */
function instanceId(env) {
  const id = env.COPERNICUS_INSTANCE_ID || env.INSTANCE_ID;
  if (!id || !String(id).trim()) {
    throw new ProxyError(
      "MISSING_INSTANCE_ID",
      "Falta COPERNICUS_INSTANCE_ID (o INSTANCE_ID) en el entorno del servidor.",
      { status: 503 }
    );
  }
  return String(id).trim();
}

export const SERVICES = {
  "copernicus-wms": {
    label: "Copernicus WMS",
    params: WMS_PARAMS,
    defaults: { SERVICE: "WMS", VERSION: "1.3.0" },
    buildUrl: (env) => `${COPERNICUS_OGC}/wms/${instanceId(env)}`,
    validate: "wms",
    maxBytes: 12 * 1024 * 1024,
  },
  "copernicus-wfs": {
    label: "Copernicus WFS",
    params: WFS_PARAMS,
    defaults: { SERVICE: "WFS", VERSION: "2.0.0" },
    buildUrl: (env) => `${COPERNICUS_OGC}/wfs/${instanceId(env)}`,
    validate: "wfs",
    maxBytes: 8 * 1024 * 1024,
  },
  "copernicus-wmts": {
    label: "Copernicus WMTS",
    params: WMTS_PARAMS,
    defaults: { SERVICE: "WMTS", VERSION: "1.0.0" },
    buildUrl: (env) => `${COPERNICUS_OGC}/wmts/${instanceId(env)}`,
    validate: "wmts",
    maxBytes: 12 * 1024 * 1024,
  },
  "worldview-snapshot": {
    label: "NASA Worldview Snapshots",
    params: WORLDVIEW_PARAMS,
    defaults: { REQUEST: "GetSnapshot", CRS: "EPSG:4326", FORMAT: "image/jpeg" },
    buildUrl: () => WORLDVIEW_SNAPSHOT,
    validate: "worldview",
    maxBytes: 12 * 1024 * 1024,
  },
};

/**
 * @param {string} source
 * @returns {object}
 */
export function getService(source) {
  if (!source || typeof source !== "string") {
    throw new ProxyError("MISSING_SOURCE", "Falta el parámetro 'source'.", { status: 400 });
  }
  if (!Object.hasOwn(SERVICES, source)) {
    throw new ProxyError("UNKNOWN_SOURCE", `Servicio no permitido: ${source}.`, { status: 400 });
  }
  const service = SERVICES[source];
  if (!service) {
    throw new ProxyError("UNKNOWN_SOURCE", `Servicio no permitido: ${source}.`, { status: 400 });
  }
  return service;
}

/**
 * Normaliza query params: mayúsculas, primer valor si es array, sin
 * `source` ni parámetros de cache busting.
 *
 * @param {Record<string, any>} query
 * @returns {Record<string, string>}
 */
export function normalizeQuery(query = {}) {
  const out = {};

  for (const [rawKey, rawValue] of Object.entries(query)) {
    const key = String(rawKey).toUpperCase();
    if (key === "SOURCE" || key === "_" || key === "T") continue;

    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (value === undefined || value === null) continue;
    if (typeof value === "object") continue;

    out[key] = String(value);
  }

  return out;
}

/**
 * Filtra los parámetros según la allowlist del servicio.
 *
 * @param {object} service
 * @param {Record<string, string>} params
 * @returns {Record<string, string>}
 */
export function pickAllowedParams(service, params) {
  const out = {};
  for (const [key, value] of Object.entries(params)) {
    if (service.params.has(key)) out[key] = value;
  }
  return out;
}

/**
 * Construye la URL upstream con defaults + parámetros permitidos y
 * valida la petición.
 *
 * @param {string} source
 * @param {NodeJS.ProcessEnv} env
 * @param {Record<string, any>} query
 * @returns {{url: URL, service: object, params: Record<string,string>}}
 */
export function prepareUpstream(source, env, query) {
  const service = getService(source);
  const params = pickAllowedParams(service, normalizeQuery(query));

  for (const [key, value] of Object.entries(service.defaults || {})) {
    if (params[key] === undefined) params[key] = value;
  }

  validateRequest(service.validate, params);

  const url = new URL(service.buildUrl(env));
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return { url, service, params };
}

// Alias histórico.
export const buildUpstreamUrl = prepareUpstream;
