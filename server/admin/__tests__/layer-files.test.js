import { test } from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";

import {
  deleteLayerFile,
  layerFileInfo,
  layerFileRelative,
  layerZipInfo,
  layerZipPath,
  layerZipRelative,
  saveGeoJsonStream,
  saveZipStream,
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

test("guarda un ZIP de Shapefile en la carpeta privada", async () => {
  const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(32, 1)]);
  try {
    const saved = await saveZipStream(
      (async function* () {
        yield zip;
      })(),
      KEY
    );
    assert.equal(saved.file, layerZipRelative(KEY));
    assert.equal(saved.format, "shapefile");
    assert.equal(saved.bytes, zip.length);
    const info = await layerZipInfo(KEY);
    assert.equal(info.exists, true);
    assert.equal(info.file, layerZipRelative(KEY));
  } finally {
    await rm(layerZipPath(KEY), { force: true });
  }
});

test("rechaza ZIP vacío, firma inválida y exceso de tamaño", async () => {
  await assert.rejects(
    saveZipStream(
      (async function* () {
        yield Buffer.alloc(0);
      })(),
      KEY
    ),
    /vacío/
  );
  await assert.rejects(
    saveZipStream(
      (async function* () {
        yield Buffer.from("no es un zip");
      })(),
      KEY
    ),
    /ZIP válido/
  );
  await assert.rejects(
    saveZipStream(
      (async function* () {
        yield Buffer.concat([
          Buffer.from([0x50, 0x4b, 0x03, 0x04]),
          Buffer.alloc(64, 1),
        ]);
      })(),
      KEY,
      { maxBytes: 10 }
    ),
    /límite/
  );
});

test("tileSlug normaliza tildes y espacios", () => {
  assert.equal(tileSlug("Capa Ñandú"), "capa_nandu");
  assert.equal(tileSlug("a/b"), "a_b");
});
