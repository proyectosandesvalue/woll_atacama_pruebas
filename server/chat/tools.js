/**
 * Definición de las tools (herramientas) que el LLM puede invocar.
 *
 * Estas descripciones y esquemas JSON-Schema llegan al LLM en cada llamada.
 * El orquestador las inyecta en el system prompt + el campo "tools" del
 * request a Groq (formato OpenAI-compatible).
 *
 * Las tools NO escriben SQL: invocan RPCs tipadas en la BD → cero
 * SQL injection.
 */

export const TOOL_DEFINITIONS = [
  // ── Consultas tabulares ──────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_layer_stats",
      description:
        "Devuelve estadísticas precalculadas de una capa: count, rangos " +
        "numéricos (min, max, promedio, mediana, desv. estándar) y top 5 " +
        "valores por atributo. Úsala cuando el usuario pida cifras " +
        "agregadas de una capa específica. Para agrupaciones por " +
        "comuna/provincia/región, usa aggregate_by_admin.",
      parameters: {
        type: "object",
        properties: {
          layer_id: {
            type: "string",
            description: "Identificador interno de la capa (ver catálogo del sistema).",
          },
        },
        required: ["layer_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_layer_schema",
      description:
        "Devuelve el esquema REAL de una capa: lista exacta de columnas " +
        "con tipo, min/max/promedio (numéricas) y top 5 valores " +
        "(categóricas). Úsala SIEMPRE que dudes del nombre exacto de una " +
        "columna antes de agrupar o filtrar por ella.",
      parameters: {
        type: "object",
        properties: {
          layer_id: { type: "string" },
        },
        required: ["layer_id"],
        additionalProperties: false,
      },
    },
  },
  {
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
          },
          limit: {
            type: "integer",
            description: "Máximo de filas (default 20, máximo 50).",
            minimum: 1,
            maximum: 50,
          },
        },
        required: ["layer_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "aggregate_layer",
      description:
        "Agrupa los registros de una capa por una COLUMNA existente en la " +
        "tabla (count, avg, sum, min, max). Devuelve top 50 grupos. NO la " +
        "uses si el usuario quiere agrupar por COMUNA, PROVINCIA o REGIÓN: " +
        "para eso usa aggregate_by_admin.",
      parameters: {
        type: "object",
        properties: {
          layer_id: { type: "string" },
          group_by: { type: "string" },
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
        required: ["layer_id", "group_by"],
        additionalProperties: false,
      },
    },
  },

  // ── Geoprocesos por división administrativa ──────────────────
  {
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
  {
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
          },
        },
        required: ["layer_id", "admin_level", "group_by"],
        additionalProperties: false,
      },
    },
  },

  // ── Geoprocesos de proximidad ────────────────────────────────
  {
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
  {
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
        required: ["layer_id_source", "layer_id_targets", "distance_m", "admin_level"],
        additionalProperties: false,
      },
    },
  },
];

export const TOOL_NAMES = TOOL_DEFINITIONS.map((t) => t.function.name);