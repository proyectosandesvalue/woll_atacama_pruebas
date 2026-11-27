#!/usr/bin/env node
/**
 * Evaluación de retrieval RAG (Sprint 18-E).
 *
 * Corre 6 preguntas del catastro frutícola contra `rag.chunks` y reporta
 * Recall@5 y MRR. No escribe en la BD ni llama al LLM.
 *
 * Uso:
 *   node --env-file=.env.local scripts/eval-rag-retrieval.mjs
 *   node --env-file=.env.local scripts/eval-rag-retrieval.mjs --limit 5
 *
 * Requiere DB_DRIVER=postgres, DATABASE_URL y EMBEDDINGS_*.
 */

import { runSearchDocuments } from "../server/chat/tools/search-documents.js";

const args = process.argv.slice(2);
const limitIndex = args.indexOf("--limit");
const limit =
  limitIndex >= 0 && Number(args[limitIndex + 1]) > 0
    ? Math.min(Number(args[limitIndex + 1]), 8)
    : 5;

const CASES = [
  {
    id: "metodologia",
    question: "¿Cuál es la metodología del catastro frutícola?",
    expected: [
      { slug: "catastro-fruticola-atacama-2024", pages: [7, 8, 9] },
      { slug: "catastro-fruticola-atacama-2018", pages: [5, 6] },
    ],
  },
  {
    id: "superficie-2024",
    question: "¿Cuánta superficie frutícola había en Atacama en 2024 y qué especies dominan?",
    expected: [
      { slug: "catastro-fruticola-atacama-2024", pages: [8, 9, 10, 11, 12] },
    ],
  },
  {
    id: "riego-2024",
    question: "¿Qué sistema de riego predomina en el catastro frutícola 2024?",
    expected: [
      { slug: "catastro-fruticola-atacama-2024", pages: [15, 16, 17, 18] },
    ],
  },
  {
    id: "superficie-2018",
    question: "¿Cuál era la superficie frutícola de Atacama en 2018?",
    expected: [
      { slug: "catastro-fruticola-atacama-2018", pages: [5, 6, 7, 11, 12] },
    ],
  },
  {
    id: "especies-2024",
    question: "¿Qué especies frutales se destacan en la Región de Atacama en 2024?",
    expected: [
      { slug: "catastro-fruticola-atacama-2024", pages: [8, 9, 10, 11, 12, 13] },
    ],
  },
  {
    id: "evolucion-vid",
    question: "¿Cómo varió la superficie de vid de mesa en Atacama entre 2018 y 2024?",
    expected: [
      { slug: "catastro-fruticola-atacama-2024", pages: [11, 12, 13, 14] },
      { slug: "catastro-fruticola-atacama-2018", pages: [11, 12, 13, 14, 15, 16, 17] },
    ],
  },
];

function matches(passage, expected) {
  if (passage.document_slug !== expected.slug) return false;
  const start = Number(passage.page_start);
  const end = Number(passage.page_end);
  return expected.pages.some((p) => p >= start && p <= end);
}

function firstMatchRank(passages, expected) {
  for (let i = 0; i < passages.length; i += 1) {
    if (expected.some((e) => matches(passages[i], e))) return i + 1;
  }
  return 0;
}

let hits = 0;
let rr = 0;
let errors = 0;

for (const c of CASES) {
  const started = Date.now();
  const out = await runSearchDocuments({ query: c.question, limit });
  const ms = Date.now() - started;

  if (out.reason === "fuente_no_disponible") {
    errors += 1;
    console.log(
      JSON.stringify({
        id: c.id,
        ok: false,
        status: out.reason,
        ms,
      })
    );
    continue;
  }

  const rank = firstMatchRank(out.passages || [], c.expected);
  if (rank > 0) {
    hits += 1;
    rr += 1 / rank;
  }
  console.log(
    JSON.stringify({
      id: c.id,
      ok: rank > 0,
      rank,
      ms,
      top: (out.passages || []).slice(0, 3).map((p) => ({
        slug: p.document_slug,
        page: p.page_start,
        score: p.score,
      })),
    })
  );
}

const total = CASES.length;
const recall = hits / total;
const mrr = rr / total;

console.log("");
console.log(
  JSON.stringify(
    {
      event: "summary",
      cases: total,
      hits,
      errors,
      recall_at_5: Number(recall.toFixed(3)),
      mrr: Number(mrr.toFixed(3)),
      limit,
    },
    null,
    2
  )
);

if (errors > 0) process.exitCode = 2;
