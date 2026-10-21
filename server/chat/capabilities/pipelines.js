/**
 * Ejecutor de pipelines.
 *
 * Recibe un pipeline (del registro) y un objeto de slots, y ejecuta
 * cada paso con `runTool`. Los pasos corren en paralelo con
 * `Promise.allSettled` y los resultados se registran.
 *
 * Sustituye slots: "$layer_id" → slots.layer_id, "$filters" → slots.filters,
 * etc. Si un slot no existe, el paso se saltea con un error.
 *
 * Caso especial: el pipeline `distribucion_con_elementos` usa
 * `aggregate_by_admin` cuando group_by es COMUNA/PROVINCIA/REGION,
 * y `aggregate_layer` en el resto de los casos. Eso se resuelve acá,
 * no en el clasificador, para que el pipeline sea robusto a errores
 * de clasificación.
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
 * FIX F4: resuelve los pasos del pipeline según los slots.
 *
 * Solo el pipeline `distribucion_con_elementos` tiene lógica dinámica:
 * - Si group_by es COMUNA/PROVINCIA/REGION → aggregate_by_admin.
 * - Si no → aggregate_layer.
 *
 * @param {object} pipeline - Pipeline del registro (con id).
 * @param {object} slots - Slots del router.
 * @returns {Array} Pasos del pipeline con la tool correcta.
 */
function resolveSteps(pipeline, slots) {
  if (pipeline.id !== "distribucion_con_elementos") {
    return pipeline.steps;
  }

  const gb = String(slots.group_by || "").toUpperCase();
  const adminLevels = { COMUNA: "comuna", PROVINCIA: "provincia", REGION: "region" };
  const isAdmin = Object.prototype.hasOwnProperty.call(adminLevels, gb);

  if (!isAdmin) {
    return pipeline.steps;
  }

  const adminLevel = adminLevels[gb];
  dbg(
    `pipeline distribucion_con_elementos: group_by=${gb} es admin → usando aggregate_by_admin(${adminLevel})`
  );

  // Reemplazar el primer paso (aggregate_layer) por aggregate_by_admin.
  return [
    {
      tool: "aggregate_by_admin",
      args: { layer_id: "$layer_id", admin_level: adminLevel },
    },
    ...pipeline.steps.slice(1),
  ];
}

/**
 * Ejecuta un pipeline.
 *
 * @param {object} pipeline - Pipeline del registro (con id).
 * @param {object} slots - Slots del router (layer_id, filters, group_by, etc.).
 * @returns {Promise<Array>} Resultados de cada paso: { tool, args, ok, result, error }.
 */
export async function executePipeline(pipeline, slots) {
  if (!pipeline || !Array.isArray(pipeline.steps)) {
    return [];
  }

  const steps = resolveSteps(pipeline, slots);
  const pipelineId = pipeline.id || "(sin id)";

  const stepPromises = steps.map(async (step) => {
    const args = substituteSlots(step.args, slots);
    dbg(
      `pipeline ${pipelineId}: ejecutando ${step.tool} con ${JSON.stringify(args)}`
    );

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