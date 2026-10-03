/**
 * Tests unitarios del geo-filter.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isLatam,
  getCountryFromRequest,
  getIpFromRequest,
  GEO_CONFIG,
} from "../geo-filter.js";

// ── isLatam ───────────────────────────────────────────────────

test("isLatam: CL es LATAM", () => {
  assert.strictEqual(isLatam("CL"), true);
});

test("isLatam: AR es LATAM", () => {
  assert.strictEqual(isLatam("AR"), true);
});

test("isLatam: MX es LATAM", () => {
  assert.strictEqual(isLatam("MX"), true);
});

test("isLatam: minúsculas funcionan", () => {
  assert.strictEqual(isLatam("cl"), true);
});

test("isLatam: US no es LATAM", () => {
  assert.strictEqual(isLatam("US"), false);
});

test("isLatam: ES no es LATAM", () => {
  assert.strictEqual(isLatam("ES"), false);
});

test("isLatam: undefined es false", () => {
  assert.strictEqual(isLatam(undefined), false);
});

test("isLatam: null es false", () => {
  assert.strictEqual(isLatam(null), false);
});

test("isLatam: string vacío es false", () => {
  assert.strictEqual(isLatam(""), false);
});

test("isLatam: número es false", () => {
  assert.strictEqual(isLatam(42), false);
});

// ── getCountryFromRequest ─────────────────────────────────────

test("getCountryFromRequest: header válido", () => {
  const req = { headers: { "x-vercel-ip-country": "cl" } };
  assert.strictEqual(getCountryFromRequest(req), "CL");
});

test("getCountryFromRequest: sin header → undefined", () => {
  assert.strictEqual(getCountryFromRequest({ headers: {} }), undefined);
});

test("getCountryFromRequest: header demasiado largo → undefined", () => {
  const req = { headers: { "x-vercel-ip-country": "CHL" } };
  assert.strictEqual(getCountryFromRequest(req), undefined);
});

test("getCountryFromRequest: req sin headers → undefined", () => {
  assert.strictEqual(getCountryFromRequest({}), undefined);
});

// ── getIpFromRequest ──────────────────────────────────────────

test("getIpFromRequest: x-forwarded-for simple", () => {
  const req = { headers: { "x-forwarded-for": "1.2.3.4" } };
  assert.strictEqual(getIpFromRequest(req), "1.2.3.4");
});

test("getIpFromRequest: x-forwarded-for con cadena → primer valor", () => {
  const req = { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } };
  assert.strictEqual(getIpFromRequest(req), "1.2.3.4");
});

test("getIpFromRequest: x-real-ip como fallback", () => {
  const req = { headers: { "x-real-ip": "9.9.9.9" } };
  assert.strictEqual(getIpFromRequest(req), "9.9.9.9");
});

test("getIpFromRequest: sin headers → undefined", () => {
  assert.strictEqual(getIpFromRequest({ headers: {} }), undefined);
});

// ── Constantes ────────────────────────────────────────────────

test("GEO_CONFIG.LATAM_COUNTRIES contiene los países esperados", () => {
  assert.ok(GEO_CONFIG.LATAM_COUNTRIES.has("CL"));
  assert.ok(GEO_CONFIG.LATAM_COUNTRIES.has("AR"));
  assert.ok(GEO_CONFIG.LATAM_COUNTRIES.has("MX"));
  assert.ok(!GEO_CONFIG.LATAM_COUNTRIES.has("US"));
  assert.ok(!GEO_CONFIG.LATAM_COUNTRIES.has("ES"));
});