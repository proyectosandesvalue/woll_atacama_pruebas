/**
 * Tool: count_near_layer
 *
 * Cuenta elementos de una capa fuente que están a menos de X metros de
 * los elementos de una o varias capas objetivo.
 */

import { getDB } from "../../db/pool.js";

export default {
  schema: {
    type: "function",
    function: {
      name: "count_near_layer",
      description:
        "Cuenta elementos de una capa que están a menos de X metros de " +
        "los elementos de una o varias capas objetivo. Distancia en " +
        "METROS. Si la pregunta menciona 'fuente de agua', 'cuerpo de " +
        "agua' o similar SIN especificar tipo, usa layer_id_targets=" +
        "['agua_superficial'] (capa unificada que incluye ríos, lagunas, " +
        "salares, humedales y glaciares). Si el usuario pide un tipo " +
        "específico (ej: 'ríos'), usa esa capa concreta (ej: " +
        "['hidrografia']).",
      parameters: {
        type: "object",
        properties: {
          layer_id_source: {
            type: "string",
            description: "Layer_id de la capa a contar (la fuente).",
          },
          layer_id_targets: {
            type: "array",
            items: { type: "string" },
            description:
              "Array de layer_ids objetivo. Para 'fuente de agua' genérica: " +
              "['agua_superficial']. Para tipos específicos: " +
              "['hidrografia'], ['glaciares'], ['humedales'], etc.",
          },
          distance_m: {
            type: "number",
            description: "Distancia máxima en metros (ej: 500).",
          },
          filters: {
            type: "object",
            description: "Filtros opcionales sobre la capa fuente.",
            additionalProperties: true,
          },
        },
        required: ["layer_id_source", "layer_id_targets", "distance_m"],
        additionalProperties: false,
      },
    },
  },

  run: async ({ layer_id_source, layer_id_targets, distance_m, filters }) => {
    const db = await getDB();
    return db.rpc("chat_count_near_layer", {
      p_layer_source: layer_id_source,
      p_layer_targets: layer_id_targets,
      p_distance_m: distance_m,
      p_filters: filters ?? {},
    });
  },
};