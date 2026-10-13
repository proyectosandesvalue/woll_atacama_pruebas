/**
 * Configuración del proveedor LLM (server-side).
 *
 * Modo "openai-compatible" (genérico):
 *   LLM_PROVIDER              "openai-compatible" (default)
 *   LLM_BASE_URL              URL base del proveedor
 *   LLM_MODEL                 Modelo principal
 *   LLM_API_KEY               API key
 *
 * Modo "vertex-ai" (Google Cloud):
 *   LLM_PROVIDER              "vertex-ai"
 *   GOOGLE_CLOUD_PROJECT      ID del proyecto GCP (ej: woll-atacama-staging)
 *   GOOGLE_CLOUD_LOCATION     "global" | "us-central1" | ...
 *   LLM_MODEL                 Modelo principal (ej: gemini-2.5-flash)
 *   GOOGLE_APPLICATION_CREDENTIALS_JSON  (opcional, producción) JSON de Service Account
 *
 * Comunes:
 *   LLM_MAX_TOKENS            Tokens de la respuesta final
 *   LLM_TEMPERATURE           Temperatura
 *   LLM_SUPPORTS_PARALLEL_TOOLS true|false
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

function commonConfig() {
  return {
    maxTokens: optional("LLM_MAX_TOKENS", 1024),
    temperature: optional("LLM_TEMPERATURE", 0.7),
    supportsParallelTools: process.env.LLM_SUPPORTS_PARALLEL_TOOLS !== "false",
  };
}

export function getLLMConfig() {
  const provider = process.env.LLM_PROVIDER || "openai-compatible";

  if (provider === "vertex-ai") {
    return {
      provider: "vertex-ai",
      project: required("GOOGLE_CLOUD_PROJECT"),
      location: process.env.GOOGLE_CLOUD_LOCATION || "global",
      model: required("LLM_MODEL"),
      ...commonConfig(),
    };
  }

  // Modo genérico OpenAI-compatible.
  return {
    provider,
    baseUrl: required("LLM_BASE_URL").replace(/\/+$/, ""),
    model: required("LLM_MODEL"),
    apiKey: required("LLM_API_KEY"),
    ...commonConfig(),
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

  const provider = process.env.LLM_PROVIDER || "openai-compatible";
  const fallbackModel = String(model).trim();

  if (provider === "vertex-ai") {
    return {
      provider: "vertex-ai",
      project: required("GOOGLE_CLOUD_PROJECT"),
      location: process.env.GOOGLE_CLOUD_LOCATION || "global",
      model: fallbackModel,
      ...commonConfig(),
    };
  }

  return {
    provider,
    baseUrl: required("LLM_BASE_URL").replace(/\/+$/, ""),
    model: fallbackModel,
    apiKey: required("LLM_API_KEY"),
    ...commonConfig(),
  };
}