import { normalizeArgs } from "./_helpers.js";

/**
 * Catálogo de indicadores ARClim expuestos al chat.
 *
 * Los IDs provienen de `js/config/clima.js` (indicatorId). La API de ARClim
 * usa el mismo nombre en el atributo `$CLIMA$<indicador>$<temporada>$...`.
 */
export const INDICATORS = Object.freeze({
  hot_days: { unit: "días/año" },
  consecutive_days_over_30C: { unit: "días/año" },
  very_hot_days: { unit: "días/año" },
  tropical_nights: { unit: "días/año" },
  ola_calor_compuesto_dmc: { unit: "días/año" },
  tasmax_mean: { unit: "°C" },
  tasmin_mean: { unit: "°C" },
  mean_temperature: { unit: "°C" },
  daily_temperature_range: { unit: "°C" },
  hottest_day: { unit: "°C" },
  coldest_night: { unit: "°C" },
  frost_days: { unit: "días/año" },
  frost_days_below_minus_2_degrees: { unit: "días/año" },
  ice_days: { unit: "días/año" },
  cold_spell_duration_index_short: { unit: "días/año" },
  pr_sum: { unit: "mm/año" },
  max_5day_precip: { unit: "mm" },
  number_of_heavy_precipitation_days: { unit: "días/año" },
  consecutive_dry_days: { unit: "días" },
  drought_periods: { unit: "eventos" },
  spi: { unit: "índice" },
  vel_mean: { unit: "m/s" },
  rsds_mean: { unit: "W/m²" },
  rsds_max: { unit: "W/m²" },
  hurs_mean: { unit: "%" },
  huss_mean: { unit: "g/kg" },
});

const SEASONS = new Set(["annual", "summer", "winter"]);
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatValue(value, unit) {
  return value === null ? "N/A" : `${value.toFixed(2)} ${unit}`;
}

/**
 * Convierte las filas crudas de ARClim en objetos por comuna.
 * Es una función pura para poder testearla sin red.
 *
 * @param {Array<Array<unknown>>} values
 * @param {string} indicador
 * @returns {Array<{comuna: string, historico: number|null, futuro_ssp245: number|null, futuro_ssp585: number|null}>}
 */
export function parseArclimRows(values, indicador) {
  if (!Array.isArray(values) || !INDICATORS[indicador]) return [];
  return values
    .filter(
      (row) =>
        Array.isArray(row) &&
        typeof row[0] === "string" &&
        (toNumber(row[1]) !== null ||
          toNumber(row[2]) !== null ||
          toNumber(row[3]) !== null)
    )
    .map((row) => ({
      comuna: row[0],
      historico: toNumber(row[1]),
      futuro_ssp245: toNumber(row[2]),
      futuro_ssp585: toNumber(row[3]),
    }));
}

async function fetchArclim(indicador, temporada) {
  const key = `${indicador}|${temporada}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const fields = [
    "NOM_COMUNA",
    `$CLIMA$${indicador}$${temporada}$present`,
    `$CLIMA$${indicador}$${temporada}$future$ssp245`,
    `$CLIMA$${indicador}$${temporada}$future$ssp585`,
  ];
  const encodedFields = fields.map((f) => encodeURIComponent(f)).join(",");
  const url = `https://arclim.mma.gob.cl/api/datos/comunas/json/?attributes=${encodedFields}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "WollAtacama/1.0 (https://wollatacama.cl)" },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[get_arclim_forecast] HTTP ${res.status}: ${errorText}`);
    throw new Error(`Error consultando ARClim: HTTP ${res.status}`);
  }

  const json = await res.json();
  if (!json.data || !json.data.values) {
    throw new Error("La API de ARClim devolvió una estructura inesperada.");
  }

  const rows = parseArclimRows(json.data.values, indicador);
  cache.set(key, { at: Date.now(), value: rows });
  return rows;
}

const schema = {
  type: "function",
  function: {
    name: "get_arclim_forecast",
    description:
      "Obtiene proyecciones climáticas futuras (ARClim) para una o varias " +
      "comunas de Atacama. Cubre 26 indicadores y devuelve histórico, " +
      "SSP2-4.5 y SSP5-8.5. Si no se indica comuna, devuelve todas las " +
      "comunas de Atacama para permitir rankings.",
    parameters: {
      type: "object",
      properties: {
        comuna: {
          type: "string",
          description:
            "Nombre de la comuna (ej. Vallenar). Opcional si usas comunas.",
        },
        comunas: {
          type: "array",
          items: { type: "string" },
          description:
            "Lista de comunas para comparar o rankear. Si se omite, devuelve " +
            "todas las comunas de Atacama.",
        },
        indicador: {
          type: "string",
          enum: Object.keys(INDICATORS),
          description:
            "Variable climática ARClim. Ej: hot_days, frost_days, pr_sum, spi.",
        },
        temporada: {
          type: "string",
          enum: ["annual", "summer", "winter"],
          description: "Temporada del año.",
        },
      },
      required: ["indicador"],
      additionalProperties: false,
    },
  },
};

async function run(args) {
  try {
    const indicador = args.indicador;
    const temporada = String(args.temporada || "annual").toLowerCase();
    const normalized = normalizeArgs("get_arclim_forecast", args);

    if (!INDICATORS[indicador]) {
      return { ok: false, message: `Indicador '${indicador}' no válido.` };
    }
    if (!SEASONS.has(temporada)) {
      return { ok: false, message: `Temporada '${temporada}' no válida.` };
    }

    const rows = await fetchArclim(indicador, temporada);
    const requested = Array.isArray(normalized.comunas)
      ? normalized.comunas
      : normalized.comuna
        ? [normalized.comuna]
        : [];

    const selected =
      requested.length === 0
        ? rows
        : rows.filter((row) =>
            requested.some((name) =>
              normalizeName(row.comuna).includes(normalizeName(name))
            )
          );

    if (selected.length === 0) {
      return {
        ok: false,
        message: `No se encontraron datos para la comuna indicada.`,
      };
    }

    const unit = INDICATORS[indicador].unit;

    // Compatibilidad: una sola comuna devuelve el formato histórico.
    if (!Array.isArray(normalized.comunas) && normalized.comuna) {
      const row = selected[0];
      return {
        ok: true,
        data: {
          comuna: row.comuna,
          indicador,
          temporada,
          historico: formatValue(row.historico, unit),
          futuro_ssp245: formatValue(row.futuro_ssp245, unit),
          futuro_ssp585: formatValue(row.futuro_ssp585, unit),
        },
      };
    }

    return {
      ok: true,
      data: {
        indicador,
        temporada,
        unidad: unit,
        comunas: selected.map((row) => ({
          comuna: row.comuna,
          historico: row.historico,
          futuro_ssp245: row.futuro_ssp245,
          futuro_ssp585: row.futuro_ssp585,
          unidad: unit,
        })),
      },
    };
  } catch (error) {
    console.error("[get_arclim_forecast] Error interno:", error);
    return { ok: false, message: `Error interno: ${error.message}` };
  }
}

export default { schema, run };
