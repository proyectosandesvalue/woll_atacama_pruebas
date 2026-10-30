import { getDB } from "../../db/pool.js";

export default {
  schema: {
    type: "function",
    function: {
      name: "get_historical_climate",
      description:
        "Devuelve estadísticas HISTÓRICAS de una estación y una variable: total de registros, " +
        "mínimo, máximo, promedio, rango de fechas y los últimos 12 valores. " +
        "Úsala para preguntas sobre datos del PASADO (cualquier año anterior al actual): " +
        "'¿cuánto llovió en 1997?', 'temperatura mínima histórica en Iglesia Colorada', " +
        "'promedio de caudal del Río Copiapó en 2010'. " +
        "Funciona tanto para variables climáticas (temp_min_diaria, precip_diaria) " +
        "como para variables hídricas (caudal_diario, calidad_ph).",
      parameters: {
        type: "object",
        properties: {
          codigo: {
            type: "string",
            description: "Código de la estación (ej: '03414002' para Iglesia Colorada).",
          },
          indicator: {
            type: "string",
            description:
              "Variable a consultar. Valores válidos: " +
              "'temp_min_diaria', 'temp_max_diaria', 'temp_media_diaria', 'temp_media_mensual', " +
              "'precip_diaria', 'precip_mensual', 'precip_max_anual', " +
              "'caudal_diario', 'caudal_mensual', " +
              "'sedimentos_integrado', 'sedimentos_rutinario', " +
              "'nivel_estatico_pozo', " +
              "o cualquier 'calidad_*' (calidad_ph, calidad_arsenico_total, calidad_cobre_total, etc.).",
          },
          year_start: {
            type: "integer",
            description: "Año inicial del filtro (opcional). Ej: 1990.",
          },
          year_end: {
            type: "integer",
            description: "Año final del filtro (opcional). Ej: 2000.",
          },
        },
        required: ["codigo", "indicator"],
        additionalProperties: false,
      },
    },
  },
  run: async ({ codigo, indicator, year_start, year_end }) => {
    const db = await getDB();
    return db.rpc("chat_historical_climate", {
      p_codigo: codigo,
      p_indicator: indicator,
      p_year_start: year_start || null,
      p_year_end: year_end || null,
    });
  },
};