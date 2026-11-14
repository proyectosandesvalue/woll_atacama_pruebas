import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HTML = await readFile(path.join(ROOT, "admin.html"), "utf8");

const CHAT_HELP = [
  "help-chat-prompts",
  "help-chat-settings",
  "help-chat-messages",
  "help-chat-unavailable",
  "help-chat-golden",
  "help-chat-tools",
];

test("cada botón de ayuda tiene su popover y su aria-controls", () => {
  const buttons = [...HTML.matchAll(/data-help="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(buttons.length > 0);
  for (const id of buttons) {
    assert.ok(
      HTML.includes(`aria-controls="${id}"`),
      `el botón ${id} no declara aria-controls`
    );
    assert.match(
      HTML,
      new RegExp(`id="${id}"[^>]*class="help-popover"`),
      `el botón ${id} no tiene popover`
    );
  }
});

test("no hay popovers de ayuda huérfanos", () => {
  const popovers = [...HTML.matchAll(/id="([^"]+)" class="help-popover"/g)].map(
    (match) => match[1]
  );
  for (const id of popovers) {
    assert.ok(
      HTML.includes(`data-help="${id}"`),
      `el popover ${id} no tiene botón que lo abra`
    );
  }
});

test("la vista Chat IA tiene ayuda en sus seis secciones", () => {
  for (const id of CHAT_HELP) {
    assert.ok(HTML.includes(`data-help="${id}"`), `falta el botón ${id}`);
    assert.ok(HTML.includes(`id="${id}"`), `falta el popover ${id}`);
  }
});

test("el banner explica qué hace cada bloque y la caché", () => {
  assert.ok(HTML.includes("Esta sección controla cómo responde el chat del geoportal"));
  assert.ok(HTML.includes("≤ 5 min"));
  assert.ok(HTML.includes("corre el golden set"));
  assert.ok(HTML.includes("Si algo funciona, no lo cambies sin evaluar el impacto"));
});
