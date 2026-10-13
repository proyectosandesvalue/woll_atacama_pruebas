/**
 * Configuración del proveedor LLM (server-side).
 *
 * Variables:
 *   LLM_PROVIDER              "openai-compatible" (default)
 *   LLM_BASE_URL              URL base del proveedor
 *   LLM_MODEL                 Modelo principal
 *   LLM_API_KEY               API key
 *   LLM_MAX_TOKENS            Tokens de la respuesta final
 *   LLM_TEMPERATURE           Temperatura
 *   LLM_SUPPORTS_PARALLEL_TOOLS true|false
 *
 *   LLM_FALLBACK_ENABLED      1|0 (default 0)
 *   LLM_FALLBACK_MODEL        Modelo alternativo (mismo proveedor)
 */

function required(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`Variable de entorno requerida no configurada: ${name}`);
  }
  return v;
}

function optional(name, fallback) {
  const v = process.env[name];
  return v && String(v).trim() ? Number(v) : fallback;
}

function optionalBool(name, fallback) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return /^(1|true|yes)$/i.test(String(v));
}

export function getLLMConfig() {
  return {
    provider: process.env.LLM_PROVIDER || "openai-compatible",
    baseUrl: required("LLM_BASE_URL").replace(/\/+$/, ""),
    model: required("LLM_MODEL"),
    apiKey: required("LLM_API_KEY"),
    maxTokens: optional("LLM_MAX_TOKENS", 1024),
    temperature: optional("LLM_TEMPERATURE", 0.7),
    supportsParallelTools:
      process.env.LLM_SUPPORTS_PARALLEL_TOOLS !== "false",
  };
}

/**
 * Config del modelo de fallback. Mismo proveedor, distinto modelo.
 * Devuelve null si el fallback está deshabilitado o mal configurado.
 */
export function getFallbackConfig() {
  const enabled = optionalBool("LLM_FALLBACK_ENABLED", false);
  if (!enabled) return null;

  const model = process.env.LLM_FALLBACK_MODEL;
  if (!model || !String(model).trim()) return null;

  const baseUrl = required("LLM_BASE_URL").replace(/\/+$/, "");
  const apiKey = required("LLM_API_KEY");

  return {
    provider: process.env.LLM_PROVIDER || "openai-compatible",
    baseUrl,
    model: String(model).trim(),
    apiKey,
    maxTokens: optional("LLM_MAX_TOKENS", 1024),
    temperature: optional("LLM_TEMPERATURE", 0.7),
    supportsParallelTools:
      process.env.LLM_SUPPORTS_PARALLEL_TOOLS !== "false",
  };
}