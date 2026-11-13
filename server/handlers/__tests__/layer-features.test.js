import { test } from "node:test";
import assert from "node:assert/strict";

import { handleLayerFeatures } from "../layer-features.js";

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
  const result = await handleLayerFeatures(query, { getDB: async () => db });
  return { ...result, db };
}

test("layer-features exige layer_id", async () => {
  const { status, body } = await run({}, createDB([]));
  assert.equal(status, 400);
  assert.match(body.error, /layer_id/);
});

test("layer-features rechaza layer_id inválido", async () => {
  const { status, body } = await run({ layer_id: "../etc/passwd" }, createDB([]));
  assert.equal(status, 400);
  assert.match(body.error, /inválido/);
});

test("layer-features devuelve 404 si la capa no está en el catálogo", async () => {
  const db = createDB([[]]);
  const { status, body } = await run({ layer_id: "no_existe" }, db);
  assert.equal(status, 404);
  assert.match(body.error, /no encontrada/i);
});

test("layer-features devuelve propiedades sin geometría por defecto", async () => {
  let featureSql = "";
  const db = createDB([
    [{ physical_table: "public.borde_costero" }],
    [{ f_geometry_column: "geom" }],
    (sql, params) => {
      featureSql = sql;
      assert.deepEqual(params, [1000, 0]);
      return [
        {
          collection: {
            type: "FeatureCollection",
            features: [{ type: "Feature", geometry: null, properties: { ZONA_1: "ZP" } }],
          },
        },
      ];
    },
  ]);

  const { status, body } = await run(
    { layer_id: "borde_costero", limit: "99999" },
    db
  );

  assert.equal(status, 200);
  assert.equal(body.type, "FeatureCollection");
  assert.equal(body.features.length, 1);
  assert.equal(body.include_geometry, false);
  assert.equal(body.limit, 1000);
  assert.match(featureSql, /NULL::jsonb/);
  assert.doesNotMatch(featureSql, /ST_AsGeoJSON/);
});

test("layer-features incluye geometría solo si se pide", async () => {
  let featureSql = "";
  const db = createDB([
    [{ physical_table: "public.borde_costero" }],
    [{ f_geometry_column: "geom" }],
    (sql) => {
      featureSql = sql;
      return [{ collection: { type: "FeatureCollection", features: [] } }];
    },
  ]);

  const { status, body } = await run(
    { layer_id: "borde_costero", limit: "2", include_geometry: "1" },
    db
  );

  assert.equal(status, 200);
  assert.equal(body.include_geometry, true);
  assert.match(featureSql, /ST_AsGeoJSON/);
});

test("layer-features rechaza una tabla física inválida del catálogo", async () => {
  const db = createDB([[{ physical_table: "public.borde; DROP TABLE x" }]]);
  const { status, body } = await run({ layer_id: "borde_costero" }, db);
  assert.equal(status, 500);
  assert.match(body.error, /Tabla física inválida/);
});
