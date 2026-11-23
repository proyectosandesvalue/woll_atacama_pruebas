import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { rm } from "node:fs/promises";

import { createSession } from "../../admin/auth.js";
import { layerZipPath } from "../../admin/layer-files.js";
import {
  handleLayerArchive,
  handleLayerQueue,
  handleLayerSave,
  handleLayerUpload,
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

test("sube un ZIP de Shapefile y lo registra como fuente shapefile", async () => {
  const key = "test_shapefile_upload";
  const zip = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.alloc(64, 1),
  ]);
  const base = ctx();
  const req = Readable.from([zip]);
  req.headers = {
    ...base.req.headers,
    "content-type": "application/zip",
    "content-length": String(zip.length),
  };

  const db = {
    pool: { query: async () => [] },
    query: async (sql, params = []) => {
      if (sql.includes("FROM admin.layers")) return [];
      if (sql.includes("INSERT INTO admin.layers")) {
        return [
          {
            id: 1,
            layer_key: key,
            nombre: "Test",
            source_type: params[3],
            config: JSON.parse(params[4]),
          },
        ];
      }
      return [];
    },
  };

  try {
    const result = await handleLayerUpload(
      ctx({ query: { key }, req }),
      { getDB: async () => db }
    );
    assert.equal(result.status, 201);
    assert.equal(result.body.format, "shapefile");
    assert.equal(result.body.file, `geojson/private/${key}.zip`);
    assert.equal(result.body.item.source_type, "shapefile");
    assert.equal(result.body.item.config.upload.format, "shapefile");
  } finally {
    await rm(layerZipPath(key), { force: true });
  }
});

test("encola un Shapefile con payload.format y ruta privada", async () => {
  const key = "test_shapefile_queue";
  const db = {
    pool: { query: async () => [] },
    query: async (sql, params = []) => {
      if (sql.includes("FROM admin.layers")) {
        return [
          {
            id: 1,
            layer_key: key,
            nombre: "Test",
            config: {
              upload: {
                format: "shapefile",
                file: `geojson/private/${key}.zip`,
                bytes: 100,
              },
            },
          },
        ];
      }
      if (sql.includes("INSERT INTO admin.layer_jobs")) {
        return [{ id: 9, status: "queued", payload: JSON.parse(params[1]) }];
      }
      return [];
    },
  };

  const result = await handleLayerQueue(
    ctx({ body: { layer_key: key, dimension_key: "otros" } }),
    { getDB: async () => db }
  );
  assert.equal(result.status, 201);
  assert.equal(result.body.job.payload.format, "shapefile");
  assert.equal(result.body.job.payload.file, `geojson/private/${key}.zip`);
});
