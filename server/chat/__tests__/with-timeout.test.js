import { test } from "node:test";
import assert from "node:assert/strict";

import { withTimeout } from "../tools/_helpers.js";

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
