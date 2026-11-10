import { test } from "node:test";
import assert from "node:assert/strict";

import { createSemaphore } from "../semaphore.js";

test("limita la concurrencia y encola el siguiente turno", async () => {
  const semaphore = createSemaphore({ max: 1, maxQueue: 2, timeoutMs: 200 });

  await semaphore.acquire();

  let secondAcquired = false;
  const second = semaphore.acquire().then(() => {
    secondAcquired = true;
  });

  await Promise.resolve();
  assert.equal(secondAcquired, false);
  assert.equal(semaphore.queued, 1);

  semaphore.release();
  await second;

  assert.equal(secondAcquired, true);
  assert.equal(semaphore.active, 1);

  semaphore.release();
  assert.equal(semaphore.active, 0);
});

test("rechaza con LLM_BUSY cuando la cola está llena", async () => {
  const semaphore = createSemaphore({ max: 1, maxQueue: 1, timeoutMs: 200 });

  await semaphore.acquire();
  const queued = semaphore.acquire();

  await assert.rejects(
    semaphore.acquire(),
    (err) => err.code === "LLM_BUSY" && err.status === 503
  );

  semaphore.release();
  await queued;
  semaphore.release();
});

test("rechaza con LLM_BUSY si vence el timeout de cola", async () => {
  const semaphore = createSemaphore({ max: 1, maxQueue: 2, timeoutMs: 20 });

  await semaphore.acquire();

  await assert.rejects(
    semaphore.acquire(),
    (err) => err.code === "LLM_BUSY" && /Timeout/.test(err.detail || "")
  );

  semaphore.release();
  assert.equal(semaphore.active, 0);
});
