import test from "node:test";
import assert from "node:assert/strict";

import tool, {
  bboxPolygon,
  pointBufferPolygon,
} from "../get-wms-statistics.js";

test("bboxPolygon arma un polígono cerrado", () => {
  const poly = bboxPolygon([-70, -27, -69, -26]);
  assert.equal(poly.type, "Polygon");
  assert.deepEqual(poly.coordinates[0][0], [-70, -27]);
  assert.deepEqual(poly.coordinates[0].at(-1), [-70, -27]);
  assert.equal(poly.coordinates[0].length, 5);
});

test("pointBufferPolygon centra el buffer en el punto", () => {
  const { geometry, bbox } = pointBufferPolygon(-27, -70, 100);
  assert.equal(geometry.type, "Polygon");
  assert.equal(bbox.length, 4);
  assert.ok(bbox[0] < -70 && bbox[2] > -70);
  assert.ok(bbox[1] < -27 && bbox[3] > -27);
});

test("get_wms_statistics solo exige layer_id y acepta AOI alternativo", () => {
  const params = tool.schema.function.parameters;
  assert.deepEqual(params.required, ["layer_id"]);
  assert.ok(params.properties.geometry);
  assert.ok(params.properties.bbox);
  assert.ok(params.properties.lat);
  assert.ok(params.properties.thresholds);
});
