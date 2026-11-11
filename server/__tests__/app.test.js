import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createApp } from "../app.js";

const servers = [];

function fakeDB() {
  return {
    ping: async () => true,
    rpc: async (name) => {
      switch (name) {
        case "chat_stations_map_data":
          return [{ codigo_nacional: "270009" }];
        case "chat_station_details":
          return { values: [], ranges: {} };
        case "chat_variable_availability":
          return {
            variable: "temp_avg",
            fecha_min: "2020-01-01",
            fecha_max: "2026-01-01",
            total_registros: 1,
            estaciones_con_dato: 1,
          };
        case "chat_variable_available_dates":
          return ["2026-01-01"];
        default:
          return null;
      }
    },
  };
}

async function startApp() {
  const db = fakeDB();
  const app = createApp({
    getDB: async () => db,
    env: {
      ALLOWED_ORIGINS: "http://localhost:8099",
      GEO_PROVIDER: "none",
    },
    logger: { error() {}, warn() {} },
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

after(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise((resolve) => {
          server.close(resolve);
        })
    )
  );
});

test("GET /healthz responde 200 con la BD arriba", async () => {
  const base = await startApp();
  const res = await fetch(`${base}/healthz`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.db, "up");
});

test("una ruta desconocida devuelve 404", async () => {
  const base = await startApp();
  const res = await fetch(`${base}/nope`);
  assert.equal(res.status, 404);
});

test("un método no permitido devuelve 405", async () => {
  const base = await startApp();
  const res = await fetch(`${base}/healthz`, { method: "POST" });
  assert.equal(res.status, 405);
});

test("OPTIONS devuelve CORS para el origen permitido", async () => {
  const base = await startApp();
  const res = await fetch(`${base}/api/chat`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:8099",
      "Access-Control-Request-Method": "POST",
    },
  });

  assert.equal(res.status, 204);
  assert.equal(
    res.headers.get("access-control-allow-origin"),
    "http://localhost:8099"
  );
  assert.match(res.headers.get("access-control-allow-methods") || "", /POST/);
});

test("POST /api/chat rechaza un body inválido antes del LLM", async () => {
  const base = await startApp();
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.ok(body.error);
});

test("POST /api/chat rechaza JSON inválido", async () => {
  const base = await startApp();
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });

  assert.equal(res.status, 400);
});

test("GET /api/arclim-geojson exige indicator", async () => {
  const base = await startApp();
  const res = await fetch(`${base}/api/arclim-geojson`);
  assert.equal(res.status, 400);
});

test("GET /api/stations-map devuelve estaciones", async () => {
  const base = await startApp();
  const res = await fetch(`${base}/api/stations-map?variable=temp_avg`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.stations.length, 1);
});

test("GET /api/station-details exige código", async () => {
  const base = await startApp();
  const res = await fetch(`${base}/api/station-details`);
  assert.equal(res.status, 400);
});

test("GET /api/station-details devuelve detalle", async () => {
  const base = await startApp();
  const res = await fetch(`${base}/api/station-details?codigo=270009`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.codigo, "270009");
  assert.deepEqual(body.values, []);
});

test("GET /api/variable-availability devuelve disponibilidad", async () => {
  const base = await startApp();
  const res = await fetch(`${base}/api/variable-availability?variable=temp_avg`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.variable, "temp_avg");
});

test("GET /api/variable-available-dates devuelve fechas", async () => {
  const base = await startApp();
  const res = await fetch(
    `${base}/api/variable-available-dates?variable=temp_avg`
  );
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(body.dates, ["2026-01-01"]);
});

test("GET /api/proxy rechaza un servicio fuera de la allowlist", async () => {
  const base = await startApp();
  const res = await fetch(`${base}/api/proxy?source=nope`);
  assert.ok(res.status >= 400);
});
