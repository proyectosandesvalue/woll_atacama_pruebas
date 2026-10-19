/**
 * Tool: query_layer
 *
 * Devuelve filas concretas de una capa, opcionalmente filtradas por
 * columna=valor. Máximo 50 filas.
 */

import { getDB } from "../../db/pool.js";

export default {
  schema: {
    type: "function",
    function: {
      name: "query_layer",
      description:
        "Devuelve filas individuales de una capa, opcionalmente filtradas " +
        "por pares columna=valor. Solo acepta columnas existentes.",
      parameters: {
        type: "object",
        properties: {
          layer_id: { type: "string" },
          filters: {
            type: "object",
            additionalProperties: true,
          },
          limit: {
            type: "integer",
            description: "Máximo de filas (default 20, máximo 50).",
            minimum: 1,
            maximum: 50,
          },
        },
        required: ["layer_id"],
        additionalProperties: false,
      },
    },
  },

  run: async ({ layer_id, filters, limit }) => {
  const db = await getDB();
  return db.rpc("chat_query", {
    p_layer: layer_id,
    p_filters: normalizeFilters(filters),
    p_limit: limit ?? 20,
  });
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