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
        "filtros por columna=valor.",
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
        },
        required: ["layer_id"],
        additionalProperties: false,
      },
    },
  },

  run: async ({ layer_id, filters, limit }) => {
  const db = await getDB();
  const result = await db.rpc("chat_layer_features", {
    p_layer: layer_id,
    p_filters: filters ?? {},
    p_limit: limit ?? 500,
  });

  return {
    ...result,
    _layer_id: layer_id,
  };
},
} 