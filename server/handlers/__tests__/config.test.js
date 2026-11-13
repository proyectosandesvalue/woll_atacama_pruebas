import { test } from "node:test";
import assert from "node:assert/strict";

import { handleConfig } from "../config.js";

function createDB(snapshot) {
  return {
    rpc: async (name) => {
      assert.equal(name, "chat_get_config_snapshot");
      return snapshot;
    },
  };
}

const SNAPSHOT = {
  version: 3,
  checksum: "abc123",
  generatedAt: "2026-11-13T12:00:00.000Z",
  config: { agua: { nombre: "Agua" } },
};

test("config devuelve el snapshot activo con ETag y cache", async () => {
  const result = await handleConfig(
    { req: { headers: {} }, env: {} },
    { getDB: async () => createDB(SNAPSHOT) }
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, SNAPSHOT);
  assert.equal(result.headers.ETag, '"abc123"');
  assert.match(result.headers["Cache-Control"], /max-age=300/);
});

test("config responde 304 si el ETag coincide", async () => {
  const result = await handleConfig(
    { req: { headers: { "if-none-match": '"abc123"' } }, env: {} },
    { getDB: async () => createDB(SNAPSHOT) }
  );
  assert.equal(result.status, 304);
  assert.equal(result.headers.ETag, '"abc123"');
});

test("config responde 503 si no hay snapshot activo", async () => {
  const result = await handleConfig(
    { req: { headers: {} }, env: {} },
    { getDB: async () => createDB(null) }
  );
  assert.equal(result.status, 503);
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.equal(result.headers["Retry-After"], "30");
});

test("config responde 503 si la BD falla", async () => {
  const result = await handleConfig(
    { req: { headers: {} }, env: {} },
    { getDB: async () => ({ rpc: async () => { throw new Error("db down"); } }) }
  );
  assert.equal(result.status, 503);
  assert.match(result.body.error, /no disponible/i);
});

test("config respeta CONFIG_API_MAX_AGE y lo acota", async () => {
  const result = await handleConfig(
    { req: { headers: {} }, env: { CONFIG_API_MAX_AGE: "99999" } },
    { getDB: async () => createDB(SNAPSHOT) }
  );
  assert.match(result.headers["Cache-Control"], /max-age=3600/);
});
