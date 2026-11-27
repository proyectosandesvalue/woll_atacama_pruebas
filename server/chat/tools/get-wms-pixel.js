/**
 * Tool: get_wms_pixel
 *
 * Consulta GetFeatureInfo de una capa WMS de Copernicus en un punto y fecha.
 *
 * Devuelve el color del píxel, la fecha, la nubosidad y la escena. NO devuelve
 * un valor numérico de NDVI/NDWI: las capas de visualización entregan RGB.
 * Para un índice numérico hace falta una capa de una banda o una ingesta de
 * estadísticas.
 */

import { getDB } from "../../db/pool.js";
import { handleProxy } from "../../proxy/handler.js";
import { getWmsLayer } from "../wms-catalog.js";

const WEB_MERCATOR_RADIUS = 6378137;
const HALF_BOX_METERS = 10;

/**
 * Convierte lat/lon a Web Mercator (EPSG:3857).
 * @param {number} lat
 * @param {number} lon
 * @returns {{x:number, y:number}}
 */
export function toWebMercator(lat, lon) {
  const x = (lon * Math.PI * WEB_MERCATOR_RADIUS) / 180;
  const y =
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) *
      WEB_MERCATOR_RADIUS);
  return { x, y };
}

function parseProxyJson(result) {
  try {
    return JSON.parse(Buffer.from(result.body).toString("utf8"));
  } catch {
    return null;
  }
}

export default {
  schema: {
    type: "function",
    function: {
      name: "get_wms_pixel",
      description:
        "Consulta un píxel de una capa WMS de Copernicus (NDVI, NDWI, EVI, " +
        "humedad, SWIR, etc.) en una comuna o en lat/lon. Devuelve color RGB, " +
        "fecha, nubosidad y escena. NO devuelve el valor numérico del índice; " +
        "el color no es el índice.",
      parameters: {
        type: "object",
        properties: {
          layer_id: {
            type: "string",
            description:
              "ID de la capa Copernicus (ej: copernicus_ndvi, copernicus_ndwi).",
          },
          comuna: {
            type: "string",
            description:
              "Comuna de Atacama. Si se omite, usa lat y lon.",
          },
          lat: {
            type: "number",
            description: "Latitud en WGS84 (opcional si usas comuna).",
          },
          lon: {
            type: "number",
            description: "Longitud en WGS84 (opcional si usas comuna).",
          },
          date: {
            type: "string",
            description:
              "Fecha YYYY-MM-DD (opcional). Si se omite, usa la última escena disponible.",
          },
          maxcc: {
            type: "integer",
            description: "Nubosidad máxima aceptada (0-100). Default 30.",
          },
        },
        required: ["layer_id"],
        additionalProperties: false,
      },
    },
  },

  run: async ({ layer_id, comuna, lat, lon, date, maxcc }) => {
    const layer = getWmsLayer(layer_id);
    if (!layer) throw new Error(`Capa WMS no encontrada: ${layer_id}`);
    if (!layer.pixel_query) {
      throw new Error(
        `La capa ${layer_id} es WMS de solo metadatos; no permite consulta por píxel.`
      );
    }

    let useLat = Number(lat);
    let useLon = Number(lon);
    let usedComuna = comuna || null;

    if ((!Number.isFinite(useLat) || !Number.isFinite(useLon)) && comuna) {
      const db = await getDB();
      const centroid = await db.rpc("chat_comuna_centroid", {
        p_comuna: comuna,
      });
      if (!centroid || !Number.isFinite(Number(centroid.lat))) {
        throw new Error(`No se encontró el centroide de la comuna: ${comuna}`);
      }
      useLat = Number(centroid.lat);
      useLon = Number(centroid.lon);
      usedComuna = centroid.comuna || comuna;
    }

    if (!Number.isFinite(useLat) || !Number.isFinite(useLon)) {
      throw new Error(
        "Debes indicar 'comuna' o un par 'lat'/'lon' válido."
      );
    }

    const { x, y } = toWebMercator(useLat, useLon);
    const bbox = [
      x - HALF_BOX_METERS,
      y - HALF_BOX_METERS,
      x + HALF_BOX_METERS,
      y + HALF_BOX_METERS,
    ].join(",");

    const result = await handleProxy(
      {
        query: {
          source: "copernicus-wms",
          SERVICE: "WMS",
          VERSION: "1.3.0",
          REQUEST: "GetFeatureInfo",
          LAYERS: layer.service_layers,
          QUERY_LAYERS: layer.service_layers,
          CRS: "EPSG:3857",
          BBOX: bbox,
          WIDTH: "1",
          HEIGHT: "1",
          I: "0",
          J: "0",
          INFO_FORMAT: "application/json",
          FEATURE_COUNT: "1",
          MAXCC: String(maxcc ?? layer.wmsMaxcc ?? 30),
          ...(date ? { TIME: date } : {}),
        },
        ip: "chat-wms",
        method: "GET",
      },
      { env: process.env }
    );

    if (result.status !== 200) {
      const payload = parseProxyJson(result);
      throw new Error(
        payload?.error || `Copernicus respondió ${result.status}.`
      );
    }

    const json = parseProxyJson(result);
    const feature = json?.data?.features?.[0];
    if (!feature) {
      return {
        layer_id,
        display_name: layer.display_name,
        comuna: usedComuna,
        lat: useLat,
        lon: useLon,
        date: date || null,
        message:
          "Sin datos en este píxel para la fecha y nubosidad solicitadas.",
      };
    }

    const props = feature.properties || {};
    return {
      layer_id,
      display_name: layer.display_name,
      comuna: usedComuna,
      lat: useLat,
      lon: useLon,
      value_kind: "rgb",
      out1_rojo: props.out1 ?? null,
      out2_verde: props.out2 ?? null,
      out3_azul: props.out3 ?? null,
      out4_mascara: props.out4 ?? null,
      fecha: props.date || date || null,
      hora: props.time || null,
      nubosidad_pct: props.cloudCoverPercentage ?? null,
      escena: props.id || null,
      rango: layer.wmsFeatureInfo?.range || null,
      bandas: layer.wmsFeatureInfo?.bands || null,
      nota:
        layer.wmsFeatureInfo?.note ||
        "El color del píxel no es el valor numérico del índice.",
    };
  },
};
