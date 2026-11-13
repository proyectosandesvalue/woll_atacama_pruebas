import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { RagError } from "./errors.js";
import { getRagConfig } from "./config.js";
import { extractPdf } from "./extract.js";
import { normalizeText, stripRepeatedLines } from "./normalize.js";
import { chunkPages } from "./chunker.js";
import { validateEntry } from "./manifest.js";

export { validateEntry };

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/**
 * True si el PDF no tiene texto suficiente (probable escaneo).
 *
 * @param {string[]} pages
 * @param {number} [minCharsPerPage]
 */
export function needsOcr(pages, minCharsPerPage = 80) {
  if (!Array.isArray(pages) || pages.length === 0) return true;
  const total = pages.reduce((sum, page) => sum + String(page ?? "").replace(/\s/g, "").length, 0);
  return total / pages.length < minCharsPerPage;
}

/**
 * Texto que se envía al modelo de embeddings: contexto + contenido.
 * Se embebe título y sección para mejorar la recuperación; en la BD se
 * guarda solo el contenido limpio.
 *
 * @param {string} title
 * @param {{section?:string|null, content:string}} chunk
 */
export function buildEmbeddingInput(title, chunk) {
  return [title, chunk.section, "", chunk.content]
    .filter((part) => part !== null && part !== undefined)
    .join("\n");
}

const toVectorLiteral = (vector) => `[${vector.join(",")}]`;

/**
 * @param {number[][]} vectors
 * @param {number} expectedCount
 * @param {number} dim
 */
export function assertVectors(vectors, expectedCount, dim) {
  if (!Array.isArray(vectors) || vectors.length !== expectedCount) {
    throw new RagError(
      "EMBED_COUNT_MISMATCH",
      `Se esperaban ${expectedCount} vectores y se recibieron ${Array.isArray(vectors) ? vectors.length : 0}.`
    );
  }

  for (const [index, vector] of vectors.entries()) {
    if (!Array.isArray(vector) || vector.length !== dim) {
      throw new RagError(
        "EMBED_DIM_MISMATCH",
        `Chunk ${index}: dimensión ${Array.isArray(vector) ? vector.length : "?"}, esperada ${dim}.`
      );
    }
    for (const value of vector) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new RagError("EMBED_BAD_VECTOR", `Chunk ${index}: vector con valores no finitos.`);
      }
    }
  }
}

/**
 * Lee y valida el PDF, sin salir de la carpeta del manifiesto.
 *
 * @param {any} entry
 * @param {string} baseDir
 * @param {{maxPdfBytes:number}} cfg
 */
async function readPdf(entry, baseDir, cfg) {
  let baseReal;
  try {
    baseReal = await realpath(baseDir);
  } catch {
    throw new RagError("BASE_DIR_NOT_FOUND", "No existe la carpeta del manifiesto.");
  }

  const abs = path.resolve(baseReal, entry.file);

  let real;
  try {
    real = await realpath(abs);
  } catch {
    throw new RagError("FILE_NOT_FOUND", `${entry.slug}: archivo no encontrado.`);
  }

  if (real !== baseReal && !real.startsWith(baseReal + path.sep)) {
    throw new RagError("PATH_TRAVERSAL", `${entry.slug}: ruta fuera de la carpeta de ingesta.`);
  }

  const buffer = await readFile(real);

  if (buffer.length === 0) {
    throw new RagError("EMPTY_FILE", `${entry.slug}: el archivo está vacío.`);
  }

  if (buffer.length > cfg.maxPdfBytes) {
    throw new RagError(
      "FILE_TOO_LARGE",
      `${entry.slug}: el PDF supera el máximo de ${cfg.maxPdfBytes} bytes.`
    );
  }

  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new RagError("NOT_A_PDF", `${entry.slug}: el archivo no tiene la firma %PDF-.`);
  }

  return { buffer, hash: sha256(buffer) };
}

/**
 * @param {{query:Function}} pool
 */
async function isUpToDate(pool, slug, hash, model) {
  const { rowCount } = await pool.query(
    `SELECT 1
       FROM rag.documents d
      WHERE d.slug = $1
        AND d.status = 'ready'
        AND d.sha256 = $2
        AND EXISTS (
          SELECT 1
            FROM rag.chunks c
           WHERE c.document_id = d.document_id
             AND c.embedding_model = $3
        )`,
    [slug, hash, model]
  );
  return rowCount > 0;
}

/**
 * Escritura atómica de un documento y sus chunks.
 *
 * Los embeddings se calculan ANTES de abrir esta transacción: la
 * transacción solo contiene escrituras locales y puede ser corta.
 *
 * @param {{connect:Function}} pool
 * @param {{
 *   entry:any, hash:string, pageCount:number|null, status:string,
 *   chunks:object[], vectors:number[][], model:string|null,
 *   insertBatch:number
 * }} args
 */
