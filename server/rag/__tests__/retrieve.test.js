import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeRetrievalParams,
  rrfScore,
  toPassage,
  searchDocuments,
  RETRIEVAL_SQL,
} from "../retrieve.js";

test("normaliza query, limit y year", () => {
  const p = normalizeRetrievalParams(
    { query: "  ¿Cuál   es la metodología?  ", limit: 99, year: "2024" },
    {}
  );
  assert.equal(p.query, "¿Cuál es la metodología?");
  assert.equal(p.limit, 8);
  assert.equal(p.year, 2024);
  assert.equal(p.minScore, 0.62);
});

test("usa defaults y rechaza query corta o año inválido", () => {
  const p = normalizeRetrievalParams({ query: "catastro" }, {});
  assert.equal(p.limit, 5);
  assert.equal(p.year, null);

  assert.throws(() => normalizeRetrievalParams({ query: "ab" }, {}), /al menos 3/);
  assert.throws(
    () => normalizeRetrievalParams({ query: "catastro", year: 1800 }, {}),
    /1900/
  );
  assert.throws(
    () => normalizeRetrievalParams({ query: "catastro", year: "2024.5" }, {}),
    /1900/
  );
});

test("lee RAG_TOP_K y RAG_MIN_SCORE del entorno", () => {
  const p = normalizeRetrievalParams(
    { query: "catastro" },
    { RAG_TOP_K: "2", RAG_MIN_SCORE: "0.7" }
  );
  assert.equal(p.limit, 2);
  assert.equal(p.minScore, 0.7);
});

test("rrf combina rankings 1-based", () => {
  assert.equal(rrfScore(1, null), 1 / 61);
  assert.equal(rrfScore(null, 1), 1 / 61);
  assert.equal(rrfScore(1, 2), 1 / 61 + 1 / 62);
  assert.equal(rrfScore(null, null), 0);
});

test("toPassage arma una cita trazable y untrusted", () => {
  const p = toPassage(
    {
      slug: "catastro-fruticola-atacama-2024",
      title: "Catastro 2024",
      publisher: "ODEPA / CIREN",
      published_at: new Date("2024-09-01T00:00:00Z"),
      source_url: "https://example.cl/doc.pdf",
      page_start: 8,
      page_end: 8,
      section: "ANTECEDENTES",
      vec_score: 0.81234,
      rrf: 0.0321,
      trust_level: "untrusted",
      content: "texto",
    },
    0
  );
  assert.equal(p.citation_id, "doc-1");
  assert.equal(p.published_at, "2024-09-01");
  assert.equal(p.score, 0.8123);
  assert.equal(p.trust, "untrusted");
});

test("searchDocuments embebe con RETRIEVAL_QUERY y pasa los parámetros", async () => {
  let captured = null;
  const db = {
    async query(sql, params) {
      assert.equal(sql, RETRIEVAL_SQL);
      captured = params;
      return [
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
      ];
    },
  };
  const calls = [];
  const embedder = {
    dim: 3,
    async embed(texts, options) {
      calls.push({ texts, options });
      return [[0.1, 0.2, 0.3]];
    },
  };

  const out = await searchDocuments({
    db,
    embedder,
    query: "metodología del catastro",
    limit: 3,
    year: 2024,
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].texts, ["metodología del catastro"]);
  assert.equal(calls[0].options.taskType, "RETRIEVAL_QUERY");
  assert.equal(captured.length, 5);
  assert.equal(captured[1], "metodología del catastro");
  assert.equal(captured[2], 0.62);
  assert.equal(captured[3], 3);
  assert.equal(captured[4], 2024);
  assert.equal(out.count, 1);
  assert.equal(out.reason, null);
  assert.equal(out.passages[0].citation_id, "doc-1");
});

test("searchDocuments devuelve sin_evidencia cuando no hay filas", async () => {
  const db = { async query() { return []; } };
  const embedder = { dim: 2, async embed() { return [[0, 0]]; } };
  const out = await searchDocuments({ db, embedder, query: "normativa" });
  assert.equal(out.count, 0);
  assert.equal(out.reason, "sin_evidencia");
  assert.deepEqual(out.passages, []);
});

test("searchDocuments valida el vector del proveedor", async () => {
  const db = { async query() { return []; } };
  const embedder = { dim: 4, async embed() { return [[0, 0]]; } };
  await assert.rejects(
    () => searchDocuments({ db, embedder, query: "catastro" }),
    /Dimensión de embedding inesperada/
  );
});
