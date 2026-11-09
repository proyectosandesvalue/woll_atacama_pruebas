import { test } from "node:test";
import assert from "node:assert/strict";

import { getRagConfig } from "../config.js";

test("usa los defaults del ADR 022", () => {
  const cfg = getRagConfig({});

  assert.equal(cfg.targetTokens, 450);
  assert.equal(cfg.overlapTokens, 60);
  assert.equal(cfg.maxPdfBytes, 25 * 1024 * 1024);
  assert.equal(cfg.maxPages, 300);
  assert.equal(cfg.insertBatch, 50);
});

test("lee variables de entorno", () => {
  const cfg = getRagConfig({
    RAG_CHUNK_TOKENS: "300",
    RAG_CHUNK_OVERLAP: "40",
    RAG_MAX_PDF_MB: "10",
    RAG_MAX_PAGES: "50",
  });

  assert.equal(cfg.targetTokens, 300);
  assert.equal(cfg.overlapTokens, 40);
  assert.equal(cfg.maxPdfBytes, 10 * 1024 * 1024);
  assert.equal(cfg.maxPages, 50);
});

test("rechaza solape mayor o igual que el objetivo", () => {
  assert.throws(
    () => getRagConfig({ RAG_CHUNK_TOKENS: "100", RAG_CHUNK_OVERLAP: "100" }),
    RangeError
  );
});

test("rechaza valores no numéricos o negativos", () => {
  assert.throws(() => getRagConfig({ RAG_CHUNK_TOKENS: "muchos" }), RangeError);
  assert.throws(() => getRagConfig({ RAG_MAX_PAGES: "-1" }), RangeError);
});
