import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyColumn, classifyLayer, checkConfigCoherence, computeProvenance, pct,
} from "./classify.js";

const facts = (o = {}) => ({
  row_count: 10000, null_count: 0, empty_count: 0, suspicious_count: 0,
  numeric_parseable_count: 0, mojibake_count: 0, unique_count: 5,
  variant_groups: 0, declared_type: "text", ...o,
});

// ── Fronteras de calidad ──────────────────────────────────────
test("clean cuando no hay problemas", () => {
  assert.equal(classifyColumn(facts()).quality, "clean");
});

test("4.99 % de nulos → mostly_clean", () => {
  assert.equal(classifyColumn(facts({ null_count: 499 })).quality, "mostly_clean");
});

test("5 % exacto → has_nulls", () => {
  assert.equal(classifyColumn(facts({ null_count: 500 })).quality, "has_nulls");
});

test("30 % exacto → has_nulls; 30.01 % → dirty", () => {
  assert.equal(classifyColumn(facts({ null_count: 3000 })).quality, "has_nulls");
  assert.equal(classifyColumn(facts({ null_count: 3001 })).quality, "dirty");
});

test("70 % exacto → dirty; 70.01 % → broken", () => {
  assert.equal(classifyColumn(facts({ null_count: 7000 })).quality, "dirty");
  assert.equal(classifyColumn(facts({ null_count: 7001 })).quality, "broken");
});

test("vacíos cuentan como nulos", () => {
  assert.equal(classifyColumn(facts({ empty_count: 4000 })).quality, "dirty");
});

test("sospechosos: 1 % → has_nulls, >5 % → dirty, >50 % → broken", () => {
  assert.equal(classifyColumn(facts({ suspicious_count: 100 })).quality, "has_nulls");
  assert.equal(classifyColumn(facts({ suspicious_count: 501 })).quality, "dirty");
  assert.equal(classifyColumn(facts({ suspicious_count: 5001 })).quality, "broken");
});

test("cualquier mojibake → dirty", () => {
  assert.equal(classifyColumn(facts({ mojibake_count: 1 })).quality, "dirty");
});

test("tabla vacía → empty; error → error", () => {
  assert.equal(classifyColumn(facts({ row_count: 0 })).quality, "empty");
  assert.equal(classifyColumn({ error: "timeout" }).quality, "error");
});

// ── Flags ─────────────────────────────────────────────────────
test("numeric_as_text solo si es texto y >80 % parseable", () => {
  const f = classifyColumn(facts({ numeric_parseable_count: 9000, unique_count: 500 }));
  assert.ok(f.flags.includes("numeric_as_text"));
  const g = classifyColumn(facts({ declared_type: "integer", numeric_parseable_count: 9000 }));
  assert.ok(!g.flags.includes("numeric_as_text"));
});

test("categorical, id_like y has_case_variants", () => {
  assert.ok(classifyColumn(facts({ unique_count: 5 })).flags.includes("categorical"));
  assert.ok(classifyColumn(facts({ unique_count: 10000 })).flags.includes("id_like"));
  assert.ok(classifyColumn(facts({ variant_groups: 2 })).flags.includes("has_case_variants"));
});

test("expected_sparse: los nulos no penalizan", () => {
  const r = classifyColumn(facts({ null_count: 9000 }), { expectedSparse: true });
  assert.notEqual(r.quality, "broken");
  assert.notEqual(r.quality, "dirty");
  assert.ok(r.flags.includes("expected_sparse"));
});

test("columna 100 % nula → broken", () => {
  assert.equal(classifyColumn(facts({ null_count: 10000 })).quality, "broken");
});

// ── Coherencia config↔tabla ───────────────────────────────────
test("coherencia: detecta campos inexistentes ignorando mayúsculas", () => {
  const cfg = {
    popupCampos: ["NOMBRE", "Caudal Anual Promedio en Ls/s"],
    atributo: "Uso del Agua",
    alias: { nombre: "Nombre", "Caudal Anual Promedio": "Caudal" },
  };
  const issues = checkConfigCoherence([cfg], ["nombre", "Uso del Agua", "Caudal Anual Promedio en Ls/s"]);
  assert.deepEqual(issues, [{ type: "alias_key_missing", field: "Caudal Anual Promedio" }]);
});

