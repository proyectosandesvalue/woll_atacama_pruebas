import { RagError } from "../rag/errors.js";
import { getAccessToken as defaultGetAccessToken } from "./vertex-auth.js";

/**
 * Driver de embeddings compatible con OpenAI `/embeddings`.
 *
 * - Envía por lotes (`RAG_EMBED_BATCH`).
 * - Timeout explícito por request.
 * - Reintentos con backoff exponencial + jitter y respeto de
 *   `Retry-After` para 429/5xx.
 * - Valida cantidad, dimensión y finitud de los vectores.
 * - Nunca incluye el texto de entrada ni el cuerpo de la respuesta en
 *   los errores (puede contener contenido de documentos).
 */
function createOpenAIEmbedder(cfg, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const url = `${cfg.baseUrl}/embeddings`;

  const backoff = (attempt, retryAfter) => {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, 60_000);
    }
    return Math.min(30_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
  };

  async function callBatch(inputs) {
    for (let attempt = 0; ; attempt++) {
      let response;

      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({
            model: cfg.model,
            input: inputs,
            ...(cfg.sendDimensions ? { dimensions: cfg.dim } : {}),
          }),
          signal: AbortSignal.timeout(cfg.timeoutMs),
        });
      } catch {
        if (attempt >= cfg.maxRetries) {
          throw new RagError(
            "EMBED_NETWORK",
            "Fallo de red o timeout con el proveedor de embeddings."
          );
        }
        await sleep(backoff(attempt));
        continue;
      }

      if (response.ok) {
        let json;
        try {
          json = await response.json();
        } catch {
          throw new RagError("EMBED_BAD_RESPONSE", "El proveedor devolvió JSON inválido.");
        }

        const data = Array.isArray(json?.data) ? [...json.data] : null;
        if (!data || data.length !== inputs.length) {
          throw new RagError(
            "EMBED_BAD_RESPONSE",
            `Se esperaban ${inputs.length} embeddings y llegaron ${data ? data.length : 0}.`
          );
        }

        data.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

        return data.map((item, index) => {
          if (!Array.isArray(item.embedding) || item.embedding.length !== cfg.dim) {
            throw new RagError(
              "EMBED_DIM_MISMATCH",
              `Embedding ${index}: dimensión ${item.embedding?.length ?? "?"}, esperada ${cfg.dim}.`
            );
          }
          for (const value of item.embedding) {
            if (typeof value !== "number" || !Number.isFinite(value)) {
              throw new RagError("EMBED_BAD_VECTOR", `Embedding ${index}: valores no finitos.`);
            }
          }
          return item.embedding;
        });
      }

      if ((response.status === 429 || response.status >= 500) && attempt < cfg.maxRetries) {
        const retryAfter = response.headers?.get?.("retry-after") ?? null;
        await sleep(backoff(attempt, retryAfter));
        continue;
      }

      throw new RagError(
        `EMBED_HTTP_${response.status}`,
        `El proveedor de embeddings respondió ${response.status}.`
      );
    }
  }

  return {
    model: cfg.model,
    dim: cfg.dim,

    /**
     * @param {string[]} texts
     * @returns {Promise<number[][]>}
     */
    async embed(texts) {
      if (!Array.isArray(texts)) throw new TypeError("embed(texts): se esperaba un arreglo.");
      if (texts.length === 0) return [];

      const vectors = [];
      for (let i = 0; i < texts.length; i += cfg.batchSize) {
        const batch = texts.slice(i, i + cfg.batchSize);
        vectors.push(...(await callBatch(batch)));
      }
      return vectors;
    },
  };
}

