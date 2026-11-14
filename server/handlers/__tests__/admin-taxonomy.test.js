import { test } from "node:test";
import assert from "node:assert/strict";

import { createSession } from "../../admin/auth.js";
import {
  handleDimensionSave,
  handlePlacementSave,
  handleTaxonomyGet,
} from "../admin-taxonomy.js";

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

function db() {
  return {
    pool: { query: async () => [] },
    query: async (sql) => {
      if (sql.includes("INSERT INTO admin.dimensions")) {
        return [{ id: 10, key: "test", nombre: "Test", icono: null, orden: 0, activo: true }];
      }
      return [];
    },
  };
}

test("taxonomía exige sesión", async () => {
  const result = await handleTaxonomyGet(
    { req: { headers: {} }, env: ENV },
    { getDB: async () => db() }
  );
  assert.equal(result.status, 401);
});

test("taxonomía lista las tablas normalizadas", async () => {
  const result = await handleTaxonomyGet(ctx(), { getDB: async () => db() });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.dimensions, []);
});

test("crea una dimensión con clave válida", async () => {
  const result = await handleDimensionSave(
    ctx({ body: { key: "test", nombre: "Test", orden: 0, activo: true } }),
    { getDB: async () => db() }
  );
  assert.equal(result.status, 201);
  assert.equal(result.body.item.key, "test");
});

test("rechaza una dimensión con clave inválida", async () => {
  const result = await handleDimensionSave(
    ctx({ body: { key: "Clave Inválida", nombre: "Test" } }),
    { getDB: async () => db() }
  );
  assert.equal(result.status, 400);
});

test("rechaza una asignación con scope inválido", async () => {
  const result = await handlePlacementSave(
    ctx({ body: { layer_id: 1, dimension_id: 1, scope: "otro" } }),
    { getDB: async () => db() }
  );
  assert.equal(result.status, 400);
});
