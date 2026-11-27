/**
 * Tool: spatial_overlay
 *
 * Responde preguntas de intersección, contención y superficie entre una capa
 * fuente y una o varias capas objetivo. No reemplaza un SIG, pero cubre el
 * "qué hay dentro/cuánto se superpone" que antes no tenía tool.
 */

import { getDB } from "../../db/pool.js";

export default {
  schema: {
    type: "function",
    function: {
      name: "spatial_overlay",
      description:
        "Calcula intersección, contención o superficie entre una capa fuente " +
        "y una o varias capas objetivo. Operaciones: 'intersects' (cuenta " +
        "features que tocan), 'within' (cuenta features contenidos) y 'area' " +
        "(cuenta y suma superficie de intersección en m² y ha).",
      parameters: {
        type: "object",
        properties: {
          layer_id_source: { type: "string" },
          layer_id_targets: {
            type: "array",
            items: { type: "string" },
            description: "Una o varias capas objetivo.",
          },
          operation: {
            type: "string",
            enum: ["intersects", "within", "area"],
          },
          filters: {
            type: "object",
            additionalProperties: true,
            description:
              "Filtros simples sobre la capa fuente. Para rangos usa conditions.",
          },
          conditions: {
            type: "array",
            description:
              "Filtros avanzados: [{field, op, value|values}]. " +
              "op válido: match, eq, in, ilike, gt, gte, lt, lte, between.",
            items: {
              type: "object",
              properties: {
                field: { type: "string" },
                op: { type: "string" },
                value: { type: "string" },
                values: { type: "array", items: { type: "string" } },
              },
              required: ["field", "op"],
            },
          },
        },
        required: ["layer_id_source", "layer_id_targets", "operation"],
        additionalProperties: false,
      },
    },
  },

  run: async ({ layer_id_source, layer_id_targets, operation, filters }) => {
    const db = await getDB();
    return db.rpc("chat_spatial_overlay", {
      p_layer_source: layer_id_source,
      p_layer_targets: layer_id_targets,
      p_operation: operation,
      p_filters: filters ?? {},
    });
  },
};
