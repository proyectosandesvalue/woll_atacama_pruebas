/**
 * Información pública del proveedor LLM (Sprint 32-C).
 *
 * Devuelve solo el proveedor, una etiqueta legible y el modelo. Nunca
 * expone la API key, la URL base, credenciales de Google ni rutas internas.
 * Si el entorno no está configurado, responde con un texto genérico.
 */

const NOTICE_VERSION = "2026-11";
const GENERIC_LABEL = "Proveedor externo de modelos de lenguaje";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Deriva una etiqueta legible desde LLM_PROVIDER y LLM_BASE_URL.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{provider:string, provider_label:string, model:string|null,
 *   external_processing:boolean, notice_version:string}}
 */
export function describeProvider(env = process.env) {
  const rawProvider = String(env.LLM_PROVIDER || "openai-compatible").trim();
  const provider = rawProvider.toLowerCase();
  const baseUrl = normalize(env.LLM_BASE_URL);

  let providerLabel = GENERIC_LABEL;

  if (provider === "vertex-ai") {
    providerLabel = "Google Cloud Vertex AI";
  } else if (baseUrl.includes("groq.com")) {
    providerLabel = "Groq";
  } else if (baseUrl.includes("generativelanguage.googleapis.com")) {
    providerLabel = "Google AI Studio";
  } else if (baseUrl.includes("api.openai.com")) {
    providerLabel = "OpenAI";
  } else if (baseUrl.includes("openrouter.ai")) {
    providerLabel = "OpenRouter";
  } else if (baseUrl.includes("mistral.ai")) {
    providerLabel = "Mistral AI";
  } else if (baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1")) {
    providerLabel = "Servidor local de modelos";
  } else if (baseUrl) {
    providerLabel = "Proveedor compatible con OpenAI";
  }

  const model = String(env.LLM_MODEL || "").trim() || null;

  return {
    provider: rawProvider,
    provider_label: providerLabel,
    model,
    external_processing: true,
    notice_version: NOTICE_VERSION,
  };
}

/**
 * Handler de `GET /api/chat/info`.
 *
 * @param {unknown} _body
 * @param {{ env?: NodeJS.ProcessEnv }} [ctx]
 */
export async function handleChatInfo(_body, ctx = {}) {
  return {
    status: 200,
    body: describeProvider(ctx.env || process.env),
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  };
}
