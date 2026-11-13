import { test } from "node:test";
import assert from "node:assert/strict";

import { handleLayerTiles } from "../layer-tiles.js";

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
  return handleLayerTiles(query, { getDB: async () => db });
}

function metaResponses() {
  return [
    [{ physical_table: "public.borde_costero" }],
    [{ f_geometry_column: "geom" }],
    [{ column_name: "fid" }, { column_name: "ZONA_1" }],
  ];
}

test("layer-tiles exige layer_id", async () => {
  const result = await run({ z: 10, x: 1, y: 1 }, createDB([]));
  assert.equal(result.status, 400);
});

test("layer-tiles valida z/x/y", async () => {
  const db = createDB([]);
  assert.equal((await run({ layer_id: "borde_costero", z: 19, x: 0, y: 0 }, db)).status, 400);
  assert.equal((await run({ layer_id: "borde_costero", z: 10, x: 9999, y: 0 }, db)).status, 400);
  assert.equal((await run({ layer_id: "borde_costero", z: -1, x: 0, y: 0 }, db)).status, 400);
});

test("layer-tiles devuelve 404 si la capa no existe", async () => {
  const result = await run(
    { layer_id: "no_existe", z: 10, x: 1, y: 1 },
    createDB([[]])
  );
  assert.equal(result.status, 404);
});

test("layer-tiles devuelve un MVT con sus headers", async () => {
  const tile = Buffer.from([0x1a, 0x02, 0x08, 0x01]);
  const db = createDB([
    ...metaResponses(),
    [{ tile }],
  ]);

  const result = await run(
    { layer_id: "borde_costero", z: 10, x: 308, y: 596 },
    db
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, tile);
  assert.match(result.headers["Content-Type"], /mapbox-vector-tile/);
  assert.match(db.calls.at(-1).sql, /ST_AsMVTGeom/);
  assert.deepEqual(db.calls.at(-1).params, [10, 308, 596, "borde_costero"]);
});

test("layer-tiles devuelve 204 para un tile vacío", async () => {
  const db = createDB([...metaResponses(), [{ tile: Buffer.alloc(0) }]]);
  const result = await run(
    { layer_id: "borde_costero", z: 14, x: 1, y: 1 },
    db
  );
  assert.equal(result.status, 204);
  assert.equal(result.body, undefined);
});
