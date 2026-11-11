import { test } from "node:test";
import assert from "node:assert/strict";

import { createDriver } from "../drivers/postgres.js";

test("exige connectionString", () => {
  assert.throws(() => createDriver({}), /requiere DATABASE_URL/);
});

test("rechaza un AbortSignal ya abortado sin abrir conexión", async () => {
  const driver = createDriver({
    connectionString: "postgres://invalid:invalid@127.0.0.1:1/none",
  });
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    () => driver.rpc("chat_catalog", {}, { signal: controller.signal }),
    /cancelada antes de ejecutar/
  );

  await driver.close();
});
