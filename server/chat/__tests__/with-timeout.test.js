import { test } from "node:test";
import assert from "node:assert/strict";

import {
  withTimeout,
  timeoutForTool,
  RPC_TIMEOUT_MS,
  TOOL_TIMEOUTS,
} from "../tools/_helpers.js";

test("timeoutForTool usa 6 s por defecto y más para WMS", () => {
  assert.equal(timeoutForTool("query_layer"), RPC_TIMEOUT_MS);
  assert.equal(timeoutForTool("get_wms_statistics"), 25000);
  assert.equal(timeoutForTool("get_wms_available_dates"), 15000);
  assert.ok(TOOL_TIMEOUTS.get_wms_statistics > RPC_TIMEOUT_MS);
});

test("resuelve si la promesa termina antes del timeout", async () => {
  const controller = new AbortController();
  const value = await withTimeout(Promise.resolve(42), 100, controller);

  assert.equal(value, 42);
  assert.equal(controller.signal.aborted, false);
});

test("aborta el controller cuando vence el timeout", async () => {
  const controller = new AbortController();

  await assert.rejects(
    withTimeout(new Promise(() => {}), 10, controller),
    /timeout/
  );

  assert.equal(controller.signal.aborted, true);
});
