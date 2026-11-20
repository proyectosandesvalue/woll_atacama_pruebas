import { test } from "node:test";
import assert from "node:assert/strict";

import { handleRasterStats } from "../raster-stats.js";

function createDB(responses) {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      const next = responses.shift();
      if (!next) throw new Error("query inesperada");
      return typeof next === "function" ? next(sql, params) : next;
    },
  };
}

async function run(query, db) {
  return handleRasterStats(query, { getDB: async () => db });
}

test("raster-stats exige layer_id", async () => {
  const { status, body } = await run({}, createDB([]));
  assert.equal(status, 400);
  assert.match(body.error, /layer_id/);
});

test("raster-stats rechaza layer_id y admin_level inválidos", async () => {
  const invalidLayer = await run({ layer_id: "../etc/passwd" }, createDB([]));
  assert.equal(invalidLayer.status, 400);

  const invalidLevel = await run(
    { layer_id: "aptitud_jojoba", admin_level: "barrio" },
    createDB([])
  );
  assert.equal(invalidLevel.status, 400);
  assert.match(invalidLevel.body.error, /admin_level/);
});

test("raster-stats usa la última versión si no se indica", async () => {
  const db = createDB([
    [{ version: "2026-11" }],
    [
      {
        admin_code: "03101",
        admin_name: "Copiapó",
        class_id: -1,
        hectares: 12345.6,
        mean: 0.62,
      },
    ],
  ]);
  const { status, body } = await run({ layer_id: "aptitud_jojoba" }, db);
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.version, "2026-11");
  assert.equal(body.data.rows.length, 1);
  assert.equal(body.data.rows[0].admin_name, "Copiapó");
  assert.match(db.calls[0].sql, /ORDER BY computed_at DESC/);
});

test("raster-stats devuelve vacío si no hay estadísticas", async () => {
  const db = createDB([[]]);
  const { status, body } = await run({ layer_id: "aptitud_jojoba" }, db);
  assert.equal(status, 200);
  assert.deepEqual(body.data.rows, []);
  assert.equal(body.data.version, null);
});

test("raster-stats devuelve 500 sin filtrar el error de la BD", async () => {
  const db = createDB([
    () => {
      throw new Error("relation public.raster_stats does not exist");
    },
  ]);
  const { status, body } = await run(
    { layer_id: "aptitud_jojoba", version: "2026-11" },
    db
  );
  assert.equal(status, 500);
  assert.equal(body.error, "Error interno");
});
