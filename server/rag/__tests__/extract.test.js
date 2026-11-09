import { test } from "node:test";
import assert from "node:assert/strict";

import { extractPdf } from "../extract.js";
import { buildPdf } from "./_pdf-fixture.js";

test("extrae el texto y el número de páginas", async () => {
  const pdf = buildPdf(["Hola mundo desde un PDF de prueba."]);
  const result = await extractPdf(pdf, { maxPages: 10 });

  assert.equal(result.pageCount, 1);
  assert.equal(result.pages.length, 1);
  assert.match(result.pages[0], /Hola mundo desde un PDF de prueba/);
});

test("extrae varias páginas en orden", async () => {
  const pdf = buildPdf(["Primera página.", "Segunda página.", "Tercera página."]);
  const result = await extractPdf(pdf, { maxPages: 10 });

  assert.equal(result.pageCount, 3);
  assert.match(result.pages[0], /Primera/);
  assert.match(result.pages[1], /Segunda/);
  assert.match(result.pages[2], /Tercera/);
});

test("rechaza un PDF con más páginas que el máximo", async () => {
  const pdf = buildPdf(["uno", "dos", "tres"]);

  await assert.rejects(extractPdf(pdf, { maxPages: 2 }), { code: "TOO_MANY_PAGES" });
});

test("rechaza un archivo que no es PDF", async () => {
  await assert.rejects(extractPdf(Buffer.from("no soy un pdf"), { maxPages: 10 }), {
    code: "PDF_UNREADABLE",
  });
});

test("un PDF sin texto devuelve páginas vacías", async () => {
  const pdf = buildPdf([""]);
  const result = await extractPdf(pdf, { maxPages: 10 });

  assert.equal(result.pageCount, 1);
  assert.equal(result.pages[0].trim(), "");
});
