/**
 * Tool: aggregate_near_layer
 *
 * Igual que count_near_layer pero agrupa por comuna/provincia/región.
 */

import { getDB } from "../../db/pool.js";

export default {
  schema: {
    type: "function",
    function: {
      name: "aggregate_near_layer",
      description:
        "Igual que count_near_layer pero agrupa por comuna, provincia o " +
        "región. Distancia en METROS. Si la pregunta menciona 'fuente " +
        "de agua' genérica, usa layer_id_targets=['agua_superficial'].",
      parameters: {
        type: "object",
        properties: {
          layer_id_source: { type: "string" },
          layer_id_targets: {
            type: "array",
            items: { type: "string" },
            description:
              "Para 'fuente de agua' genérica: ['agua_superficial']. " +
              "Para específicos: ['hidrografia'], ['glaciares'], etc.",
          },
          distance_m: { type: "number" },
          admin_level: {
            type: "string",
            enum: ["comuna", "provincia", "region"],
          },
          filters: {
            type: "object",
            additionalProperties: true,
          },
        },
        required: [
          "layer_id_source",
          "layer_id_targets",
          "distance_m",
          "admin_level",
        ],
        additionalProperties: false,
      },
    },
  },

  run: async ({
    layer_id_source,
    layer_id_targets,
    distance_m,
    admin_level,
    filters,
  }) => {
    const db = await getDB();
    return db.rpc("chat_aggregate_near_layer", {
      p_layer_source: layer_id_source,
      p_layer_targets: layer_id_targets,
      p_distance_m: distance_m,
      p_admin_level: admin_level,
      p_filters: filters ?? {},
    });
  },
};