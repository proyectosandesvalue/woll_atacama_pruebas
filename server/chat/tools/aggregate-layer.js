/**
 * Tool: aggregate_layer
 *
 * Agrupa por una COLUMNA existente en la tabla (count/avg/sum/min/max).
 * NO usar para agrupaciones por comuna/provincia/región (usar
 * aggregate_by_admin).
 */

import { getDB } from "../../db/pool.js";

export default {
  schema: {
    type: "function",
    function: {
      name: "aggregate_layer",
      description:
        "Agrupa los registros de una capa por una COLUMNA existente en la " +
        "tabla (count, avg, sum, min, max). Devuelve top 50 grupos. NO la " +
        "uses si el usuario quiere agrupar por COMUNA, PROVINCIA o REGIÓN: " +
        "para eso usa aggregate_by_admin.",
      parameters: {
        type: "object",
        properties: {
          layer_id: { type: "string" },
          group_by: { type: "string" },
          metric: {
            type: "string",
            enum: ["count", "avg", "sum", "min", "max"],
          },
          field: { type: "string" },
          filters: {
            type: "object",
            additionalProperties: true,
          },
        },
        required: ["layer_id", "group_by"],
        additionalProperties: false,
      },
    },
  },

  run: async ({ layer_id, group_by, metric, field, filters }) => {
    const db = await getDB();
    return db.rpc("chat_aggregate", {
      p_layer: layer_id,
      p_group_by: group_by,
      p_metric: metric ?? "count",
      p_field: field ?? null,
      p_filters: filters ?? {},
    });
  },
};