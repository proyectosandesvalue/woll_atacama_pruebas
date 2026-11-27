import test from "node:test";
import assert from "node:assert/strict";

import tool, { runSearchDocuments } from "../search-documents.js";

function fakeDb(rows = []) {
  return {
    pool: {},
    async query() {
      return rows;
    },
  };
}

function fakeEmbedder() {
  return {
    dim: 3,
    async embed() {
      return [[0.1, 0.2, 0.3]];
    },
  };
}

test("schema de search_documents", () => {
  assert.equal(tool.schema.function.name, "search_documents");
  assert.deepEqual(tool.schema.function.parameters.required, ["query"]);
  assert.equal(tool.schema.function.parameters.additionalProperties, false);
});

test("devuelve fuente_no_disponible fuera de PostgreSQL", async () => {
  const out = await runSearchDocuments(
    { query: "metodología del catastro" },
    { driver: "supabase" }
  );
  assert.equal(out.reason, "fuente_no_disponible");
  assert.equal(out.count, 0);
});

test("devuelve argumentos_invalidos con query corta", async () => {
  const out = await runSearchDocuments(
    { query: "ab" },
    { driver: "postgres", db: fakeDb(), embedder: fakeEmbedder() }
  );
  assert.equal(out.reason, "argumentos_invalidos");
});

test("devuelve pasajes con cita y trust", async () => {
  const out = await runSearchDocuments(
    { query: "metodología del catastro", limit: 2 },
    {
      driver: "postgres",
      db: fakeDb([
        {
          slug: "catastro-fruticola-atacama-2024",
          title: "Catastro 2024",
          publisher: "ODEPA / CIREN",
          published_at: "2024-09-01",
          source_url: "https://example.cl/doc.pdf",
          page_start: 8,
          page_end: 8,
          section: "ANTECEDENTES",
          vec_score: 0.8,
          rrf: 0.03,
          trust_level: "untrusted",
          content: "La metodología...",
        },
      ]),
      embedder: fakeEmbedder(),
    }
  );
  assert.equal(out.count, 1);
  assert.equal(out.reason, null);
  assert.equal(out.passages[0].document_slug, "catastro-fruticola-atacama-2024");
  assert.equal(out.passages[0].trust, "untrusted");
});

test("respeta el killswitch de RAG", async () => {
  let embedCalls = 0;
  const out = await runSearchDocuments(
    { query: "metodología del catastro" },
    {
      driver: "postgres",
      db: fakeDb(),
      settings: { enabled: false, minScore: 0.62, topK: 5 },
      embedder: {
        async embed() {
          embedCalls += 1;
          return [[0.1, 0.2, 0.3]];
        },
      },
    }
  );
  assert.equal(out.reason, "deshabilitado");
  assert.equal(embedCalls, 0);
});

test("aplica top_k y min_score de los settings", async () => {
  let captured = null;
  const db = {
    pool: {},
    async query(sql, params) {
      captured = params;
      return [];
    },
  };
  await runSearchDocuments(
    { query: "metodología del catastro", limit: 8 },
    {
      driver: "postgres",
      db,
      settings: { enabled: true, minScore: 0.7, topK: 3 },
      embedder: fakeEmbedder(),
    }
  );
  assert.equal(captured[2], 0.7);
  assert.equal(captured[3], 3);
});

test("un error de BD se degrada a fuente_no_disponible", async () => {
  const db = {
    pool: {},
    async query() {
      throw new Error("connection refused");
    },
  };
  const out = await runSearchDocuments(
    { query: "metodología del catastro" },
    { driver: "postgres", db, embedder: fakeEmbedder() }
  );
  assert.equal(out.reason, "fuente_no_disponible");
});
