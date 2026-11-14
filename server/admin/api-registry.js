/**
 * Registro de conexiones externas del backend (Sprint 45-B).
 *
 * La allowlist real del proxy sigue en `server/proxy/services.js`. Este
 * registro describe las conexiones para el panel; no permite URLs arbitrarias.
 * Los secretos solo se referencian por nombre de variable de entorno.
 */

export const API_REGISTRY = Object.freeze([
  {
    key: "copernicus-wms",
    label: "Copernicus WMS",
    kind: "proxy",
    service: "copernicus-wms",
    baseUrl: "https://sh.dataspace.copernicus.eu/ogc/wms",
    description: "Tiles satelitales WMS de Copernicus Data Space.",
    secretEnv: ["COPERNICUS_INSTANCE_ID", "INSTANCE_ID"],
    requiredEnv: [],
    requiredAnyEnv: ["COPERNICUS_INSTANCE_ID", "INSTANCE_ID"],
    testType: "proxy",
    testQuery: "SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities",
  },
  {
    key: "copernicus-wfs",
    label: "Copernicus WFS",
    kind: "proxy",
    service: "copernicus-wfs",
    baseUrl: "https://sh.dataspace.copernicus.eu/ogc/wfs",
    description: "Disponibilidad y huellas de escenas Copernicus.",
    secretEnv: ["COPERNICUS_INSTANCE_ID", "INSTANCE_ID"],
    requiredEnv: [],
    requiredAnyEnv: ["COPERNICUS_INSTANCE_ID", "INSTANCE_ID"],
    testType: "proxy",
    testQuery: "SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities",
  },
  {
    key: "copernicus-wmts",
    label: "Copernicus WMTS",
    kind: "proxy",
    service: "copernicus-wmts",
    baseUrl: "https://sh.dataspace.copernicus.eu/ogc/wmts",
    description: "Tiles WMTS de Copernicus.",
    secretEnv: ["COPERNICUS_INSTANCE_ID", "INSTANCE_ID"],
    requiredEnv: [],
    requiredAnyEnv: ["COPERNICUS_INSTANCE_ID", "INSTANCE_ID"],
    testType: "proxy",
    testQuery: "SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetCapabilities",
  },
  {
    key: "worldview-snapshot",
    label: "NASA Worldview Snapshots",
    kind: "proxy",
    service: "worldview-snapshot",
    baseUrl: "https://wvs.earthdata.nasa.gov/api/v1/snapshot",
    description: "Snapshots de imágenes satelitales NASA.",
    secretEnv: [],
    requiredEnv: [],
    testType: "proxy",
    testQuery: "REQUEST=GetSnapshot&LAYERS=MODIS_Terra_CorrectedReflectance_TrueColor&CRS=EPSG:4326&BBOX=-70,-28,-69,-27&WIDTH=64&HEIGHT=64&FORMAT=image/jpeg&TIME=2024-01-01",
  },
  {
    key: "arclim",
    label: "ARClim (MMA)",
    kind: "http",
    baseUrl: "https://arclim.mma.gob.cl/api/datos/comunas/geojson/",
    description: "Indicadores climáticos comunales de ARClim.",
    secretEnv: [],
    requiredEnv: [],
    testType: "http",
    testMethod: "GET",
  },
  {
    key: "agromet",
    label: "Agromet (INIA)",
    kind: "http",
    baseUrl: "https://www.agromet.cl/ext/aux/getUltLectEma.php",
    description: "Últimas lecturas de estaciones Agromet.",
    secretEnv: [],
    requiredEnv: [],
    testType: "http",
    testMethod: "GET",
  },
  {
    key: "meteochile",
    label: "MeteoChile (DMC)",
    kind: "http",
    baseUrl: "https://climatologia.meteochile.gob.cl",
    description: "Datos de estaciones de la Dirección Meteorológica de Chile.",
    secretEnv: ["METEOCHILE_TOKEN", "METEOCHILE_USER"],
    requiredEnv: [],
    testType: "http",
    testMethod: "GET",
  },
  {
    key: "embeddings",
    label: "Proveedor de embeddings",
    kind: "embeddings",
    baseUrl: "",
    description: "Endpoint OpenAI-compatible usado por la ingesta RAG.",
    secretEnv: ["EMBEDDINGS_API_KEY"],
    requiredEnv: ["EMBEDDINGS_BASE_URL", "EMBEDDINGS_MODEL"],
    testType: "embeddings",
  },
]);

export function getApiDefinition(key) {
  return API_REGISTRY.find((item) => item.key === key) || null;
}

/**
 * Estado de las variables de entorno, solo nombres y presencia.
 *
 * @param {object} definition
 * @param {NodeJS.ProcessEnv} [env]
 */
export function envStatus(definition, env = process.env) {
  const names = [...new Set([
    ...(definition.requiredEnv || []),
    ...(definition.requiredAnyEnv || []),
    ...(definition.secretEnv || []),
  ])];
  return names.map((name) => ({
    name,
    present: Boolean(env[name] && String(env[name]).trim()),
  }));
}

export function publicDefinition(definition, env = process.env) {
  return {
    key: definition.key,
    label: definition.label,
    kind: definition.kind,
    description: definition.description,
    baseUrl: definition.baseUrl || "",
    requiredEnv: definition.requiredEnv || [],
    requiredAnyEnv: definition.requiredAnyEnv || [],
    secretEnv: definition.secretEnv || [],
    env: envStatus(definition, env),
  };
}
