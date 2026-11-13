import { test } from "node:test";
import assert from "node:assert/strict";

import {
  _resetTemasConfigForTests,
  getTemasConfig,
  getTemasConfigMeta,
  initTemasConfig,
} from "../../js/config/loader.js";

function reset() {
  _resetTemasConfigForTests();
}

test("initTemasConfig usa /api/config cuando responde bien", async () => {
  reset();
  const config = await initTemasConfig({
    fetchImpl: async (url) => {
      assert.equal(url, "/api/config");
      return {
        ok: true,
        json: async () => ({
          version: 7,
          checksum: "abc",
          config: { agua: { nombre: "Desde API" } },
        }),
      };
    },
  });

  assert.equal(config.agua.nombre, "Desde API");
  assert.deepEqual(getTemasConfigMeta(), {
    source: "api",
    version: 7,
    checksum: "abc",
  });
  assert.equal(getTemasConfig().agua.nombre, "Desde API");
});

test("initTemasConfig cae al fallback si la API falla", async () => {
  reset();
  const config = await initTemasConfig({
    fetchImpl: async () => {
      throw new Error("network");
    },
  });

  assert.equal(getTemasConfigMeta().source, "fallback");
  assert.ok(config.agua, "el fallback debe tener la dimensión agua");
  assert.equal(config.agua, getTemasConfig().agua);
});

test("initTemasConfig cae al fallback si el payload es inválido", async () => {
  reset();
  const config = await initTemasConfig({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ version: 1, config: null }),
    }),
  });

  assert.equal(getTemasConfigMeta().source, "fallback");
  assert.ok(config.agua);
});

test("initTemasConfig es idempotente", async () => {
  reset();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true,
      json: async () => ({ version: 1, checksum: "x", config: { agua: {} } }),
    };
  };

  const first = initTemasConfig({ fetchImpl });
  const second = initTemasConfig({ fetchImpl });
  assert.equal(first, second);
  await first;
  assert.equal(calls, 1);
});
