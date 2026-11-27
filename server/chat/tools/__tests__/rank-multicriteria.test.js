import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeCriterion,
  computeRanking,
} from "../rank-multicriteria.js";

test("normalizeCriterion respeta dirección y empate", () => {
  assert.equal(normalizeCriterion(10, 0, 10, "desc"), 1);
  assert.equal(normalizeCriterion(0, 0, 10, "desc"), 0);
  assert.equal(normalizeCriterion(0, 0, 10, "asc"), 1);
  assert.equal(normalizeCriterion(5, 5, 5, "desc"), 0.5);
});

test("computeRanking pondera dos criterios y ordena", () => {
  const out = computeRanking(
    [
      {
        layer_id: "agua",
        field: "caudal",
        metric: "sum",
        direction: "desc",
        weight: 2,
        data: [
          { group: "Copiapó", value: 100 },
          { group: "Vallenar", value: 50 },
        ],
      },
      {
        layer_id: "clima",
        field: "dias_calor",
        metric: "sum",
        direction: "asc",
        weight: 1,
        data: [
          { group: "Copiapó", value: 30 },
          { group: "Vallenar", value: 10 },
        ],
      },
    ],
    "comuna"
  );

  assert.equal(out.ranking.length, 2);
  assert.equal(out.ranking[0].alternative, "Copiapó");
  assert.equal(out.ranking[0].rank, 1);
  assert.equal(out.weights[0].weight, 0.6667);
  assert.equal(out.weights[1].weight, 0.3333);
  assert.ok(out.ranking[0].score > out.ranking[1].score);
});

test("computeRanking exige pesos positivos", () => {
  assert.throws(
    () =>
      computeRanking(
        [
          {
            layer_id: "a",
            field: null,
            metric: "count",
            direction: "desc",
            weight: 0,
            data: [{ group: "X", value: 1 }],
          },
        ],
        "comuna"
      ),
    /pesos/
  );
});
