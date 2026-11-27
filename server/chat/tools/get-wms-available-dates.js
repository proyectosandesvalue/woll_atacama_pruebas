/**
 * Tool: get_wms_available_dates
 *
 * Consulta el WFS de Copernicus para listar los días con imágenes
 * disponibles de una capa, en una comuna o en toda Atacama.
 *
 * No devuelve valores del índice; solo fechas de escena. Para el valor de un
 * píxel usa `get_wms_pixel`.
 */

import { getDB } from "../../db/pool.js";
import { handleProxy } from "../../proxy/handler.js";
import { getWmsLayer } from "../wms-catalog.js";

const ATACAMA_BBOX = "-29.6,-70.6,-25.0,-67.0"; // south,west,north,east
const MAX_FEATURES = 100;
const MAX_PAGES = 3;

function pad(value) {
  return String(value).padStart(2, "0");
}

function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * Construye el rango de fechas de la consulta.
 * @param {number|null} year
 * @param {number|null} month 1-12
 * @param {Date} [now]
 * @returns {{from:string,to:string}}
 */
export function buildDateRange(year = null, month = null, now = new Date()) {
  if (Number.isInteger(month) && month >= 1 && month <= 12) {
    const y = Number.isInteger(year) ? year : now.getFullYear();
    return {
      from: `${y}-${pad(month)}-01`,
      to: `${y}-${pad(month)}-${pad(lastDayOfMonth(y, month))}`,
    };
  }

  if (Number.isInteger(year)) {
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }

  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - 90);
  return {
    from: `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`,
    to: `${to.getFullYear()}-${pad(to.getMonth() + 1)}-${pad(to.getDate())}`,
  };
}

function parseProxyJson(result) {
  try {
    return JSON.parse(Buffer.from(result.body).toString("utf8"));
  } catch {
    return null;
  }
}

async function bboxForComuna(comuna) {
  if (!comuna) return ATACAMA_BBOX;
  const db = await getDB();
  const centroid = await db.rpc("chat_comuna_centroid", { p_comuna: comuna });
  if (!centroid || !Number.isFinite(Number(centroid.lat))) {
    throw new Error(`No se encontró el centroide de la comuna: ${comuna}`);
  }
  const lat = Number(centroid.lat);
  const lon = Number(centroid.lon);
  const delta = 0.05;
  return `${(lat - delta).toFixed(5)},${(lon - delta).toFixed(5)},` +
    `${(lat + delta).toFixed(5)},${(lon + delta).toFixed(5)}`;
}

export default {
  schema: {
    type: "function",
    function: {
      name: "get_wms_available_dates",
      description:
        "Lista los días con imágenes disponibles de una capa Copernicus " +
        "para una comuna o para Atacama. Sirve para elegir una fecha antes " +
        "de consultar get_wms_pixel. No devuelve valores del índice.",
      parameters: {
        type: "object",
        properties: {
          layer_id: {
            type: "string",
            description: "ID de la capa Copernicus (ej: copernicus_ndvi).",
          },
          comuna: {
            type: "string",
            description: "Comuna de Atacama (opcional).",
          },
          year: {
            type: "integer",
            description: "Año (opcional).",
          },
          month: {
            type: "integer",
            description: "Mes 1-12 (opcional). Si se omite, usa el año o los últimos 90 días.",
            minimum: 1,
            maximum: 12,
          },
        },
        required: ["layer_id"],
        additionalProperties: false,
      },
    },
  },

  run: async ({ layer_id, comuna, year, month }) => {
    const layer = getWmsLayer(layer_id);
    if (!layer) throw new Error(`Capa WMS no encontrada: ${layer_id}`);
    if (!layer.pixel_query) {
      throw new Error(
        `La capa ${layer_id} no es Copernicus o no permite consulta de fechas.`
      );
    }

    const { from, to } = buildDateRange(year, month);
    const bbox = await bboxForComuna(comuna);
    const dates = [];
    let totalFeatures = 0;
    let truncated = false;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await handleProxy(
        {
          query: {
            source: "copernicus-wfs",
            SERVICE: "WFS",
            VERSION: "2.0.0",
            REQUEST: "GetFeature",
            TYPENAMES: layer.wmsCollection || "DSS2",
            SRSNAME: "EPSG:4326",
            BBOX: bbox,
            TIME: `${from}/${to}`,
            MAXFEATURES: String(MAX_FEATURES),
            OUTPUTFORMAT: "application/json",
            MAXCC: String(layer.wmsMaxcc ?? 30),
            ...(page > 0 ? { FEATURE_OFFSET: String(page * MAX_FEATURES) } : {}),
          },
          ip: "chat-wms",
          method: "GET",
        },
        { env: process.env }
      );

      if (result.status !== 200) {
        const payload = parseProxyJson(result);
        throw new Error(
          payload?.error || `Copernicus WFS respondió ${result.status}.`
        );
      }

      const json = parseProxyJson(result);
      const features = json?.features || [];
      totalFeatures += features.length;

      for (const feature of features) {
        const date = feature?.properties?.date;
        if (typeof date === "string" && date.length === 10) dates.push(date);
      }

      if (features.length < MAX_FEATURES) break;
      if (page === MAX_PAGES - 1) truncated = true;
    }

    const unique = [...new Set(dates)].sort();
    return {
      layer_id,
      display_name: layer.display_name,
      comuna: comuna || null,
      from,
      to,
      count: unique.length,
      dates: unique,
      total_features: totalFeatures,
      truncated,
      note: truncated
        ? "Hay más escenas que las 300 consultadas; acota el rango de fechas o la comuna."
        : "Fechas de escena para el área consultada; pueden existir otras fuera del bbox.",
    };
  },
};
