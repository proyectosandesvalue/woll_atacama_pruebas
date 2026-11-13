import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checksum,
  flattenLayers,
  stableStringify,
  summarize,
} from "../config-snapshot.mjs";

const CONFIG = {
  agua: {
    capas: ["hidrografia", "humedales"],
    grupos: {
      base: { nombre: "Base", capas: ["hidrografia"] },
    },
    estilo: {
      hidrografia: {
        type: "line",
        nombrePersonalizado: "Hidrografía",
        source: { type: "postgis", tiles: { mode: "static" } },
      },
      humedales: { type: "polygon", nombrePersonalizado: "Humedales" },
    },
  },
  clima: {
    capas: ["estacion_temp_avg"],
    grupos: {
      estaciones: {
        nombre: "Estaciones",
        subgrupos: {
          vivo: { nombre: "En vivo", capas: ["estacion_temp_avg"] },
        },
      },
    },
    estilo: { estacion_temp_avg: { type: "point" } },
  },
};

test("stableStringify ordena claves para un checksum estable", () => {
  assert.equal(
    stableStringify({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } }),
    stableStringify({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 })
  );
  assert.equal(checksum({ a: 1, b: 2 }), checksum({ b: 2, a: 1 }));
});

test("flattenLayers separa master, grupo y subgrupo", () => {
  const rows = flattenLayers(CONFIG);
  const master = rows.filter((row) => row.scope === "master");
  const groups = rows.filter((row) => row.scope === "group");
  const subgroups = rows.filter((row) => row.scope === "subgroup");

  assert.deepEqual(
    master.map((row) => row.layer_key),
    ["hidrografia", "humedales", "estacion_temp_avg"]
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].group_key, "base");
  assert.equal(subgroups.length, 1);
  assert.equal(subgroups[0].group_key, "estaciones");
  assert.equal(subgroups[0].subgroup_key, "vivo");
});

test("flattenLayers conserva metadatos de la capa", () => {
  const rows = flattenLayers(CONFIG);
  const hidrografia = rows.find(
    (row) => row.layer_key === "hidrografia" && row.scope === "master"
  );
  assert.equal(hidrografia.nombre, "Hidrografía");
  assert.equal(hidrografia.tipo, "line");
  assert.equal(hidrografia.source_type, "postgis");
  assert.equal(hidrografia.has_tiles, true);
});

test("summarize cuenta dimensiones, capas maestras y filas", () => {
  const summary = summarize(CONFIG);
  assert.equal(summary.dimensions, 2);
  assert.equal(summary.layers, 3);
  assert.equal(summary.rows, 5);
  assert.equal(summary.checksum.length, 64);
});
