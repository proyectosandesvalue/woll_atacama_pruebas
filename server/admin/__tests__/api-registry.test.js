import { test } from "node:test";
import assert from "node:assert/strict";

import {
  API_REGISTRY,
  envStatus,
  getApiDefinition,
  publicDefinition,
} from "../api-registry.js";
import { testApiConnection } from "../../handlers/admin-apis.js";

test("el registro contiene las conexiones existentes y no expone secretos", () => {
  const keys = API_REGISTRY.map((item) => item.key);
  for (const key of [
    "copernicus-wms",
    "copernicus-wfs",
    "copernicus-wmts",
    "worldview-snapshot",
    "arclim",
    "agromet",
    "meteochile",
    "embeddings",
  ]) {
    assert.ok(keys.includes(key), `falta ${key}`);
  }

  const publicDef = publicDefinition(getApiDefinition("copernicus-wms"), {
    COPERNICUS_INSTANCE_ID: "abc",
  });
  assert.equal(JSON.stringify(publicDef).includes("abc"), false);
  assert.ok(publicDef.env.some((item) => item.name === "COPERNICUS_INSTANCE_ID" && item.present));
});

test("envStatus distingue variables presentes y ausentes", () => {
  const def = getApiDefinition("embeddings");
  const status = envStatus(def, { EMBEDDINGS_BASE_URL: "http://x/v1" });
  assert.equal(status.find((item) => item.name === "EMBEDDINGS_BASE_URL")?.present, true);
  assert.equal(status.find((item) => item.name === "EMBEDDINGS_MODEL")?.present, false);
});

test("prueba HTTP controlada devuelve estado y latencia", async () => {
  const def = getApiDefinition("arclim");
  const result = await testApiConnection(def, {
    env: {},
    fetchImpl: async () => ({
      status: 200,
      body: { cancel: async () => {} },
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.ok(result.latencyMs >= 0);
});

test("prueba falla si falta una variable requerida", async () => {
  const result = await testApiConnection(getApiDefinition("embeddings"), {
    env: {},
    fetchImpl: async () => {
      throw new Error("no debería llamarse");
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /variables de entorno/i);
});
