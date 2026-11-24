import { test } from "node:test";
import assert from "node:assert/strict";

import { healthRoute, readyRoute } from "../routes/health.js";

function ctx(getDB, logger = { error() {} }) {
  return { getDB, logger };
}

test("/healthz responde 200 cuando la BD responde", async () => {
  const result = await healthRoute.handler(
    ctx(async () => ({ ping: async () => true }))
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.db, "up");
  assert.ok(Number.isInteger(result.body.uptime_s));
});

test("/healthz responde 503 cuando la BD falla", async () => {
  const result = await healthRoute.handler(
    ctx(async () => ({
      ping: async () => {
        throw new Error("sin conexión");
      },
    }))
  );
  assert.equal(result.status, 503);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.db, "down");
});

test("/healthz acepta el driver REST (rpc) de la demo", async () => {
  let called = null;
  const result = await healthRoute.handler(
    ctx(async () => ({
      rpc: async (name) => {
        called = name;
        return [];
      },
    }))
  );
  assert.equal(result.status, 200);
  assert.equal(called, "chat_catalog");
});

test("/readyz es alias de /healthz", async () => {
  assert.equal(readyRoute.path, "/readyz");
  const result = await readyRoute.handler(
    ctx(async () => ({ ping: async () => true }))
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.db, "up");
});
