/**
 * Router determinístico.
 *
 * Recibe la salida del clasificador unificado
 * (`{ domain, intent, slots, confidence }`) y decide qué hacer:
 *   - Si hay un pipeline para el intent Y la confianza supera el umbral,
 *     ejecuta el pipeline.
 *   - Si no, devuelve null para que handleChat() degrade al orquestador.
 *
 * Variables:
 *   CHAT_ROUTER_ENABLED (default 0): si 0, siempre devuelve null.
 *   CHAT_ROUTER_MIN_CONFIDENCE (default 0.7): umbral mínimo.
 */

import { getPipelineForIntent } from "./capabilities/registry.js";
import { executePipeline } from "./capabilities/pipelines.js";

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

  const intent = classification.intent;
  if (!intent || intent === "fuera_de_alcance") {
    dbg(`router: intent=${intent}, skip`);
    return null;
  }

  const pipeline = getPipelineForIntent(intent);
  if (!pipeline) {
    dbg(`router: no hay pipeline para intent=${intent}, skip`);
    return null;
  }

  const slots = classification.slots || {};

  // Validar slots obligatorios.
  const missing = (pipeline.requires || []).filter(
    (key) => slots[key] === undefined || slots[key] === null
  );
  if (missing.length > 0) {
    dbg(
      `router: pipeline ${pipeline.id} requiere slots [${missing.join(", ")}], skip`
    );
    return null;
  }

  dbg(`router: ejecutando pipeline ${pipeline.id} con slots ${JSON.stringify(slots)}`);

  try {
    const results = await executePipeline(pipeline, slots);
    const allFailed = results.every((r) => !r.ok);
    if (allFailed) {
      dbg(`router: pipeline ${pipeline.id} falló en todos los pasos, skip`);
      return null;
    }
    return { pipeline, results, slots };
  } catch (err) {
    dbg(`router: excepción en pipeline ${pipeline.id}: ${err?.message || err}`);
    return null;
  }
}