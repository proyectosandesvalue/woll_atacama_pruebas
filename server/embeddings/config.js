/**
 * Configuración del proveedor de embeddings (server-side).
 *
 * Interfaz compatible con OpenAI `/v1/embeddings`: OpenAI, Azure
 * OpenAI, vLLM, TEI (Text Embeddings Inference), Ollama en modo
 * OpenAI-compatible, etc.
 *
 * Variables:
 *   EMBEDDINGS_PROVIDER          "openai-compatible" (default)
 *   EMBEDDINGS_BASE_URL          http://127.0.0.1:8080/v1
 *   EMBEDDINGS_MODEL             BAAI/bge-m3
 *   EMBEDDINGS_API_KEY           opcional en autoalojado
 *   EMBEDDINGS_DIM               1024 (fijado por rag.chunks.embedding)
 *   EMBEDDINGS_SEND_DIMENSIONS   1 solo para modelos que aceptan dimensions
 *   EMBEDDINGS_TIMEOUT_MS        30000
 *   EMBEDDINGS_MAX_RETRIES       5
 *   EMBEDDINGS_PRICE_PER_MTOK    0 (costo estimado; informativo)
 *   RAG_EMBED_BATCH              32
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
  if (provider !== "openai-compatible") {
    throw new Error(
      `EMBEDDINGS_PROVIDER no soportado: ${provider}. Válido: openai-compatible.`
    );
  }

  const dim = Math.floor(positive(env, "EMBEDDINGS_DIM", EMBEDDING_DIM));
  if (dim !== EMBEDDING_DIM) {
    throw new Error(
      `EMBEDDINGS_DIM=${dim} no coincide con rag.chunks.embedding vector(${EMBEDDING_DIM}). ` +
        "Cambiar la dimensión exige una migración nueva y re-ingesta total (ADR 022)."
    );
  }

  return {
    provider,
    baseUrl: required(env, "EMBEDDINGS_BASE_URL").replace(/\/+$/, ""),
    model: required(env, "EMBEDDINGS_MODEL"),
    // Un servidor autoalojado puede no requerir clave; el header vacío
    // es aceptado por vLLM/TEI. Nunca se registra en logs.
    apiKey: env.EMBEDDINGS_API_KEY ? String(env.EMBEDDINGS_API_KEY) : "none",
    dim,
    batchSize: Math.floor(positive(env, "RAG_EMBED_BATCH", 32)),
    timeoutMs: Math.floor(positive(env, "EMBEDDINGS_TIMEOUT_MS", 30000)),
    maxRetries: Math.floor(positive(env, "EMBEDDINGS_MAX_RETRIES", 5)),
    sendDimensions: bool(env, "EMBEDDINGS_SEND_DIMENSIONS", false),
    pricePerMTok: Number(env.EMBEDDINGS_PRICE_PER_MTOK || 0),
  };
}
