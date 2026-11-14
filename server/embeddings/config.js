/**
 * Configuración del proveedor de embeddings (server-side).
 *
 * Dos modos:
 *
 * 1. OpenAI-compatible (`EMBEDDINGS_PROVIDER=openai-compatible`, default):
 *      OpenAI, Azure OpenAI, vLLM, TEI (Text Embeddings Inference), Ollama.
 *      Variables: EMBEDDINGS_BASE_URL, EMBEDDINGS_MODEL, EMBEDDINGS_API_KEY,
 *      EMBEDDINGS_SEND_DIMENSIONS.
 *
 * 2. Vertex AI (`EMBEDDINGS_PROVIDER=vertex` o `vertex-ai`):
 *      gemini-embedding-001 con outputDimensionality=1024.
 *      Variables: GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION,
 *      EMBEDDINGS_MODEL, GOOGLE_APPLICATION_CREDENTIALS_JSON o ADC.
 *
 * Comunes:
 *   EMBEDDINGS_DIM               1024 (fijado por rag.chunks.embedding)
 *   EMBEDDINGS_TIMEOUT_MS        30000
 *   EMBEDDINGS_MAX_RETRIES       5
 *   EMBEDDINGS_PRICE_PER_MTOK    0 (costo estimado; informativo)
 *   RAG_EMBED_BATCH              32
 *   EMBEDDINGS_TASK_TYPE         RETRIEVAL_DOCUMENT (solo Vertex)
 */

function required(env, name) {
  const value = env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Variable de entorno requerida no configurada: ${name}`);
  }
  return String(value).trim();
}

function positive(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new RangeError(`Variable de entorno inválida: ${name}=${raw}`);
  }
  return n;
}

function bool(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined) return fallback;
  return /^(1|true|yes)$/i.test(String(raw));
}

export const EMBEDDING_DIM = 1024;

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function getEmbeddingsConfig(env = process.env) {
  const provider = String(env.EMBEDDINGS_PROVIDER || "openai-compatible").trim();
  const normalized =
    provider === "vertex-ai" ? "vertex" : provider;
  if (!["openai-compatible", "vertex"].includes(normalized)) {
    throw new Error(
      `EMBEDDINGS_PROVIDER no soportado: ${provider}. Válidos: openai-compatible, vertex.`
    );
  }

  const dim = Math.floor(positive(env, "EMBEDDINGS_DIM", EMBEDDING_DIM));
  if (dim !== EMBEDDING_DIM) {
    throw new Error(
      `EMBEDDINGS_DIM=${dim} no coincide con rag.chunks.embedding vector(${EMBEDDING_DIM}). ` +
        "Cambiar la dimensión exige una migración nueva y re-ingesta total (ADR 022)."
    );
  }

  const common = {
    dim,
    batchSize: Math.floor(positive(env, "RAG_EMBED_BATCH", 32)),
    timeoutMs: Math.floor(positive(env, "EMBEDDINGS_TIMEOUT_MS", 30000)),
    maxRetries: Math.floor(positive(env, "EMBEDDINGS_MAX_RETRIES", 5)),
    pricePerMTok: Number(env.EMBEDDINGS_PRICE_PER_MTOK || 0),
  };

  if (normalized === "vertex") {
    return {
      provider: "vertex",
      project: required(env, "GOOGLE_CLOUD_PROJECT"),
      location: String(
        env.EMBEDDINGS_LOCATION || env.GOOGLE_CLOUD_LOCATION || "us-central1"
      ).trim(),
      model: required(env, "EMBEDDINGS_MODEL"),
      taskType: String(env.EMBEDDINGS_TASK_TYPE || "RETRIEVAL_DOCUMENT").trim(),
      ...common,
    };
  }

  return {
    provider: "openai-compatible",
    baseUrl: required(env, "EMBEDDINGS_BASE_URL").replace(/\/+$/, ""),
    model: required(env, "EMBEDDINGS_MODEL"),
    // Un servidor autoalojado puede no requerir clave; el header vacío
    // es aceptado por vLLM/TEI. Nunca se registra en logs.
    apiKey: env.EMBEDDINGS_API_KEY ? String(env.EMBEDDINGS_API_KEY) : "none",
    sendDimensions: bool(env, "EMBEDDINGS_SEND_DIMENSIONS", false),
    ...common,
  };
}
