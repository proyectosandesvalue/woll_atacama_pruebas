/**
 * Proveedor LLM — factoría con fallback.
 *
 * Devuelve un wrapper que:
 *   1. Llama al driver principal.
 *   2. Si falla con 503/502/504/timeout, intenta el modelo de fallback.
 *   3. Si el fallback también falla, propaga el error original.
 *
 * El orquestador no se entera del fallback: ve una sola interfaz
 * `llm.chat({...})`.
 */

import { getLLMConfig, getFallbackConfig } from "./config.js";
import { createProvider as createOpenAICompatible } from "./drivers/openai-compatible.js";

const DRIVERS = {
  "openai-compatible": createOpenAICompatible,
};

let _llm = null;

/**
 * Determina si un error es "recuperable con fallback".
 */
function isFallbackable(err) {
  if (!err) return false;
  if (err.retryable === true) return true;
  const msg = String(err.message || "").toLowerCase();
  return (
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("504") ||
    msg.includes("unavailable") ||
    msg.includes("high demand") ||
    msg.includes("timeout") ||
    msg.includes("overloaded")
  );
}

/**
 * Crea el wrapper con fallback.
 */
function createWrapper(primaryConfig, fallbackConfig) {
  const factory = DRIVERS[primaryConfig.provider];
  if (!factory) {
    throw new Error(
      `No hay driver LLM registrado para "${primaryConfig.provider}".`
    );
  }
  const primary = factory(primaryConfig);
  const fallback = fallbackConfig ? factory(fallbackConfig) : null;

  return {
    async chat(args) {
      try {
        return await primary.chat(args);
      } catch (err) {
        if (!fallback) throw err;
        if (!isFallbackable(err)) throw err;

        console.warn(
          `[llm] Modelo principal (${primaryConfig.model}) falló. ` +
            `Reintentando con fallback (${fallbackConfig.model})... ` +
            `Error: ${err?.message || err}`
        );

        try {
          const result = await fallback.chat(args);
          console.log(`[llm] Fallback (${fallbackConfig.model}) respondió OK.`);
          return result;
        } catch (fallbackErr) {
          console.error(
            `[llm] Fallback también falló: ${fallbackErr?.message || fallbackErr}`
          );
          throw err;
        }
      }
    },
  };
}

export async function getLLM() {
  if (_llm) return _llm;
  const primaryConfig = getLLMConfig();
  const fallbackConfig = getFallbackConfig();
  _llm = createWrapper(primaryConfig, fallbackConfig);

  if (fallbackConfig) {
    console.log(
      `[llm] Provider: ${primaryConfig.provider} | ` +
        `primary=${primaryConfig.model} | ` +
        `fallback=${fallbackConfig.model}`
    );
  } else {
    console.log(
      `[llm] Provider: ${primaryConfig.provider} | ` +
        `model=${primaryConfig.model} | fallback=disabled`
    );
  }

  return _llm;
}

export function _resetLLM() {
  _llm = null;
}