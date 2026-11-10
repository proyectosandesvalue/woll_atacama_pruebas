import { test } from "node:test";
import assert from "node:assert/strict";

import { createCatalogCache } from "../catalog.js";

test("reutiliza el catálogo dentro del TTL y recarga al vencer", async () => {
  let now = 1000;
  let loads = 0;
  const cache = createCatalogCache({
    load: async () => {
      loads += 1;
      return [{ load: loads }];
    },
    ttlMs: 100,
    now: () => now,
  });

  assert.deepEqual(await cache.get(), [{ load: 1 }]);
  assert.deepEqual(await cache.get(), [{ load: 1 }]);
  assert.equal(loads, 1);

  now = 1200;
  assert.deepEqual(await cache.get(), [{ load: 2 }]);
  assert.equal(loads, 2);
});

test("reset fuerza una recarga", async () => {
  let loads = 0;
  const cache = createCatalogCache({
    load: async () => {
      loads += 1;
      return loads;
    },
    ttlMs: 1000,
    now: () => 5000,
  });

  assert.equal(await cache.get(), 1);
  cache.reset();
  assert.equal(await cache.get(), 2);
});
