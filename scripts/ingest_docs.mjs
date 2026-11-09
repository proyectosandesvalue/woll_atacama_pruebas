/**
 * Ingesta de PDFs al índice RAG.
 *
 * Uso:
 *   node --env-file=.env.staging scripts/ingest_docs.mjs [opciones]
 *
 * Opciones:
 *   --dry-run             Extrae y chunkea sin BD ni proveedor. Informa
 *                         chunks, tokens y costo estimado.
 *   --force               Re-embebe aunque el sha256 y el modelo no
 *                         hayan cambiado.
 *   --only <slug>         Procesa solo ese slug (repetible).
 *   --manifest <ruta>     Manifiesto alternativo (default rag/manifest.json).
 *   --help                Esta ayuda.
 *
 * Requiere (solo sin --dry-run):
 *   DATABASE_URL          postgres://rag_ingest:...@host:5432/woll
 *   EMBEDDINGS_*          ver server/embeddings/config.js
 *
 * Los logs nunca incluyen contenido de documentos ni API keys.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { ingestDocument } from "../server/rag/pipeline.js";
import { getRagConfig } from "../server/rag/config.js";
import { createEmbedder } from "../server/embeddings/provider.js";
import { getEmbeddingsConfig } from "../server/embeddings/config.js";

const args = process.argv.slice(2);

function hasFlag(name) {
  return args.includes(name);
}

function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`Falta el valor de ${name}.`);
    process.exit(2);
  }
  return value;
}

function optionAll(name) {
  const values = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name && args[i + 1] && !args[i + 1].startsWith("--")) {
      values.push(args[i + 1]);
    }
  }
  return values;
}

if (hasFlag("--help") || hasFlag("-h")) {
  console.log(
    [
      "Ingesta RAG de PDFs",
      "",
      "  node --env-file=.env.staging scripts/ingest_docs.mjs [--dry-run] [--force]",
      "       [--only slug] [--manifest rag/manifest.json]",
      "",
      "--dry-run no necesita DATABASE_URL ni proveedor de embeddings.",
    ].join("\n")
  );
  process.exit(0);
}

const dryRun = hasFlag("--dry-run");
const force = hasFlag("--force");
const only = new Set(optionAll("--only"));
const manifestPath = path.resolve(option("--manifest", "rag/manifest.json"));
const baseDir = path.dirname(manifestPath);

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch (err) {
  console.error(`No se pudo leer el manifiesto ${manifestPath}: ${err.message}`);
  process.exit(2);
}

if (!Array.isArray(manifest)) {
  console.error("El manifiesto debe ser un arreglo JSON de documentos.");
  process.exit(2);
}

const entries = manifest.filter((entry) => only.size === 0 || only.has(entry?.slug));

if (entries.length === 0) {
  console.error(
    only.size > 0
      ? `Ningún documento coincide con --only ${[...only].join(", ")}.`
      : "El manifiesto no tiene documentos."
  );
  process.exit(2);
}

const ragConfig = getRagConfig();

let pool = null;
let embedder = null;
let pricePerMTok = 0;

if (!dryRun) {
  if (!process.env.DATABASE_URL) {
    console.error("Falta DATABASE_URL (o usa --dry-run).");
    process.exit(2);
  }

  const { default: pg } = await import("pg");

  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    application_name: "woll-rag-ingest",
    statement_timeout: 120_000,
    connectionTimeoutMillis: 10_000,
    // El tipo vector vive en el schema extensions (pgvector).
    options: "-c search_path=public,extensions",
  });

  try {
    const config = getEmbeddingsConfig();
    pricePerMTok = config.pricePerMTok;
    embedder = createEmbedder(config);

    console.log(
      JSON.stringify({
        event: "start",
        mode: "ingest",
        documents: entries.length,
        embedding_model: embedder.model,
        embedding_dim: embedder.dim,
        batch_size: config.batchSize,
        target_tokens: ragConfig.targetTokens,
        overlap_tokens: ragConfig.overlapTokens,
      })
    );
  } catch (err) {
    console.error(`Configuración de embeddings inválida: ${err.message}`);
    await pool.end().catch(() => {});
    process.exit(2);
  }
} else {
  console.log(
    JSON.stringify({
      event: "start",
      mode: "dry-run",
      documents: entries.length,
      target_tokens: ragConfig.targetTokens,
      overlap_tokens: ragConfig.overlapTokens,
    })
  );
}

const summary = {
  total: entries.length,
  ready: 0,
  skipped: 0,
  needs_ocr: 0,
  rejected: 0,
  failed: 0,
  chunks: 0,
  est_tokens: 0,
  est_cost_usd: 0,
};

try {
  for (const entry of entries) {
    const result = await ingestDocument({
      entry,
      baseDir,
      pool,
      embedder,
      config: ragConfig,
      dryRun,
      force,
      pricePerMTok,
    });

    console.log(JSON.stringify(result));

    if (result.status === "ready" || result.status === "dry-run") {
      summary.ready += 1;
    } else if (result.status === "skipped") {
      summary.skipped += 1;
    } else if (result.status === "needs_ocr") {
      summary.needs_ocr += 1;
    } else if (result.status === "rejected") {
      summary.rejected += 1;
    } else {
      summary.failed += 1;
    }

    summary.chunks += result.chunks || 0;
    summary.est_tokens += result.estTokens || 0;
    summary.est_cost_usd += result.estCostUsd || 0;
  }
} catch (err) {
  console.error(`Error fatal en la ingesta: ${err.message}`);
  summary.failed += 1;
} finally {
  if (pool) await pool.end().catch(() => {});
}

summary.est_cost_usd = Number(summary.est_cost_usd.toFixed(6));
console.log(JSON.stringify({ event: "summary", ...summary }));

process.exitCode = summary.failed > 0 || summary.rejected > 0 ? 1 : 0;
