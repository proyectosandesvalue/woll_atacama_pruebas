/**
 * Tool: get_layer_metadata
 *
 * Devuelve fuente, fecha, escala, licencia, método, cobertura y limitaciones
 * de una capa. Si un campo no está declarado, devuelve null; el LLM debe
 * decir "no declarado" en vez de inventarlo.
 */

import { getDB } from "../../db/pool.js";

export default {
  schema: {
    type: "function",
    function: {
      name: "get_layer_metadata",
      description:
        "Devuelve metadatos de procedencia de una capa: fuente, URL, fecha de " +
        "actualización, escala, licencia, método, cobertura y limitaciones. " +
        "Úsala para '¿cuál es la fuente?', '¿de cuándo es?', '¿a qué escala?' " +
        "o '¿cómo cito?'.",
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
    const rows = await db.rpc("chat_layers_metadata", {
      p_layers: [layer_id],
    });
    const item = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    return (
      item || {
        layer_id,
        display_name: null,
        source: null,
        source_url: null,
        data_updated_at: null,
        scale: null,
        license: null,
        method: null,
        coverage: null,
        limitations: null,
      }
    );
  },
};
