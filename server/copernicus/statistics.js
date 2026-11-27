/**
 * Cliente mínimo de Copernicus Statistical API.
 *
 * Devuelve estadísticas numéricas de un índice (NDVI, NDWI, etc.) para un
 * polígono y un rango de fechas. Usa OAuth client credentials; el token se
 * cachea en memoria hasta 60 s antes de expirar.
 *
 * Variables:
 *   COPERNICUS_CLIENT_ID
 *   COPERNICUS_CLIENT_SECRET
 *
 * No se llama desde el frontend. El chat la usa server-side.
 */

const TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const STATISTICS_URL =
  "https://sh.dataspace.copernicus.eu/api/v1/statistics";

const TOKEN_SAFETY_MS = 60_000;
let _tokenCache = { token: null, expiresAt: 0 };

function requireCredentials(env) {
  const clientId = env.COPERNICUS_CLIENT_ID;
  const clientSecret = env.COPERNICUS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Falta COPERNICUS_CLIENT_ID o COPERNICUS_CLIENT_SECRET en el servidor."
    );
  }
  return { clientId, clientSecret };
}

/**
 * Obtiene un token OAuth client_credentials.
 * @param {{env?:object, fetchImpl?:Function, now?:number}} [opts]
 * @returns {Promise<string>}
 */
export async function getAccessToken({
  env = process.env,
  fetchImpl = fetch,
  now = Date.now(),
} = {}) {
  if (_tokenCache.token && now < _tokenCache.expiresAt - TOKEN_SAFETY_MS) {
    return _tokenCache.token;
  }

  const { clientId, clientSecret } = requireCredentials(env);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Copernicus OAuth respondió ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  if (!json.access_token) {
    throw new Error("Copernicus OAuth no devolvió access_token.");
  }

  const expiresIn = Number(json.expires_in) || 600;
  _tokenCache = {
    token: json.access_token,
    expiresAt: now + expiresIn * 1000,
  };
  return _tokenCache.token;
}

/** Solo para tests. */
export function _resetTokenCache() {
  _tokenCache = { token: null, expiresAt: 0 };
}

function scriptFor({ bands, body }) {
  const input = [...bands, "dataMask"].map((band) => `"${band}"`).join(", ");
  return `//VERSION=3
function setup() {
  return {
    input: [${input}],
    output: [
      { id: "index", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  ${body}
  return { index: [value], dataMask: [s.dataMask] };
}`;
}

/**
 * Índices con fórmula numérica implementada.
 * El `layer_id` es el del visor; `bands` son las bandas Sentinel-2 usadas.
 */
export const INDEX_SPECS = Object.freeze({
  copernicus_ndvi: {
    label: "NDVI",
    bands: ["B04", "B08"],
    body: "const d = s.B08 + s.B04; const value = d === 0 ? 0 : (s.B08 - s.B04) / d;",
  },
  copernicus_ndwi: {
    label: "NDWI",
    bands: ["B03", "B08"],
    body: "const d = s.B03 + s.B08; const value = d === 0 ? 0 : (s.B03 - s.B08) / d;",
  },
  copernicus_ndci: {
    label: "NDCI",
    bands: ["B04", "B05"],
    body: "const d = s.B05 + s.B04; const value = d === 0 ? 0 : (s.B05 - s.B04) / d;",
  },
  copernicus_evi: {
    label: "EVI",
    bands: ["B02", "B04", "B08"],
    body: "const d = s.B08 + 6 * s.B04 - 7.5 * s.B02 + 1; const value = d === 0 ? 0 : 2.5 * (s.B08 - s.B04) / d;",
  },
  copernicus_evi2: {
    label: "EVI2",
    bands: ["B04", "B08"],
    body: "const d = s.B08 + 2.4 * s.B04 + 1; const value = d === 0 ? 0 : 2.5 * (s.B08 - s.B04) / d;",
  },
  copernicus_gndvi: {
    label: "GNDVI",
    bands: ["B03", "B08"],
    body: "const d = s.B08 + s.B03; const value = d === 0 ? 0 : (s.B08 - s.B03) / d;",
  },
  copernicus_savi: {
    label: "SAVI",
    bands: ["B04", "B08"],
    body: "const d = s.B08 + s.B04 + 0.5; const value = d === 0 ? 0 : (s.B08 - s.B04) * 1.5 / d;",
  },
  copernicus_msavi2: {
    label: "MSAVI2",
    bands: ["B04", "B08"],
    body: "const t = 2 * s.B08 + 1; const d = t * t - 8 * (s.B08 - s.B04); const value = d < 0 ? 0 : (t - Math.sqrt(d)) / 2;",
  },
  copernicus_ndyi: {
    label: "NDYI",
    bands: ["B02", "B03"],
    body: "const d = s.B03 + s.B02; const value = d === 0 ? 0 : (s.B03 - s.B02) / d;",
  },
  copernicus_psri: {
    label: "PSRI",
    bands: ["B02", "B04", "B06"],
    body: "const value = s.B06 === 0 ? 0 : (s.B04 - s.B02) / s.B06;",
  },
  copernicus_vari: {
    label: "VARI",
    bands: ["B02", "B03", "B04"],
    body: "const d = s.B03 + s.B04 - s.B02; const value = d === 0 ? 0 : (s.B03 - s.B04) / d;",
  },
  copernicus_mcari: {
    label: "MCARI",
    bands: ["B03", "B04", "B05"],
    body: "const value = s.B04 === 0 ? 0 : ((s.B05 - s.B04) - 0.2 * (s.B05 - s.B03)) * (s.B05 / s.B04);",
  },
  copernicus_ari_1: {
    label: "ARI_1",
    bands: ["B03", "B05"],
    body: "const value = (s.B03 === 0 || s.B05 === 0) ? 0 : 1 / s.B03 - 1 / s.B05;",
  },
  copernicus_msi: {
    label: "MSI",
    bands: ["B08", "B11"],
    body: "const value = s.B08 === 0 ? 0 : s.B11 / s.B08;",
  },
  copernicus_moisture_index: {
    label: "NDMI",
    bands: ["B08", "B11"],
    body: "const d = s.B08 + s.B11; const value = d === 0 ? 0 : (s.B08 - s.B11) / d;",
  },
});

