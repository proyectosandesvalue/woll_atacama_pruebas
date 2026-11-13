import { test } from "node:test";
import assert from "node:assert/strict";

import { createSession } from "../../admin/auth.js";
import {
  handleRagManifestSave,
  handleRagQueue,
  handleRagOverview,
  handleRagUpload,
} from "../admin-rag.js";

const ENV = {
  ADMIN_SESSION_SECRET: "s".repeat(48),
  RAG_MANIFEST_PATH: "/tmp/woll-rag-handler-test/manifest.json",
};

function ctx(overrides = {}) {
  const session = createSession({ user: "admin", secret: ENV.ADMIN_SESSION_SECRET });
  return {
    env: ENV,
    ip: "127.0.0.1",
    req: {
      headers: {
        cookie: `woll_admin=${encodeURIComponent(session.token)}`,
        "x-csrf-token": session.csrf,
      },
    },
    query: {},
    body: {},
    ...overrides,
  };
}

test("rag overview exige sesión", async () => {
  const result = await handleRagOverview(
    { req: { headers: {} }, env: ENV },
    { getDB: async () => ({}) }
  );
  assert.equal(result.status, 401);
});

test("rag upload exige application/pdf", async () => {
  const result = await handleRagUpload(
    ctx({
      query: { slug: "ley-glaciares" },
      req: { headers: { cookie: "", "content-type": "text/plain" } },
    })
  );
  assert.equal(result.status, 401);

  const result2 = await handleRagUpload(
    ctx({
      query: { slug: "ley-glaciares" },
      req: {
        headers: {
          ...ctx().req.headers,
          "content-type": "text/plain",
        },
      },
    })
  );
  assert.equal(result2.status, 415);
});

test("rag queue rechaza acciones inválidas", async () => {
  const result = await handleRagQueue(
    ctx({ body: { slug: "x", action: "borrar" } }),
    { getDB: async () => ({}) }
  );
  assert.equal(result.status, 400);
});

test("rag manifest exige CSRF", async () => {
  const result = await handleRagManifestSave({
    ...ctx(),
    body: { slug: "x" },
    req: { headers: { cookie: ctx().req.headers.cookie } },
  });
  assert.equal(result.status, 403);
});
