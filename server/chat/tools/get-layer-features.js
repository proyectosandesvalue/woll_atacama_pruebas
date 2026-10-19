/**
 * Tool: get_layer_features
 *
 * Devuelve las features de una capa como FeatureCollection para pintarlas
 * en el mapa. Útil cuando el usuario pide ver elementos específicos.
 *
 * El resultado NO se envía al LLM: el orquestador lo extrae por forma
 * y lo adjunta a la respuesta para que el frontend lo pinte.
 */

import { getDB } from "../../db/pool.js";

export default {
  schema: {
    type: "function",
    function: {
      name: "get_layer_features",
      description:
        "Devuelve las features de una capa como FeatureCollection para pintarlas " +
        "en el mapa. Úsala cuando el usuario pida VER los elementos, ubicarlos, o " +
        "combinarlos con una ubicación concreta. Límite: 500 features. Acepta " +
        "filtros por columna=valor y un parámetro opcional color_by para colorear " +
        "las features por una columna categórica (ej: COMUNA, TIPO, ESTADO).",
      parameters: {
        type: "object",
        properties: {
          layer_id: { type: "string" },
          filters: {
            type: "object",
            additionalProperties: true,
            description: "Filtros opcionales por columna=valor.",
          },
          limit: {
            type: "integer",
            description: "Máximo de features (default 500, máximo 1000).",
            minimum: 1,
            maximum: 1000,
          },
          color_by: {
            type: "string",
            description:
              "Opcional. Nombre de la columna por la que se colorearán las " +
              "features en el mapa. Ej: COMUNA, TIPO, USO, ESTADO. Solo se usa " +
              "para generar la leyenda visual; no afecta a los datos.",
          },
        },
        required: ["layer_id"],
        additionalProperties: false,
      },
    },
  },

    run: async ({ layer_id, filters, limit, color_by }) => {
  const db = await getDB();
  const result = await db.rpc("chat_layer_features", {
    p_layer: layer_id,
    p_filters: normalizeFilters(filters),
    p_limit: limit ?? 500,
  });

  return {
    ...result,
    _layer_id: layer_id,
    _color_by: color_by || null,
  };
},
};

/**
 * Normaliza un valor de filtro: quita tildes y espacios extra.
 * El ILIKE de la RPC hará el match case-insensitive.
 */
function normalizeFilterValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") return value;
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");  // quitar tildes
}

function normalizeFilters(filters) {
  if (!filters || typeof filters !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined) continue;
    out[key] = normalizeFilterValue(value);
  }
  return out;
}