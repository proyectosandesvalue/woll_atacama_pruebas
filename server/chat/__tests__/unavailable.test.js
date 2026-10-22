/**
 * Tests del detector de datos no disponibles (40-D.2).
 * Ejecutar con: node --test server/chat/__tests__/unavailable.test.js
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// Forzar enabled para los tests.
process.env.CHAT_UNAVAILABLE_ENABLED = "1";

const { detectUnavailable, buildUnavailableNotice, _resetUnavailable } =
  await import("../unavailable.js");

test("detecta 'kilos' como producción no disponible", async () => {
  _resetUnavailable();
  const matches = await detectUnavailable(
    "¿Cuántos kilos de jojoba se producen al año?"
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "produccion_frutales_kg");
});

test("detecta 'mejor zona' como aptitud no disponible", async () => {
  _resetUnavailable();
  const matches = await detectUnavailable("¿Cuál es la mejor zona para jojoba?");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "aptitud_cultivos");
});

test("no detecta nada en preguntas normales", async () => {
  _resetUnavailable();
  const matches = await detectUnavailable("¿Cuáles son los glaciares?");
  assert.equal(matches.length, 0);
});

test("buildUnavailableNotice construye la línea correctamente", async () => {
  _resetUnavailable();
  const matches = await detectUnavailable("¿Cuántos kilos de jojoba?");
  const notice = buildUnavailableNotice(matches);
  assert.ok(notice);
  assert.match(notice, /no incluye/);
  assert.match(notice, /Catastro Frutícola/);
});