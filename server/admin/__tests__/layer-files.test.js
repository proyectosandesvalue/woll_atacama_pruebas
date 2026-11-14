import { test } from "node:test";
import assert from "node:assert/strict";

import {
  deleteLayerFile,
  layerFileInfo,
  layerFileRelative,
  saveGeoJsonStream,
  tileSlug,
  validateLayerKey,
} from "../layer-files.js";

const KEY = "test_layer_files";

async function upload(body) {
  return saveGeoJsonStream(
    (async function* () {
      yield Buffer.from(body);
    })(),
    KEY
  );
}

test("valida claves de capa seguras", () => {
  assert.equal(validateLayerKey("capa_1"), "capa_1");
  assert.throws(() => validateLayerKey("../capa"), /clave/i);
  assert.throws(() => validateLayerKey("Capa"), /clave/i);
  assert.throws(() => validateLayerKey("capa-1"), /clave/i);
});

test("guarda un GeoJSON y detecta el tipo", async () => {
  const collection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { NOMBRE: "A" },
        geometry: {
          type: "Polygon",
          coordinates: [[[-70, -27], [-69, -27], [-69, -26], [-70, -26], [-70, -27]]],
        },
      },
    ],
  };
  try {
    const saved = await upload(JSON.stringify(collection));
    assert.equal(saved.file, layerFileRelative(KEY));
    assert.equal(saved.features, 1);
    assert.equal(saved.type, "polygon");
    const info = await layerFileInfo(KEY);
    assert.equal(info.exists, true);
    assert.ok(info.bytes > 0);
  } finally {
    await deleteLayerFile(KEY);
  }
});

test("rechaza JSON inválido, colecciones vacías y claves con path", async () => {
  await assert.rejects(upload("{no-json"), /JSON válido/);
  await assert.rejects(
    upload(JSON.stringify({ type: "FeatureCollection", features: [] })),
    /features con geometría/
  );
  await assert.rejects(
    upload(JSON.stringify({ type: "Feature", properties: {} })),
    /FeatureCollection/
  );
});

test("tileSlug normaliza tildes y espacios", () => {
  assert.equal(tileSlug("Capa Ñandú"), "capa_nandu");
  assert.equal(tileSlug("a/b"), "a_b");
});
