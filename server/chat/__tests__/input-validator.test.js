/**
 * Tests unitarios de validateChatInput.
 *
 * Cubre:
 *   - Validación de `text` (tipo, vacío, longitud, contenido mínimo).
 *   - Validación de `history` (estructura, roles, longitudes).
 *   - Combinaciones válidas e inválidas.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { validateChatInput, LIMITS } from "../input-validator.js";

// ── text: casos válidos ────────────────────────────────────────

test("text válido simple", () => {
  const out = validateChatInput({ text: "¿cuántas plantas desaladoras hay?" });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.text, "¿cuántas plantas desaladoras hay?");
  assert.deepStrictEqual(out.history, []);
});

test("text se trimea", () => {
  const out = validateChatInput({ text: "  hola  " });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.text, "hola");
});

test("text exactamente en el límite pasa", () => {
  const text = "a".repeat(LIMITS.MAX_TEXT_LENGTH);
  const out = validateChatInput({ text });
  assert.strictEqual(out.ok, true);
});

// ── text: casos inválidos ──────────────────────────────────────

test("text ausente falla", () => {
  const out = validateChatInput({});
  assert.strictEqual(out.ok, false);
  assert.match(out.error, /'text' debe ser un string/);
});

test("text null falla", () => {
  const out = validateChatInput({ text: null });
  assert.strictEqual(out.ok, false);
});

test("text número falla", () => {
  const out = validateChatInput({ text: 42 });
  assert.strictEqual(out.ok, false);
});

test("text vacío falla", () => {
  const out = validateChatInput({ text: "" });
  assert.strictEqual(out.ok, false);
  assert.match(out.error, /no puede estar vacío/);
});

test("text solo whitespace falla", () => {
  const out = validateChatInput({ text: "     \n\t " });
  assert.strictEqual(out.ok, false);
});

test("text demasiado largo falla", () => {
  const text = "a".repeat(LIMITS.MAX_TEXT_LENGTH + 1);
  const out = validateChatInput({ text });
  assert.strictEqual(out.ok, false);
  assert.match(out.error, /supera el máximo/);
});

test("text sin letras ni números falla", () => {
  const out = validateChatInput({ text: "......" });
  assert.strictEqual(out.ok, false);
  assert.match(out.error, /al menos una letra o número/);
});

test("text con emojis y letras pasa", () => {
  const out = validateChatInput({ text: "🏞️ hay glaciares?" });
  assert.strictEqual(out.ok, true);
});

// ── history: casos válidos ─────────────────────────────────────

test("history ausente → array vacío", () => {
  const out = validateChatInput({ text: "hola" });
  assert.strictEqual(out.ok, true);
  assert.deepStrictEqual(out.history, []);
});

test("history null → array vacío", () => {
  const out = validateChatInput({ text: "hola", history: null });
  assert.strictEqual(out.ok, true);
  assert.deepStrictEqual(out.history, []);
});

test("history válido con 1 item", () => {
  const out = validateChatInput({
    text: "hola",
    history: [{ role: "user", content: "pregunta previa" }],
  });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.history.length, 1);
  assert.strictEqual(out.history[0].role, "user");
});

test("history válido con user + assistant", () => {
  const out = validateChatInput({
    text: "siguiente",
    history: [
      { role: "user", content: "pregunta" },
      { role: "assistant", content: "respuesta" },
    ],
  });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.history.length, 2);
});

// ── history: casos inválidos ───────────────────────────────────

test("history no-array falla", () => {
  const out = validateChatInput({ text: "hola", history: "no soy array" });
  assert.strictEqual(out.ok, false);
  assert.match(out.error, /'history' debe ser un array/);
});

test("history demasiado largo falla", () => {
  const history = Array.from(
    { length: LIMITS.MAX_HISTORY_ITEMS + 1 },
    () => ({ role: "user", content: "x" })
  );
  const out = validateChatInput({ text: "hola", history });
  assert.strictEqual(out.ok, false);
  assert.match(out.error, /no puede tener más de/);
});

test("history item no-objeto falla", () => {
  const out = validateChatInput({ text: "hola", history: ["string"] });
  assert.strictEqual(out.ok, false);
  assert.match(out.error, /item 0 de 'history'/);
});

test("history item con role inválido falla", () => {
  const out = validateChatInput({
    text: "hola",
    history: [{ role: "system", content: "x" }],
  });
  assert.strictEqual(out.ok, false);
  assert.match(out.error, /'role' inválido/);
});

test("history item con content no-string falla", () => {
  const out = validateChatInput({
    text: "hola",
    history: [{ role: "user", content: 42 }],
  });
  assert.strictEqual(out.ok, false);
  assert.match(out.error, /'content' que no es string/);
});

test("history item con content demasiado largo falla", () => {
  const content = "a".repeat(LIMITS.MAX_HISTORY_ITEM_LENGTH + 1);
  const out = validateChatInput({
    text: "hola",
    history: [{ role: "user", content }],
  });
  assert.strictEqual(out.ok, false);
  assert.match(out.error, /supera los/);
});

// ── body: casos inválidos ──────────────────────────────────────

test("body null falla", () => {
  const out = validateChatInput(null);
  assert.strictEqual(out.ok, false);
});

test("body array falla", () => {
  const out = validateChatInput([1, 2, 3]);
  assert.strictEqual(out.ok, false);
});

test("body string falla", () => {
  const out = validateChatInput("no soy objeto");
  assert.strictEqual(out.ok, false);
});

test("LIMITS expone las constantes esperadas", () => {
  assert.strictEqual(LIMITS.MAX_TEXT_LENGTH, 1000);
  assert.strictEqual(LIMITS.MAX_HISTORY_ITEMS, 20);
  assert.strictEqual(LIMITS.MAX_HISTORY_ITEM_LENGTH, 2000);
});