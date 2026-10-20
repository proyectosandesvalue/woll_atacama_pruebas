/**
 * Ejecutor de pipelines.
 *
 * Recibe un pipeline (del registro) y un objeto de slots, y ejecuta
 * cada paso con `runTool`. Los pasos corren en paralelo con
 * `Promise.allSettled` y los resultados se registran.
 *
 * Sustituye slots: "$layer_id" → slots.layer_id, "$filters" → slots.filters,
 * etc. Si un slot no existe, el paso se saltea con un error.
 */

import { runTool } from "../runners.js";

const DEBUG = /^(1|true|yes)$/i.test(process.env.ORCHESTRATOR_DEBUG || "");
function dbg(...args) {
  if (DEBUG) console.log("[pipelines]", ...args);
}

/**
 * Sustituye los slots en los args de un paso.
 *
 * @param {object} args - Args del paso (con $slots).
 * @param {object} slots - Slots del router.
 * @returns {object} Args con slots sustituidos.
 */
function substituteSlots(args, slots) {
  const out = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string" && value.startsWith("$")) {
      const slotName = value.slice(1);
      if (slots[slotName] !== undefined) {
        out[key] = slots[slotName];
      }
      // Si el slot no existe, no se agrega (el paso usará el default).
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Ejecuta un pipeline.
 *
 * @param {object} pipeline - Pipeline del registro.
 * @param {object} slots - Slots del router (layer_id, filters, group_by, etc.).
 * @returns {Promise<Array>} Resultados de cada paso: { tool, ok, result, error }.
 */
export async function executePipeline(pipeline, slots) {
  if (!pipeline || !Array.isArray(pipeline.steps)) {
    return [];
  }

  const stepPromises = pipeline.steps.map(async (step) => {
    const args = substituteSlots(step.args, slots);
    dbg(`pipeline ${pipeline.id}: ejecutando ${step.tool} con ${JSON.stringify(args)}`);

    try {
      const out = await runTool(step.tool, args);
      return {
        tool: step.tool,
        args,
        ok: out.ok,
        result: out.result,
        error: out.error,
      };
    } catch (err) {
      return {
        tool: step.tool,
        args,
        ok: false,
        result: null,
        error: err?.message || String(err),
      };
    }
  });

  const results = await Promise.allSettled(stepPromises);

  return results.map((r) => {
    if (r.status === "fulfilled") return r.value;
    return {
      tool: "unknown",
      args: {},
      ok: false,
      result: null,
      error: r.reason?.message || String(r.reason),
    };
  });
}