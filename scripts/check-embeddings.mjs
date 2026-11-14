#!/usr/bin/env node
/**
 * Verifica el proveedor de embeddings configurado.
 *
 * Uso:
 *   npm run embeddings:check
 *
 * Lee EMBEDDINGS_* del entorno, genera un vector de prueba y valida que la
 * dimensión sea 1024 (rag.chunks.embedding). No imprime la API key ni el
 * texto de prueba.
 */
import { getEmbeddingsConfig } from "../server/embeddings/config.js";
import { createEmbedder } from "../server/embeddings/provider.js";

function safeBaseUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return "(URL inválida)";
  }
}

async function main() {
  let cfg;
  try {
    cfg = getEmbeddingsConfig();
  } catch (err) {
    console.error(`[embeddings:check] configuración inválida: ${err.message}`);
    console.error(
      "Define EMBEDDINGS_BASE_URL, EMBEDDINGS_MODEL y, si aplica, EMBEDDINGS_API_KEY."
    );
    process.exitCode = 1;
    return;
  }

  const embedder = createEmbedder(cfg);
  const started = performance.now();
  try {
    const vectors = await embedder.embed([
      "Verificación del proveedor de embeddings del Visor Territorial de Atacama.",
    ]);
    const latencyMs = Math.round(performance.now() - started);

    if (!Array.isArray(vectors) || vectors.length !== 1) {
      throw new Error(`Se esperaba 1 vector y llegaron ${vectors?.length ?? 0}.`);
    }
    if (!Array.isArray(vectors[0]) || vectors[0].length !== cfg.dim) {
      throw new Error(
        `Dimensión ${vectors[0]?.length ?? "?"}, esperada ${cfg.dim}. ` +
          "Elige un modelo de 1024 dimensiones o usa EMBEDDINGS_SEND_DIMENSIONS=1 si el proveedor lo soporta."
      );
    }

    const target =
      cfg.provider === "vertex"
        ? { project: cfg.project, location: cfg.location }
        : { baseUrl: safeBaseUrl(cfg.baseUrl) };

    console.log(
      JSON.stringify(
        {
          ok: true,
          provider: cfg.provider,
          ...target,
          model: cfg.model,
          dim: cfg.dim,
          vectorLength: vectors[0].length,
          latencyMs,
        },
        null,
        2
      )
    );
  } catch (err) {
    console.error(`[embeddings:check] falló: ${err?.message || err}`);
    console.error(
      "Revisa que el servicio esté arriba, la URL base, el modelo y la API key. " +
        "La dimensión debe ser 1024."
    );
    process.exitCode = 1;
  }
}

main();
