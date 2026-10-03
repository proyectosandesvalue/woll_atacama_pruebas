/**
 * runners.js — Reexport delgado.
 *
 * El contenido original (8 runners + normalizeArgs + withTimeout) se movió
 * a `server/chat/tools/` durante la Fase 3 del refactor:
 *   - normalizeArgs y withTimeout → `server/chat/tools/_helpers.js`.
 *   - Cada runner vive ahora junto a su schema en `tools/<tool>.js`.
 *
 * Este archivo se mantiene para no romper `orchestrator.js`, que importa
 * `runTool` desde acá. En una feature posterior se puede borrar y cambiar
 * el import del orquestador directamente.
 *
 * @deprecated usar `server/chat/tools/index.js` directamente en código nuevo.
 */

import {
  TOOL_RUNNERS,
  TOOL_NAMES,
} from "./tools/index.js";
import { normalizeArgs, withTimeout, RPC_TIMEOUT_MS } from "./tools/_helpers.js";

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

  if (!args.layer_id) {
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