import { test } from "node:test";
import assert from "node:assert/strict";

import { createEmbedder } from "../provider.js";

const cfg = {
  provider: "vertex",
  project: "woll-test",
  location: "us-central1",
  model: "gemini-embedding-001",
  dim: 4,
  batchSize: 2,
  timeoutMs: 1000,
  maxRetries: 2,
  taskType: "RETRIEVAL_DOCUMENT",
};

const vec = () => [0.1, 0.2, 0.3, 0.4];
const ok = (n) => ({
  ok: true,
  status: 200,
  json: async () => ({
    predictions: Array.from({ length: n }, () => ({
      embeddings: { values: vec() },
    })),
  }),
});
const noSleep = async () => {};
const token = async () => "token-test";

test("llama al endpoint :predict con dimensión y task type", async () => {
  let captured;
  const fakeFetch = async (url, init) => {
    captured = { url, body: JSON.parse(init.body), headers: init.headers };
    return ok(1);
  };

  const out = await createEmbedder(cfg, {
    fetch: fakeFetch,
    sleep: noSleep,
    getAccessToken: token,
  }).embed(["hola"]);

  assert.equal(out.length, 1);
  assert.match(
    captured.url,
    /projects\/woll-test\/locations\/us-central1\/publishers\/google\/models\/gemini-embedding-001:predict/
  );
  assert.equal(captured.headers.Authorization, "Bearer token-test");
  assert.deepEqual(captured.body.instances, [{ content: "hola" }]);
  assert.equal(captured.body.parameters.outputDimensionality, 4);
  assert.equal(captured.body.parameters.task_type, "RETRIEVAL_DOCUMENT");
});

test("permite usar RETRIEVAL_QUERY para la consulta", async () => {
  let body;
  const fakeFetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return ok(1);
  };

  await createEmbedder(cfg, {
    fetch: fakeFetch,
    sleep: noSleep,
    getAccessToken: token,
  }).embed(["consulta"], { taskType: "RETRIEVAL_QUERY" });

  assert.equal(body.parameters.task_type, "RETRIEVAL_QUERY");
});

test("agrupa en lotes según batchSize", async () => {
  let calls = 0;
  const fakeFetch = async (_url, init) => {
    calls += 1;
    return ok(JSON.parse(init.body).instances.length);
  };

  const out = await createEmbedder(cfg, {
    fetch: fakeFetch,
    sleep: noSleep,
    getAccessToken: token,
  }).embed(["a", "b", "c", "d", "e"]);

  assert.equal(out.length, 5);
  assert.equal(calls, 3);
});

test("normaliza el prefijo google/ del modelo", async () => {
  let url;
  const fakeFetch = async (value) => {
    url = value;
    return ok(1);
  };

  await createEmbedder(
    { ...cfg, model: "google/gemini-embedding-001" },
    { fetch: fakeFetch, sleep: noSleep, getAccessToken: token }
  ).embed(["a"]);

  assert.match(url, /models\/gemini-embedding-001:predict/);
  assert.doesNotMatch(url, /google\/gemini-embedding-001/);
});

test("rechaza una dimensión distinta de la configurada", async () => {
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ predictions: [{ embeddings: { values: [0, 1, 2] } }] }),
  });

  await assert.rejects(
    () =>
      createEmbedder(cfg, {
        fetch: fakeFetch,
        sleep: noSleep,
        getAccessToken: token,
      }).embed(["a"]),
    /dimensión 3, esperada 4/
  );
});

test("reintenta ante 429 y luego tiene éxito", async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    if (calls < 3) {
      return { ok: false, status: 429, headers: { get: () => null } };
    }
    return ok(1);
  };

  const out = await createEmbedder(cfg, {
    fetch: fakeFetch,
    sleep: noSleep,
    getAccessToken: token,
  }).embed(["a"]);

  assert.equal(out.length, 1);
  assert.equal(calls, 3);
});

test("401 se reporta como error de autenticación", async () => {
  const fakeFetch = async () => ({ ok: false, status: 401 });

  await assert.rejects(
    () =>
      createEmbedder(cfg, {
        fetch: fakeFetch,
        sleep: noSleep,
        getAccessToken: token,
      }).embed(["a"]),
    /rechazó la autenticación/
  );
});
