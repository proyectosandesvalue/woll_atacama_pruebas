/**
 * Endpoints del panel para la ingesta RAG (Sprint 45-A).
 *
 * El API solo valida/maneja metadatos y encola. El worker
 * (`scripts/rag-worker.mjs`) hace extracción, embeddings y escritura en
 * `rag.*`.
 */

import { getDB as defaultGetDB } from "../db/pool.js";
import { getEmbeddingsConfig } from "../embeddings/config.js";
import { RagError } from "../rag/errors.js";
import { recordAudit } from "../admin/auth.js";
import {
  DEFAULT_MAX_PDF_BYTES,
  deletePdf,
  fileInfo,
  findManifestEntry,
  readManifest,
  removeManifestEntry,
  savePdfStream,
  upsertManifestEntry,
} from "../admin/rag-manifest.js";
import {
  isPostgres,
  json,
  requireCsrf,
  requireSession,
} from "./admin.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(["dry_run", "ingest", "reingest"]);

function errorStatus(err) {
  if (err instanceof RagError) {
    if (err.code === "FILE_TOO_LARGE") return 413;
    if (["BAD_SLUG", "BAD_FILE", "BAD_FILE_TYPE", "NOT_A_PDF", "BAD_MANIFEST"].includes(err.code)) {
      return 400;
    }
    if (err.code === "NOT_FOUND") return 404;
    return 400;
  }
  return 500;
}

function errorBody(err) {
  const message = err instanceof RagError ? err.message : "Error interno.";
  return { error: message, code: err?.code || "INTERNAL" };
}

async function audit(ctx, session, action, target, result, detail = {}) {
  let db = null;
  try {
    db = await defaultGetDB();
  } catch {
    return;
  }
  await recordAudit(db, {
    actor: session?.sub || null,
    action,
    target,
    result,
    ip: ctx.ip,
    detail,
  });
}

async function readOverviewConfig() {
  try {
    const config = getEmbeddingsConfig();
    return {
      configured: true,
      provider: config.provider,
      model: config.model,
      dim: config.dim,
      batchSize: config.batchSize,
      pricePerMTok: config.pricePerMTok,
    };
  } catch (err) {
    return { configured: false, error: err.message };
  }
}

async function withManifestFiles(entries) {
  return Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      file_info: await fileInfo(entry).catch(() => ({
        exists: false,
        bytes: 0,
        modified_at: null,
      })),
    }))
  );
}

/**
 * GET /api/admin/rag/overview
 */
export async function handleRagOverview(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;

  let manifest = [];
  let manifestError = null;
  try {
    manifest = await readManifest(ctx.env);
  } catch (err) {
    manifestError = err.message;
  }

  let db;
  try {
    db = await getDB();
  } catch (err) {
    return json(503, { error: "PostgreSQL no disponible.", detail: err.message });
  }
  if (!isPostgres(db)) {
    return json(503, { error: "La ingesta RAG requiere PostgreSQL." });
  }

  try {
    const [documents, runs, jobs, workers, config] = await Promise.all([
      db.query(
        `SELECT DISTINCT ON (d.slug)
                d.document_id, d.slug, d.version, d.title, d.source_url,
                d.publisher, d.license, d.language, d.published_at,
                d.page_count, d.trust_level, d.copyright_cleared, d.status,
                d.tags, d.created_at,
                (SELECT count(*)::int FROM rag.chunks c
                  WHERE c.document_id = d.document_id) AS chunk_count
           FROM rag.documents d
          ORDER BY d.slug, (d.status = 'ready') DESC, d.version DESC`
      ),
      db.query(
        `SELECT run_id, document_id, slug, status, started_at, finished_at,
                chunks_total, embedding_model, est_tokens, est_cost_usd, error_code
           FROM rag.ingestion_runs
          ORDER BY started_at DESC, run_id DESC
          LIMIT 25`
      ),
      db.query(
        `SELECT id, action, slug, force, status, requested_by,
                result, error_code, error_message,
                created_at, started_at, finished_at, heartbeat_at
           FROM admin.rag_jobs
          ORDER BY id DESC
          LIMIT 25`
      ),
      db.query(
        `SELECT worker, last_seen_at, details
           FROM admin.worker_heartbeats
          WHERE worker IN ('rag-worker')`
      ),
      readOverviewConfig(),
    ]);

    return json(200, {
      manifest: await withManifestFiles(manifest),
      manifestError,
      documents,
      runs,
      jobs,
      worker: workers[0] || null,
      config,
      limits: { maxPdfBytes: DEFAULT_MAX_PDF_BYTES },
    });
  } catch (err) {
    console.error("[admin:rag] error en overview:", err?.message || err);
    return json(503, { error: "No se pudo leer el estado del RAG." });
  }
}

