export default {
  schema: {
    type: "function",
    function: {
      name: "list_climate_stations",
      description:
        "Lista las estaciones meteorológicas disponibles en Atacama. " +
        "Devuelve nombre, código, comuna, estado (online/historica), " +
        "tipo de estación y propietario. " +
        "Úsala cuando el usuario pregunte '¿qué estaciones hay en X?', " +
        "'¿qué estaciones reportan?', '¿qué estaciones históricas hay?'.",
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