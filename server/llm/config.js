/**
 * Configuración del proveedor LLM (server-side).
 *
 * Hoy: Groq (pruebas). Mañana: OpenAI / Mistral / vLLM local cambiando
 * solo variables de entorno — el driver "openai-compatible" habla el
 * dialecto de la API OpenAI Chat Completions, que Groq y la mayoría
 * de proveedores actuales ya soportan.
 *
 * Variables:
 *   LLM_PROVIDER      "openai-compatible" (default)
 *   LLM_BASE_URL       https://api.groq.com/openai/v1
 *   LLM_MODEL          openai/gpt-oss-120b
 *   LLM_API_KEY        gsk_...
 *   LLM_MAX_TOKENS     1024  (respuesta final)
 *   LLM_TEMPERATURE    0.7
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

export function getLLMConfig() {
  return {
    provider: process.env.LLM_PROVIDER || "openai-compatible",
    baseUrl: required("LLM_BASE_URL").replace(/\/+$/, ""),
    model: required("LLM_MODEL"),
    apiKey: required("LLM_API_KEY"),
    maxTokens: optional("LLM_MAX_TOKENS", 1024),
    temperature: optional("LLM_TEMPERATURE", 0.7),
  };
}