/**
 * POST /api/admin/rag/upload?slug=...
 */
export async function handleRagUpload(ctx) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) {
    return json(403, { error: "Token CSRF inválido." });
  }

  const slug = String(ctx.query?.slug || "");
  const contentType = String(ctx.req?.headers?.["content-type"] || "").toLowerCase();
  if (!contentType.includes("application/pdf")) {
    return json(415, { error: "El upload debe ser application/pdf." });
  }

  const declared = Number(ctx.req?.headers?.["content-length"] || 0);
  if (Number.isFinite(declared) && declared > DEFAULT_MAX_PDF_BYTES) {
    return json(413, { error: "El PDF supera el límite de 25 MB." });
  }

  let saved;
  try {
    saved = await savePdfStream(ctx.req, slug, {
      maxBytes: DEFAULT_MAX_PDF_BYTES,
      env: ctx.env,
    });
  } catch (err) {
    return json(errorStatus(err), errorBody(err));
  }

  await audit(ctx, auth.session, "rag.upload", slug, "ok", {
    bytes: saved.bytes,
  });
  return json(201, { slug, ...saved });
}

/**
 * POST /api/admin/rag/manifest
 */
export async function handleRagManifestSave(ctx) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) {
    return json(403, { error: "Token CSRF inválido." });
  }

  try {
    const entry = await upsertManifestEntry(ctx.body || {}, ctx.env);
    await audit(ctx, auth.session, "rag.manifest.save", entry.slug, "ok", {
      file: entry.file,
    });
    return json(200, { entry });
  } catch (err) {
    await audit(ctx, auth.session, "rag.manifest.save", ctx.body?.slug || null, "fail", {
      code: err?.code || "INTERNAL",
    });
    return json(errorStatus(err), errorBody(err));
  }
}

/**
 * DELETE /api/admin/rag/manifest?slug=&file=1
 */
export async function handleRagManifestDelete(ctx) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) {
    return json(403, { error: "Token CSRF inválido." });
  }

  const slug = String(ctx.query?.slug || "");
  try {
    const result = await removeManifestEntry(slug, ctx.env);
    let fileDeleted = false;
    if (String(ctx.query?.file || "") === "1") {
      await deletePdf(slug, ctx.env);
      fileDeleted = true;
    }
    await audit(ctx, auth.session, "rag.manifest.delete", slug, "ok", {
      fileDeleted,
    });
    return json(200, { ...result, fileDeleted });
  } catch (err) {
    return json(errorStatus(err), errorBody(err));
  }
}

/**
 * POST /api/admin/rag/jobs
 */
export async function handleRagQueue(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) {
    return json(403, { error: "Token CSRF inválido." });
  }

  const body = ctx.body || {};
  const slug = String(body.slug || "");
  const action = String(body.action || "ingest");
  const force = body.force === true || action === "reingest";

  if (!ACTIONS.has(action)) {
    return json(400, { error: "Acción inválida." });
  }

  let entry;
  try {
    entry = await findManifestEntry(slug, ctx.env);
  } catch (err) {
    return json(errorStatus(err), errorBody(err));
  }
  if (!entry) {
    return json(404, { error: "El documento no está en el manifiesto." });
  }

  if (action !== "dry_run") {
    try {
      getEmbeddingsConfig();
    } catch (err) {
      return json(503, { error: `Embeddings no configurados: ${err.message}` });
    }
  }

  let db;
  try {
    db = await getDB();
  } catch (err) {
    return json(503, { error: "PostgreSQL no disponible.", detail: err.message });
  }
  if (!isPostgres(db)) {
    return json(503, { error: "La ingesta RAG requiere PostgreSQL." });
  }

  try {
    const rows = await db.query(
      `INSERT INTO admin.rag_jobs (action, slug, force, status, requested_by)
       VALUES ($1, $2, $3, 'queued', $4)
       RETURNING id, action, slug, force, status, requested_by, created_at`,
      [action, slug, force, auth.session.sub]
    );
    await audit(ctx, auth.session, "rag.job.queue", slug, "ok", { action });
    return json(201, { job: rows[0] });
  } catch (err) {
    if (err?.code === "23505") {
      return json(409, { error: "Ya hay un job activo para este documento." });
    }
    console.error("[admin:rag] error al encolar:", err?.message || err);
    return json(503, { error: "No se pudo encolar el trabajo." });
  }
}

