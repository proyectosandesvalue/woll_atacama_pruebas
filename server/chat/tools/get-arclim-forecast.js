import { normalizeArgs } from "./_helpers.js";

const schema = {
  type: "function",
  function: {
    name: "get_arclim_forecast",
    description: "Obtiene proyecciones climáticas futuras (ARClim) para una comuna específica de Atacama. Úsala cuando el usuario pregunte por el clima futuro, temperaturas, lluvias, heladas u olas de calor.",
    parameters: {
      type: "object",
      properties: {
        comuna: {
          type: "string",
          description: "Nombre de la comuna (ej. Copiapó, Vallenar, Caldera)."
        },
        indicador: {
          type: "string",
          enum: ["hot_days", "tasmax_mean", "tasmin_mean", "frost_days", "pr_sum"],
          description: "Variable climática: hot_days (días >30°C), tasmax_mean (temp máx), tasmin_mean (temp mín), frost_days (heladas), pr_sum (precipitación)."
        },
        temporada: {
          type: "string",
          enum: ["annual", "summer", "winter"],
          description: "Temporada: annual (anual), summer (verano), winter (invierno). Por defecto 'annual'."
        }
      },
      required: ["comuna", "indicador"]
    }
  }
};

async function run(args, ctx) {
  const parsed = normalizeArgs(args, schema.function.parameters);
  const comuna = parsed.comuna;
  const indicador = parsed.indicador;
  const temporada = parsed.temporada || "annual";

  const fields = [
    "NOM_COMUNA",
    `$CLIMA$${indicador}$${temporada}$present`,
    `$CLIMA$${indicador}$${temporada}$future$ssp245`,
    `$CLIMA$${indicador}$${temporada}$future$ssp585`
  ];

  const encodedFields = fields.map(f => encodeURIComponent(f)).join(",");
  const url = `https://arclim.mma.gob.cl/api/datos/comunas/json/?attributes=${encodedFields}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Error consultando ARClim: HTTP ${res.status}`);
    const json = await res.json();
    
    const { values } = json.data;
    
    const comunaUpper = comuna.toUpperCase();
    const row = values.find(v => v[0]?.toUpperCase().includes(comunaUpper));

    if (!row) {
      return { 
        ok: false, 
        message: `No se encontraron datos para la comuna '${comuna}'. Asegúrate de que sea una comuna de Atacama.` 
      };
    }

    const nombreComuna = row[0];
    const valPresent = row[1];
    const valFuture45 = row[2];
    const valFuture85 = row[3];

    const unidades = {
      hot_days: "días/año",
      tasmax_mean: "°C",
      tasmin_mean: "°C",
      frost_days: "días/año",
      pr_sum: "mm/año"
    };

    const unidad = unidades[indicador] || "";

    return {
      ok: true,
      data: {
        comuna: nombreComuna,
        indicador: indicador,
        temporada: temporada,
        historico: `${valPresent.toFixed(2)} ${unidad}`,
        futuro_ssp245: `${valFuture45.toFixed(2)} ${unidad}`,
        futuro_ssp585: `${valFuture85.toFixed(2)} ${unidad}`,
        conclusion: `Bajo el escenario más pesimista (SSP5-8.5), el valor proyectado es de ${valFuture85.toFixed(2)} ${unidad}.`
      }
    };
  } catch (error) {
    return { ok: false, message: `Error al obtener datos de ARClim: ${error.message}` };
  }
}

export default { schema, run };