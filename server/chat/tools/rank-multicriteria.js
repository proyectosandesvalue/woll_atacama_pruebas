/**
 * Tool: rank_multicriteria
 *
 * Ranking multicriterio simple sobre comunas/provincias/regiones.
 *
 * Cada criterio se calcula con `chat_aggregate_by_admin` (count/avg/sum/min/max
 * de una capa), se normaliza min-max y se pondera. Es un MVP: no reemplaza un
 * MCDA completo con restricciones, jerarquía ni sensibilidad.
 */

import { getDB } from "../../db/pool.js";

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

/**
 * Normaliza un valor según dirección.
 * - desc: mayor es mejor.
 * - asc: menor es mejor.
 * Si todos los valores son iguales, devuelve 0.5.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @param {"asc"|"desc"} direction
 */
export function normalizeCriterion(value, min, max, direction = "desc") {
  if (!Number.isFinite(value)) return null;
  if (max === min) return 0.5;
  const base = (value - min) / (max - min);
  return direction === "asc" ? clamp01(1 - base) : clamp01(base);
}

/**
 * Calcula ranking a partir de datos por criterio.
 *
 * @param {Array<{
 *   layer_id:string,
 *   field:string|null,
 *   metric:string,
 *   direction:"asc"|"desc",
 *   weight:number,
 *   data:Array<{group:string,value:number}>
 * }>} criteria
 * @param {string} adminLevel
 */
export function computeRanking(criteria, adminLevel = "comuna") {
  if (!Array.isArray(criteria) || criteria.length === 0) {
    throw new Error("Se requiere al menos un criterio.");
  }

  const totalWeight = criteria.reduce(
    (acc, criterion) => acc + (Number(criterion.weight) || 0),
    0
  );
  if (totalWeight <= 0) {
    throw new Error("Los pesos deben sumar más de cero.");
  }

  const normalizedCriteria = criteria.map((criterion) => {
    const values = (criterion.data || [])
      .map((row) => ({
        group: String(row.group || "").trim(),
        value: Number(row.value),
      }))
      .filter((row) => row.group && Number.isFinite(row.value));

    if (values.length === 0) {
      throw new Error(
        `El criterio ${criterion.layer_id} no devolvió valores.`
      );
    }

    const min = Math.min(...values.map((row) => row.value));
    const max = Math.max(...values.map((row) => row.value));
    return {
      ...criterion,
      weight: (Number(criterion.weight) || 0) / totalWeight,
      min,
      max,
      values,
    };
  });

  const groups = [
    ...new Set(
      normalizedCriteria.flatMap((criterion) =>
        criterion.values.map((row) => row.group)
      )
    ),
  ];

  const ranking = groups
    .map((group) => {
      let score = 0;
      let available = 0;
      const contributions = [];

      for (const criterion of normalizedCriteria) {
        const row = criterion.values.find((item) => item.group === group);
        if (!row) continue;
        const normalized = normalizeCriterion(
          row.value,
          criterion.min,
          criterion.max,
          criterion.direction
        );
        if (normalized === null) continue;
        const contribution = normalized * criterion.weight;
        score += contribution;
        available += criterion.weight;
        contributions.push({
          layer_id: criterion.layer_id,
          field: criterion.field || null,
          metric: criterion.metric,
          direction: criterion.direction,
          weight: Number(criterion.weight.toFixed(4)),
          value: row.value,
          normalized: Number(normalized.toFixed(4)),
          contribution: Number(contribution.toFixed(4)),
        });
      }

      const normalizedScore = available > 0 ? score / available : 0;
      return {
        alternative: group,
        score: Number((normalizedScore * 100).toFixed(2)),
        contributions,
        coverage: Number((available * 100).toFixed(1)),
      };
    })
    .filter((row) => row.coverage > 0)
    .sort((a, b) => b.score - a.score)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return {
    admin_level: adminLevel,
    method: "weighted_sum_minmax",
    weights: normalizedCriteria.map((criterion) => ({
      layer_id: criterion.layer_id,
      field: criterion.field || null,
      metric: criterion.metric,
      direction: criterion.direction,
      weight: Number(criterion.weight.toFixed(4)),
    })),
    ranking,
    assumptions: [
      "Normalización min-max por criterio.",
      "Pesos normalizados para sumar 1.",
      "Solo criterios cuantitativos agregados por admin.",
    ],
    limitations: [
      "No aplica restricciones ni umbrales.",
      "No calcula sensibilidad de pesos.",
      "No reemplaza un MCDA completo.",
    ],
  };
}

export default {
  schema: {
    type: "function",
    function: {
      name: "rank_multicriteria",
      description:
        "Ranking multicriterio simple de comunas/provincias/regiones. " +
        "Cada criterio se calcula con una capa (count/avg/sum/min/max), se " +
        "normaliza y se pondera. Úsalo para 'prioriza comunas según agua y " +
        "clima' o 'ranking con estos pesos'. No aplica restricciones ni " +
        "sensibilidad; es un MVP.",
      parameters: {
        type: "object",
        properties: {
          admin_level: {
            type: "string",
            enum: ["comuna", "provincia", "region"],
          },
          criteria: {
            type: "array",
            minItems: 2,
            maxItems: 6,
            items: {
              type: "object",
              properties: {
                layer_id: { type: "string" },
                field: {
                  type: "string",
                  description: "Columna numérica si metric no es count.",
                },
                metric: {
                  type: "string",
                  enum: ["count", "avg", "sum", "min", "max"],
                },
                direction: {
                  type: "string",
                  enum: ["asc", "desc"],
                  description:
                    "desc = mayor es mejor; asc = menor es mejor.",
                },
                weight: {
                  type: "number",
                  description: "Peso relativo del criterio.",
                },
              },
              required: ["layer_id", "metric", "direction", "weight"],
              additionalProperties: false,
            },
          },
          filters: {
            type: "object",
            additionalProperties: true,
            description:
              "Filtros simples aplicados a todos los criterios. Para rangos usa conditions.",
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
        required: ["admin_level", "criteria"],
        additionalProperties: false,
      },
    },
  },

  run: async ({ admin_level, criteria, filters }) => {
    if (!Array.isArray(criteria) || criteria.length < 2) {
      throw new Error("Se requieren al menos 2 criterios.");
    }

    const db = await getDB();
    const results = await Promise.all(
      criteria.map(async (criterion) => {
        if (
          criterion.metric !== "count" &&
          (!criterion.field || !String(criterion.field).trim())
        ) {
          throw new Error(
            `El criterio ${criterion.layer_id} requiere field para metric=${criterion.metric}.`
          );
        }
        const data = await db.rpc("chat_aggregate_by_admin", {
          p_layer: criterion.layer_id,
          p_admin_level: admin_level,
          p_metric: criterion.metric,
          p_field: criterion.field || null,
          p_filters: filters ?? {},
        });
        return { ...criterion, data };
      })
    );

    return computeRanking(results, admin_level);
  },
};
