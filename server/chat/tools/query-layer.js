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
      p_filters: filters ?? {},
      p_limit: limit ?? 20,
    });
  },
};