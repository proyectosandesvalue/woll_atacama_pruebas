/**
 * Tool: query_layer
 *
 * Devuelve filas concretas de una capa, opcionalmente filtradas por
 * columna=valor. Máximo 50 filas.
 */

import { getDB } from "../../db/pool.js";

export default {
  schema: {
    type: "function",
    function: {
      name: "query_layer",
      description:
        "Devuelve filas individuales de una capa, opcionalmente filtradas " +
        "por pares columna=valor. Solo acepta columnas existentes.",
      parameters: {
        type: "object",
        properties: {
          layer_id: { type: "string" },
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
          limit: {
            type: "integer",
            description: "Máximo de filas (default 20, máximo 50).",
            minimum: 1,
            maximum: 50,
          },
          order_by: {
            type: "string",
            description:
              "Columna para ordenar. Úsala con limit para top-N. " +
              "Ej: 'Caudal Anual Promedio'. Usa el nombre exacto del catálogo.",
          },
          order_dir: {
            type: "string",
            enum: ["asc", "desc"],
            description: "Dirección del orden (default desc).",
          },
        },
        required: ["layer_id"],
        additionalProperties: false,
      },
    },
  },

  run: async ({ layer_id, filters, limit, order_by, order_dir }) => {
    const db = await getDB();
    return db.rpc("chat_query", {
      p_layer: layer_id,
      p_filters: filters ?? {},
      p_limit: limit ?? 20,
      p_order_by: order_by ?? null,
      p_order_dir: order_dir ?? "desc",
    });
  },
};