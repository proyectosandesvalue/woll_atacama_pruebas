import { test } from "node:test";
import assert from "node:assert/strict";

import { getEmbeddingsConfig, EMBEDDING_DIM } from "../config.js";

const base = {
  EMBEDDINGS_BASE_URL: "http://127.0.0.1:8080/v1/",
  EMBEDDINGS_MODEL: "BAAI/bge-m3",
};

test("usa defaults y quita la barra final de la URL", () => {
  const cfg = getEmbeddingsConfig(base);

  assert.equal(cfg.baseUrl, "http://127.0.0.1:8080/v1");
  assert.equal(cfg.dim, EMBEDDING_DIM);
  assert.equal(cfg.apiKey, "none");
  assert.equal(cfg.batchSize, 32);
  assert.equal(cfg.sendDimensions, false);
});

test("exige base URL y modelo", () => {
  assert.throws(() => getEmbeddingsConfig({}), /EMBEDDINGS_BASE_URL/);
  assert.throws(() => getEmbeddingsConfig({ ...base, EMBEDDINGS_MODEL: "" }), /EMBEDDINGS_MODEL/);
});

test("rechaza una dimensión distinta de la columna", () => {
  assert.throws(
    () => getEmbeddingsConfig({ ...base, EMBEDDINGS_DIM: "768" }),
    /no coincide con rag\.chunks\.embedding/
  );
});

test("lee el flag sendDimensions", () => {
  const cfg = getEmbeddingsConfig({ ...base, EMBEDDINGS_SEND_DIMENSIONS: "1" });
  assert.equal(cfg.sendDimensions, true);
});

test("un proveedor desconocido se rechaza", () => {
  assert.throws(
    () => getEmbeddingsConfig({ ...base, EMBEDDINGS_PROVIDER: "groq" }),
    /EMBEDDINGS_PROVIDER no soportado/
  );
});
