import { getDB } from "../../db/pool.js";

export default {
  schema: {
    type: "function",
    function: {
      name: "get_station_weather",
      description:
        "Devuelve el clima ACTUAL (últimas horas) de estaciones meteorológicas online en Atacama. " +
        "Úsala para preguntas sobre condiciones en vivo: '¿cuál es la temperatura en Copiapó?', " +
        "'¿qué humedad hay en Vallenar?', 'dame el viento en Caldera'. " +
        "Acepta filtrar por comuna o por código de estación. Devuelve valores actuales " +
        "de temperatura, humedad, precipitación, viento, radiación y presión.",
      parameters: {
        type: "object",
        properties: {
          comuna: {
            type: "string",
            description: "Nombre de la comuna (ej: 'Copiapó', 'Vallenar'). Opcional.",
          },
          codigo: {
            type: "string",
            description: "Código de la estación (ej: '270009', 'AGROMET_714', 'RMCL0123'). Opcional.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  run: async ({ comuna, codigo }) => {
    const db = await getDB();
    return db.rpc("chat_station_weather", {
      p_comuna: comuna || null,
      p_codigo: codigo || null,
    });
  },
};