async function persist(
  pool,
  { entry, hash, pageCount, status, chunks, vectors, model, insertBatch, skipIfCurrent = false }
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Serializa ingestas concurrentes del mismo slug.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`rag:${entry.slug}`]);

    // Re-chequeo dentro del lock: dos procesos pudieron pasar el chequeo
    // previo a la extracción/embeddings. Si otro ya dejó esta misma
    // versión lista, no se duplica.
    if (status === "ready" && skipIfCurrent) {
      const current = await client.query(
        `SELECT 1
           FROM rag.documents d
          WHERE d.slug = $1
            AND d.status = 'ready'
            AND d.sha256 = $2
            AND EXISTS (
              SELECT 1 FROM rag.chunks c
               WHERE c.document_id = d.document_id
                 AND c.embedding_model = $3
            )`,
        [entry.slug, hash, model]
      );

      if (current.rowCount > 0) {
        await client.query("ROLLBACK");
        return { skipped: true };
      }
    }

    const {
      rows: [{ next_version: nextVersion }],
    } = await client.query(
      "SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM rag.documents WHERE slug = $1",
      [entry.slug]
    );

    let supersededIds = [];

    if (status === "ready") {
      const { rows } = await client.query(
        `UPDATE rag.documents
            SET status = 'superseded'
          WHERE slug = $1 AND status = 'ready'
          RETURNING document_id`,
        [entry.slug]
      );
      supersededIds = rows.map((row) => row.document_id);
    }

    const {
      rows: [doc],
    } = await client.query(
      `INSERT INTO rag.documents
         (slug, version, title, source_url, publisher, license, language,
          published_at, sha256, page_count, trust_level, copyright_cleared,
          status, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'untrusted',true,$11,$12)
       RETURNING document_id, version`,
      [
        entry.slug,
        Number(nextVersion),
        entry.title,
        entry.source_url,
        entry.publisher ?? null,
        entry.license,
        entry.language ?? "es",
        entry.published_at ?? null,
        hash,
        pageCount,
        status,
        entry.tags ?? [],
      ]
    );

    for (let i = 0; i < chunks.length; i += insertBatch) {
      const slice = chunks.slice(i, i + insertBatch);
      const params = [];

      const rows = slice.map((chunk, k) => {
        const base = k * 10;
        params.push(
          doc.document_id,
          chunk.ordinal,
          chunk.page_start,
          chunk.page_end,
          chunk.section ?? null,
          chunk.content,
          chunk.token_estimate,
          sha256(Buffer.from(chunk.content, "utf8")),
          toVectorLiteral(vectors[i + k]),
          model
        );
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9}::vector,$${base + 10})`;
      });

      await client.query(
        `INSERT INTO rag.chunks
           (document_id, ordinal, page_start, page_end, section, content,
            token_estimate, content_sha256, embedding, embedding_model)
         VALUES ${rows.join(",")}`,
        params
      );
    }

    if (supersededIds.length > 0) {
      await client.query("DELETE FROM rag.chunks WHERE document_id = ANY($1::uuid[])", [
        supersededIds,
      ]);
    }

    await client.query("COMMIT");
    return doc;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Registra la corrida. Nunca debe tumbar la ingesta: si falla, solo se
 * emite un warning sin contenido de documentos.
 *
 * @param {{query:Function}|null} pool
 */
async function recordRun(pool, run) {
  if (!pool) return;

  try {
    await pool.query(
      `INSERT INTO rag.ingestion_runs
         (document_id, slug, status, finished_at, chunks_total,
          embedding_model, est_tokens, est_cost_usd, error_code)
       VALUES ($1,$2,$3,now(),$4,$5,$6,$7,$8)`,
      [
        run.documentId ?? null,
        run.slug,
        run.status,
        run.chunks ?? null,
        run.model ?? null,
        run.estTokens ?? null,
        run.estCost ?? null,
        run.errorCode ?? null,
      ]
    );
  } catch (err) {
    console.warn(`[rag] no se pudo registrar ingestion_run (${err.code || "DB_ERROR"}).`);
  }
}

/**
 * Ingesta un documento del manifiesto.
 *
 * @param {{
 *   entry:any,
 *   baseDir:string,
 *   pool?:any,
 *   embedder?:{model:string, dim:number, embed:(texts:string[])=>Promise<number[][]>},
 *   config?:Partial<ReturnType<typeof getRagConfig>>,
 *   dryRun?:boolean,
 *   force?:boolean,
 *   pricePerMTok?:number
 * }} args
 */
export async function ingestDocument({
  entry,
  baseDir,
  pool = null,
  embedder = null,
  config = {},
  dryRun = false,
  force = false,
  pricePerMTok = 0,
}) {
  const cfg = { ...getRagConfig(), ...config };
  const slug = entry?.slug ?? "(sin-slug)";

  let hash = null;
  let pageCount = null;

  try {
    validateEntry(entry);

    if (!dryRun && !pool) throw new RagError("NO_DB", "Falta el pool de PostgreSQL.");
    if (!dryRun && !embedder) throw new RagError("NO_EMBEDDER", "Falta el embedder.");

    const read = await readPdf(entry, baseDir, cfg);
    hash = read.hash;

    if (!dryRun && !force && (await isUpToDate(pool, slug, hash, embedder.model))) {
      await recordRun(pool, { slug, status: "skipped", model: embedder.model });
      return { slug, status: "skipped", reason: "sin cambios (sha256 idéntico)" };
    }

    const extracted = await extractPdf(read.buffer, { maxPages: cfg.maxPages });
    pageCount = extracted.pageCount;

    const cleanedPages = stripRepeatedLines(extracted.pages).map(normalizeText);

    if (needsOcr(cleanedPages, cfg.minCharsPerPage)) {
      if (dryRun) {
        return { slug, status: "needs_ocr", pageCount, chunks: 0 };
      }

      const doc = await persist(pool, {
        entry,
        hash,
        pageCount,
        status: "needs_ocr",
        chunks: [],
        vectors: [],
        model: null,
        insertBatch: cfg.insertBatch,
      });

      await recordRun(pool, { slug, documentId: doc.document_id, status: "needs_ocr" });
      return { slug, status: "needs_ocr", pageCount, chunks: 0 };
    }

    const chunks = chunkPages(
      cleanedPages.map((text, index) => ({ page: index + 1, text })),
      { targetTokens: cfg.targetTokens, overlapTokens: cfg.overlapTokens }
    );

    if (chunks.length === 0) {
      throw new RagError("NO_CHUNKS", `${slug}: no se generaron chunks.`);
    }

    const inputs = chunks.map((chunk) => buildEmbeddingInput(entry.title, chunk));
    const estTokens = inputs.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0);
    const estCost = Number(((estTokens / 1e6) * pricePerMTok).toFixed(6));

    const tokenEstimates = chunks.map((chunk) => chunk.token_estimate);
    const stats = {
      chunks: chunks.length,
      avgTokens: Math.round(
        tokenEstimates.reduce((a, b) => a + b, 0) / tokenEstimates.length
      ),
      maxTokens: Math.max(...tokenEstimates),
      targetTokens: cfg.targetTokens,
      estTokens,
      estCostUsd: estCost,
    };

    if (dryRun) {
      return { slug, status: "dry-run", pageCount, ...stats };
    }

    const vectors = await embedder.embed(inputs);
    assertVectors(vectors, chunks.length, embedder.dim);

    const doc = await persist(pool, {
      entry,
      hash,
      pageCount,
      status: "ready",
      chunks,
      vectors,
      model: embedder.model,
      insertBatch: cfg.insertBatch,
      skipIfCurrent: !force,
    });

    if (doc.skipped) {
      await recordRun(pool, { slug, status: "skipped", model: embedder.model });
      return { slug, status: "skipped", reason: "otra corrida dejó esta versión lista" };
    }

    await recordRun(pool, {
      slug,
      documentId: doc.document_id,
      status: "ready",
      chunks: chunks.length,
      model: embedder.model,
      estTokens,
      estCost,
    });

    return { slug, status: "ready", version: doc.version, pageCount, ...stats };
  } catch (err) {
    const code = err instanceof RagError ? err.code : "UNEXPECTED";
    const rejected = code === "COPYRIGHT_NOT_CLEARED";

    // Deja rastro del intento fallido sin tocar la versión ready vigente.
    if (!dryRun && pool && hash) {
      try {
        const failed = await persist(pool, {
          entry,
          hash,
          pageCount,
          status: "failed",
          chunks: [],
          vectors: [],
          model: null,
          insertBatch: cfg.insertBatch,
        });
        await recordRun(pool, { slug, documentId: failed.document_id, status: "failed", errorCode: code });
      } catch (persistErr) {
        console.warn(`[rag] no se pudo registrar el documento fallido (${persistErr.code || "DB_ERROR"}).`);
      }
    } else {
      await recordRun(pool, { slug, status: rejected ? "rejected" : "failed", errorCode: code });
    }

    return {
      slug,
      status: rejected ? "rejected" : "failed",
      errorCode: code,
      error: err instanceof RagError ? err.message : "Error inesperado (ver traza local).",
      ...(process.env.RAG_DEBUG === "1" && !(err instanceof RagError)
        ? { stack: String(err?.stack || "").split("\n").slice(0, 5) }
        : {}),
    };
  }
}
