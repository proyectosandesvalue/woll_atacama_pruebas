import { test } from "node:test";
import assert from "node:assert/strict";

import {
  handleHistoricalStations,
  handleStationAvailableDates,
  handleStationDetails,
  handleStationSeries,
  handleStationsMap,
  handleVariableAvailability,
  handleVariableAvailableDates,
} from "../handlers/stations.js";

function fakeDB(rpc) {
  return { rpc };
}

test("stations-map usa latest por defecto", async () => {
  let received;
  const getDB = async () =>
    fakeDB(async (name, params) => {
      received = { name, params };
      return [{ codigo_nacional: "270009" }];
    });

  const result = await handleStationsMap({ variable: "temp_avg" }, { getDB });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    variable: "temp_avg",
    date: null,
    estado: null,
    stations: [{ codigo_nacional: "270009" }],
  });
  assert.deepEqual(received, {
    name: "chat_stations_map_data",
    params: { p_variable: "temp_avg", p_period: "latest" },
  });
});

test("stations-map usa la fecha y el estado cuando vienen", async () => {
  let received;
  const getDB = async () =>
    fakeDB(async (name, params) => {
      received = { name, params };
      return [];
    });

  const result = await handleStationsMap(
    { variable: "temp_avg", date: "2026-01-15", estado: "online" },
    { getDB }
  );

  assert.equal(result.status, 200);
  assert.deepEqual(received, {
    name: "chat_stations_map_data_at_date",
    params: {
      p_variable: "temp_avg",
      p_date: "2026-01-15",
      p_estado: "online",
    },
  });
});

test("station-details exige código", async () => {
  const result = await handleStationDetails({});
  assert.equal(result.status, 400);
});

test("station-details degrada a vacío si la RPC falla", async () => {
  const getDB = async () =>
    fakeDB(async () => {
      throw new Error("RPC rota");
    });

  const result = await handleStationDetails({ codigo: "270009" }, { getDB });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.values, []);
  assert.deepEqual(result.body.ranges, {});
  assert.match(result.body.error, /RPC rota/);
});

test("station-series parsea números y defaults", async () => {
  let received;
  const getDB = async () =>
    fakeDB(async (name, params) => {
      received = { name, params };
      return { points: [], unit: "°C" };
    });

  const result = await handleStationSeries(
    {
      codigo: "270009",
      indicator: "temp_min_diaria",
      year_start: "2020",
      year_end: "",
      month: "1",
    },
    { getDB }
  );

  assert.equal(result.status, 200);
  assert.equal(received.name, "chat_station_series");
  assert.deepEqual(received.params, {
    p_codigo: "270009",
    p_indicator: "temp_min_diaria",
    p_granularity: "year",
    p_year_start: 2020,
    p_year_end: null,
    p_month: 1,
    p_day: null,
  });
});

test("station-available-dates devuelve array", async () => {
  const getDB = async () =>
    fakeDB(async () => ["2026-01-01", "2026-01-02"]);

  const result = await handleStationAvailableDates(
    { codigo: "270009", indicator: "temp_avg" },
    { getDB }
  );

  assert.deepEqual(result.body.dates, ["2026-01-01", "2026-01-02"]);
});

test("variable-availability degrada si falla la RPC", async () => {
  const getDB = async () =>
    fakeDB(async () => {
      throw new Error("vista no disponible");
    });

  const result = await handleVariableAvailability(
    { variable: "temp_avg" },
    { getDB }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.degraded, true);
  assert.equal(result.body.variable, "temp_avg");
});

test("variable-available-dates exige variable", async () => {
  const result = await handleVariableAvailableDates({});
  assert.equal(result.status, 400);
});

test("historical-stations usa METEOROLOGICA por defecto", async () => {
  let received;
  const getDB = async () =>
    fakeDB(async (name, params) => {
      received = { name, params };
      return [];
    });

  const result = await handleHistoricalStations({}, { getDB });
  assert.equal(result.status, 200);
  assert.deepEqual(received, {
    name: "chat_historical_stations",
    params: { p_tipo: "METEOROLOGICA" },
  });
});
