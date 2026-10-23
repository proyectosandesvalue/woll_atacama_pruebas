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

// Fix 23-C: isLatam(null/undefined/"") ahora es fail-open (true).
// El único caso en el que aplicamos el límite estricto es si el país
// está presente y NO es LATAM.

test("isLatam: undefined es fail-open (true)", () => {
  assert.strictEqual(isLatam(undefined), true);
});

test("isLatam: null es fail-open (true)", () => {
  assert.strictEqual(isLatam(null), true);
});

test("isLatam: string vacío es fail-open (true)", () => {
  assert.strictEqual(isLatam(""), true);
});

test("isLatam: número es fail-open (true)", () => {
  assert.strictEqual(isLatam(42), true);
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

// Fix 23-C: la IP se cuenta desde la DERECHA de x-forwarded-for,
// según TRUST_PROXY_HOPS (default 2). Antes se tomaba el primer valor.

test("getIpFromRequest: x-forwarded-for simple (hops=2)", () => {
  // Con un solo valor, el hops no afecta.
  const req = { headers: { "x-forwarded-for": "1.2.3.4" } };
  assert.strictEqual(getIpFromRequest(req), "1.2.3.4");
});

test("getIpFromRequest: x-forwarded-for con cadena (hops=2)", () => {
  // "1.2.3.4, 5.6.7.8, 9.10.11.12" con hops=2 → penúltimo = "5.6.7.8"
  const req = { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.10.11.12" } };
  assert.strictEqual(getIpFromRequest(req), "5.6.7.8");
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