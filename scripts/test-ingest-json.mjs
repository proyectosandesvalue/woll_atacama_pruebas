/**
 * scripts/test-ingest-json.mjs
 *
 * Test unitario del adapter JSON con un JSON mockeado (sin red).
 *
 * Uso:
 *   node --env-file=.env.staging scripts/test-ingest-json.mjs
 */

import { runJsonEndpoint } from "../server/ingest/adapters/json.js";

// JSON mockeado (simula la respuesta de MeteoChile)
const MOCK_DATA = {
  datosEstaciones: [
    {
      estacion: {
        codigoNacional: 330020,
        nombreEstacion: "Quinta Normal",
        latitud: -33.44,
        longitud: -70.68,
      },
      datos: [
        {
          momento: "2024-06-15 12:00:00",
          temperatura: "15.2 °C",
          temperaturaMaxima12Horas: "18.5 °C",
          temperaturaMinima12Horas: "8.5 °C",
          humedadRelativa: "65 %",
          aguaCaida24Horas: "0.0 mm",
          direccionDelViento: "250 °",
          fuerzaDelViento: "12.5 kt",
          radiacionGlobalInst: "350 W/m2",
        },
      ],
    },
  ],
};

// Endpoint mockeado (mismo formato que el de la BD)
const MOCK_ENDPOINT = {
  id: "test:mock",
  source_id: "test",
  format: "json",
  json_path: "$.datosEstaciones[*]",
  entity_mapping: {
    type: "estacion",
    id_template: "estacion:{estacion.codigoNacional}",
    name_field: "estacion.nombreEstacion",
  },
  period_mapping: {
    start_field: "datos[0].momento",
    end_field: "datos[0].momento",
    format: "YYYY-MM-DD HH:mm:ss",
  },
  value_mapping: {
    temp_avg: { field: "datos[0].temperatura", indicator: "temp_avg", unit: "°C" },
    temp_max: { field: "datos[0].temperaturaMaxima12Horas", indicator: "temp_max", unit: "°C" },
    temp_min: { field: "datos[0].temperaturaMinima12Horas", indicator: "temp_min", unit: "°C" },
    humedad: { field: "datos[0].humedadRelativa", indicator: "humedad", unit: "%" },
    precip: { field: "datos[0].aguaCaida24Horas", indicator: "precip", unit: "mm" },
    viento_dir: { field: "datos[0].direccionDelViento", indicator: "viento_dir", unit: "°" },
    viento_vel: { field: "datos[0].fuerzaDelViento", indicator: "viento_vel", unit: "kt" },
    radiacion: { field: "datos[0].radiacionGlobalInst", indicator: "radiacion", unit: "W/m2" },
  },
};

// Mock del fetch (sin red)
globalThis.fetch = async (url) => {
  console.log(`[mock-fetch] ${url}`);
  return {
    ok: true,
    json: async () => MOCK_DATA,
    text: async () => JSON.stringify(MOCK_DATA),
  };
};

// Mock del DB (sin persistencia, solo cuenta)
const upserts = [];
const MOCK_DB = {
  rpc: async (name, params) => {
    if (name === "ingest_upsert_value") {
      upserts.push(params);
      return null;
    }
    return null;
  },
};

const MOCK_SOURCE = {
  id: "test",
  url_base: "https://example.com",
  nombre: "Test",
};

// Ejecutar
const result = await runJsonEndpoint(MOCK_DB, MOCK_SOURCE, MOCK_ENDPOINT);

console.log("");
console.log("=== Resultado ===");
console.log(`loaded: ${result.loaded}`);
console.log(`skipped: ${result.skipped}`);
console.log(`errors: ${result.errors.length}`);
console.log("");

// Valores esperados (para detectar bugs de parseo)
const EXPECTED = {
  temp_avg: 15.2,
  temp_max: 18.5,
  temp_min: 8.5,
  humedad: 65,
  precip: 0,
  viento_dir: 250,
  viento_vel: 12.5,
  radiacion: 350,
};

const valuesOk = upserts.every((u) => {
  const expected = EXPECTED[u.p_indicator_id];
  return expected !== undefined && Number(u.p_value) === expected;
});

console.log("");
console.log("Valores cargados:");
for (const u of upserts) {
  const expected = EXPECTED[u.p_indicator_id];
  const ok = Number(u.p_value) === expected ? "✅" : "❌";
  console.log(`  ${ok} ${u.p_indicator_id} = ${u.p_value} ${u.p_unit} (esperado: ${expected})`);
}

if (result.loaded === 8 && valuesOk && result.errors.length === 0) {
  console.log("");
  console.log("✅ PASS: 8 valores cargados con valores correctos");
  process.exit(0);
} else {
  console.log("");
  console.log(`❌ FAIL: loaded=${result.loaded} (esperado 8), valuesOk=${valuesOk}, errors=${result.errors.length}`);
  for (const e of result.errors) {
    console.log(`  • ${e}`);
  }
  process.exit(1);
}