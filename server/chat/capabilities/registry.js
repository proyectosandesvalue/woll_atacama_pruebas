/**
 * Registro de capacidades del chat.
 *
 * Describe las 9 tools atómicas y los 3 pipelines compuestos de forma
 * declarativa. El router (40-C.2) usa este registro para decidir qué
 * ejecutar.
 *
 * Un pipeline es una secuencia de pasos que se ejecutan en paralelo o
 * en serie. Cada paso referencia una tool y sus argumentos (con slots
 * sustituibles: "$layer_id", "$filters", "$group_by", "$color_by").
 */

export const TOOLS = {
  get_layer_stats: {
    type: "tool",
    description: "Estadísticas generales de una capa.",
    requires: ["layer_id"],
  },
  get_layer_schema: {
    type: "tool",
    description: "Esquema de columnas de una capa.",
    requires: ["layer_id"],
  },
  query_layer: {
    type: "tool",
    description: "Filas concretas de una capa (listado).",
    requires: ["layer_id"],
  },
  aggregate_layer: {
    type: "tool",
    description: "Agregación por una columna (tipo, uso, etc.).",
    requires: ["layer_id", "group_by"],
  },
  aggregate_by_admin: {
    type: "tool",
    description: "Agregación por comuna/provincia/región.",
    requires: ["layer_id", "admin_level"],
  },
  aggregate_by_admin_and_column: {
    type: "tool",
    description: "Doble agrupación: admin + columna.",
    requires: ["layer_id", "admin_level", "group_by"],
  },
  count_near_layer: {
    type: "tool",
    description: "Conteo por proximidad a otra capa.",
    requires: ["layer_id_source", "layer_id_targets", "distance_m"],
  },
  aggregate_near_layer: {
    type: "tool",
    description: "Agregación por proximidad, agrupada por admin.",
    requires: ["layer_id_source", "layer_id_targets", "distance_m", "admin_level"],
  },
  get_layer_features: {
    type: "tool",
    description: "FeatureCollection para pintar en el mapa.",
    requires: ["layer_id"],
  },
};

export const PIPELINES = {
  /**
   * Listado con pintado en mapa (reemplaza Regla 20).
   * Para "¿cuáles son los X?" o "lista los X".
   */
  listado_con_mapa: {
    type: "pipeline",
    intents: ["dato_simple"],
    requires: ["layer_id"],
    timeoutMs: 6000,
    steps: [
      {
        tool: "query_layer",
        args: { layer_id: "$layer_id", filters: "$filters" },
      },
      {
        tool: "get_layer_features",
        args: { layer_id: "$layer_id", filters: "$filters" },
      },
    ],
  },

  /**
   * Ubicación con distribución (reemplaza Reglas 13 y 14).
   * Para "¿dónde están los X?".
   */
  ubicacion_con_distribucion: {
    type: "pipeline",
    intents: ["dato_simple"],
    requires: ["layer_id"],
    timeoutMs: 6000,
    steps: [
      {
        tool: "get_layer_features",
        args: { layer_id: "$layer_id", filters: "$filters" },
      },
      {
        tool: "aggregate_by_admin",
        args: { layer_id: "$layer_id", admin_level: "comuna" },
      },
    ],
  },

  /**
   * Distribución con elementos (reemplaza Regla 19).
   * Para "¿cuántos X por <campo>?".
   */
  distribucion_con_elementos: {
    type: "pipeline",
    intents: ["dato_simple"],
    requires: ["layer_id", "group_by"],
    timeoutMs: 6000,
    steps: [
      {
        tool: "aggregate_layer",
        args: { layer_id: "$layer_id", group_by: "$group_by" },
      },
      {
        tool: "get_layer_features",
        args: { layer_id: "$layer_id", color_by: "$group_by" },
      },
    ],
  },

    proximidad_conteo: {
    type: "pipeline",
    intents: ["dato_simple"],
    requires: ["layer_id_source", "layer_id_targets", "distance_m"],
    timeoutMs: 8000,
    steps: [
      {
        tool: "count_near_layer",
        args: {
          layer_id_source: "$layer_id_source",
          layer_id_targets: "$layer_id_targets",
          distance_m: "$distance_m",
        },
      },
    ],
  },
};

/**
 * Devuelve el pipeline que corresponde a un intent, o null.
 */
export function getPipelineForIntent(intent) {
  for (const [id, pipeline] of Object.entries(PIPELINES)) {
    if (pipeline.intents.includes(intent)) {
      return { id, ...pipeline };
    }
  }
  return null;
}
