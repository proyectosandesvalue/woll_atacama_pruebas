import { test } from "node:test";
import assert from "node:assert/strict";

import {
  validateEntry,
  needsOcr,
  buildEmbeddingInput,
  assertVectors,
} from "../pipeline.js";

const valid = {
  file: "inbox/ley-a.pdf",
  slug: "ley-a",
  title: "Ley A",
  source_url: "https://www.bcn.cl/leychile/ley-a",
  publisher: "BCN",
  license: "Dominio público",
  copyright_cleared: true,
};

test("una entrada válida pasa", () => {
  assert.doesNotThrow(() => validateEntry(valid));
});

test("sin copyright_cleared se rechaza antes de leer el PDF", () => {
  assert.throws(() => validateEntry({ ...valid, copyright_cleared: false }), {
    code: "COPYRIGHT_NOT_CLEARED",
  });
  assert.throws(() => validateEntry({ ...valid, copyright_cleared: "true" }), {
    code: "COPYRIGHT_NOT_CLEARED",
  });
});

test("slug inválido o con path traversal se rechaza", () => {
  assert.throws(() => validateEntry({ ...valid, slug: "../x" }), { code: "BAD_SLUG" });
  assert.throws(() => validateEntry({ ...valid, slug: "Mayúsculas" }), { code: "BAD_SLUG" });
  assert.throws(() => validateEntry({ ...valid, slug: "a" }), { code: "BAD_SLUG" });
});

test("source_url debe ser https", () => {
  assert.throws(() => validateEntry({ ...valid, source_url: "http://x.cl" }), {
    code: "BAD_SOURCE_URL",
  });
});

test("faltan campos obligatorios", () => {
  assert.throws(() => validateEntry({ ...valid, license: "" }), { code: "MISSING_FIELD" });
  assert.throws(() => validateEntry({ ...valid, title: undefined }), { code: "MISSING_FIELD" });
});

test("el archivo debe ser PDF", () => {
  assert.throws(() => validateEntry({ ...valid, file: "inbox/doc.txt" }), {
    code: "BAD_FILE_TYPE",
  });
});

test("published_at y tags se validan", () => {
  assert.throws(() => validateEntry({ ...valid, published_at: "2024/03/01" }), {
    code: "BAD_DATE",
  });
  assert.throws(() => validateEntry({ ...valid, tags: "agua" }), { code: "BAD_TAGS" });
});

test("needsOcr detecta PDFs sin texto suficiente", () => {
  assert.equal(needsOcr([""]), true);
  assert.equal(needsOcr(["", "  ", "x"]), true);
  assert.equal(needsOcr(["a".repeat(500), "b".repeat(500)]), false);
  assert.equal(needsOcr([]), true);
  assert.equal(needsOcr(null), true);
});

test("buildEmbeddingInput antepone título y sección", () => {
  const input = buildEmbeddingInput("Ley X", { section: "Artículo 3", content: "texto" });
  assert.equal(input, "Ley X\nArtículo 3\n\ntexto");
});

test("buildEmbeddingInput sin sección no deja 'null'", () => {
  const input = buildEmbeddingInput("Ley X", { section: null, content: "texto" });
  assert.equal(input, "Ley X\n\ntexto");
});

test("assertVectors valida cantidad, dimensión y finitud", () => {
  assert.doesNotThrow(() => assertVectors([[0.1, 0.2]], 1, 2));

  assert.throws(() => assertVectors([], 1, 2), { code: "EMBED_COUNT_MISMATCH" });
  assert.throws(() => assertVectors([[0.1]], 1, 2), { code: "EMBED_DIM_MISMATCH" });
  assert.throws(() => assertVectors([[0.1, Number.NaN]], 1, 2), {
    code: "EMBED_BAD_VECTOR",
  });
});
