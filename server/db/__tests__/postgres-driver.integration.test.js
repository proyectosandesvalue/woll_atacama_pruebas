import { test, after } from "node:test";
import assert from "node:assert/strict";

import { createDriver } from "../drivers/postgres.js";

const dsn = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const skip = dsn ? false : "TEST_DATABASE_URL no configurada (test de integración)";

const driver = dsn ? createDriver({ connectionString: dsn }) : null;

after(async () => {
  if (driver) await driver.close();
});

test("ping responde contra PostgreSQL", { skip }, async () => {
  assert.equal(await driver.ping(), true);
});

test("query directa devuelve filas", { skip }, async () => {
  const rows = await driver.query("SELECT 1::int AS n");
  assert.deepEqual(rows, [{ n: 1 }]);
});

test("chat_catalog devuelve un array", { skip }, async () => {
  const catalog = await driver.rpc("chat_catalog");
  assert.ok(Array.isArray(catalog));
});

test("chat_get_setting usa el default cuando no hay setting", { skip }, async () => {
  const value = await driver.rpc("chat_get_setting", {
    p_key: "test.setting.inexistente",
    p_default: { enabled: false },
  });
  assert.deepEqual(value, { enabled: false });
});

test("chat_get_prompt devuelve texto o null", { skip }, async () => {
  const prompt = await driver.rpc("chat_get_prompt", { p_id: "chat.system" });
  assert.ok(prompt === null || typeof prompt === "string");
});

test("admin_ingest_stats devuelve un objeto", { skip }, async () => {
  const stats = await driver.rpc("admin_ingest_stats");
  assert.ok(stats === null || typeof stats === "object");
});

test("chat_unavailable_data devuelve un array", { skip }, async () => {
  const inventory = await driver.rpc("chat_unavailable_data");
  assert.ok(Array.isArray(inventory));
});

test("chat_stations_map_data devuelve un array", { skip }, async () => {
  const stations = await driver.rpc("chat_stations_map_data", {
    p_variable: "temp_avg",
  });
  assert.ok(Array.isArray(stations));
});

test("rechaza una RPC no registrada antes de tocar la BD", { skip }, async () => {
  await assert.rejects(
    () => driver.rpc("drop_all_tables"),
    /RPC no registrada/
  );
});

test("rechaza parámetros no declarados antes de tocar la BD", { skip }, async () => {
  await assert.rejects(
    () => driver.rpc("chat_query", { p_layer: "x", p_sql: "SELECT 1" }),
    /Parámetros no permitidos/
  );
});
