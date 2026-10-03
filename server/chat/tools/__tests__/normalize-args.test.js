/**
 * Tests unitarios de normalizeArgs.
 *
 * `normalizeArgs` es la última línea de defensa entre el LLM (que puede
 * alucinar) y Supabase. Si esta función falla, las RPCs reciben basura.
 * Por eso tiene que estar bien testeada.
 *
 * Correr con:
 *   npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeArgs, METRICS, ADMIN_LEVELS, MAX_LIMIT } from "../_helpers.js";

// ── Coacción de tipos básicos ──────────────────────────────────

test("normalizeArgs coacciona layer_id numérico a string", () => {
  const out = normalizeArgs("query_layer", { layer_id: 42 });
  assert.strictEqual(out.layer_id, "42");
});

test("normalizeArgs coacciona group_by numérico a string", () => {
  const out = normalizeArgs("aggregate_layer", { group_by: 7 });
  assert.strictEqual(out.group_by, "7");
});

test("normalizeArgs coacciona field numérico a string", () => {
  const out = normalizeArgs("aggregate_layer", {
    layer_id: "x",
    group_by: "y",
    field: 3,
  });
  assert.strictEqual(out.field, "3");
});

// ── Inputs raros ──────────────────────────────────────────────

test("normalizeArgs devuelve objeto plano si raw es null", () => {
  const out = normalizeArgs("query_layer", null);
  assert.deepStrictEqual(out, {});
});

test("normalizeArgs devuelve objeto plano si raw es array", () => {
  const out = normalizeArgs("query_layer", [1, 2, 3]);
  assert.deepStrictEqual(out, {});
});

test("normalizeArgs ignora primitivos y devuelve objeto plano", () => {
  const out = normalizeArgs("query_layer", "no soy un objeto");
  assert.deepStrictEqual(out, {});
});

// ── admin_level ───────────────────────────────────────────────

test("normalizeArgs degrada admin_level inválido a 'comuna'", () => {
  const out = normalizeArgs("aggregate_by_admin", {
    layer_id: "x",
    admin_level: "barrio",
  });
  assert.strictEqual(out.admin_level, "comuna");
});

test("normalizeArgs acepta admin_level válido en mayúsculas", () => {
  const out = normalizeArgs("aggregate_by_admin", {
    layer_id: "x",
    admin_level: "COMUNA",
  });
  assert.strictEqual(out.admin_level, "comuna");
});

test("normalizeArgs aplica admin_level a aggregate_near_layer", () => {
  const out = normalizeArgs("aggregate_near_layer", {
    layer_id: "x",
    admin_level: "PROVINCIA",
  });
  assert.strictEqual(out.admin_level, "provincia");
});

test("normalizeArgs no toca admin_level si la tool no lo usa", () => {
  const out = normalizeArgs("query_layer", { admin_level: "comuna" });
  assert.strictEqual(out.admin_level, "comuna");
});

// ── limit ─────────────────────────────────────────────────────

test("normalizeArgs acota limit a 50", () => {
  const out = normalizeArgs("query_layer", { layer_id: "x", limit: 999 });
  assert.strictEqual(out.limit, MAX_LIMIT);
});

test("normalizeArgs eleva limit a mínimo 1", () => {
  const out = normalizeArgs("query_layer", { layer_id: "x", limit: -5 });
  assert.strictEqual(out.limit, 1);
});

test("normalizeArgs convierte limit no numérico a 20 (default)", () => {
  const out = normalizeArgs("query_layer", { layer_id: "x", limit: "muchas" });
  assert.strictEqual(out.limit, 20);
});

test("normalizeArgs redondea limit decimal", () => {
  const out = normalizeArgs("query_layer", { layer_id: "x", limit: 12.7 });
  assert.strictEqual(out.limit, 12);
});

test("normalizeArgs no toca limit en tools que no lo usan", () => {
  const out = normalizeArgs("get_layer_stats", { layer_id: "x", limit: 999 });
  assert.strictEqual(out.limit, 999);
});

// ── filters ───────────────────────────────────────────────────

test("normalizeArgs convierte filters null a objeto vacío", () => {
  const out = normalizeArgs("query_layer", { layer_id: "x", filters: null });
  assert.deepStrictEqual(out.filters, {});
});

test("normalizeArgs convierte filters array a objeto vacío", () => {
  const out = normalizeArgs("query_layer", { layer_id: "x", filters: [1, 2] });
  assert.deepStrictEqual(out.filters, {});
});

test("normalizeArgs preserva filters válido", () => {
  const filters = { comuna: "Copiapó" };
  const out = normalizeArgs("query_layer", { layer_id: "x", filters });
  assert.deepStrictEqual(out.filters, filters);
});

test("normalizeArgs no toca filters si no está presente", () => {
  const out = normalizeArgs("query_layer", { layer_id: "x" });
  assert.strictEqual(out.filters, undefined);
});

// ── metric ────────────────────────────────────────────────────

test("normalizeArgs degrada metric inválida a count", () => {
  const out = normalizeArgs("aggregate_layer", {
    layer_id: "x",
    group_by: "y",
    metric: "pifia",
  });
  assert.strictEqual(out.metric, "count");
});

test("normalizeArgs degrada metric distinta de count si falta field", () => {
  const out = normalizeArgs("aggregate_layer", {
    layer_id: "x",
    group_by: "y",
    metric: "avg",
  });
  assert.strictEqual(out.metric, "count");
});

test("normalizeArgs preserva metric avg si hay field", () => {
  const out = normalizeArgs("aggregate_layer", {
    layer_id: "x",
    group_by: "y",
    metric: "avg",
    field: "potencia",
  });
  assert.strictEqual(out.metric, "avg");
});

test("normalizeArgs acepta todas las métricas válidas", () => {
  for (const m of METRICS) {
    const out = normalizeArgs("aggregate_layer", {
      layer_id: "x",
      group_by: "y",
      metric: m,
      field: m === "count" ? undefined : "campo",
    });
    assert.strictEqual(out.metric, m);
  }
});

// ── distance_m + layer_id_targets (proximidad) ────────────────

test("normalizeArgs convierte layer_id_targets string a array", () => {
  const out = normalizeArgs("count_near_layer", {
    layer_id_source: "x",
    layer_id_targets: "y",
    distance_m: 500,
  });
  assert.deepStrictEqual(out.layer_id_targets, ["y"]);
});

test("normalizeArgs convierte layer_id_targets array a array de strings", () => {
  const out = normalizeArgs("count_near_layer", {
    layer_id_source: "x",
    layer_id_targets: [1, 2, 3],
    distance_m: 500,
  });
  assert.deepStrictEqual(out.layer_id_targets, ["1", "2", "3"]);
});

test("normalizeArgs convierte layer_id_targets ausente a array vacío", () => {
  const out = normalizeArgs("count_near_layer", {
    layer_id_source: "x",
    distance_m: 500,
  });
  assert.deepStrictEqual(out.layer_id_targets, []);
});

test("normalizeArgs asigna layer_id desde layer_id_source", () => {
  const out = normalizeArgs("count_near_layer", {
    layer_id_source: "plantas",
    layer_id_targets: ["rios"],
    distance_m: 500,
  });
  assert.strictEqual(out.layer_id, "plantas");
});

test("normalizeArgs acota distance_m inválido a 500 (default)", () => {
  const out = normalizeArgs("count_near_layer", {
    layer_id_source: "x",
    layer_id_targets: ["y"],
    distance_m: "lejos",
  });
  assert.strictEqual(out.distance_m, 500);
});

test("normalizeArgs acota distance_m negativo a 500", () => {
  const out = normalizeArgs("count_near_layer", {
    layer_id_source: "x",
    layer_id_targets: ["y"],
    distance_m: -100,
  });
  assert.strictEqual(out.distance_m, 500);
});

test("normalizeArgs preserva distance_m válido", () => {
  const out = normalizeArgs("count_near_layer", {
    layer_id_source: "x",
    layer_id_targets: ["y"],
    distance_m: 1500,
  });
  assert.strictEqual(out.distance_m, 1500);
});

test("normalizeArgs no toca distance_m en tools que no lo usan", () => {
  const out = normalizeArgs("query_layer", { layer_id: "x", distance_m: 123 });
  assert.strictEqual(out.distance_m, 123);
});

// ── Inmutabilidad del objeto original ──────────────────────────

test("normalizeArgs no muta el objeto original", () => {
  const original = { layer_id: 42, metric: "pifia" };
  const copy = { ...original };
  normalizeArgs("query_layer", original);
  assert.deepStrictEqual(original, copy);
});

// ── Combinaciones ─────────────────────────────────────────────

test("normalizeArgs coacciona todos los campos a la vez", () => {
  const out = normalizeArgs("aggregate_by_admin_and_column", {
    layer_id: 42,
    admin_level: "COMUNA",
    group_by: 7,
    metric: "SUM",
    field: 3,
    filters: null,
  });
  assert.strictEqual(out.layer_id, "42");
  assert.strictEqual(out.admin_level, "comuna");
  assert.strictEqual(out.group_by, "7");
  // "SUM" en mayúsculas no es válido → degrada a count
  assert.strictEqual(out.metric, "count");
  assert.strictEqual(out.field, "3");
  assert.deepStrictEqual(out.filters, {});
});

test("ADMIN_LEVELS contiene los 3 niveles esperados", () => {
  assert.ok(ADMIN_LEVELS.has("comuna"));
  assert.ok(ADMIN_LEVELS.has("provincia"));
  assert.ok(ADMIN_LEVELS.has("region"));
  assert.strictEqual(ADMIN_LEVELS.size, 3);
});

test("METRICS contiene las 5 métricas esperadas", () => {
  assert.ok(METRICS.has("count"));
  assert.ok(METRICS.has("avg"));
  assert.ok(METRICS.has("sum"));
  assert.ok(METRICS.has("min"));
  assert.ok(METRICS.has("max"));
  assert.strictEqual(METRICS.size, 5);
});