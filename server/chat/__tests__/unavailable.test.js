import { test } from "node:test";
import assert from "node:assert/strict";

process.env.CHAT_UNAVAILABLE_ENABLED = "1";

const {
  detectUnavailable,
  buildUnavailableNotice,
  _resetUnavailable,
  _setInventoryForTests,
} = await import("../unavailable.js");

const TEST_INVENTORY = [
  {
    id: "produccion_frutales_kg",
    descripcion: "producción anual en kilos por especie",
    palabras: ["kilos", "kilogramos", "toneladas", "producción anual"],
    capas_relacionadas: ["catastro_especies_frutales"],
    existe: "superficie plantada (ha) y año de plantación en el Catastro Frutícola",
    motivo: "dato_inexistente",
  },
  {
    id: "aptitud_cultivos",
    descripcion: "análisis de aptitud para cultivos (mejor zona para X)",
    palabras: ["mejor zona", "aptitud", "conviene plantar"],
    capas_relacionadas: ["catastro_especies_frutales"],
    existe: "el análisis multicriterio está previsto para el Sprint 41",
    motivo: "sin_receta",
  },
];

test("detecta 'kilos' como producción no disponible", async () => {
  _resetUnavailable();
  _setInventoryForTests(TEST_INVENTORY);
  const matches = await detectUnavailable(
    "¿Cuántos kilos de jojoba se producen al año?"
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "produccion_frutales_kg");
});

test("detecta 'mejor zona' como aptitud no disponible", async () => {
  _resetUnavailable();
  _setInventoryForTests(TEST_INVENTORY);
  const matches = await detectUnavailable("¿Cuál es la mejor zona para jojoba?");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "aptitud_cultivos");
});

test("no detecta nada en preguntas normales", async () => {
  _resetUnavailable();
  _setInventoryForTests(TEST_INVENTORY);
  const matches = await detectUnavailable("¿Cuáles son los glaciares?");
  assert.equal(matches.length, 0);
});

test("buildUnavailableNotice construye la línea correctamente", async () => {
  _resetUnavailable();
  _setInventoryForTests(TEST_INVENTORY);
  const matches = await detectUnavailable("¿Cuántos kilos de jojoba?");
  const notice = buildUnavailableNotice(matches);
  assert.ok(notice);
  assert.match(notice, /no incluye/);
  assert.match(notice, /Catastro Frutícola/);
});