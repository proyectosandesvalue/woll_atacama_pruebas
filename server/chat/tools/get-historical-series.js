/**
 * Tool: get_historical_series
 *
 * Devuelve la serie completa (o un tramo acotado) de una estación/indicador.
 * A diferencia de `get_historical_climate`, que devuelve un resumen y los
 * últimos 12 valores, esta tool sirve para tendencias, gráficos y análisis
 * temporal.
 */

import { getDB } from "../../db/pool.js";

export default {
  schema: {
    type: "function",
    function: {
      name: "get_historical_series",
      description:
        "Devuelve la serie temporal completa de una estación y un indicador " +
        "(máximo 5.000 puntos). Úsala para tendencias, variaciones, gráficos " +
        "y análisis de series. Para un resumen rápido usa " +
        "get_historical_climate. Indicadores: temp_min_diaria, " +
        "temp_max_diaria, temp_media_diaria, temp_media_mensual, " +
        "precip_diaria, precip_mensual, precip_max_anual, caudal_diario, " +
        "caudal_mensual, sedimentos_integrado, sedimentos_rutinario, " +
        "nivel_estatico_pozo o cualquier calidad_*.",
      parameters: {
        type: "object",
        properties: {
          codigo: {
            type: "string",
            description: "Código de la estación (ej: '03414002').",
          },
          indicator: {
            type: "string",
            description: "Variable a consultar.",
          },
          year_start: {
            type: "integer",
            description: "Año inicial (opcional).",
          },
          year_end: {
            type: "integer",
            description: "Año final (opcional).",
          },
          limit: {
            type: "integer",
            description: "Máximo de puntos (default 5000, máximo 5000).",
            minimum: 1,
            maximum: 5000,
          },
        },
        required: ["codigo", "indicator"],
        additionalProperties: false,
      },
    },
  },

  run: async ({ codigo, indicator, year_start, year_end, limit }) => {
    const db = await getDB();
    return db.rpc("chat_historical_series", {
      p_codigo: codigo,
      p_indicator: indicator,
      p_year_start: year_start ?? null,
      p_year_end: year_end ?? null,
      p_limit: limit ?? 5000,
    });
  },
};
