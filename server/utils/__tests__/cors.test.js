import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ALLOWED_ORIGINS,
  getAllowedOrigins,
  getOriginHeader,
  applyCors,
} from "../cors.js";

test("usa la allowlist por defecto", () => {
  assert.deepEqual(getAllowedOrigins({}), DEFAULT_ALLOWED_ORIGINS);
});

test("lee ALLOWED_ORIGINS separada por comas", () => {
  assert.deepEqual(getAllowedOrigins({ ALLOWED_ORIGINS: "https://a.cl, https://b.cl" }), [
    "https://a.cl",
    "https://b.cl",
  ]);
});

test("refleja solo orígenes permitidos", () => {
  const env = { ALLOWED_ORIGINS: "https://a.cl" };
  assert.equal(getOriginHeader({ headers: { origin: "https://a.cl" } }, env), "https://a.cl");
  assert.equal(getOriginHeader({ headers: { origin: "https://evil.cl" } }, env), null);
  assert.equal(getOriginHeader({ headers: {} }, env), null);
});

test("applyCors setea headers y Vary solo si el origen está permitido", () => {
  const headers = {};
  const res = { setHeader: (k, v) => { headers[k] = v; } };
  const env = { ALLOWED_ORIGINS: "https://a.cl" };

  const origin = applyCors(
    { headers: { origin: "https://a.cl" } },
    res,
    { env, methods: "GET, OPTIONS" }
  );

  assert.equal(origin, "https://a.cl");
  assert.equal(headers["Access-Control-Allow-Origin"], "https://a.cl");
  assert.equal(headers.Vary, "Origin");
  assert.equal(headers["Access-Control-Allow-Methods"], "GET, OPTIONS");
});

test("applyCors no emite Allow-Origin para un origen no permitido", () => {
  const headers = {};
  const res = { setHeader: (k, v) => { headers[k] = v; } };

  applyCors(
    { headers: { origin: "https://evil.cl" } },
    res,
    { env: { ALLOWED_ORIGINS: "https://a.cl" } }
  );

  assert.equal(headers["Access-Control-Allow-Origin"], undefined);
  assert.equal(headers.Vary, "Origin");
  assert.equal(headers["Access-Control-Allow-Methods"], "GET, OPTIONS");
});
