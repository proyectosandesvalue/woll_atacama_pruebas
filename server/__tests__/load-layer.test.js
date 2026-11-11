import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildInsertBatch,
  buildTablePlan,
  inferColumnType,
  normalizeValue,
  pgDsn,
  quoteColumn,
  quoteIdent,
} from "../../scripts/load-layer.mjs";

test("quoteIdent solo acepta identificadores seguros", () => {
  assert.equal(quoteIdent("lagunas_embalses"), '"lagunas_embalses"');
  assert.throws(() => quoteIdent("foo;drop"), /Identificador inválido/);
  assert.throws(() => quoteIdent("1foo"), /Identificador inválido/);
});

test("quoteColumn escapa nombres con espacios o comillas", () => {
  assert.equal(quoteColumn("Nombre Comuna"), '"Nombre Comuna"');
  assert.equal(quoteColumn('a"b'), '"a""b"');
});

test("inferColumnType distingue boolean, numeric y text", () => {
  assert.equal(inferColumnType([true, false, null]), "boolean");
  assert.equal(inferColumnType([1, 2.5, "3", null]), "numeric");
  assert.equal(inferColumnType(["Copiapó", "Vallenar"]), "text");
  assert.equal(inferColumnType([null, undefined]), "text");
});

test("buildTablePlan excluye gid/geom y conserva el orden", () => {
  const features = [
    { properties: { nombre: "A", area: 10, gid: 1 } },
    { properties: { nombre: "B", area: 20.5, geom: "x" } },
  ];

  const plan = buildTablePlan(features, { table: "demo" });
  assert.equal(plan.table, "demo");
  assert.equal(plan.srid, 4326);
  assert.deepEqual(plan.columns, [
    { name: "nombre", pgType: "text" },
    { name: "area", pgType: "numeric" },
  ]);
});

test("buildInsertBatch alinea placeholders y valores", () => {
  const plan = {
    table: "demo",
    srid: 4326,
    columns: [
      { name: "nombre", pgType: "text" },
      { name: "area", pgType: "numeric" },
    ],
  };

  const batch = buildInsertBatch(plan, [
    {
      geometry: { type: "Point", coordinates: [-70, -27] },
      properties: { nombre: "A", area: 10 },
    },
    {
      geometry: { type: "Point", coordinates: [-71, -28] },
      properties: { nombre: "B", area: 20 },
    },
  ]);

  assert.equal(
    batch.sql,
    'INSERT INTO public."demo" (geom, "nombre", "area") VALUES ' +
      "(ST_SetSRID(ST_GeomFromGeoJSON($1), $2::int), $3, $4), " +
      "(ST_SetSRID(ST_GeomFromGeoJSON($5), $6::int), $7, $8)"
  );
  assert.equal(batch.values.length, 8);
  assert.equal(batch.values[2], "A");
  assert.equal(batch.values[3], 10);
  assert.equal(batch.values[6], "B");
});

test("normalizeValue serializa objetos y conserva null", () => {
  assert.equal(normalizeValue(null), null);
  assert.equal(normalizeValue(undefined), null);
  assert.equal(normalizeValue({ a: 1 }), '{"a":1}');
  assert.equal(normalizeValue("x"), "x");
});

test("pgDsn convierte una URL en DSN para ogr2ogr", () => {
  const result = pgDsn("postgres://user:pass@db.example:5433/woll");
  assert.equal(result.dsn, "PG:host=db.example port=5433 dbname=woll user=user");
  assert.equal(result.password, "pass");
});