test("coherencia: ignora WMS y deduplica", () => {
  assert.deepEqual(checkConfigCoherence([{ tipo: "wms", popupCampos: ["X"] }], []), []);
  const dup = { popupCampos: ["X"] };
  assert.equal(checkConfigCoherence([dup, dup], []).length, 1);
});

// ── Procedencia ───────────────────────────────────────────────
const NOW = new Date("2026-10-10T00:00:00Z");

test("missing_provenance si no hay columna de origen", () => {
  const r = computeProvenance([{ column_name: "nombre", null_pct: 0 }], { now: NOW });
  assert.ok(r.flags.includes("missing_provenance"));
});

test("missing_provenance si la columna de origen está vacía", () => {
  const r = computeProvenance([{ column_name: "Origen Data", null_pct: 80 }], { now: NOW });
  assert.ok(r.flags.includes("missing_provenance"));
});

test("stale cuando la última actualización supera 3 años", () => {
  const cols = [
    { column_name: "Origen Data", null_pct: 0 },
    { column_name: "Última Actualización", null_pct: 0, max_date: "2021-01-15" },
  ];
  const r = computeProvenance(cols, { now: NOW });
  assert.ok(r.flags.includes("stale"));
  assert.equal(r.newest_date, "2021-01-15");
});

test("sin flags con origen y fecha reciente", () => {
  const cols = [
    { column_name: "Origen Data", null_pct: 0 },
    { column_name: "FECHA_ACTUALIZACION", null_pct: 0, max_date: "2026-03-01" },
  ];
  assert.deepEqual(computeProvenance(cols, { now: NOW }).flags, []);
});

// ── Estado de capa ────────────────────────────────────────────
const okGeom = { has_geometry: true, total: 100, null_geom: 0, empty_geom: 0,
  invalid_geom: 0, zero_zero: 0, srid_mismatch: 0, outside_bbox: 0, duplicate_geom: 0 };

test("capa ok", () => {
  const r = classifyLayer({ rowCount: 100, geometry: okGeom,
    columns: [{ column_name: "a", quality: "clean" }], configIssues: [], provenance: { flags: [] } });
  assert.equal(r.status, "ok");
});

test("capa vacía → blocked", () => {
  assert.equal(classifyLayer({ rowCount: 0, columns: [] }).status, "blocked");
});

test("geometrías: 5 % no bloquea, >5 % bloquea", () => {
  const at = classifyLayer({ rowCount: 100, geometry: { ...okGeom, invalid_geom: 5 }, columns: [] });
  assert.notEqual(at.status, "blocked");
  const over = classifyLayer({ rowCount: 100, geometry: { ...okGeom, invalid_geom: 6 }, columns: [] });
  assert.equal(over.status, "blocked");
});

test("zero_zero >50 % bloquea", () => {
  const r = classifyLayer({ rowCount: 100, geometry: { ...okGeom, zero_zero: 51 }, columns: [] });
  assert.equal(r.status, "blocked");
});

test("columna dirty o config_issues → warning", () => {
  const a = classifyLayer({ rowCount: 100, geometry: okGeom,
    columns: [{ column_name: "c", quality: "dirty" }] });
  assert.equal(a.status, "warning");
  const b = classifyLayer({ rowCount: 100, geometry: okGeom, columns: [],
    configIssues: [{ type: "x", field: "y" }] });
  assert.equal(b.status, "warning");
});

test("capa sin geometría no falla", () => {
  const r = classifyLayer({ rowCount: 10, geometry: { has_geometry: false }, columns: [] });
  assert.equal(r.status, "ok");
});

test("pct con total 0 devuelve 0", () => {
  assert.equal(pct(5, 0), 0);
});