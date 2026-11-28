import { test } from "node:test";
import assert from "node:assert/strict";

import { createSession } from "../../admin/auth.js";
import {
  handleLayerMetadataGet,
  handleLayerMetadataSave,
} from "../admin-layer-metadata.js";

const ENV = { ADMIN_SESSION_SECRET: "s".repeat(48) };

function ctx(overrides = {}) {
  const session = createSession({
    user: "admin",
    secret: ENV.ADMIN_SESSION_SECRET,
  });
  return {
    env: ENV,
    ip: "127.0.0.1",
    query: {},
    body: {},
    req: {
      headers: {
        cookie: `woll_admin=${encodeURIComponent(session.token)}`,
        "x-csrf-token": session.csrf,
      },
    },
    ...overrides,
  };
}

function fakeDB({ rows = [], updateRows = null } = {}) {
  const calls = [];
  return {
    pool: { query: async () => [] },
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes("FROM chat.chat_catalog")) return rows;
      if (sql.includes("UPDATE chat.chat_catalog")) {
        if (updateRows !== null) return updateRows;
        return [
          {
            layer_id: params[0],
            display_name: "Glaciares",
            dimension: "agua",
            geometry_type: "polygon",
            source: params[1],
            source_url: params[2],
            data_updated_at: params[3],
            scale: params[4],
            license: params[5],
            method: params[6],
            coverage: params[7],
            limitations: params[8],
          },
        ];
      }
      return [];
    },
  };
}

test("metadatos exige sesión", async () => {
  const result = await handleLayerMetadataGet(
    { req: { headers: {} }, env: ENV },
    { getDB: async () => fakeDB() }
  );
  assert.equal(result.status, 401);
});

test("lista las capas con sus metadatos", async () => {
  const db = fakeDB({
    rows: [
      {
        layer_id: "glaciares",
        display_name: "Glaciares",
        dimension: "agua",
        source: "DGA",
      },
    ],
  });
  const result = await handleLayerMetadataGet(ctx(), {
    getDB: async () => db,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.items.length, 1);
  assert.equal(result.body.items[0].layer_id, "glaciares");
  assert.equal(result.body.editable, true);
});

test("guardar exige CSRF", async () => {
  const base = ctx();
  const result = await handleLayerMetadataSave(
    {
      ...base,
      body: { layer_id: "glaciares" },
      req: { headers: { cookie: base.req.headers.cookie } },
    },
    { getDB: async () => fakeDB() }
  );
  assert.equal(result.status, 403);
});

test("rechaza source_url que no sea https", async () => {
  const result = await handleLayerMetadataSave(
    ctx({
      body: { layer_id: "glaciares", source_url: "http://ejemplo.cl" },
    }),
    { getDB: async () => fakeDB() }
  );
  assert.equal(result.status, 400);
  assert.match(result.body.error, /https/);
});

test("rechaza una fecha inválida", async () => {
  const result = await handleLayerMetadataSave(
    ctx({
      body: { layer_id: "glaciares", data_updated_at: "2024-02-31" },
    }),
    { getDB: async () => fakeDB() }
  );
  assert.equal(result.status, 400);
  assert.match(result.body.error, /fecha/);
});

test("actualiza la procedencia y devuelve la fila", async () => {
  const db = fakeDB();
  const result = await handleLayerMetadataSave(
    ctx({
      body: {
        layer_id: "glaciares",
        source: "DGA",
        source_url: "https://dga.mop.gob.cl/",
        data_updated_at: "2025-07-15",
        scale: "1:50.000",
        license: "Uso institucional con atribución",
        method: "Fotointerpretación Sentinel-2",
        coverage: "Región de Atacama",
        limitations: "No reemplaza un inventario de detalle.",
      },
    }),
    { getDB: async () => db }
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.item.layer_id, "glaciares");
  assert.equal(result.body.item.source, "DGA");
  const update = db.calls.find((call) => call.sql.includes("UPDATE chat.chat_catalog"));
  assert.ok(update);
  assert.equal(update.params[0], "glaciares");
  assert.equal(update.params[1], "DGA");
  assert.equal(update.params[3], "2025-07-15");
});

test("devuelve 404 si la capa no existe", async () => {
  const result = await handleLayerMetadataSave(
    ctx({ body: { layer_id: "no-existe" } }),
    { getDB: async () => fakeDB({ updateRows: [] }) }
  );
  assert.equal(result.status, 404);
});
