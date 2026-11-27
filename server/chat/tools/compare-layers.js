/**
 * Tool: compare_layers
 *
 * Compara 2-4 capas por comuna/provincia/región en una sola llamada.
 * Evita que el orquestador tenga que encadenar varias tools y reduce el
 * riesgo de quedarse sin presupuesto en comparaciones multi-capa.
 */

import { getDB } from "../../db/pool.js";

export default {
  schema: {
    type: "function",
    function: {
      name: "compare_layers",
      description:
        "Compara 2-4 capas por comuna, provincia o región usando count, " +
        "avg, sum, min o max. Úsala para preguntas como 'compara glaciares " +
        "y derechos de agua por comuna' o 'compara plantas solares y eólicas'. " +
        "Devuelve una serie por capa y admin.",
      parameters: {
        type: "object",
        properties: {
          layer_ids: {
            type: "array",
            items: { type: "string" },
            description: "2-4 layer_ids a comparar.",
            minItems: 2,
            maxItems: 4,
          },
          admin_level: {
            type: "string",
            enum: ["comuna", "provincia", "region"],
          },
          metric: {
            type: "string",
            enum: ["count", "avg", "sum", "min", "max"],
          },
          field: {
            type: "string",
            description: "Columna numérica si metric no es count.",
          },
          filters: {
            type: "object",
            additionalProperties: true,
            description:
              "Filtros simples por columna=valor. Para rangos usa conditions.",
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
        required: ["layer_ids", "admin_level"],
        additionalProperties: false,
      },
    },
  },

  run: async ({ layer_ids, admin_level, metric, field, filters }) => {
    const db = await getDB();
    const layers = await Promise.all(
      layer_ids.map(async (layerId) => {
        try {
          const data = await db.rpc("chat_aggregate_by_admin", {
            p_layer: layerId,
            p_admin_level: admin_level,
            p_metric: metric ?? "count",
            p_field: field ?? null,
            p_filters: filters ?? {},
          });
          return { layer_id: layerId, ok: true, data };
        } catch (err) {
          return {
            layer_id: layerId,
            ok: false,
            error: String(err?.message || err),
          };
        }
      })
    );

    return {
      admin_level,
      metric: metric ?? "count",
      field: field ?? null,
      layers,
    };
  },
};