/**
 * GET /api/admin/rag/jobs?id=...
 */
export async function handleRagJobsGet(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;

  let db;
  try {
    db = await getDB();
  } catch (err) {
    return json(503, { error: "PostgreSQL no disponible." });
  }
  if (!isPostgres(db)) {
    return json(503, { error: "La ingesta RAG requiere PostgreSQL." });
  }

  const id = Number.parseInt(ctx.query?.id, 10);
  try {
    if (Number.isInteger(id)) {
      const rows = await db.query(
        `SELECT id, action, slug, force, status, requested_by, result,
                error_code, error_message, created_at, started_at,
                finished_at, heartbeat_at
           FROM admin.rag_jobs
          WHERE id = $1`,
        [id]
      );
      if (rows.length === 0) return json(404, { error: "Job no encontrado." });
      return json(200, { job: rows[0] });
    }

    const rows = await db.query(
      `SELECT id, action, slug, force, status, requested_by, result,
              error_code, error_message, created_at, started_at,
              finished_at, heartbeat_at
         FROM admin.rag_jobs
        ORDER BY id DESC
        LIMIT 25`
    );
    return json(200, { items: rows });
  } catch (err) {
    console.error("[admin:rag] error leyendo jobs:", err?.message || err);
    return json(503, { error: "No se pudieron leer los trabajos." });
  }
}

/**
 * POST /api/admin/rag/jobs/cancel
 */
export async function handleRagJobCancel(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) {
    return json(403, { error: "Token CSRF inválido." });
  }

  const id = Number.parseInt(ctx.body?.id, 10);
  if (!Number.isInteger(id)) return json(400, { error: "Falta el id del job." });

  let db;
  try {
    db = await getDB();
  } catch {
    return json(503, { error: "PostgreSQL no disponible." });
  }
  if (!isPostgres(db)) {
    return json(503, { error: "La ingesta RAG requiere PostgreSQL." });
  }

  try {
    const rows = await db.query(
      `UPDATE admin.rag_jobs
          SET status = 'cancelled', finished_at = now()
        WHERE id = $1 AND status = 'queued'
        RETURNING id, status`,
      [id]
    );
    if (rows.length === 0) {
      const existing = await db.query("SELECT status FROM admin.rag_jobs WHERE id = $1", [id]);
      if (existing.length === 0) return json(404, { error: "Job no encontrado." });
      return json(409, { error: "El job ya está en ejecución o terminó." });
    }
    await audit(ctx, auth.session, "rag.job.cancel", String(id), "ok", {});
    return json(200, { job: rows[0] });
  } catch (err) {
    console.error("[admin:rag] error cancelando job:", err?.message || err);
    return json(503, { error: "No se pudo cancelar el trabajo." });
  }
}

/**
 * GET /api/admin/rag/chunks?document_id=&limit=&offset=
 */
export async function handleRagChunks(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;

  const documentId = String(ctx.query?.document_id || "");
  if (!UUID_RE.test(documentId)) {
    return json(400, { error: "document_id inválido." });
  }
  const requestedLimit = Number.parseInt(ctx.query?.limit, 10);
  const requestedOffset = Number.parseInt(ctx.query?.offset, 10);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 100)
    : 20;
  const offset = Number.isInteger(requestedOffset) && requestedOffset > 0
    ? requestedOffset
    : 0;

  let db;
  try {
    db = await getDB();
  } catch {
    return json(503, { error: "PostgreSQL no disponible." });
  }
  if (!isPostgres(db)) {
    return json(503, { error: "La ingesta RAG requiere PostgreSQL." });
  }

  try {
    const [totalRows, rows] = await Promise.all([
      db.query("SELECT count(*)::int AS total FROM rag.chunks WHERE document_id = $1", [
        documentId,
      ]),
      db.query(
        `SELECT chunk_id, ordinal, page_start, page_end, section, content,
                token_estimate, content_sha256
           FROM rag.chunks
          WHERE document_id = $1
          ORDER BY ordinal
          LIMIT $2 OFFSET $3`,
        [documentId, limit, offset]
      ),
    ]);
    return json(200, {
      total: totalRows[0]?.total || 0,
      limit,
      offset,
      items: rows,
    });
  } catch (err) {
    console.error("[admin:rag] error leyendo chunks:", err?.message || err);
    return json(503, { error: "No se pudieron leer los chunks." });
  }
}
