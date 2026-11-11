/**
 * Handlers puros de estaciones y variables climáticas.
 *
 * Los usan tanto las Vercel Functions (`api/*.js`) como el servidor Node
 * (`server/routes/stations.js`). Mantienen el contrato actual de cada endpoint,
 * incluidos los fallbacks que ya existían.
 */

import { getDB as defaultGetDB } from "../db/pool.js";

function optionalInt(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function logError(endpoint, err) {
  console.error(`[${endpoint}] Error:`, err?.message || err);
}

/**
 * @param {Record<string, unknown>} [query]
 * @param {{getDB?: () => Promise<object>}} [opts]
 */
export async function handleStationsMap(query = {}, opts = {}) {
  const { getDB = defaultGetDB } = opts;
  const variable = query.variable ? String(query.variable) : "temp_avg";
  const date = query.date ? String(query.date) : null;
  const estado = query.estado ? String(query.estado) : null;

  try {
    const db = await getDB();
    const stations = date
      ? await db.rpc("chat_stations_map_data_at_date", {
          p_variable: variable,
          p_date: date,
          p_estado: estado,
        })
      : await db.rpc("chat_stations_map_data", {
          p_variable: variable,
          p_period: "latest",
        });

    return { status: 200, body: { variable, date, estado, stations } };
  } catch (err) {
    logError("/api/stations-map", err);
    return { status: 500, body: { error: err?.message || "Error interno" } };
  }
}

/**
 * @param {Record<string, unknown>} [query]
 * @param {{getDB?: () => Promise<object>}} [opts]
 */
export async function handleStationDetails(query = {}, opts = {}) {
  const { getDB = defaultGetDB } = opts;
  const codigo = query.codigo ? String(query.codigo) : null;
  if (!codigo) {
    return { status: 400, body: { error: "Falta el código de la estación" } };
  }

  try {
    const db = await getDB();
    const data = await db.rpc("chat_station_details", {
      p_codigo_nacional: codigo,
    });
    return {
      status: 200,
      body: { codigo, ...(data || { values: [], ranges: {} }) },
    };
  } catch (err) {
    logError(`/api/station-details (${codigo})`, err);
    return {
      status: 200,
      body: { codigo, values: [], ranges: {}, error: err?.message || "Error" },
    };
  }
}

/**
 * @param {Record<string, unknown>} [query]
 * @param {{getDB?: () => Promise<object>}} [opts]
 */
export async function handleStationSeries(query = {}, opts = {}) {
  const { getDB = defaultGetDB } = opts;
  const codigo = query.codigo ? String(query.codigo) : null;
  const indicator = query.indicator ? String(query.indicator) : null;
  if (!codigo || !indicator) {
    return { status: 400, body: { error: "Faltan parametros" } };
  }

  try {
    const db = await getDB();
    const data = await db.rpc("chat_station_series", {
      p_codigo: codigo,
      p_indicator: indicator,
      p_granularity: query.granularity ? String(query.granularity) : "year",
      p_year_start: optionalInt(query.year_start),
      p_year_end: optionalInt(query.year_end),
      p_month: optionalInt(query.month),
      p_day: optionalInt(query.day),
    });
    return { status: 200, body: data };
  } catch (err) {
    logError("/api/station-series", err);
    return { status: 500, body: { error: err?.message || "Error interno" } };
  }
}

/**
 * @param {Record<string, unknown>} [query]
 * @param {{getDB?: () => Promise<object>}} [opts]
 */
export async function handleStationAvailableDates(query = {}, opts = {}) {
  const { getDB = defaultGetDB } = opts;
  const codigo = query.codigo ? String(query.codigo) : null;
  const indicator = query.indicator ? String(query.indicator) : null;
  if (!codigo || !indicator) {
    return { status: 400, body: { error: "Faltan parametros" } };
  }

  try {
    const db = await getDB();
    const dates = await db.rpc("chat_station_available_dates", {
      p_codigo: codigo,
      p_indicator: indicator,
    });
    return { status: 200, body: { codigo, indicator, dates: dates || [] } };
  } catch (err) {
    logError("/api/station-available-dates", err);
    return { status: 500, body: { error: err?.message || "Error interno" } };
  }
}

/**
 * @param {Record<string, unknown>} [query]
 * @param {{getDB?: () => Promise<object>}} [opts]
 */
export async function handleVariableAvailability(query = {}, opts = {}) {
  const { getDB = defaultGetDB } = opts;
  const variable = query.variable ? String(query.variable) : null;
  if (!variable) {
    return { status: 400, body: { error: "Falta parámetro 'variable'" } };
  }

  try {
    const db = await getDB();
    const data = await db.rpc("chat_variable_availability", {
      p_variable: variable,
    });
    return { status: 200, body: data };
  } catch (err) {
    logError("/api/variable-availability", err);
    // Fallback INV-5: el selector de fechas es auxiliar.
    return {
      status: 200,
      body: {
        variable,
        fecha_min: null,
        fecha_max: null,
        total_registros: 0,
        estaciones_con_dato: 0,
        degraded: true,
      },
    };
  }
}

/**
 * @param {Record<string, unknown>} [query]
 * @param {{getDB?: () => Promise<object>}} [opts]
 */
export async function handleVariableAvailableDates(query = {}, opts = {}) {
  const { getDB = defaultGetDB } = opts;
  const variable = query.variable ? String(query.variable) : null;
  if (!variable) {
    return { status: 400, body: { error: "Falta variable" } };
  }

  try {
    const db = await getDB();
    const dates = await db.rpc("chat_variable_available_dates", {
      p_variable: variable,
    });
    return { status: 200, body: { variable, dates: dates || [] } };
  } catch (err) {
    logError("/api/variable-available-dates", err);
    return { status: 500, body: { error: err?.message || "Error interno" } };
  }
}

/**
 * @param {Record<string, unknown>} [query]
 * @param {{getDB?: () => Promise<object>}} [opts]
 */
export async function handleHistoricalStations(query = {}, opts = {}) {
  const { getDB = defaultGetDB } = opts;
  const tipo = query.tipo ? String(query.tipo) : "METEOROLOGICA";

  try {
    const db = await getDB();
    const stations = await db.rpc("chat_historical_stations", {
      p_tipo: tipo,
    });
    return { status: 200, body: { stations } };
  } catch (err) {
    logError("/api/historical-stations", err);
    return { status: 500, body: { error: err?.message || "Error interno" } };
  }
}
