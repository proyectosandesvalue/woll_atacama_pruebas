import { test } from "node:test";
import assert from "node:assert/strict";

import { createEmbedder } from "../provider.js";

const cfg = {
  baseUrl: "http://x/v1",
  model: "m",
  apiKey: "k",
  dim: 4,
  batchSize: 32,
  timeoutMs: 1000,
  maxRetries: 3,
  sendDimensions: false,
};

const vec = () => [0.1, 0.2, 0.3, 0.4];
const ok = (n) => ({
  ok: true,
  status: 200,
  json: async () => ({
    data: Array.from({ length: n }, (_, i) => ({ index: i, embedding: vec() })),
  }),
});
const noSleep = async () => {};

test("agrupa en lotes según batchSize", async () => {
  let calls = 0;
  const fakeFetch = async (_url, init) => {
    calls += 1;
    return ok(JSON.parse(init.body).input.length);
  };

  const embedder = createEmbedder(cfg, { fetch: fakeFetch, sleep: noSleep });
  const out = await embedder.embed(Array.from({ length: 70 }, (_, i) => `t${i}`));

  assert.equal(out.length, 70);
  assert.equal(calls, 3);
});

test("ordena por index aunque el proveedor responda desordenado", async () => {
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: [
        { index: 1, embedding: [0, 0, 0, 1] },
        { index: 0, embedding: [1, 0, 0, 0] },
      ],
    }),
  });

  const out = await createEmbedder(cfg, { fetch: fakeFetch, sleep: noSleep }).embed(["a", "b"]);
  assert.deepEqual(out[0], [1, 0, 0, 0]);
  assert.deepEqual(out[1], [0, 0, 0, 1]);
});

test("reintenta ante 429 y luego tiene éxito", async () => {
  let calls = 0;
  const fakeFetch = async (_url, init) => {
    calls += 1;
    if (calls < 3) {
      return { ok: false, status: 429, headers: { get: () => null } };
    }
    return ok(JSON.parse(init.body).input.length);
  };

  const out = await createEmbedder(cfg, { fetch: fakeFetch, sleep: noSleep }).embed(["a"]);
  assert.equal(out.length, 1);
  assert.equal(calls, 3);
});

test("respeta Retry-After", async () => {
  const waits = [];
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    if (calls === 1) {
      return { ok: false, status: 429, headers: { get: () => "2" } };
    }
    return ok(1);
  };

  await createEmbedder(cfg, {
    fetch: fakeFetch,
    sleep: async (ms) => waits.push(ms),
  }).embed(["a"]);

  assert.deepEqual(waits, [2000]);
});

test("falla tras agotar reintentos sin filtrar el cuerpo", async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 500,
    headers: { get: () => null },
    text: async () => "SECRET",
  });

  await assert.rejects(
    createEmbedder({ ...cfg, maxRetries: 1 }, { fetch: fakeFetch, sleep: noSleep }).embed(["a"]),
    (err) => {
      assert.equal(err.code, "EMBED_HTTP_500");
      assert.ok(!String(err.message).includes("SECRET"));
      return true;
    }
  );
});

test("un 400 no se reintenta", async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    return { ok: false, status: 400, headers: { get: () => null } };
  };

  await assert.rejects(
    createEmbedder(cfg, { fetch: fakeFetch, sleep: noSleep }).embed(["a"]),
    { code: "EMBED_HTTP_400" }
  );
  assert.equal(calls, 1);
});

test("dimensión incorrecta produce EMBED_DIM_MISMATCH", async () => {
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: [{ index: 0, embedding: [1, 2] }] }),
  });

  await assert.rejects(
    createEmbedder(cfg, { fetch: fakeFetch, sleep: noSleep }).embed(["a"]),
    { code: "EMBED_DIM_MISMATCH" }
  );
});

test("cantidad inesperada produce EMBED_BAD_RESPONSE", async () => {
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: [{ index: 0, embedding: vec() }] }),
  });

  await assert.rejects(
    createEmbedder(cfg, { fetch: fakeFetch, sleep: noSleep }).embed(["a", "b"]),
    { code: "EMBED_BAD_RESPONSE" }
  );
});

test("fallo de red persistente produce EMBED_NETWORK", async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    throw new Error("ECONNRESET");
  };

  await assert.rejects(
    createEmbedder({ ...cfg, maxRetries: 2 }, { fetch: fakeFetch, sleep: noSleep }).embed(["a"]),
    { code: "EMBED_NETWORK" }
  );
  assert.equal(calls, 3);
});

test("envía dimensions solo si está habilitado", async () => {
  const bodies = [];
  const fakeFetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return ok(1);
  };

  await createEmbedder(cfg, { fetch: fakeFetch, sleep: noSleep }).embed(["a"]);
  await createEmbedder({ ...cfg, sendDimensions: true }, { fetch: fakeFetch, sleep: noSleep }).embed(["a"]);

  assert.equal(bodies[0].dimensions, undefined);
  assert.equal(bodies[1].dimensions, 4);
});

test("entrada vacía no llama al proveedor", async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    return ok(0);
  };

  const out = await createEmbedder(cfg, { fetch: fakeFetch, sleep: noSleep }).embed([]);
  assert.deepEqual(out, []);
  assert.equal(calls, 0);
});
