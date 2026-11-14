import { test } from "node:test";
import assert from "node:assert/strict";

import { buildTaxonomy } from "../taxonomy-seed.mjs";
import { compileConfigFromRows } from "../taxonomy-compile.mjs";

const CONFIG = {
  agua: {
    capas: ["hidrografia", "humedales"],
    cargaInicial: { grupos: ["base"], capas: ["humedales"] },
    grupos: {
      base: {
        nombre: "Base",
        capas: ["hidrografia"],
        subgrupos: {
          detalle: { nombre: "Detalle", capas: ["humedales"] },
        },
      },
    },
    estilo: {
      hidrografia: { type: "line", nombrePersonalizado: "Hidrografía" },
      humedales: { type: "polygon", nombrePersonalizado: "Humedales" },
    },
    leyenda: { visible: true },
  },
  clima: {
    capas: ["estacion_temp_avg"],
    grupos: {},
    estilo: { estacion_temp_avg: { type: "point" } },
  },
};

function rowsFromTaxonomy(taxonomy) {
  const dimensionIds = new Map(taxonomy.dimensions.map((item, index) => [item.key, index + 1]));
  const groupIds = new Map(
    taxonomy.groups.map((item, index) => [`${item.dimension_key}\0${item.key}`, index + 1])
  );
  const subgroupIds = new Map(
    taxonomy.subgroups.map((item, index) => [
      `${item.dimension_key}\0${item.group_key}\0${item.key}`,
      index + 1,
    ])
  );
  const layerIds = new Map(taxonomy.layers.map((item, index) => [item.layer_key, index + 1]));

  return {
    dimensions: taxonomy.dimensions.map((item) => ({ ...item, id: dimensionIds.get(item.key) })),
    groups: taxonomy.groups.map((item) => ({
      ...item,
      id: groupIds.get(`${item.dimension_key}\0${item.key}`),
    })),
    subgroups: taxonomy.subgroups.map((item) => ({
      ...item,
      id: subgroupIds.get(`${item.dimension_key}\0${item.group_key}\0${item.key}`),
    })),
    layers: taxonomy.layers.map((item) => ({ ...item, id: layerIds.get(item.layer_key) })),
    placements: taxonomy.placements.map((item, index) => ({
      ...item,
      id: index + 1,
      layer_id: layerIds.get(item.layer_key),
    })),
    initial: taxonomy.initial.map((item, index) => ({
      ...item,
      id: index + 1,
      layer_id: item.layer_key ? layerIds.get(item.layer_key) : null,
      group_id: item.group_key ? groupIds.get(`${item.dimension_key}\0${item.group_key}`) : null,
    })),
  };
}

test("buildTaxonomy conserva dimensiones, grupos, subgrupos y asignaciones", () => {
  const taxonomy = buildTaxonomy(CONFIG);
  assert.equal(taxonomy.dimensions.length, 2);
  assert.equal(taxonomy.groups.length, 1);
  assert.equal(taxonomy.subgroups.length, 1);
  assert.equal(taxonomy.layers.length, 3);
  assert.equal(taxonomy.placements.length, 5);
  assert.equal(taxonomy.initial.length, 2);
});

test("compileConfigFromRows reconstruye la config original", () => {
  const taxonomy = buildTaxonomy(CONFIG);
  const rows = rowsFromTaxonomy(taxonomy);
  const { config, warnings } = compileConfigFromRows(rows);
  assert.deepEqual(config, CONFIG);
  assert.deepEqual(warnings, []);
});
