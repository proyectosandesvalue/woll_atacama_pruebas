/**
 * Router determinístico.
 *
 * Recibe la salida del clasificador unificado
 * (`{ domain, intent, pipeline, slots, confidence }`) y decide qué hacer:
 *   - Si hay un pipeline explícito Y la confianza supera el umbral,
 *     ejecuta el pipeline.
 *   - Si no, devuelve null para que handleChat() degrade al orquestador.
 *
 * Variables:
 *   CHAT_ROUTER_ENABLED (default 0): si 0, siempre devuelve null.
 *   CHAT_ROUTER_MIN_CONFIDENCE (default 0.7): umbral mínimo.
 */

import { executePipeline } from "./capabilities/pipelines.js";
import { PIPELINES } from "./capabilities/registry.js";

const DEBUG = /^(1|true|yes)$/i.test(process.env.ORCHESTRATOR_DEBUG || "");
function dbg(...args) {
  if (DEBUG) console.log("[router]", ...args);
}

function isRouterEnabled() {
  return /^(1|true|yes)$/i.test(process.env.CHAT_ROUTER_ENABLED || "0");
}

function getMinConfidence() {
  const n = Number(process.env.CHAT_ROUTER_MIN_CONFIDENCE);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.7;
}

/**
 * Intenta resolver una pregunta con un pipeline determinístico.
 *
 * @param {object} classification - Salida del clasificador unificado.
 * @param {string} text - Pregunta del usuario (para logs).
 * @returns {Promise<{pipeline: object, results: Array, slots: object} | null>}
 *   null si no aplica pipeline (el caller debe degradar).
 */
export async function route(classification, text = "") {
  if (!isRouterEnabled()) {
    dbg("router deshabilitado (CHAT_ROUTER_ENABLED=0)");
    return null;
  }

  if (!classification || classification.domain !== "IN") {
    dbg("router: domain != IN, skip");
    return null;
  }

  const minConfidence = getMinConfidence();
  if (
    typeof classification.confidence !== "number" ||
    classification.confidence < minConfidence
  ) {
    dbg(
      `router: confidence ${classification.confidence} < ${minConfidence}, skip`
    );
    return null;
  }

  // Validar pipeline explícito (defensa contra undefined, null, "").
  const pipelineId = classification.pipeline;
  if (typeof pipelineId !== "string" || pipelineId.length === 0) {
    dbg(`router: pipeline inválido (${JSON.stringify(pipelineId)}), skip`);
    return null;
  }

  const pipeline = PIPELINES[pipelineId];
  if (!pipeline) {
    dbg(`router: pipeline "${pipelineId}" no existe en el registro, skip`);
    return null;
  }

  const slots = classification.slots || {};

  // Validar slots obligatorios.
  const missing = (pipeline.requires || []).filter(
    (key) => slots[key] === undefined || slots[key] === null
  );
  if (missing.length > 0) {
    dbg(
      `router: pipeline ${pipelineId} requiere slots [${missing.join(", ")}], skip`
    );
    return null;
  }

  dbg(
    `router: ejecutando pipeline ${pipelineId} con slots ${JSON.stringify(slots)}`
  );

  try {
    // FIX F1: pasar el id al pipeline para que los logs lo muestren.
    const pipelineWithId = { ...pipeline, id: pipelineId };
    const results = await executePipeline(pipelineWithId, slots);
    const allFailed = results.every((r) => !r.ok);
    if (allFailed) {
      dbg(`router: pipeline ${pipelineId} falló en todos los pasos, skip`);
      return null;
    }
    return { pipeline: pipelineWithId, results, slots };
  } catch (err) {
    dbg(`router: excepción en pipeline ${pipelineId}: ${err?.message || err}`);
    return null;
  }
}