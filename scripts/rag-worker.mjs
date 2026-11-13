#!/usr/bin/env node
/**
 * Worker de ingesta RAG (Sprint 45-A).
 *
 * Reclama jobs de `admin.rag_jobs` y ejecuta `ingestDocument`. Corre en una
 * imagen con `pdfjs-dist` (devDependencies) y volumen compartido `rag/`.
 *
 * Uso:
 *   node --env-file=.env.local scripts/rag-worker.mjs
 *   node --env-file=.env.local scripts/rag-worker.mjs --once
 *   node --env-file=.env.local scripts/rag-worker.mjs --poll 2000
 *
 * Variables:
 *   DATABASE_URL / WORKER_DATABASE_URL  cola admin.rag_jobs
 *   RAG_DATABASE_URL                    escritura rag.* (fallback DATABASE_URL)
 *   RAG_MANIFEST_PATH                   default rag/manifest.json
 *   EMBEDDINGS_*                        proveedor de embeddings
 *
 * Los logs no incluyen contenido de documentos ni API keys.
 */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

import { getRagConfig } from "../server/rag/config.js";
import { ingestDocument } from "../server/rag/pipeline.js";
import { getEmbeddingsConfig } from "../server/embeddings/config.js";
import { createEmbedder } from "../server/embeddings/provider.js";
import { readManifest } from "../server/admin/rag-manifest.js";

const { Pool } = pg;
const WORKER = "rag-worker";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function log(event, data = {}) {
  console.log(JSON.stringify({ event, worker: WORKER, ...data }));
}

function parseArgs(argv) {
  const opts = { once: false, pollMs: 2000, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--once") opts.once = true;
    else if (arg === "--poll") opts.pollMs = Math.max(500, Number(argv[++i]) || 2000);
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`Argumento desconocido: ${arg}`);
  }
  return opts;
}

export function mapIngestStatus(result) {
  switch (result?.status) {
    case "ready":
    case "dry-run":
      return "succeeded";
    case "skipped":
      return "skipped";
    case "needs_ocr":
      return "needs_ocr";
    case "rejected":
      return "rejected";
    default:
      return "failed";
  }
}

function databaseUrl() {
  return (
    process.env.WORKER_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.RAG_DATABASE_URL ||
    ""
  );
}

function ragDatabaseUrl() {
  return process.env.RAG_DATABASE_URL || process.env.DATABASE_URL || "";
}

function createPools() {
  const jobUrl = databaseUrl();
  if (!jobUrl) throw new Error("Falta DATABASE_URL/WORKER_DATABASE_URL para la cola.");
  const jobPool = new Pool({
    connectionString: jobUrl,
    max: 2,
    application_name: `${WORKER}-jobs`,
    connectionTimeoutMillis: 10_000,
  });

  const ragUrl = ragDatabaseUrl();
  let ragPool = null;
  if (ragUrl) {
    ragPool = new Pool({
      connectionString: ragUrl,
      max: 2,
      application_name: WORKER,
      statement_timeout: 120_000,
      connectionTimeoutMillis: 10_000,
      options: "-c search_path=public,extensions",
    });
  }

  return { jobPool, ragPool };
}

async function heartbeat(pool, details = {}) {
  await pool.query(
    `INSERT INTO admin.worker_heartbeats (worker, last_seen_at, details)
     VALUES ($1, now(), $2::jsonb)
     ON CONFLICT (worker) DO UPDATE
       SET last_seen_at = now(), details = EXCLUDED.details`,
    [WORKER, JSON.stringify(details)]
  );
}

async function claimJob(pool) {
  const { rows } = await pool.query(
    `WITH next AS (
       SELECT id FROM admin.rag_jobs
        WHERE status = 'queued'
        ORDER BY id
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE admin.rag_jobs j
        SET status = 'running', started_at = now(), heartbeat_at = now()
       FROM next
      WHERE j.id = next.id
      RETURNING j.*`
  );
  return rows[0] || null;
}

async function finishJob(pool, job, status, result, error = null) {
  await pool.query(
    `UPDATE admin.rag_jobs
        SET status = $2,
            result = $3::jsonb,
            error_code = $4,
            error_message = $5,
            finished_at = now(),
            heartbeat_at = now()
      WHERE id = $1`,
    [
      job.id,
      status,
      JSON.stringify(result || {}),
      error?.code || null,
      error ? String(error.message || "").slice(0, 800) : null,
    ]
  );
}

function manifestEntry(manifest, slug) {
  return manifest.find((entry) => entry?.slug === slug) || null;
}

