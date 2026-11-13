import { test } from "node:test";
import assert from "node:assert/strict";

import { getBbox } from "../../js/utils/geoUtils.js";

test("getBbox calcula una FeatureCollection", () => {
  const bbox = getBbox({
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: { type: "Point", coordinates: [-70, -27] } },
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [[[-71, -28], [-69, -28], [-69, -26], [-71, -26], [-71, -28]]],
        },
      },
    ],
  });
  assert.deepEqual(bbox, [-71, -28, -69, -26]);
});

test("getBbox soporta MultiPolygon y GeometryCollection", () => {
  const bbox = getBbox({
    type: "Feature",
    geometry: {
      type: "GeometryCollection",
      geometries: [
        { type: "MultiPoint", coordinates: [[1, 2], [3, 4]] },
        { type: "LineString", coordinates: [[-1, 0], [5, -2]] },
      ],
    },
  });
  assert.deepEqual(bbox, [-1, -2, 5, 4]);
});

test("getBbox devuelve null si no hay coordenadas", () => {
  assert.equal(getBbox(null), null);
  assert.equal(getBbox({ type: "Feature", geometry: null }), null);
  assert.equal(
    getBbox({ type: "FeatureCollection", features: [] }),
    null
  );
});
