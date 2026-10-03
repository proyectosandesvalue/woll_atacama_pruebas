/**
 * Tool: aggregate_by_admin
 *
 * Agrupa registros por división administrativa (comuna/provincia/región)
 * vía intersección espacial (PostGIS ST_Intersects). Funciona incluso si
 * la capa no tiene columna 'comuna'.
 */

import { getDB } from "../../db/pool.js";

export default {
  schema: {
    type: "function",
    function: {
      name: "aggregate_by_admin",
      description:
        "Agrupa los registros de una capa por la división administrativa " +
        "(comuna, provincia o región) donde geográficamente caen, " +
        "mediante intersección espacial (PostGIS ST_Intersects). " +
        "ÚSALA SIEMPRE que el usuario pregunte '¿cuántos X hay por " +
        "comuna?', '¿en qué comuna hay más X?', etc. Funciona incluso " +
        "si la capa NO tiene columna 'comuna'.",
      parameters: {
        type: "object",
        properties: {
          layer_id: { type: "string" },
          admin_level: {
            type: "string",
            enum: ["comuna", "provincia", "region"],
          },
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
        required: ["layer_id", "admin_level"],
        additionalProperties: false,
      },
    },
  },

  run: async ({ layer_id, admin_level, metric, field, filters }) => {
    const db = await getDB();
    return db.rpc("chat_aggregate_by_admin", {
      p_layer: layer_id,
      p_admin_level: admin_level,
      p_metric: metric ?? "count",
      p_field: field ?? null,
      p_filters: filters ?? {},
    });
  },
};