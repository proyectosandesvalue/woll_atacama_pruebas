
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
        "Devuelve la LISTA de columnas de una capa. " +
        "Úsala SOLO si ya intentaste agregar/filtrar y la tool falló " +
        "porque el nombre de la columna era inválido. " +
        "NO la uses antes de actuar: si la columna está en el catálogo, úsala directo.",
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