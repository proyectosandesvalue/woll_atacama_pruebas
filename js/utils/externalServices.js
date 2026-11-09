/**
 * Cliente de los servicios externos proxeados por `/api/proxy`.
 *
 * El navegador nunca ve el INSTANCE_ID de Copernicus ni claves: solo
 * llama al proxy del mismo origen. Ver server/proxy/services.js.
 *
 * Convenciones de BBOX:
 *   - WMS/WMTS: el string debe corresponder al CRS y a la versión WMS
 *     (WMS 1.3.0 + EPSG:4326 usa lat,lon).
 *   - WFS 2.0.0 + EPSG:4326: lat,lon (sur,oeste,norte,este).
 *   - Worldview + EPSG:4326: minLat,minLon,maxLat,maxLon.
 */

import { PROXY_URL } from "../config/proxy.js";

/**
 * @param {string} source
 * @param {Record<string, string|number|null|undefined>} [params]
 * @returns {string}
 */
export function buildProxyUrl(source, params = {}) {
  if (!source || typeof source !== "string") {
    throw new TypeError("buildProxyUrl: falta source.");
  }

  const search = new URLSearchParams();
  search.set("source", source);

  for (const [key, value] of Object.entries(params)) {
    if (key.toLowerCase() === "source") continue;
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }

  return `${PROXY_URL}?${search.toString()}`;
}

/**
 * Crea una capa WMS de Copernicus a través del proxy.
 *
 * @param {{
 *   layer: string,
 *   time?: string,
 *   maxcc?: number|null,
 *   version?: string,
 *   format?: string,
 *   transparent?: boolean,
 *   opacity?: number,
 *   attribution?: string,
 *   maxNativeZoom?: number,
 *   keepBuffer?: number,
 *   tileSize?: number
 * }} opts
 * @returns {L.TileLayer.WMS}
 */
export function createCopernicusWMSLayer(opts) {
  if (typeof L === "undefined") throw new Error("Leaflet no está disponible.");

  const {
    layer,
    time,
    maxcc = 30,
    version = "1.3.0",
    format = "image/png",
    transparent = true,
    opacity = 0.8,
    attribution = "Copernicus Data Space Ecosystem",
    maxNativeZoom = 16,
    keepBuffer = 1,
    tileSize = 512,
  } = opts;

  if (!layer) throw new TypeError("createCopernicusWMSLayer: falta layer.");

  const url = buildProxyUrl("copernicus-wms", {
    ...(time ? { TIME: time } : {}),
    ...(maxcc !== null && maxcc !== undefined ? { MAXCC: String(maxcc) } : {}),
  });

  return L.tileLayer.wms(url, {
    layers: layer,
    format,
    transparent,
    version,
    opacity,
    attribution,
    maxNativeZoom,
    keepBuffer,
    tileSize,
    updateWhenIdle: true,
    updateWhenZooming: false,
  });
}

/**
 * Crea una capa WMTS de Copernicus a través del proxy.
 *
 * Usa `PopularWebMercator256` para que coincida con la grilla XYZ de
 * Leaflet (256 px, sin zoomOffset).
 *
 * @param {{
 *   layer: string,
 *   time?: string,
 *   tileMatrixSet?: string,
 *   format?: string,
 *   opacity?: number,
 *   attribution?: string,
 *   maxZoom?: number
 * }} opts
 * @returns {L.TileLayer}
 */
export function createCopernicusWMTSLayer(opts) {
  if (typeof L === "undefined") throw new Error("Leaflet no está disponible.");

  const {
    layer,
    time,
    tileMatrixSet = "PopularWebMercator256",
    format = "image/png",
    opacity = 0.8,
    attribution = "Copernicus Data Space Ecosystem",
    maxZoom = 18,
  } = opts;

  if (!layer) throw new TypeError("createCopernicusWMTSLayer: falta layer.");

  const base = buildProxyUrl("copernicus-wmts", {
    SERVICE: "WMTS",
    VERSION: "1.0.0",
    REQUEST: "GetTile",
    LAYER: layer,
    STYLE: "default",
    TILEMATRIXSET: tileMatrixSet,
    FORMAT: format,
    ...(time ? { TIME: time } : {}),
  });

  // Leaflet expande {z}/{y}/{x}; no deben ir URL-encoded.
  const url = `${base}&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;

  return L.tileLayer(url, {
    tileSize: 256,
    opacity,
    attribution,
    maxZoom,
  });
}

/**
 * Pide footprints de escenas a Copernicus WFS.
 *
 * @param {{
 *   typename?: string,
 *   bbox: string,
 *   time: string,
 *   maxFeatures?: number,
 *   featureOffset?: number,
 *   maxcc?: number|null,
 *   signal?: AbortSignal
 * }} opts
 * @returns {Promise<{type:string, features:object[]}>}
 */
export async function fetchCopernicusFootprints(opts) {
  const {
    typename = "DSS2",
    bbox,
    time,
    maxFeatures = 20,
    featureOffset = 0,
    maxcc = null,
    signal,
  } = opts;

  const url = buildProxyUrl("copernicus-wfs", {
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAMES: typename,
    SRSNAME: "EPSG:4326",
    BBOX: bbox,
    TIME: time,
    MAXFEATURES: String(maxFeatures),
    OUTPUTFORMAT: "application/json",
    ...(featureOffset > 0 ? { FEATURE_OFFSET: String(featureOffset) } : {}),
    ...(maxcc !== null && maxcc !== undefined ? { MAXCC: String(maxcc) } : {}),
  });

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Copernicus WFS respondió ${response.status}.`);
  }
  return response.json();
}

/**
 * Pide un GetFeatureInfo JSON a Copernicus WMS.
 *
 * @param {{
 *   layer: string,
 *   bbox: string,
 *   width: number,
 *   height: number,
 *   i: number,
 *   j: number,
 *   time?: string,
 *   crs?: string,
 *   maxcc?: number|null,
 *   signal?: AbortSignal
 * }} opts
 * @returns {Promise<{type:string, features:object[]}>}
 */
export async function fetchCopernicusFeatureInfo(opts) {
  const {
    layer,
    bbox,
    width,
    height,
    i,
    j,
    time,
    crs = "EPSG:3857",
    maxcc = null,
    signal,
  } = opts;

  const url = buildProxyUrl("copernicus-wms", {
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetFeatureInfo",
    LAYERS: layer,
    QUERY_LAYERS: layer,
    CRS: crs,
    BBOX: bbox,
    WIDTH: String(width),
    HEIGHT: String(height),
    I: String(i),
    J: String(j),
    INFO_FORMAT: "application/json",
    ...(time ? { TIME: time } : {}),
    ...(maxcc !== null && maxcc !== undefined ? { MAXCC: String(maxcc) } : {}),
  });

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Copernicus GetFeatureInfo respondió ${response.status}.`);
  }
  return response.json();
}

/**
 * Construye la URL de un snapshot de NASA Worldview a través del proxy.
 *
 * @param {{
 *   layers: string,
 *   bbox: string,
 *   width: number,
 *   height: number,
 *   time: string,
 *   format?: string,
 *   crs?: string
 * }} opts
 * @returns {string}
 */
export function buildWorldviewSnapshotUrl(opts) {
  const {
    layers,
    bbox,
    width,
    height,
    time,
    format = "image/jpeg",
    crs = "EPSG:4326",
  } = opts;

  return buildProxyUrl("worldview-snapshot", {
    REQUEST: "GetSnapshot",
    LAYERS: layers,
    BBOX: bbox,
    WIDTH: String(width),
    HEIGHT: String(height),
    TIME: time,
    FORMAT: format,
    CRS: crs,
  });
}
