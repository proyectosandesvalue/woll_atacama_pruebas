/**
 * Tool: get_layer_stats
 *
 * Devuelve stats precalculadas de una capa: count, min/max/mean/median/stddev
 * de cada atributo numérico y top 5 valores de cada atributo categórico.
 */

import { getDB } from "../../db/pool.js";

export default {
  schema: {
    type: "function",
    function: {
      name: "get_layer_stats",
      description:
        "Devuelve estadísticas precalculadas de una capa: count, rangos " +
        "numéricos (min, max, promedio, mediana, desv. estándar) y top 5 " +
        "valores por atributo. Úsala cuando el usuario pida cifras " +
        "agregadas de una capa específica. Para agrupaciones por " +
        "comuna/provincia/región, usa aggregate_by_admin.",
      parameters: {
        type: "object",
        properties: {
          layer_id: {
            type: "string",
            description:
              "Identificador interno de la capa (ver catálogo del sistema).",
          },
        },
        required: ["layer_id"],
        additionalProperties: false,
      },
    },
  },

  run: async ({ layer_id }) => {
    const db = await getDB();
    return db.rpc("chat_layer_stats", { p_layer: layer_id });
  },
};