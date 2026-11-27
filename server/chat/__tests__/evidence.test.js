import test from "node:test";
import assert from "node:assert/strict";

import { buildEvidence, compact } from "../evidence.js";

test("buildEvidence agrega citas documentales deduplicadas", async () => {
  const passage = {
    document_slug: "catastro-fruticola-atacama-2024",
    title: "Catastro Frutícola 2024",
    publisher: "ODEPA / CIREN",
    published_at: "2024-09-01",
    source_url: "https://example.cl/doc.pdf",
    page_start: 8,
    page_end: 8,
    section: "ANTECEDENTES",
  };
  const ctx = {
    trace: [],
    documentPassages: [passage, { ...passage }, { ...passage, page_start: 9, page_end: 9 }],
  };

  const out = await buildEvidence(ctx, "metodología del catastro", []);
  assert.equal(out.citations.length, 2);
  assert.ok(out.citations.every((c) => c.type === "document"));
  assert.equal(out.citations[0].document_slug, "catastro-fruticola-atacama-2024");
  assert.equal(out.citations[0].page_start, 8);
  assert.equal(out.citations[1].page_start, 9);
});

test("buildEvidence mantiene citas de capas y las marca como layer", async () => {
  const ctx = {
    trace: [
      {
        tool: "aggregate_by_admin",
        args: { layer_id: "catastro_especies_frutales" },
        ok: true,
      },
    ],
    documentPassages: [],
  };

  const out = await buildEvidence(ctx, "cuántas hectáreas por comuna", [
    { layer_id: "catastro_especies_frutales", display_name: "Catastro frutícola" },
  ]);
  const layer = out.citations.find((c) => c.type === "layer");
  assert.ok(layer);
  assert.equal(layer.layer_id, "catastro_especies_frutales");
  assert.equal(layer.label, "Catastro frutícola");
});

test("buildEvidence sin trace devuelve vacío", async () => {
  const out = await buildEvidence(null, "pregunta", []);
  assert.deepEqual(out.citations, []);
});

test("buildEvidence extrae layer_ids de tools multi-capa", async () => {
  const ctx = {
    trace: [
      {
        tool: "compare_layers",
        args: { layer_ids: ["glaciares", "humedales"] },
        ok: true,
      },
      {
        tool: "rank_multicriteria",
        args: {
          criteria: [{ layer_id: "glaciares" }, { layer_id: "humedales" }],
        },
        ok: true,
      },
      {
        tool: "spatial_overlay",
        args: {
          layer_id_source: "glaciares",
          layer_id_targets: ["sistema_areas_protegidas"],
        },
        ok: true,
      },
      {
        tool: "nearest_distance",
        args: {
          layer_id_source: "comunas_poligonos",
          layer_id_targets: ["plantas_desaladoras_puntos"],
        },
        ok: true,
      },
      {
        tool: "get_wms_layer_info",
        args: { layer_id: "copernicus_ndvi" },
        ok: true,
      },
    ],
    documentPassages: [],
  };

  const out = await buildEvidence(ctx, "compara y calcula distancias", [
    { layer_id: "glaciares", display_name: "Glaciares" },
    { layer_id: "humedales", display_name: "Humedales" },
  ]);
  const ids = new Set(
    out.citations.filter((c) => c.type === "layer").map((c) => c.layer_id)
  );
  for (const id of [
    "glaciares",
    "humedales",
    "sistema_areas_protegidas",
    "comunas_poligonos",
    "plantas_desaladoras_puntos",
    "copernicus_ndvi",
  ]) {
    assert.ok(ids.has(id), `falta cita de ${id}`);
  }
});

test("buildEvidence agrega cita climate para series históricas", async () => {
  const ctx = {
    trace: [
      {
        tool: "get_historical_series",
        args: { codigo: "03414002", indicator: "temp_media_diaria" },
        ok: true,
      },
    ],
    documentPassages: [],
  };
  const out = await buildEvidence(ctx, "serie histórica", []);
  const climate = out.citations.find((c) => c.type === "climate");
  assert.ok(climate);
  assert.equal(climate.station, "03414002");
  assert.equal(climate.indicator, "temp_media_diaria");
});

test("compact trunca series, comparaciones, rankings y fechas WMS", () => {
  const ctx = { raw: new Map() };

  const history = compact(
    "get_historical_series",
    {
      ok: true,
      result: {
        values: Array.from({ length: 5000 }, (_, i) => ({ fecha: i, valor: i })),
      },
    },
    ctx
  );
  assert.equal(history.values.length, 40);
  assert.match(history._hint, /truncada/);

  const compare = compact(
    "compare_layers",
    {
      ok: true,
      result: { layers: [{ data: Array.from({ length: 100 }, (_, i) => i) }] },
    },
    ctx
  );
  assert.equal(compare.layers[0].data.length, 40);

  const rank = compact(
    "rank_multicriteria",
    {
      ok: true,
      result: {
        ranking: Array.from({ length: 30 }, (_, i) => ({
          rank: i + 1,
          contributions: [{ value: i }],
        })),
      },
    },
    ctx
  );
  assert.equal(rank.ranking.length, 20);
  assert.equal(rank.ranking[5].contributions, undefined);

  const dates = compact(
    "get_wms_available_dates",
    {
      ok: true,
      result: { dates: Array.from({ length: 100 }, (_, i) => `2026-01-${i}`) },
    },
    ctx
  );
  assert.equal(dates.dates.length, 30);
  assert.equal(dates.total, 100);
});