function normalizeVertexModel(model) {
  return String(model || "").replace(/^google\//, "");
}

function buildVertexUrl(cfg) {
  const host =
    cfg.location === "global"
      ? "aiplatform.googleapis.com"
      : `${cfg.location}-aiplatform.googleapis.com`;
  return (
    `https://${host}/v1/projects/${cfg.project}` +
    `/locations/${cfg.location}/publishers/google/models/` +
    `${normalizeVertexModel(cfg.model)}:predict`
  );
}

/**
 * Driver de embeddings de Vertex AI (`gemini-embedding-001`).
 *
 * Usa el endpoint `:predict` con `instances[].content` y
 * `parameters.outputDimensionality`. Por defecto usa `RETRIEVAL_DOCUMENT`;
 * el retrieval puede pedir `RETRIEVAL_QUERY` con `embed(texts, { taskType })`.
 */
function createVertexEmbedder(cfg, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const getToken = deps.getAccessToken ?? defaultGetAccessToken;
  const url = buildVertexUrl(cfg);

  const backoff = (attempt, retryAfter) => {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, 60_000);
    }
    return Math.min(30_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
  };

  async function callBatch(inputs, taskType) {
    for (let attempt = 0; ; attempt++) {
      let response;

      try {
        const token = await getToken();
        response = await fetchImpl(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            instances: inputs.map((content) => ({ content })),
            parameters: {
              outputDimensionality: cfg.dim,
              task_type: taskType || cfg.taskType,
            },
          }),
          signal: AbortSignal.timeout(cfg.timeoutMs),
        });
      } catch {
        if (attempt >= cfg.maxRetries) {
          throw new RagError(
            "EMBED_NETWORK",
            "Fallo de red o timeout con Vertex AI."
          );
        }
        await sleep(backoff(attempt));
        continue;
      }

      if (response.ok) {
        let json;
        try {
          json = await response.json();
        } catch {
          throw new RagError("EMBED_BAD_RESPONSE", "Vertex AI devolvió JSON inválido.");
        }

        const predictions = Array.isArray(json?.predictions) ? json.predictions : null;
        if (!predictions || predictions.length !== inputs.length) {
          throw new RagError(
            "EMBED_BAD_RESPONSE",
            `Se esperaban ${inputs.length} embeddings y llegaron ${predictions ? predictions.length : 0}.`
          );
        }

        return predictions.map((item, index) => {
          const values = item?.embeddings?.values ?? item?.embeddings;
          if (!Array.isArray(values) || values.length !== cfg.dim) {
            throw new RagError(
              "EMBED_DIM_MISMATCH",
              `Embedding ${index}: dimensión ${values?.length ?? "?"}, esperada ${cfg.dim}.`
            );
          }
          for (const value of values) {
            if (typeof value !== "number" || !Number.isFinite(value)) {
              throw new RagError("EMBED_BAD_VECTOR", `Embedding ${index}: valores no finitos.`);
            }
          }
          return values;
        });
      }

      if ((response.status === 429 || response.status >= 500) && attempt < cfg.maxRetries) {
        const retryAfter = response.headers?.get?.("retry-after") ?? null;
        await sleep(backoff(attempt, retryAfter));
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        throw new RagError(
          `EMBED_HTTP_${response.status}`,
          `Vertex AI rechazó la autenticación (${response.status}). ` +
            "Revisa GOOGLE_APPLICATION_CREDENTIALS_JSON o ADC."
        );
      }

      throw new RagError(
        `EMBED_HTTP_${response.status}`,
        `Vertex AI respondió ${response.status}.`
      );
    }
  }

  return {
    model: cfg.model,
    dim: cfg.dim,

    /**
     * @param {string[]} texts
     * @param {{taskType?: string}} [options]
     * @returns {Promise<number[][]>}
     */
    async embed(texts, options = {}) {
      if (!Array.isArray(texts)) throw new TypeError("embed(texts): se esperaba un arreglo.");
      if (texts.length === 0) return [];

      const vectors = [];
      for (let i = 0; i < texts.length; i += cfg.batchSize) {
        const batch = texts.slice(i, i + cfg.batchSize);
        vectors.push(...(await callBatch(batch, options.taskType)));
      }
      return vectors;
    },
  };
}

/**
 * Factoría: elige el driver según `cfg.provider`.
 *
 * @param {object} cfg
 * @param {{fetch?:Function, sleep?:Function, getAccessToken?:Function}} [deps]
 */
export function createEmbedder(cfg, deps = {}) {
  if (cfg?.provider === "vertex") {
    return createVertexEmbedder(cfg, deps);
  }
  return createOpenAIEmbedder(cfg, deps);
}
