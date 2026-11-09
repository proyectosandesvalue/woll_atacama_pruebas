/**
 * Test de integración del pipeline contra PostgreSQL real.
 *
 * Se salta por defecto. Para ejecutarlo:
 *
 *   RAG_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/woll_test \
 *     node --test server/rag/__tests__/pipeline.postgres.test.js
 *
 * Requisitos: migración 036 aplicada y extensión pgvector instalada.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ingestDocument } from "../pipeline.js";
import { RagError } from "../errors.js";
import { buildPdf } from "./_pdf-fixture.js";

const dsn = process.env.RAG_TEST_DATABASE_URL;

const dim = 1024;

function fakeEmbedder(model = "test-model") {
  return {
    model,
    dim,
    async embed(texts) {
      return texts.map((text) => {
        const vector = new Array(dim).fill(0);
        vector[0] = 1;
        vector[1] = (text.length % 97) / 100;
        return vector;
      });
    },
  };
}

const failingEmbedder = {
  model: "test-model",
  dim,
  async embed() {
    throw new RagError("EMBED_HTTP_500", "fallo simulado");
  },
};

test(
  "ingesta atómica, idempotente y versionada (CA-1..CA-4)",
  { skip: dsn ? false : "RAG_TEST_DATABASE_URL no configurada" },
  async () => {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({
      connectionString: dsn,
      max: 2,
      options: "-c search_path=public,extensions",
    });

    const slug = `it-rag-${Date.now()}-${process.pid}`;
    const dir = await mkdtemp(path.join(os.tmpdir(), "woll-rag-"));

    const entry = {
      file: "doc.pdf",
      slug,
      title: "Documento de prueba",
      source_url: "https://example.org/doc.pdf",
      publisher: "Test",
      license: "Dominio público",
      language: "es",
      copyright_cleared: true,
      tags: ["test"],
    };

    try {
      const firstPdf = buildPdf([
        Array.from(
          { length: 30 },
          (_, i) => `Oración número ${i} sobre recursos hídricos de Atacama.`
        ).join(" "),
      ]);
      await writeFile(path.join(dir, "doc.pdf"), firstPdf);

      // CA-1: primer ingreso.
      const first = await ingestDocument({
        entry,
        baseDir: dir,
        pool,
        embedder: fakeEmbedder(),
        config: { targetTokens: 100, overlapTokens: 20 },
      });

      assert.equal(first.status, "ready");
      assert.ok(first.chunks > 0);

      const ready = await pool.query(
        `SELECT d.document_id, d.version, d.status,
                count(c.chunk_id)::int AS chunks,
                min(vector_dims(c.embedding)) AS dims
           FROM rag.documents d
           LEFT JOIN rag.chunks c ON c.document_id = d.document_id
          WHERE d.slug = $1
          GROUP BY d.document_id`,
        [slug]
      );

      assert.equal(ready.rowCount, 1);
      assert.equal(ready.rows[0].status, "ready");
      assert.ok(ready.rows[0].chunks > 0);
      assert.equal(ready.rows[0].dims, dim);

      // CA-2: mismo sha256 → skip sin nuevas filas.
      const second = await ingestDocument({
        entry,
        baseDir: dir,
        pool,
        embedder: fakeEmbedder(),
        config: { targetTokens: 100, overlapTokens: 20 },
      });
      assert.equal(second.status, "skipped");

      const afterSkip = await pool.query(
        "SELECT count(*)::int AS n FROM rag.documents WHERE slug = $1",
        [slug]
      );
      assert.equal(afterSkip.rows[0].n, 1);

      // CA-3: PDF modificado → versión nueva, la anterior queda superseded.
      const secondPdf = buildPdf([
        Array.from(
          { length: 30 },
          (_, i) => `Texto corregido ${i} con nuevos antecedentes del territorio.`
        ).join(" "),
      ]);
      await writeFile(path.join(dir, "doc.pdf"), secondPdf);

      const third = await ingestDocument({
        entry,
        baseDir: dir,
        pool,
        embedder: fakeEmbedder(),
        config: { targetTokens: 100, overlapTokens: 20 },
      });

      assert.equal(third.status, "ready");
      assert.equal(third.version, 2);

      const versions = await pool.query(
        `SELECT version, status,
                (SELECT count(*)::int FROM rag.chunks c WHERE c.document_id = d.document_id) AS chunks
           FROM rag.documents d
          WHERE d.slug = $1
          ORDER BY version`,
        [slug]
      );

      assert.deepEqual(
        versions.rows.map((row) => row.status),
        ["superseded", "ready"]
      );
      assert.equal(versions.rows[0].chunks, 0, "los chunks viejos se borran");

      // CA-4: fallo de embeddings → documento failed, versión ready intacta.
      const thirdPdf = buildPdf([
        Array.from(
          { length: 30 },
          (_, i) => `Tercera versión ${i} que no debe reemplazar a la vigente.`
        ).join(" "),
      ]);
      await writeFile(path.join(dir, "doc.pdf"), thirdPdf);

      const failed = await ingestDocument({
        entry,
        baseDir: dir,
        pool,
        embedder: failingEmbedder,
        config: { targetTokens: 100, overlapTokens: 20 },
      });

      assert.equal(failed.status, "failed");
      assert.equal(failed.errorCode, "EMBED_HTTP_500");

      const afterFailure = await pool.query(
        `SELECT version, status
           FROM rag.documents
          WHERE slug = $1 AND status = 'ready'`,
        [slug]
      );
      assert.equal(afterFailure.rowCount, 1, "la versión ready sigue vigente");
      assert.equal(afterFailure.rows[0].version, 2);
    } finally {
      await pool.query("DELETE FROM rag.ingestion_runs WHERE slug = $1", [slug]).catch(() => {});
      await pool.query("DELETE FROM rag.documents WHERE slug = $1", [slug]).catch(() => {});
      await pool.end().catch(() => {});
      await rm(dir, { recursive: true, force: true });
    }
  }
);
