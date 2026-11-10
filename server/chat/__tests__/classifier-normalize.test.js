import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeClassifierResult } from "../domain-classifier.js";

function base(overrides = {}) {
  return {
    domain: "IN",
    intent: "dato_simple",
    pipeline: "proximidad_conteo",
    slots: {
      layer_id_source: "derechos_agua_2025",
      layer_id_targets: "hidrografia",
      distance_m: 1000,
    },
    confidence: 0.9,
    ...overrides,
  };
}

test("convierte layer_id_targets string a array", () => {
  const result = normalizeClassifierResult(base());

  assert.deepEqual(result.slots.layer_id_targets, ["hidrografia"]);
});

test("mantiene layer_id_targets como array", () => {
  const result = normalizeClassifierResult(
    base({
      slots: {
        layer_id_source: "derechos_agua_2025",
        layer_id_targets: ["hidrografia", "agua_superficial"],
        distance_m: 1000,
      },
    })
  );

  assert.deepEqual(result.slots.layer_id_targets, [
    "hidrografia",
    "agua_superficial",
  ]);
});

test("deja null si no hay targets", () => {
  const result = normalizeClassifierResult(
    base({
      slots: { layer_id_source: "derechos_agua_2025", distance_m: 1000 },
    })
  );

  assert.equal(result.slots.layer_id_targets, null);
});
