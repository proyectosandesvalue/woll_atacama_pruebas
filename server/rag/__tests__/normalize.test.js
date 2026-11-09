import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeText, stripRepeatedLines } from "../normalize.js";

test("des-guioniza palabras cortadas al final de línea", () => {
  assert.equal(normalizeText("infor-\nmación útil"), "información útil");
});

test("une saltos simples y conserva párrafos", () => {
  assert.equal(normalizeText("uno\ndos\n\ntres"), "uno dos\n\ntres");
});

test("elimina caracteres invisibles y de control", () => {
  assert.equal(normalizeText("a\u200Bb\u0007c\uFEFF"), "abc");
});

test("normaliza espacios no separables y tabuladores", () => {
  assert.equal(normalizeText("a\u00A0\u00A0b\tc"), "a b c");
});

test("normaliza saltos CRLF y NFC", () => {
  assert.equal(normalizeText("uno\r\ndos\r\n\r\ntres"), "uno dos\n\ntres");
});

test("entrada no string devuelve vacío", () => {
  assert.equal(normalizeText(null), "");
  assert.equal(normalizeText(undefined), "");
  assert.equal(normalizeText(42), "");
});

test("stripRepeatedLines quita encabezados repetidos y números de página", () => {
  const pages = Array.from(
    { length: 6 },
    (_, i) => `Boletín Oficial\nContenido ${i} del documento\n${i + 1}`
  );

  const out = stripRepeatedLines(pages);

  assert.ok(out.every((page) => !page.includes("Boletín")));
  assert.ok(out.every((page) => page.includes("Contenido")));
  assert.ok(out.every((page) => !/\n\d+$/.test(page)));
});

test("stripRepeatedLines con pocas páginas solo quita números de página", () => {
  const out = stripRepeatedLines(["Encabezado\ntexto\n3", "Encabezado\notro\n4"]);

  assert.ok(out[0].includes("Encabezado"));
  assert.ok(!out[0].endsWith("3"));
});

test("stripRepeatedLines tolera entradas no string", () => {
  assert.deepEqual(stripRepeatedLines([null, "texto\n2"]), ["", "texto"]);
});
