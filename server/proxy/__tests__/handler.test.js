import { test } from "node:test";
import assert from "node:assert/strict";

import { handleProxy } from "../handler.js";
import { clearCache } from "../cache.js";
import { _resetProxyRateLimiter } from "../rate-limiter.js";

const env = {
  INSTANCE_ID: "test-instance",
  PROXY_RATE_LIMIT_PER_MIN: "1000",
  PROXY_RATE_LIMIT_BURST: "1000",
  PROXY_TIMEOUT_MS: "1000",
};

const wmsQuery = {
  source: "copernicus-wms",
  REQUEST: "GetMap",
  LAYERS: "NDVI",
  BBOX: "-27.5,-70.4,-27.3,-70.2",
  WIDTH: "256",
  HEIGHT: "256",
};

function response({ status = 200, contentType = "image/png", body = "img", headers = {} } = {}) {
  const map = new Map(
    Object.entries({ "content-type": contentType, ...headers }).map(([k, v]) => [
      k.toLowerCase(),
      String(v),
    ])
  );

  return {
    status,
    headers: { get: (name) => map.get(String(name).toLowerCase()) ?? null },
    arrayBuffer: async () => Buffer.from(body),
  };
}

function setup() {
  clearCache();
  _resetProxyRateLimiter();
}

test("proxya WMS, inyecta el INSTANCE_ID y descarta params no permitidos", async () => {
  setup();
  const calls = [];

  const result = await handleProxy(
    { query: { ...wmsQuery, URL: "https://evil.example" }, ip: "1.1.1.1" },
    {
      env,
      fetch: async (url) => {
        calls.push(url);
        return response();
      },
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.headers["Content-Type"], "image/png");
  assert.match(result.headers["Cache-Control"], /s-maxage=3600/);
  assert.equal(result.headers["X-Proxy-Service"], "copernicus-wms");
  assert.equal(result.headers["X-Proxy-Cache"], "MISS");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].origin + calls[0].pathname, "https://sh.dataspace.copernicus.eu/ogc/wms/test-instance");
  assert.equal(calls[0].searchParams.get("LAYERS"), "NDVI");
  assert.equal(calls[0].searchParams.has("URL"), false);
  assert.equal(calls[0].searchParams.has("source"), false);
});

test("cachea JSON y la segunda llamada no toca el upstream", async () => {
  setup();
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return response({ contentType: "application/json", body: '{"ok":true}' });
  };

  const query = { source: "copernicus-wfs", REQUEST: "GetFeature", TYPENAMES: "DSS2", BBOX: "1,2,3,4" };

  const first = await handleProxy({ query, ip: "1.1.1.2" }, { env, fetch, now: 1000 });
  const second = await handleProxy({ query, ip: "1.1.1.2" }, { env, fetch, now: 1001 });

  assert.equal(calls, 1);
  assert.equal(first.headers["X-Proxy-Cache"], "MISS");
  assert.equal(second.headers["X-Proxy-Cache"], "HIT");
  assert.equal(second.body.toString(), '{"ok":true}');
});

test("normaliza Retry-After de milisegundos a segundos", async () => {
  setup();
  const result = await handleProxy(
    { query: wmsQuery, ip: "1.1.1.3" },
    {
      env,
      fetch: async () =>
        response({
          status: 429,
          contentType: "application/json",
          body: "{}",
          headers: { "retry-after": "3398" },
        }),
    }
  );

  assert.equal(result.status, 429);
  assert.equal(result.headers["Retry-After"], "4");
  assert.equal(result.headers["Cache-Control"], "no-store");
});

test("rechaza content-type no permitido", async () => {
  setup();
  const result = await handleProxy(
    { query: wmsQuery, ip: "1.1.1.4" },
    { env, fetch: async () => response({ contentType: "text/html", body: "<html>" }) }
  );

  assert.equal(result.status, 502);
  assert.equal(JSON.parse(result.body.toString()).code, "UPSTREAM_CONTENT_TYPE");
});

