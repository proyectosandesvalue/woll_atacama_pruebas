import test from "node:test";
import assert from "node:assert/strict";

import {
  WMS_LAYERS,
  getWmsLayer,
  buildWmsPromptBlock,
} from "../../wms-catalog.js";
import { toWebMercator } from "../get-wms-pixel.js";

test("el catálogo WMS incluye las 22 capas del visor", () => {
  assert.equal(WMS_LAYERS.length, 22);
  assert.ok(WMS_LAYERS.some((l) => l.layer_id === "copernicus_ndvi"));
  assert.ok(WMS_LAYERS.some((l) => l.layer_id === "wms_ide_minagri"));
});

test("Copernicus permite píxel y IDE solo metadatos", () => {
  const ndvi = getWmsLayer("copernicus_ndvi");
  const turismo = getWmsLayer("wms_ide_minagri");
  assert.equal(ndvi.pixel_query, true);
  assert.equal(ndvi.kind, "copernicus");
  assert.equal(turismo.pixel_query, false);
  assert.equal(turismo.kind, "wms");
});

test("el bloque de prompt menciona WMS y no usa tablas", () => {
  const block = buildWmsPromptBlock();
  assert.match(block, /CAPAS WMS\/SATELITALES/);
  assert.match(block, /copernicus_ndvi/);
  assert.match(block, /NO query_layer/);
});

test("toWebMercator convierte el origen y el antimeridiano", () => {
  const origin = toWebMercator(0, 0);
  assert.ok(Math.abs(origin.x) < 0.001);
  assert.ok(Math.abs(origin.y) < 0.001);
  const right = toWebMercator(0, 180);
  assert.ok(Math.abs(right.x - 20037508.342789244) < 0.001);
  assert.ok(Math.abs(right.y) < 0.001);
});
