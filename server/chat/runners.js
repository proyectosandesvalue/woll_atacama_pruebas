/**
 * runners.js — Reexport delgado.
 *
 * @deprecated usar `server/chat/tools/index.js` directamente en código nuevo.
 */

import {
  TOOL_RUNNERS,
  TOOL_NAMES,
} from "./tools/index.js";
import { normalizeArgs, withTimeout, timeoutForTool } from "./tools/_helpers.js";
import { runWithDbSignal } from "../db/context.js";

/**
 * Tools que NO requieren 'layer_id' en sus argumentos.
 * Las tools de capas sí lo requieren, las climáticas no.
 */
const TOOLS_WITHOUT_LAYER_ID = new Set([
  "get_station_weather",
  "get_historical_climate",
  "get_historical_series",
  "list_climate_stations",
  "get_arclim_forecast",
  "get_wms_layer_info",
  "get_wms_pixel",
  "get_wms_available_dates",
  "get_wms_statistics",
  "compare_layers",
  "rank_multicriteria",
  "spatial_overlay",
  "nearest_distance",
  "get_layer_metadata",
  "search_documents",
]);

/**
 * Ejecuta una tool por nombre con sus argumentos.
 *
 * @param {string} name - Nombre de la tool.
 * @param {object} rawArgs - Argumentos crudos del LLM.
 * @returns {Promise<{ok: true, result: any} | {ok: false, error: string}>}
 */
export async function runTool(name, rawArgs) {
  const fn = TOOL_RUNNERS[name];
  if (!fn) {
    return { ok: false, error: `Tool desconocida: ${name}` };
  }

  const args = normalizeArgs(name, rawArgs);

  // Solo validar layer_id para tools que lo requieren
  if (!TOOLS_WITHOUT_LAYER_ID.has(name) && !args.layer_id) {
    return {
      ok: false,
      error: "Falta 'layer_id' en los argumentos de la tool.",
    };
  }

  try {
    const controller = new AbortController();
    const result = await withTimeout(
      runWithDbSignal(controller.signal, () => fn(args)),
      timeoutForTool(name),
      controller
    );
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

// Reexport para consumidores que lo necesiten.
export { TOOL_NAMES };