export function supportsStatistics(layerId) {
  return Boolean(INDEX_SPECS[layerId]);
}

export function getIndexSpec(layerId) {
  return INDEX_SPECS[layerId] || null;
}

function isoStart(date) {
  return `${date}T00:00:00Z`;
}

function isoEnd(date) {
  return `${date}T23:59:59Z`;
}

/**
 * Construye el body de Statistical API. Función pura para tests.
 * @param {{
 *   layerId:string,
 *   geometry:object,
 *   from:string,
 *   to:string,
 *   maxcc?:number,
 *   interval?:string
 * }} input
 */
export function buildStatisticsBody({
  layerId,
  geometry,
  from,
  to,
  maxcc = 30,
  interval = "P1M",
}) {
  const spec = getIndexSpec(layerId);
  if (!spec) {
    throw new Error(`Índice sin estadística numérica: ${layerId}`);
  }
  if (!geometry || typeof geometry !== "object") {
    throw new Error("Se requiere una geometría GeoJSON de la comuna.");
  }

  return {
    input: {
      bounds: {
        geometry,
        properties: {
          crs: "http://www.opengis.net/def/crs/EPSG/0/4326",
        },
      },
      data: [
        {
          type: "sentinel-2-l2a",
          dataFilter: {
            timeRange: { from: isoStart(from), to: isoEnd(to) },
            maxCloudCoverage: maxcc,
          },
        },
      ],
    },
    aggregation: {
      timeRange: { from: isoStart(from), to: isoEnd(to) },
      aggregationInterval: { of: interval },
      evalscript: scriptFor(spec),
    },
    calculations: {
      default: {
        statistics: {
          default: {
            percentiles: { k: [25, 50, 75] },
          },
        },
      },
    },
  };
}

function firstBandStats(outputs) {
  const bands = outputs?.index?.bands;
  if (!bands || typeof bands !== "object") return null;
  const key = Object.keys(bands)[0];
  return key ? bands[key]?.stats || null : null;
}

/**
 * Normaliza la respuesta de Statistical API a una serie.
 * @param {object} json
 */
export function normalizeStatisticsResponse(json) {
  const rows = Array.isArray(json?.data) ? json.data : [];
  const series = rows
    .map((row) => {
      const stats = firstBandStats(row.outputs);
      if (!stats) return null;
      return {
        from: row.interval?.from || null,
        to: row.interval?.to || null,
        mean: Number(stats.mean),
        min: Number(stats.min),
        max: Number(stats.max),
        stDev: Number(stats.stDev),
        sampleCount: Number(stats.sampleCount),
        noDataCount: Number(stats.noDataCount),
        percentiles: stats.percentiles || null,
      };
    })
    .filter((row) => row && Number.isFinite(row.mean));

  if (series.length === 0) {
    return { series: [], mean: null, min: null, max: null, sampleCount: 0 };
  }

  const sampleCount = series.reduce(
    (acc, row) => acc + (row.sampleCount || 0),
    0
  );
  const weightedMean =
    sampleCount > 0
      ? series.reduce((acc, row) => acc + row.mean * (row.sampleCount || 0), 0) /
        sampleCount
      : series.reduce((acc, row) => acc + row.mean, 0) / series.length;

  return {
    series,
    mean: Number(weightedMean.toFixed(4)),
    min: Math.min(...series.map((row) => row.min)),
    max: Math.max(...series.map((row) => row.max)),
    sampleCount,
  };
}

/**
 * Ejecuta Statistical API para una capa y geometría.
 * @param {{
 *   layerId:string,
 *   geometry:object,
 *   from:string,
 *   to:string,
 *   maxcc?:number,
 *   interval?:string,
 *   env?:object,
 *   fetchImpl?:Function,
 *   now?:number
 * }} input
 */
export async function getStatistics({
  layerId,
  geometry,
  from,
  to,
  maxcc = 30,
  interval = "P1M",
  env = process.env,
  fetchImpl = fetch,
  now = Date.now(),
}) {
  const body = buildStatisticsBody({
    layerId,
    geometry,
    from,
    to,
    maxcc,
    interval,
  });
  const token = await getAccessToken({ env, fetchImpl, now });

  const res = await fetchImpl(STATISTICS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Copernicus Statistical API respondió ${res.status}: ${text.slice(0, 300)}`
    );
  }

  const json = await res.json();
  const normalized = normalizeStatisticsResponse(json);
  return {
    layer_id: layerId,
    index: getIndexSpec(layerId)?.label || layerId,
    from,
    to,
    interval,
    ...normalized,
  };
}
