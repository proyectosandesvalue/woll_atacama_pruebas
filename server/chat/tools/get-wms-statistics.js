/**
 * Tool: get_wms_statistics
 *
 * Estadísticas numéricas de un índice Copernicus para una comuna y un rango
 * de fechas. Usa Copernicus Statistical API (OAuth client credentials).
 *
 * A diferencia de `get_wms_pixel`, que devuelve RGB, esta tool devuelve
 * mean/min/max/stDev y una serie por intervalo.
 */

import { getDB } from "../../db/pool.js";
import { getWmsLayer } from "../wms-catalog.js";
import {
  getStatistics,
  getIndexSpec,
  supportsStatistics,
} from "../../copernicus/statistics.js";

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateStr(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 90);
  return { from: dateStr(from), to: dateStr(to) };
}

function isValidDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Convierte un bbox [west,south,east,north] en polígono GeoJSON.
 * @param {number[]} bbox
 */
export function bboxPolygon(bbox) {
  const [west, south, east, north] = bbox.map(Number);
  return {
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
}

/**
 * Crea un cuadrado aproximado alrededor de un punto.
 * @param {number} lat
 * @param {number} lon
 * @param {number} meters
 */
export function pointBufferPolygon(lat, lon, meters) {
  const dLat = meters / 111320;
  const dLon = meters / (111320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return {
    geometry: bboxPolygon([lon - dLon, lat - dLat, lon + dLon, lat + dLat]),
    bbox: [lon - dLon, lat - dLat, lon + dLon, lat + dLat],
  };
}

function isPolygonGeometry(geometry) {
  return (
    geometry &&
    typeof geometry === "object" &&
    (geometry.type === "Polygon" || geometry.type === "MultiPolygon") &&
    Array.isArray(geometry.coordinates)
  );
}

async function resolveAoi({
  comuna,
  geometry,
  bbox,
  lat,
  lon,
  buffer_m,
}) {
  if (isPolygonGeometry(geometry)) {
    return {
      geometry,
      aoi_type: "geometry",
      aoi_label: "polígono personalizado",
      bbox: null,
    };
  }

  if (Array.isArray(bbox) && bbox.length === 4) {
    const parsed = bbox.map(Number);
    if (parsed.every(Number.isFinite)) {
      return {
        geometry: bboxPolygon(parsed),
        aoi_type: "bbox",
        aoi_label: "bbox personalizado",
        bbox: parsed,
      };
    }
  }

  const useLat = Number(lat);
  const useLon = Number(lon);
  if (Number.isFinite(useLat) && Number.isFinite(useLon)) {
    const meters = Math.min(
      Math.max(Number(buffer_m) || 100, 10),
      5000
    );
    const buffered = pointBufferPolygon(useLat, useLon, meters);
    return {
      geometry: buffered.geometry,
      aoi_type: "point_buffer",
      aoi_label: `buffer ${meters} m`,
      bbox: buffered.bbox,
    };
  }

  if (comuna) {
    const db = await getDB();
    const geo = await db.rpc("chat_comuna_geometry", { p_comuna: comuna });
    if (!geo || !geo.geometry) {
      throw new Error(`No se encontró la comuna: ${comuna}`);
    }
    return {
      geometry: geo.geometry,
      aoi_type: "comuna",
      aoi_label: geo.comuna || comuna,
      bbox: geo.bbox || null,
    };
  }

  throw new Error(
    "Indica 'comuna', 'geometry', 'bbox' o 'lat'/'lon' para definir el área."
  );
}

export default {
  schema: {
    type: "function",
    function: {
      name: "get_wms_statistics",
      description:
        "Calcula estadísticas numéricas de un índice Copernicus (NDVI, NDWI, " +
        "NDCI, EVI, SAVI, etc.) para una comuna y un rango de fechas. " +
        "Devuelve media, mínimo, máximo, desviación estándar y serie temporal. " +
        "Requiere COPERNICUS_CLIENT_ID/SECRET en el servidor.",
      parameters: {
        type: "object",
        properties: {
          layer_id: {
            type: "string",
            description:
              "Capa Copernicus con fórmula numérica (ej: copernicus_ndvi).",
          },
          comuna: {
            type: "string",
            description: "Comuna de Atacama. Opcional si usas geometry/bbox/lat-lon.",
          },
          geometry: {
            type: "object",
            description:
              "Polígono GeoJSON (Polygon o MultiPolygon) para un AOI arbitrario.",
            additionalProperties: true,
          },
          bbox: {
            type: "array",
            items: { type: "number" },
            description:
              "BBox [oeste, sur, este, norte] en WGS84 para un AOI rectangular.",
            minItems: 4,
            maxItems: 4,
          },
          lat: {
            type: "number",
            description: "Latitud del punto (para buffer).",
          },
          lon: {
            type: "number",
            description: "Longitud del punto (para buffer).",
          },
          buffer_m: {
            type: "number",
            description:
              "Buffer en metros alrededor de lat/lon (default 100, máximo 5000).",
          },
          from: {
            type: "string",
            description: "Fecha inicial YYYY-MM-DD (default: hace 90 días).",
          },
          to: {
            type: "string",
            description: "Fecha final YYYY-MM-DD (default: hoy).",
          },
          maxcc: {
            type: "integer",
            description: "Nubosidad máxima aceptada (0-100). Default 30.",
          },
          interval: {
            type: "string",
            enum: ["P1D", "P1W", "P1M"],
            description: "Intervalo de agregación (default P1M).",
          },
          thresholds: {
            type: "array",
            items: { type: "number" },
            description:
              "Umbrales para calcular % de área sobre/bajo el valor. " +
              "Ej: [0.6] para NDVI alto.",
          },
        },
        required: ["layer_id"],
        additionalProperties: false,
      },
    },
  },

  run: async ({
    layer_id,
    comuna,
    geometry,
    bbox,
    lat,
    lon,
    buffer_m,
    from,
    to,
    maxcc,
    interval,
    thresholds,
  }) => {
    const layer = getWmsLayer(layer_id);
    if (!layer) throw new Error(`Capa WMS no encontrada: ${layer_id}`);
    if (!layer.pixel_query) {
      throw new Error(`La capa ${layer_id} no es Copernicus.`);
    }
    if (!supportsStatistics(layer_id)) {
      throw new Error(
        `La capa ${layer_id} no tiene estadística numérica implementada. ` +
          "Usa get_wms_pixel para color/escena."
      );
    }

    const range = defaultRange();
    const start = from || range.from;
    const end = to || range.to;
    if (!isValidDate(start) || !isValidDate(end)) {
      throw new Error("Las fechas deben tener formato YYYY-MM-DD.");
    }
    if (start > end) {
      throw new Error("La fecha inicial no puede ser posterior a la final.");
    }

    const aoi = await resolveAoi({
      comuna,
      geometry,
      bbox,
      lat,
      lon,
      buffer_m,
    });

    const stats = await getStatistics({
      layerId: layer_id,
      geometry: aoi.geometry,
      from: start,
      to: end,
      maxcc: maxcc ?? layer.wmsMaxcc ?? 30,
      interval: interval || "P1M",
      thresholds: Array.isArray(thresholds) ? thresholds : [],
    });

    return {
      ...stats,
      display_name: layer.display_name,
      comuna: comuna || null,
      aoi_type: aoi.aoi_type,
      aoi_label: aoi.aoi_label,
      index_label: getIndexSpec(layer_id)?.label || layer_id,
      bbox: aoi.bbox || null,
      note:
        stats.series.length === 0
          ? "Sin datos para el rango, AOI y nubosidad solicitados."
          : "Estadísticas calculadas sobre el AOI con Sentinel-2 L2A.",
    };
  },
};
