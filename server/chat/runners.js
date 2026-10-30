/**
 * runners.js — Reexport delgado.
 *
 * @deprecated usar `server/chat/tools/index.js` directamente en código nuevo.
 */

import {
  TOOL_RUNNERS,
  TOOL_NAMES,
} from "./tools/index.js";
import { normalizeArgs, withTimeout, RPC_TIMEOUT_MS } from "./tools/_helpers.js";

/**
 * Tools que NO requieren 'layer_id' en sus argumentos.
 * Las tools de capas sí lo requieren, las climáticas no.
 */
const TOOLS_WITHOUT_LAYER_ID = new Set([
  "get_station_weather",
  "get_historical_climate",
  "list_climate_stations",
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
    const result = await withTimeout(fn(args), RPC_TIMEOUT_MS);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

// Reexport para consumidores que lo necesiten.
export { TOOL_NAMES };