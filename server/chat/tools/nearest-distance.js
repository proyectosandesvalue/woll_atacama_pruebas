/**
 * Tool: nearest_distance
 *
 * Devuelve la distancia mínima, promedio y máxima desde cada feature de una
 * capa fuente hasta la capa objetivo más cercana. Complementa
 * `count_near_layer`, que solo cuenta.
 */

import { getDB } from "../../db/pool.js";

export default {
  schema: {
    type: "function",
    function: {
      name: "nearest_distance",
      description:
        "Calcula la distancia (en metros) de cada feature de una capa fuente " +
        "a la capa objetivo más cercana. Devuelve mínimo, promedio, máximo y " +
        "cuántos quedan a menos de 1 km y 5 km. Úsala para 'distancia a la " +
        "planta más cercana' o 'qué tan lejos está de un río'.",
      parameters: {
        type: "object",
        properties: {
          layer_id_source: { type: "string" },
          layer_id_targets: {
            type: "array",
            items: { type: "string" },
            description: "Una o varias capas objetivo.",
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
        required: ["layer_id_source", "layer_id_targets"],
        additionalProperties: false,
      },
    },
  },

  run: async ({ layer_id_source, layer_id_targets, filters }) => {
    const db = await getDB();
    return db.rpc("chat_nearest_distance", {
      p_layer_source: layer_id_source,
      p_layer_targets: layer_id_targets,
      p_filters: filters ?? {},
    });
  },
};
