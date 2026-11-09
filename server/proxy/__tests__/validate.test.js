import { test } from "node:test";
import assert from "node:assert/strict";

import { validateRequest } from "../validate.js";

const wmsBase = {
  SERVICE: "WMS",
  VERSION: "1.3.0",
  REQUEST: "GetMap",
  LAYERS: "NDVI",
  BBOX: "-27.5,-70.4,-27.3,-70.2",
  WIDTH: "256",
  HEIGHT: "256",
  FORMAT: "image/png",
};

test("WMS GetMap válido pasa y agrega CRS por defecto", () => {
  const params = { ...wmsBase };
  assert.doesNotThrow(() => validateRequest("wms", params));
  assert.equal(params.CRS, "EPSG:3857");
});

test("WMS 1.1.1 usa SRS por defecto", () => {
  const params = { ...wmsBase, VERSION: "1.1.1" };
  validateRequest("wms", params);
  assert.equal(params.SRS, "EPSG:3857");
});

test("WMS GetMap exige capas, bbox y dimensiones", () => {
  assert.throws(() => validateRequest("wms", { REQUEST: "GetMap" }), {
    code: "MISSING_PARAM",
  });
  assert.throws(
    () => validateRequest("wms", { ...wmsBase, BBOX: "1,2,3" }),
    { code: "INVALID_BBOX" }
  );
  assert.throws(
    () => validateRequest("wms", { ...wmsBase, WIDTH: "5000" }),
    { code: "INVALID_PARAM" }
  );
});

test("WMS GetFeatureInfo exige I/J y un INFO_FORMAT seguro", () => {
  const base = { ...wmsBase, REQUEST: "GetFeatureInfo", QUERY_LAYERS: "NDVI" };

  assert.throws(() => validateRequest("wms", base), { code: "MISSING_PARAM" });
  assert.throws(
    () => validateRequest("wms", { ...base, I: "0", J: "0", INFO_FORMAT: "text/html" }),
    { code: "INVALID_FORMAT" }
  );
  assert.doesNotThrow(() =>
    validateRequest("wms", { ...base, I: "0", J: "0", INFO_FORMAT: "application/json" })
  );
});

test("WMS rechaza un REQUEST no soportado", () => {
  assert.throws(() => validateRequest("wms", { ...wmsBase, REQUEST: "GetTile" }), {
    code: "UNSUPPORTED_REQUEST",
  });
});

test("WFS GetFeature valida MAXFEATURES y formato", () => {
  const base = {
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAMES: "DSS2",
    BBOX: "-27.5,-70.4,-27.3,-70.2",
    TIME: "2026-01-01/2026-03-01",
  };

  assert.doesNotThrow(() => validateRequest("wfs", { ...base }));
  assert.throws(() => validateRequest("wfs", { ...base, MAXFEATURES: "101" }), {
    code: "INVALID_PARAM",
  });
  assert.throws(
    () => validateRequest("wfs", { ...base, OUTPUTFORMAT: "text/html" }),
    { code: "INVALID_FORMAT" }
  );
});

test("WMTS GetTile exige la matriz y los índices", () => {
  const base = {
    SERVICE: "WMTS",
    VERSION: "1.0.0",
    REQUEST: "GetTile",
    LAYER: "TRUE-COLOR-S2L2A",
    TILEMATRIXSET: "PopularWebMercator512",
    TILEMATRIX: "10",
    TILEROW: "100",
    TILECOL: "200",
  };

  assert.doesNotThrow(() => validateRequest("wmts", { ...base }));
  assert.throws(() => validateRequest("wmts", { ...base, TILEMATRIX: "31" }), {
    code: "INVALID_PARAM",
  });
});

test("Worldview exige fecha simple y formatos de imagen", () => {
  const base = {
    REQUEST: "GetSnapshot",
    LAYERS: "MODIS_Terra_CorrectedReflectance_TrueColor",
    BBOX: "-29,-71,-26,-68",
    WIDTH: "512",
    HEIGHT: "512",
    TIME: "2026-02-26",
  };

  assert.doesNotThrow(() => validateRequest("worldview", { ...base }));
  assert.throws(
    () => validateRequest("worldview", { ...base, TIME: "2026-01-01/2026-03-01" }),
    { code: "INVALID_TIME" }
  );
  assert.throws(
    () => validateRequest("worldview", { ...base, FORMAT: "text/html" }),
    { code: "INVALID_FORMAT" }
  );
});

test("rechaza caracteres de control en capas", () => {
  assert.throws(
    () => validateRequest("wms", { ...wmsBase, LAYERS: "NDVI\u0000" }),
    { code: "INVALID_PARAM" }
  );
});
