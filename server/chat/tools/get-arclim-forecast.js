import { normalizeArgs } from "./_helpers.js";

const schema = {
  type: "function",
  function: {
    name: "get_arclim_forecast",
    description: "Obtiene proyecciones climáticas futuras (ARClim) para una comuna de Atacama.",
    parameters: {
      type: "object",
      properties: {
        layer_id: { type: "string", description: "Parámetro ignorado. Solo para compatibilidad." }, // <-- FIX 1
        comuna: { type: "string", description: "Nombre de la comuna (ej. Vallenar)." },
        indicador: { 
          type: "string", 
          enum: ["hot_days", "tasmax_mean", "tasmin_mean", "frost_days", "pr_sum"],
          description: "Variable climática."
        },
        temporada: { 
          type: "string", 
          enum: ["annual", "summer", "winter"],
          description: "Temporada del año."
        }
      },
      required: ["comuna", "indicador"]
    }
  }
};

async function run(args, ctx) {
  try {
    const comuna = args.comuna;
    const indicador = args.indicador;
    const temporada = args.temporada || "annual";

    // Validar que el indicador sea válido (por si el LLM alucina)
    const validIndicators = ["hot_days", "tasmax_mean", "tasmin_mean", "frost_days", "pr_sum"];
    if (!validIndicators.includes(indicador)) {
       return { ok: false, message: `Indicador '${indicador}' no válido.` };
    }

    const fields = [
      "NOM_COMUNA",
      `$CLIMA$${indicador}$${temporada}$present`,
      `$CLIMA$${indicador}$${temporada}$future$ssp245`,
      `$CLIMA$${indicador}$${temporada}$future$ssp585`
    ];

    const encodedFields = fields.map(f => encodeURIComponent(f)).join(",");
    const url = `https://arclim.mma.gob.cl/api/datos/comunas/json/?attributes=${encodedFields}`;

    console.log(`[get_arclim_forecast] Consultando URL: ${url}`);

    // FIX 2: Agregar User-Agent y Timeout para evitar bloqueos de Vercel/AWS
    const res = await fetch(url, {
      headers: { "User-Agent": "WollAtacama/1.0 (https://wollatacama.cl)" },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[get_arclim_forecast] HTTP ${res.status}: ${errorText}`);
      return { ok: false, message: `Error consultando ARClim: HTTP ${res.status}` };
    }

    const json = await res.json();
    if (!json.data || !json.data.values) {
      return { ok: false, message: "La API de ARClim devolvió una estructura inesperada." };
    }

    const { values } = json.data;
    const comunaUpper = comuna.toUpperCase();
    const row = values.find(v => v[0]?.toUpperCase().includes(comunaUpper));

    if (!row) {
      return { ok: false, message: `No se encontraron datos para la comuna '${comuna}'.` };
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
        historico: `${Number(valPresent).toFixed(2)} ${unidad}`,
        futuro_ssp245: `${valFuture45 !== null ? Number(valFuture45).toFixed(2) : 'N/A'} ${unidad}`,
        futuro_ssp585: `${valFuture85 !== null ? Number(valFuture85).toFixed(2) : 'N/A'} ${unidad}`
      }
    };
  } catch (error) {
    console.error("[get_arclim_forecast] Error interno:", error);
    return { ok: false, message: `Error interno: ${error.message}` };
  }
}

export default { schema, run };