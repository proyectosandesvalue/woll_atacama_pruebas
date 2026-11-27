/**
 * Tool: aggregate_by_admin_and_column
 *
 * Doble agrupación: por comuna/provincia/región Y por una columna adicional.
 * Ej: "¿cuántos derechos de agua por comuna según tipo de uso?"
 */

import { getDB } from "../../db/pool.js";

export default {
  schema: {
    type: "function",
    function: {
      name: "aggregate_by_admin_and_column",
      description:
        "Doble agrupación: por comuna/provincia/región Y por una columna " +
        "adicional. Úsala para '¿cuántos X por comuna según Y?'. " +
        "Devuelve lista plana de {admin, group, value}.",
      parameters: {
        type: "object",
        properties: {
          layer_id: { type: "string" },
          admin_level: {
            type: "string",
            enum: ["comuna", "provincia", "region"],
          },
          group_by: {
            type: "string",
            description:
              "Columna adicional por la que agrupar. Verifícala con " +
              "get_layer_schema.",
          },
          metric: {
            type: "string",
            enum: ["count", "avg", "sum", "min", "max"],
          },
          field: { type: "string" },
          filters: {
            type: "object",
            additionalProperties: true,
            description:
              "Filtros simples por columna=valor. Para rangos numéricos, listas o between usa conditions.",
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
        required: ["layer_id", "admin_level", "group_by"],
        additionalProperties: false,
      },
    },
  },

  run: async ({ layer_id, admin_level, group_by, metric, field, filters }) => {
    const db = await getDB();
    return db.rpc("chat_aggregate_by_admin_and_column", {
      p_layer: layer_id,
      p_admin_level: admin_level,
      p_group_by: group_by,
      p_metric: metric ?? "count",
      p_field: field ?? null,
      p_filters: filters ?? {},
    });
  },
};