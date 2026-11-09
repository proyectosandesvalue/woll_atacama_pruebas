import { test } from "node:test";
import assert from "node:assert/strict";

import { getClientIp, getIpFromRequest } from "../request.js";

test("usa x-forwarded-for contando desde la derecha", () => {
  const req = { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1, 10.0.0.2" } };
  assert.equal(getClientIp(req, { TRUST_PROXY_HOPS: "2" }), "10.0.0.1");
});

test("cae a x-real-ip", () => {
  const req = { headers: { "x-real-ip": "198.51.100.7" } };
  assert.equal(getClientIp(req, {}), "198.51.100.7");
});

test("sin headers devuelve undefined", () => {
  assert.equal(getClientIp({ headers: {} }, {}), undefined);
});

test("getIpFromRequest es un alias compatible", () => {
  assert.equal(getIpFromRequest, getClientIp);
});
