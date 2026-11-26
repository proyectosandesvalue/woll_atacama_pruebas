import test from "node:test";
import assert from "node:assert/strict";

import { sendMessage } from "../../js/utils/chatAssistant.js";

test("sendMessage conserva todas las capas de geojson_layers", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      reply: "ok",
      geojson_layers: [
        {
          layer_id: "humedales",
          geojson: { type: "FeatureCollection", features: [] },
        },
        {
          layer_id: "lagunas_embalses",
          geojson: { type: "FeatureCollection", features: [] },
        },
      ],
      geojson: { type: "FeatureCollection", features: [] },
      geojson_meta: { layer_ids: ["humedales", "lagunas_embalses"] },
    }),
  });

  try {
    const payload = await sendMessage("prueba", []);
    assert.equal(payload.geojson_layers.length, 2);
    assert.equal(payload.geojson_layers[1].layer_id, "lagunas_embalses");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sendMessage devuelve geojson_layers vacío si el backend no lo envía", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      reply: "ok",
      geojson: null,
      geojson_meta: null,
    }),
  });

  try {
    const payload = await sendMessage("prueba", []);
    assert.deepEqual(payload.geojson_layers, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