test("rechaza redirects del upstream", async () => {
  setup();
  const result = await handleProxy(
    { query: wmsQuery, ip: "1.1.1.5" },
    { env, fetch: async () => response({ status: 302 }) }
  );

  assert.equal(result.status, 502);
  assert.equal(JSON.parse(result.body.toString()).code, "UPSTREAM_REDIRECT");
});

test("aplica rate limit por IP", async () => {
  setup();
  const tinyEnv = { ...env, PROXY_RATE_LIMIT_PER_MIN: "1", PROXY_RATE_LIMIT_BURST: "1" };
  const fetch = async () => response({ contentType: "application/json", body: "{}" });

  const first = await handleProxy(
    { query: { source: "copernicus-wms", REQUEST: "GetCapabilities" }, ip: "9.9.9.9" },
    { env: tinyEnv, fetch }
  );
  const second = await handleProxy(
    { query: { source: "copernicus-wms", REQUEST: "GetCapabilities", TIME: "2026-01-01" }, ip: "9.9.9.9" },
    { env: tinyEnv, fetch }
  );

  assert.equal(first.status, 200);
  assert.equal(second.status, 429);
  assert.equal(JSON.parse(second.body.toString()).code, "RATE_LIMITED");
});

test("sin INSTANCE_ID devuelve 503 sin detalles internos", async () => {
  setup();
  const result = await handleProxy(
    { query: wmsQuery, ip: "1.1.1.6" },
    { env: {}, fetch: async () => response() }
  );

  assert.equal(result.status, 503);
  const body = JSON.parse(result.body.toString());
  assert.equal(body.code, "MISSING_INSTANCE_ID");
  assert.equal(body.error.includes("test-instance"), false);
});

test("solo acepta GET", async () => {
  setup();
  const result = await handleProxy(
    { query: wmsQuery, ip: "1.1.1.7", method: "POST" },
    { env, fetch: async () => response() }
  );

  assert.equal(result.status, 405);
});

test("errores de red y timeout se distinguen", async () => {
  setup();
  const network = await handleProxy(
    { query: wmsQuery, ip: "1.1.1.8" },
    { env, fetch: async () => { throw new Error("ECONNRESET"); } }
  );
  assert.equal(network.status, 502);

  const timeout = await handleProxy(
    { query: wmsQuery, ip: "1.1.1.9" },
    {
      env,
      fetch: async () => {
        const err = new Error("timeout");
        err.name = "TimeoutError";
        throw err;
      },
    }
  );
  assert.equal(timeout.status, 504);
});

test("proxya Worldview Snapshot", async () => {
  setup();
  const calls = [];

  const result = await handleProxy(
    {
      query: {
        source: "worldview-snapshot",
        LAYERS: "MODIS_Terra_CorrectedReflectance_TrueColor",
        BBOX: "-29,-71,-26,-68",
        WIDTH: "512",
        HEIGHT: "512",
        TIME: "2026-02-26",
      },
      ip: "1.1.1.10",
    },
    {
      env,
      fetch: async (url) => {
        calls.push(url);
        return response({ contentType: "image/jpeg", body: "jpeg" });
      },
    }
  );

  assert.equal(result.status, 200);
  assert.equal(calls[0].origin + calls[0].pathname, "https://wvs.earthdata.nasa.gov/api/v1/snapshot");
  assert.equal(calls[0].searchParams.get("REQUEST"), "GetSnapshot");
  assert.equal(calls[0].searchParams.get("TIME"), "2026-02-26");
});

test("WFS GetFeature agrega OUTPUTFORMAT=application/json", async () => {
  setup();
  const calls = [];

  const result = await handleProxy(
    {
      query: {
        source: "copernicus-wfs",
        REQUEST: "GetFeature",
        TYPENAMES: "DSS2",
        BBOX: "-27.5,-70.4,-27.3,-70.2",
      },
      ip: "1.1.1.11",
    },
    {
      env,
      fetch: async (url) => {
        calls.push(url);
        return response({ contentType: "application/json", body: "{}" });
      },
    }
  );

  assert.equal(result.status, 200);
  assert.equal(calls[0].searchParams.get("OUTPUTFORMAT"), "application/json");
});
