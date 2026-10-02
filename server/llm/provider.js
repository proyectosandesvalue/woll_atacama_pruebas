/**
 * Proveedor LLM — factoría.
 *
 * Selecciona el driver activo según LLM_PROVIDER. Hoy solo hay
 * "openai-compatible" (Groq, OpenAI, Together, Mistral, vLLM, etc.).
 *
 * Para agregar un driver nuevo (Anthropic, Gemini, Cohere) con un
 * dialecto distinto al OpenAI Chat Completions:
 *   1. Crear server/llm/drivers/<driver>.js exportando `createProvider(config)`
 *      con la firma normalizada: { chat({system, messages, tools, toolChoice, maxTokens, temperature}) }
 *   2. Registrarlo en DRIVERS de este archivo.
 *
 * Interfaz normalizada (la consume el orquestador):
 *   await llm.chat({ system, messages, tools, toolChoice, maxTokens, temperature })
 *   → { content: string, toolCalls: Array<{name, arguments}> | null, usage }
 */

import { getLLMConfig } from "./config.js";
import { createProvider as createOpenAICompatible } from "./drivers/openai-compatible.js";

const DRIVERS = {
  "openai-compatible": createOpenAICompatible,
};

let _llm = null;

export async function getLLM() {
  if (_llm) return _llm;
  const config = getLLMConfig();
  const factory = DRIVERS[config.provider];
  if (!factory) {
    throw new Error(`No hay driver LLM registrado para "${config.provider}".`);
  }
  _llm = factory(config);
  return _llm;
}

export function _resetLLM() {
  _llm = null;
}
