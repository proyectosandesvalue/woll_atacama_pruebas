import { test } from "node:test";
import assert from "node:assert/strict";

import { createSession } from "../../admin/auth.js";
import {
  handleAdminApisList,
  handleAdminApisTest,
  handleAdminApisUpdate,
} from "../admin-apis.js";

const ENV = { ADMIN_SESSION_SECRET: "s".repeat(48) };

function ctx(overrides = {}) {
  const session = createSession({ user: "admin", secret: ENV.ADMIN_SESSION_SECRET });
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

function db(rows = []) {
  return {
    pool: { query: async () => [] },
    calls: [],
    query: async (sql) => {
      if (sql.includes("FROM admin.api_connections")) return rows;
      return [];
    },
  };
}

test("apis exige sesión", async () => {
  const result = await handleAdminApisList({ req: { headers: {} }, env: ENV }, { getDB: async () => db() });
  assert.equal(result.status, 401);
});

test("apis lista el registro con estado de entorno", async () => {
  const result = await handleAdminApisList(ctx(), { getDB: async () => db() });
  assert.equal(result.status, 200);
  assert.equal(result.body.items.length >= 8, true);
  assert.equal(result.body.items[0].key, "copernicus-wms");
});

test("apis rechaza actualizar una conexión desconocida", async () => {
  const result = await handleAdminApisUpdate(
    ctx({ body: { key: "no-existe", label: "X", timeout_ms: 15000 } }),
    { getDB: async () => db() }
  );
  assert.equal(result.status, 404);
});

test("apis actualiza parámetros no secretos", async () => {
  const result = await handleAdminApisUpdate(
    ctx({
      body: {
        key: "arclim",
        label: "ARClim",
        timeout_ms: 20000,
        rate_limit: "60/min",
        activo: true,
      },
    }),
    { getDB: async () => ({
      pool: { query: async () => [] },
      query: async (sql) => {
        if (sql.includes("INSERT INTO admin.api_connections")) {
          return [{ key: "arclim", label: "ARClim", timeout_ms: 20000, rate_limit: "60/min", activo: true }];
        }
        return [];
      },
    }) }
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.item.key, "arclim");
});

test("apis prueba una conexión y guarda el resultado", async () => {
  const calls = [];
  const fakeDB = {
    pool: { query: async () => [] },
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.includes("SELECT timeout_ms")) return [{ timeout_ms: 5000 }];
      return [];
    },
  };
  const result = await handleAdminApisTest(
    ctx({ query: { key: "arclim" } }),
    {
      getDB: async () => fakeDB,
      fetchImpl: async () => ({ status: 204, body: { cancel: async () => {} } }),
    }
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.status, 204);
  assert.ok(calls.some((call) => call.sql.includes("last_check_at")));
});
