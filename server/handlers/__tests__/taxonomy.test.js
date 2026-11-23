import { test } from "node:test";
import assert from "node:assert/strict";

import { handleTaxonomy } from "../taxonomy.js";

const ENV = { TAXONOMY_API_ENABLED: "1" };

function fakeDB({ layerConfig = { url: "hidrografia.geojson", type: "line" } } = {}) {
  return {
    query: async (sql) => {
      if (sql.includes("FROM admin.dimensions")) {
        return [{ id: 1, key: "agua", nombre: "Agua", icono: "water_drop", extra: {}, orden: 0 }];
      }
      if (sql.includes("FROM admin.groups")) return [];
      if (sql.includes("FROM admin.subgroups")) return [];
      if (sql.includes("FROM admin.layers")) {
        return [
          {
            id: 1,
            layer_key: "hidrografia",
            nombre: "Hidrografía",
            tipo: "line",
            source_type: "postgis",
            has_tiles: true,
            config: layerConfig,
          },
        ];
      }
      if (sql.includes("FROM admin.layer_placements")) {
        return [
          {
            id: 1,
            scope: "master",
            config: null,
            orden: 0,
            layer_id: 1,
            layer_key: "hidrografia",
            dimension_key: "agua",
            group_key: null,
            subgroup_key: null,
          },
        ];
      }
      if (sql.includes("FROM admin.dimension_initial_items")) return [];
      return [];
    },
  };
}

function ctx(overrides = {}) {
  return {
    env: ENV,
    req: { headers: {} },
    ...overrides,
  };
}

test("taxonomy devuelve 404 si el flag está apagado", async () => {
  const result = await handleTaxonomy(ctx({ env: {} }), {
    getDB: async () => fakeDB(),
  });
  assert.equal(result.status, 404);
});

test("taxonomy compila las tablas y devuelve la config", async () => {
  const result = await handleTaxonomy(ctx(), {
    getDB: async () => fakeDB(),
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.source, "taxonomy");
  assert.ok(result.body.checksum);
  assert.ok(result.headers.ETag);
  assert.equal(result.body.config.agua.nombre, "Agua");
  assert.deepEqual(result.body.config.agua.capas, ["hidrografia"]);
  assert.equal(result.body.config.agua.estilo.hidrografia.type, "line");
});

test("taxonomy responde 304 con el mismo ETag", async () => {
  const first = await handleTaxonomy(ctx(), { getDB: async () => fakeDB() });
  const second = await handleTaxonomy(
    ctx({ req: { headers: { "if-none-match": first.headers.ETag } } }),
    { getDB: async () => fakeDB() }
  );
  assert.equal(second.status, 304);
});

test("taxonomy responde 503 si la config compilada es inválida", async () => {
  const result = await handleTaxonomy(ctx(), {
    getDB: async () => fakeDB({ layerConfig: {} }),
  });
  assert.equal(result.status, 503);
});

test("taxonomy responde 503 si la BD falla", async () => {
  const result = await handleTaxonomy(ctx(), {
    getDB: async () => ({
      query: async () => {
        throw new Error("db down");
      },
    }),
  });
  assert.equal(result.status, 503);
});
