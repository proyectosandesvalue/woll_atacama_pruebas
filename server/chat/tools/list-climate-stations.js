import { getDB } from "../../db/pool.js";

export default {
  schema: {
    type: "function",
    function: {
      name: "list_climate_stations",
      description:
        "Lista las estaciones meteorológicas disponibles en Atacama. " +
        "Úsala cuando el usuario pregunte '¿qué estaciones hay en X?', " +
        "'¿qué estaciones están reportando?' o cuando necesites saber el código " +
        "de una estación antes de consultar sus datos.",
      parameters: {
        type: "object",
        properties: {
          estado: {
            type: "string",
            enum: ["online", "historica"],
            description:
              "'online' = reportan en vivo (MeteoChile, RedMeteo, Agromet). " +
              "'historica' = solo datos históricos (DGA).",
          },
          comuna: {
            type: "string",
            description: "Filtrar por comuna (opcional).",
          },
        },
        additionalProperties: false,
      },
    },
  },
  run: async ({ estado, comuna }) => {
    const db = await getDB();
    return db.rpc("chat_list_climate_stations", {
      p_estado: estado || null,
      p_comuna: comuna || null,
    });
  },
};