import { test } from "node:test";
import assert from "node:assert/strict";

import { runWithDbSignal, getDbSignal } from "../context.js";

test("propaga el AbortSignal por el contexto async", async () => {
  const controller = new AbortController();

  const received = await runWithDbSignal(controller.signal, async () => {
    await Promise.resolve();
    return getDbSignal();
  });

  assert.equal(received, controller.signal);
});

test("fuera de contexto devuelve null", () => {
  assert.equal(getDbSignal(), null);
});
