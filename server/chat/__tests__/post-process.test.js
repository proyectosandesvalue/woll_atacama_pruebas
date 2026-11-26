import test from "node:test";
import assert from "node:assert/strict";

import { collectTraceLayerIds } from "../post-process.js";

test("collectTraceLayerIds recupera todas las capas de la traza sin duplicados", () => {
  const ids = collectTraceLayerIds({
    trace: [
      {
        ok: true,
        tool: "aggregate_by_admin",
        args: { layer_id: "humedales" },
      },
      {
        ok: true,
        tool: "aggregate_by_admin",
        args: { layer_id: "lagunas_embalses" },
      },
      {
        ok: true,
        tool: "count_near_layer",
        args: {
          layer_id_source: "humedales",
          layer_id_targets: ["lagunas_embalses", "salares"],
        },
      },
      {
        ok: false,
        tool: "query_layer",
        args: { layer_id: "no_debe_incluirse" },
      },
    ],
  });

  assert.deepEqual(ids, ["humedales", "lagunas_embalses", "salares"]);
});

test("collectTraceLayerIds acepta targets separados por coma", () => {
  const ids = collectTraceLayerIds({
    trace: [
      {
        ok: true,
        tool: "count_near_layer",
        args: { layer_id_targets: " humedales, lagunas_embalses , " },
      },
    ],
  });

  assert.deepEqual(ids, ["humedales", "lagunas_embalses"]);
});

test("collectTraceLayerIds tolera trazas vacías o argumentos inválidos", () => {
  assert.deepEqual(collectTraceLayerIds(null), []);
  assert.deepEqual(collectTraceLayerIds({ trace: [] }), []);
  assert.deepEqual(
    collectTraceLayerIds({ trace: [{ ok: true, args: "no-es-objeto" }] }),
    []
  );
});
