
/**
 * Tool: get_layer_schema
 *
 * Devuelve el schema REAL de una capa (columnas exactas, tipos, top 5
 * valores). Se usa para evitar que el LLM alucine nombres de columnas.
 */

import { getDB } from "../../db/pool.js";

export default {
  schema: {
    type: "function",
    function: {
      name: "get_layer_schema",
      description:
        "Devuelve el esquema REAL de una capa: lista exacta de columnas " +
        "con tipo, min/max/promedio (numéricas) y top 5 valores " +
        "(categóricas). Úsala SIEMPRE que dudes del nombre exacto de una " +
        "columna antes de agrupar o filtrar por ella.",
      parameters: {
        type: "object",
        properties: {
          layer_id: { type: "string" },
        },
        required: ["layer_id"],
        additionalProperties: false,
      },
    },
  },

  run: async ({ layer_id }) => {
    const db = await getDB();
    return db.rpc("chat_layer_schema", { p_layer: layer_id });
  },
};