async function processJob(job, { jobPool, ragPool, embedder, config, manifest, baseDir }) {
  const entry = manifestEntry(manifest, job.slug);
  if (!entry) {
    throw Object.assign(new Error("El documento no está en el manifiesto."), {
      code: "NOT_IN_MANIFEST",
    });
  }

  const dryRun = job.action === "dry_run";
  let currentEmbedder = embedder;
  let pricePerMTok = 0;

  if (!dryRun) {
    if (!ragPool) {
      throw Object.assign(new Error("Falta RAG_DATABASE_URL."), { code: "NO_RAG_DB" });
    }
    if (!currentEmbedder) {
      const embeddings = getEmbeddingsConfig();
      currentEmbedder = createEmbedder(embeddings);
      pricePerMTok = embeddings.pricePerMTok || 0;
    }
  }

  return ingestDocument({
    entry,
    baseDir,
    pool: dryRun ? null : ragPool,
    embedder: dryRun ? null : currentEmbedder,
    config,
    dryRun,
    force: job.force === true,
    pricePerMTok,
  });
}

async function runOnce({ jobPool, ragPool, embedder, config, baseDir }) {
  const job = await claimJob(jobPool);
  if (!job) return null;

  log("job.start", { id: job.id, slug: job.slug, action: job.action });
  const heartbeatTimer = setInterval(() => {
    heartbeat(jobPool, { pid: process.pid }).catch(() => {});
  }, 15_000);
  heartbeatTimer.unref?.();

  try {
    const manifest = await readManifest();
    const result = await processJob(job, {
      jobPool,
      ragPool,
      embedder,
      config,
      manifest,
      baseDir,
    });
    const status = mapIngestStatus(result);
    const resultError =
      status === "failed"
        ? { code: result?.errorCode || "INGEST_FAILED", message: result?.error || "La ingesta falló." }
        : null;
    await finishJob(jobPool, job, status, result, resultError);
    log("job.finish", { id: job.id, status, slug: job.slug });
    return { job, status, result };
  } catch (err) {
    await finishJob(jobPool, job, "failed", {}, err);
    log("job.fail", {
      id: job.id,
      slug: job.slug,
      code: err?.code || "INTERNAL",
      message: String(err?.message || "").slice(0, 200),
    });
    return { job, status: "failed", error: err };
  } finally {
    clearInterval(heartbeatTimer);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(
      "Uso: node scripts/rag-worker.mjs [--once] [--poll 2000]\n" +
        "Requiere DATABASE_URL (cola), RAG_DATABASE_URL (rag.*) y EMBEDDINGS_*."
    );
    return;
  }

  const { jobPool, ragPool } = createPools();
  const config = getRagConfig();
  const baseDir = path.dirname(
    path.resolve(ROOT, process.env.RAG_MANIFEST_PATH || "rag/manifest.json")
  );

  let embedder = null;
  try {
    embedder = createEmbedder(getEmbeddingsConfig());
  } catch (err) {
    // El worker arranca igual: dry-run funciona y los jobs de ingesta fallan
    // con un mensaje claro hasta configurar EMBEDDINGS_*.
    log("worker.embeddings_unavailable", { message: err.message.slice(0, 200) });
  }

  await heartbeat(jobPool, { pid: process.pid, poll_ms: opts.pollMs });

  // Recupera jobs que quedaron running por un worker caído.
  const stale = await jobPool.query(
    `UPDATE admin.rag_jobs
        SET status = 'failed',
            finished_at = now(),
            error_code = 'STALE_HEARTBEAT',
            error_message = 'Worker sin heartbeat por más de 10 minutos.'
      WHERE status = 'running'
        AND (heartbeat_at IS NULL OR heartbeat_at < now() - interval '10 minutes')
      RETURNING id`
  );
  if (stale.rowCount > 0) log("worker.recovered_stale", { jobs: stale.rowCount });

  log("worker.start", { once: opts.once, poll_ms: opts.pollMs, embeddings: Boolean(embedder) });

  let running = true;
  const stop = () => {
    running = false;
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  let lastStatus = 0;
  while (running) {
    const outcome = await runOnce({ jobPool, ragPool, embedder, config, baseDir });
    if (outcome) {
      lastStatus = outcome.status === "failed" ? 1 : 0;
      if (opts.once) break;
    } else if (opts.once) {
      break;
    }

    await heartbeat(jobPool, { pid: process.pid, poll_ms: opts.pollMs });
    await new Promise((resolve) => setTimeout(resolve, opts.pollMs));
  }

  await jobPool.end().catch(() => {});
  if (ragPool) await ragPool.end().catch(() => {});
  if (opts.once) process.exitCode = lastStatus;
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((err) => {
    log("worker.fatal", { message: String(err?.message || err).slice(0, 300) });
    process.exitCode = 1;
  });
}
