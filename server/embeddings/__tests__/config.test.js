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

const vertex = {
  EMBEDDINGS_PROVIDER: "vertex",
  GOOGLE_CLOUD_PROJECT: "woll-test",
  GOOGLE_CLOUD_LOCATION: "us-central1",
  EMBEDDINGS_MODEL: "gemini-embedding-001",
};

test("configura Vertex con proyecto, región y modelo", () => {
  const cfg = getEmbeddingsConfig(vertex);
  assert.equal(cfg.provider, "vertex");
  assert.equal(cfg.project, "woll-test");
  assert.equal(cfg.location, "us-central1");
  assert.equal(cfg.model, "gemini-embedding-001");
  assert.equal(cfg.dim, 1024);
  assert.equal(cfg.taskType, "RETRIEVAL_DOCUMENT");
});

test("acepta el alias vertex-ai", () => {
  const cfg = getEmbeddingsConfig({
    ...vertex,
    EMBEDDINGS_PROVIDER: "vertex-ai",
  });
  assert.equal(cfg.provider, "vertex");
});

test("Vertex exige proyecto y modelo", () => {
  assert.throws(
    () => getEmbeddingsConfig({ ...vertex, GOOGLE_CLOUD_PROJECT: "" }),
    /GOOGLE_CLOUD_PROJECT/
  );
  assert.throws(
    () => getEmbeddingsConfig({ ...vertex, EMBEDDINGS_MODEL: "" }),
    /EMBEDDINGS_MODEL/
  );
});

test("Vertex usa us-central1 por defecto y permite cambiar task type", () => {
  const cfg = getEmbeddingsConfig({
    ...vertex,
    GOOGLE_CLOUD_LOCATION: "",
    EMBEDDINGS_TASK_TYPE: "RETRIEVAL_QUERY",
  });
  assert.equal(cfg.location, "us-central1");
  assert.equal(cfg.taskType, "RETRIEVAL_QUERY");
});

test("Vertex permite una región distinta para embeddings", () => {
  const cfg = getEmbeddingsConfig({
    ...vertex,
    GOOGLE_CLOUD_LOCATION: "global",
    EMBEDDINGS_LOCATION: "europe-west4",
  });
  assert.equal(cfg.location, "europe-west4");
});

test("Vertex usa GOOGLE_CLOUD_LOCATION si no hay EMBEDDINGS_LOCATION", () => {
  const cfg = getEmbeddingsConfig({
    ...vertex,
    GOOGLE_CLOUD_LOCATION: "us-east4",
  });
  assert.equal(cfg.location, "us-east4");
});
