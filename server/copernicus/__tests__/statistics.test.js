import test from "node:test";
import assert from "node:assert/strict";

import {
  INDEX_SPECS,
  buildStatisticsBody,
  getStatistics,
  normalizeStatisticsResponse,
  _resetTokenCache,
} from "../statistics.js";

const GEOMETRY = {
  type: "Polygon",
  coordinates: [
    [
      [-70, -27],
      [-69, -27],
      [-69, -26],
      [-70, -26],
      [-70, -27],
    ],
  ],
};

test("el catálogo de estadísticas cubre los índices con fórmula", () => {
  assert.ok(Object.keys(INDEX_SPECS).length >= 15);
  assert.ok(INDEX_SPECS.copernicus_ndvi);
  assert.ok(INDEX_SPECS.copernicus_ndwi);
  assert.ok(INDEX_SPECS.copernicus_moisture_index);
});

test("buildStatisticsBody arma un request NDVI válido", () => {
  const body = buildStatisticsBody({
    layerId: "copernicus_ndvi",
    geometry: GEOMETRY,
    from: "2025-01-01",
    to: "2025-03-31",
    maxcc: 20,
  });
  assert.equal(body.input.data[0].type, "sentinel-2-l2a");
  assert.equal(body.input.data[0].dataFilter.maxCloudCoverage, 20);
  assert.equal(body.aggregation.aggregationInterval.of, "P1M");
  assert.match(body.aggregation.evalscript, /B08 - s\.B04/);
  assert.equal(body.input.bounds.properties.crs.includes("EPSG/0/4326"), true);
});

test("buildStatisticsBody rechaza índices sin fórmula", () => {
  assert.throws(
    () =>
      buildStatisticsBody({
        layerId: "copernicus_true_color_s2l2a",
        geometry: GEOMETRY,
        from: "2025-01-01",
        to: "2025-03-31",
      }),
    /sin estadística numérica/
  );
});

test("normalizeStatisticsResponse calcula media ponderada y extremos", () => {
  const out = normalizeStatisticsResponse({
    data: [
      {
        interval: { from: "2025-01-01", to: "2025-01-31" },
        outputs: {
          index: {
            bands: {
              B0: {
                stats: {
                  mean: 0.4,
                  min: 0.2,
                  max: 0.6,
                  stDev: 0.1,
                  sampleCount: 100,
                  noDataCount: 0,
                },
              },
            },
          },
        },
      },
      {
        interval: { from: "2025-02-01", to: "2025-02-28" },
        outputs: {
          index: {
            bands: {
              B0: {
                stats: {
                  mean: 0.6,
                  min: 0.3,
                  max: 0.8,
                  stDev: 0.1,
                  sampleCount: 300,
                  noDataCount: 0,
                },
              },
            },
          },
        },
      },
    ],
  });
  assert.equal(out.series.length, 2);
  assert.equal(out.mean, 0.55);
  assert.equal(out.min, 0.2);
  assert.equal(out.max, 0.8);
  assert.equal(out.sampleCount, 400);
});

test("getStatistics pide token y consulta Statistical API", async () => {
  _resetTokenCache();
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url: String(url), opts });
    if (String(url).includes("protocol/openid-connect/token")) {
      return {
        ok: true,
        json: async () => ({ access_token: "token-123", expires_in: 3600 }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        data: [
          {
            interval: { from: "2025-01-01", to: "2025-01-31" },
            outputs: {
              index: {
                bands: {
                  B0: {
                    stats: {
                      mean: 0.5,
                      min: 0.1,
                      max: 0.9,
                      stDev: 0.2,
                      sampleCount: 10,
                      noDataCount: 0,
                    },
                  },
                },
              },
            },
          },
        ],
      }),
    };
  };

  const out = await getStatistics({
    layerId: "copernicus_ndvi",
    geometry: GEOMETRY,
    from: "2025-01-01",
    to: "2025-01-31",
    env: {
      COPERNICUS_CLIENT_ID: "client",
      COPERNICUS_CLIENT_SECRET: "secret",
    },
    fetchImpl,
    now: 1000,
  });

  assert.equal(out.mean, 0.5);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /identity\.dataspace\.copernicus\.eu/);
  assert.match(calls[1].url, /api\/v1\/statistics/);
  assert.equal(calls[1].opts.headers.Authorization, "Bearer token-123");
  assert.match(calls[1].opts.body, /sentinel-2-l2a/);
});
