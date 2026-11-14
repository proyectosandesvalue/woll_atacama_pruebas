import { test } from "node:test";
import assert from "node:assert/strict";

import { createSession } from "../../admin/auth.js";
import {
  handleLayerArchive,
  handleLayerQueue,
  handleLayerSave,
  handleLayersGet,
} from "../admin-layers.js";

const ENV = { ADMIN_SESSION_SECRET: "s".repeat(48) };

function ctx(overrides = {}) {
  const session = createSession({ user: "admin", secret: ENV.ADMIN_SESSION_SECRET });
  return {
    env: ENV,
    ip: "127.0.0.1",
    query: {},
    body: {},
    req: {
      method: "POST",
      headers: {
        cookie: `woll_admin=${encodeURIComponent(session.token)}`,
        "x-csrf-token": session.csrf,
      },
    },
    ...overrides,
  };
}

function fakeDB(rows = []) {
  return {
    pool: { query: async () => [] },
    query: async (sql) => {
      if (sql.includes("FROM admin.layers")) return rows;
      if (sql.includes("INSERT INTO admin.layers") || sql.includes("UPDATE admin.layers")) {
        return [{ id: 1, layer_key: "test_capa", nombre: "Test", tipo: "polygon", source_type: "geojson", has_tiles: false, config: {} }];
      }
      return [];
    },
  };
}

test("capas exige sesión", async () => {
  const result = await handleLayersGet({ req: { headers: {} }, env: ENV }, { getDB: async () => fakeDB() });
  assert.equal(result.status, 401);
});

test("crea una capa con clave válida", async () => {
  const result = await handleLayerSave(
    ctx({ body: { key: "test_capa", nombre: "Test", tipo: "polygon", source_type: "geojson" } }),
    { getDB: async () => fakeDB() }
  );
  assert.equal(result.status, 201);
});

test("rechaza una clave inválida", async () => {
  const result = await handleLayerSave(
    ctx({ body: { key: "../test", nombre: "Test", tipo: "polygon" } }),
    { getDB: async () => fakeDB() }
  );
  assert.equal(result.status, 400);
});

test("archivar exige id", async () => {
  const result = await handleLayerArchive(
    ctx({ query: {} }),
    { getDB: async () => fakeDB() }
  );
  assert.equal(result.status, 400);
});

test("encolar exige una capa con archivo subido", async () => {
  const result = await handleLayerQueue(
    ctx({ body: { layer_key: "test_capa" } }),
    { getDB: async () => fakeDB([{ id: 1, layer_key: "test_capa", nombre: "Test", config: {} }]) }
  );
  assert.equal(result.status, 400);
});
