import { test } from "node:test";
import assert from "node:assert/strict";

import {
  handleLayerFeature,
  handleLayerFeatures,
} from "../layer-features.js";

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

function metaResponses() {
  return [
    [{ physical_table: "public.borde_costero" }],
    [{ f_geometry_column: "geom" }],
    [{ column_name: "fid" }, { column_name: "ZONA_1" }],
  ];
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
    ...metaResponses(),
    [{ n: "1" }],
    (sql, params) => {
      featureSql = sql;
      assert.deepEqual(params, [5000, 0]);
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
  assert.equal(body.total, 1);
  assert.equal(body.include_geometry, false);
  assert.equal(body.limit, 5000);
  assert.match(featureSql, /NULL::jsonb/);
  assert.doesNotMatch(featureSql, /ST_AsGeoJSON/);
});

test("layer-features incluye geometría solo si se pide", async () => {
  let featureSql = "";
  const db = createDB([
    ...metaResponses(),
    [{ n: "0" }],
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

test("layer-features aplica búsqueda, orden y filtro", async () => {
  const calls = [];
  const db = createDB([
    ...metaResponses(),
    (sql, params) => {
      calls.push({ sql, params });
      return [{ n: "1" }];
    },
    (sql, params) => {
      calls.push({ sql, params });
      return [{ collection: { type: "FeatureCollection", features: [] } }];
    },
  ]);

  const { status } = await run(
    {
      layer_id: "borde_costero",
      search: "ZP",
      sort: "ZONA_1",
      order: "desc",
      filter: JSON.stringify({
        op: "and",
        conditions: [{ column: "ZONA_1", operator: "in", value: ["ZP"] }],
      }),
    },
    db
  );

  assert.equal(status, 200);
  assert.match(calls[0].sql, /ILIKE/);
  assert.match(calls[0].sql, /ANY/);
  assert.deepEqual(calls[0].params, [["ZP"], "ZP"]);
  assert.match(calls[1].sql, /ORDER BY t\."ZONA_1" DESC/);
  assert.deepEqual(calls[1].params, [["ZP"], "ZP", 500, 0]);
});

test("layer-features rechaza una tabla física inválida del catálogo", async () => {
  const db = createDB([[{ physical_table: "public.borde; DROP TABLE x" }]]);
  const { status, body } = await run({ layer_id: "borde_costero" }, db);
  assert.equal(status, 500);
  assert.match(body.error, /Tabla física inválida/);
});

async function runFeature(query, db) {
  return handleLayerFeature(query, { getDB: async () => db });
}

test("layer-feature devuelve una feature con geometría", async () => {
  const db = createDB([
    ...metaResponses(),
    [{ feature: { type: "Feature", properties: { fid: 1 }, geometry: { type: "Polygon", coordinates: [] } } }],
  ]);
  const result = await runFeature(
    { layer_id: "borde_costero", id: "1", id_column: "fid" },
    db
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.type, "Feature");
  assert.equal(result.body.properties.fid, 1);
});

test("layer-feature devuelve 404 si no existe", async () => {
  const db = createDB([...metaResponses(), []]);
  const result = await runFeature(
    { layer_id: "borde_costero", id: "999", id_column: "fid" },
    db
  );
  assert.equal(result.status, 404);
});

test("layer-feature valida la columna de id", async () => {
  const db = createDB(metaResponses());
  const result = await runFeature(
    { layer_id: "borde_costero", id: "1", id_column: "geom" },
    db
  );
  assert.equal(result.status, 400);
  assert.match(result.body.error, /id no permitida/);
});
