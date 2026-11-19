import { test } from "node:test";
import assert from "node:assert/strict";

import {
  fingerprintQuestion,
  sanitizeQuestion,
} from "../unanswered-fingerprint.js";

test("sanitiza caracteres de control y limita a 1000", () => {
  assert.equal(sanitizeQuestion("  hola\u0000 mundo  "), "hola  mundo");
  assert.equal(sanitizeQuestion("x".repeat(1200)).length, 1000);
  assert.equal(sanitizeQuestion(null), "");
});

test("el fingerprint ignora mayúsculas y espacios externos", () => {
  assert.equal(
    fingerprintQuestion("¿Cuántas lagunas hay?"),
    fingerprintQuestion("  ¿cuántas lagunas hay?  ")
  );
});

test("el fingerprint distingue preguntas diferentes", () => {
  assert.notEqual(
    fingerprintQuestion("¿Cuántas lagunas hay?"),
    fingerprintQuestion("¿Cuántos glaciares hay?")
  );
});

test("el fingerprint es estable y hexadecimal", () => {
  const value = fingerprintQuestion("¿Dónde están las desaladoras?");
  assert.match(value, /^[0-9a-f]{32}$/);
  assert.equal(value, fingerprintQuestion("¿Dónde están las desaladoras?"));
});
