import test from "node:test";
import assert from "node:assert/strict";

import { buildEvidence } from "../evidence.js";

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
