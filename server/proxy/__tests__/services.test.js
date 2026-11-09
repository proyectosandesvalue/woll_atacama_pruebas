import { test } from "node:test";
import assert from "node:assert/strict";

import { prepareUpstream, normalizeQuery } from "../services.js";

const env = { INSTANCE_ID: "test-instance" };

test("normaliza claves a mayúsculas y descarta source/_", () => {
  const query = normalizeQuery({ source: "x", LAYERS: "A", layers: "B", _: "1", WIDTH: 10 });
  assert.equal(query.SOURCE, undefined);
  assert.equal(query._ , undefined);
  assert.equal(query.LAYERS, "B"); // la última clave con la misma forma gana
  assert.equal(query.WIDTH, "10");
});

test("WMS construye la URL con INSTANCE_ID y solo params permitidos", () => {
  const { url, params } = prepareUpstream("copernicus-wms", env, {
    source: "copernicus-wms",
    SERVICE: "WMS",
    REQUEST: "GetMap",
    LAYERS: "NDVI",
    BBOX: "-27.5,-70.4,-27.3,-70.2",
    WIDTH: "256",
    HEIGHT: "256",
    URL: "https://evil.example",
  });

  assert.equal(url.origin + url.pathname, "https://sh.dataspace.copernicus.eu/ogc/wms/test-instance");
  assert.equal(url.searchParams.get("LAYERS"), "NDVI");
  assert.equal(url.searchParams.get("WIDTH"), "256");
  assert.equal(url.searchParams.get("CRS"), "EPSG:3857");
  assert.equal(url.searchParams.has("URL"), false);
  assert.equal(url.searchParams.has("source"), false);
  assert.equal(params.VERSION, "1.3.0");
});

test("WFS usa DSS2 y application/json por defecto", () => {
  const { url } = prepareUpstream("copernicus-wfs", env, {
    source: "copernicus-wfs",
    REQUEST: "GetFeature",
    TYPENAMES: "DSS2",
    BBOX: "-27.5,-70.4,-27.3,-70.2",
    TIME: "2026-01-01/2026-03-01",
  });

  assert.equal(url.origin + url.pathname, "https://sh.dataspace.copernicus.eu/ogc/wfs/test-instance");
  assert.equal(url.searchParams.get("TYPENAMES"), "DSS2");
  assert.equal(url.searchParams.get("OUTPUTFORMAT"), "application/json");
});

test("WMTS construye GetTile con TILEMATRIX", () => {
  const { url } = prepareUpstream("copernicus-wmts", env, {
    source: "copernicus-wmts",
    REQUEST: "GetTile",
    LAYER: "TRUE-COLOR-S2L2A",
    TILEMATRIXSET: "PopularWebMercator512",
    TILEMATRIX: "10",
    TILEROW: "100",
    TILECOL: "200",
  });

  assert.equal(url.origin + url.pathname, "https://sh.dataspace.copernicus.eu/ogc/wmts/test-instance");
  assert.equal(url.searchParams.get("TILEMATRIX"), "10");
  assert.equal(url.searchParams.get("FORMAT"), "image/png");
});

test("Worldview construye la URL de snapshot", () => {
  const { url } = prepareUpstream("worldview-snapshot", {}, {
    source: "worldview-snapshot",
    LAYERS: "MODIS_Terra_CorrectedReflectance_TrueColor",
    BBOX: "-29,-71,-26,-68",
    WIDTH: "512",
    HEIGHT: "512",
    TIME: "2026-02-26",
  });

  assert.equal(url.origin + url.pathname, "https://wvs.earthdata.nasa.gov/api/v1/snapshot");
  assert.equal(url.searchParams.get("REQUEST"), "GetSnapshot");
  assert.equal(url.searchParams.get("FORMAT"), "image/jpeg");
  assert.equal(url.searchParams.get("TIME"), "2026-02-26");
});

test("sin INSTANCE_ID falla con 503 y no expone nada", () => {
  assert.throws(
    () =>
      prepareUpstream("copernicus-wms", {}, {
        source: "copernicus-wms",
        REQUEST: "GetCapabilities",
      }),
    (err) => {
      assert.equal(err.code, "MISSING_INSTANCE_ID");
      assert.equal(err.status, 503);
      return true;
    }
  );
});

test("un source desconocido se rechaza", () => {
  assert.throws(
    () => prepareUpstream("open-proxy", env, { source: "open-proxy" }),
    (err) => {
      assert.equal(err.code, "UNKNOWN_SOURCE");
      assert.equal(err.status, 400);
      return true;
    }
  );
});

test("un source ausente se rechaza", () => {
  assert.throws(
    () => prepareUpstream(undefined, env, {}),
    (err) => {
      assert.equal(err.code, "MISSING_SOURCE");
      return true;
    }
  );
});

test("no permite claves heredadas de Object", () => {
  for (const source of ["__proto__", "constructor", "toString"]) {
    assert.throws(
      () => prepareUpstream(source, env, { source }),
      (err) => {
        assert.equal(err.code, "UNKNOWN_SOURCE");
        return true;
      }
    );
  }
});
