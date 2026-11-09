import { test } from "node:test";
import assert from "node:assert/strict";

import { chunkPages, estimateTokens } from "../chunker.js";

const sentence = (n) =>
  `Esta es la oración número ${n} del documento de prueba sobre recursos hídricos.`;

const paragraph = (start, count = 10) =>
  Array.from({ length: count }, (_, i) => sentence(start + i)).join(" ");

test("texto vacío o sin páginas no produce chunks", () => {
  assert.deepEqual(chunkPages([]), []);
  assert.deepEqual(chunkPages([{ page: 1, text: "" }]), []);
  assert.deepEqual(chunkPages([{ page: 1, text: "   \n\n  " }]), []);
});

test("texto corto produce un solo chunk con página y sección nula", () => {
  const out = chunkPages([{ page: 3, text: "Hola mundo. Segunda oración." }]);

  assert.equal(out.length, 1);
  assert.equal(out[0].page_start, 3);
  assert.equal(out[0].page_end, 3);
  assert.equal(out[0].section, null);
  assert.equal(out[0].ordinal, 0);
});

test("ningún chunk supera maxTokens y los ordinales son consecutivos", () => {
  const text = Array.from({ length: 20 }, (_, i) => paragraph(i * 10)).join("\n\n");
  const out = chunkPages([{ page: 1, text }], { targetTokens: 100, overlapTokens: 20 });

  assert.ok(out.length > 3);
  for (const chunk of out) {
    assert.ok(
      estimateTokens(chunk.content) <= 150,
      `chunk ${chunk.ordinal} excede max: ${estimateTokens(chunk.content)}`
    );
  }
  out.forEach((chunk, index) => assert.equal(chunk.ordinal, index));
});

test("hay solape entre chunks consecutivos de la misma sección", () => {
  const text = Array.from({ length: 10 }, (_, i) => paragraph(i * 10)).join("\n\n");
  const out = chunkPages([{ page: 1, text }], { targetTokens: 100, overlapTokens: 40 });

  assert.ok(out.length >= 2);
  const head = out[1].content.slice(0, 40);
  assert.ok(out[0].content.includes(head), "el inicio del chunk 2 debe estar en el chunk 1");
});

test("no se pierde contenido: cada oración aparece en algún chunk", () => {
  const text = Array.from({ length: 8 }, (_, i) => paragraph(i * 10)).join("\n\n");
  const out = chunkPages([{ page: 1, text }], { targetTokens: 100, overlapTokens: 20 });
  const all = out.map((chunk) => chunk.content).join("\n");

  for (let n = 0; n < 80; n++) {
    assert.ok(all.includes(sentence(n)), `falta la oración ${n}`);
  }
});

test("registra páginas inicial y final", () => {
  const pages = [
    { page: 1, text: paragraph(0, 12) },
    { page: 2, text: paragraph(100, 12) },
  ];
  const out = chunkPages(pages, { targetTokens: 400, overlapTokens: 20 });

  assert.equal(Math.min(...out.map((chunk) => chunk.page_start)), 1);
  assert.equal(Math.max(...out.map((chunk) => chunk.page_end)), 2);
});

test("un cambio de artículo cierra el chunk y asigna sección", () => {
  const text = [
    "Artículo 1",
    paragraph(0, 15),
    "Artículo 2",
    paragraph(50, 15),
  ].join("\n\n");

  const out = chunkPages([{ page: 1, text }], {
    targetTokens: 400,
    overlapTokens: 20,
    minTokens: 50,
  });

  const sections = out.map((chunk) => chunk.section);
  assert.ok(sections.includes("Artículo 1"));
  assert.ok(sections.includes("Artículo 2"));

  const art2 = out.find((chunk) => chunk.section === "Artículo 2");
  assert.ok(!art2.content.includes(sentence(0)), "no debe mezclar artículos");
});

test("una palabra gigante se parte sin superar el máximo", () => {
  const out = chunkPages([{ page: 1, text: "x".repeat(10000) }], {
    targetTokens: 100,
    overlapTokens: 10,
  });

  assert.ok(out.length > 1);
  for (const chunk of out) assert.ok(estimateTokens(chunk.content) <= 150);
});

test("el solape nunca cruza un cambio de sección", () => {
  const text = [
    "Artículo 1",
    paragraph(0, 4),
    "Artículo 2",
    paragraph(100, 4),
  ].join("\n\n");

  const out = chunkPages([{ page: 1, text }], {
    targetTokens: 60,
    overlapTokens: 20,
    minTokens: 10,
  });

  const art2 = out.filter((chunk) => chunk.section === "Artículo 2");
  assert.ok(art2.length >= 1);
  assert.ok(art2.every((chunk) => !chunk.content.includes(sentence(0))));
});

test("valida la configuración", () => {
  assert.throws(() => chunkPages([], { targetTokens: 50, overlapTokens: 50 }), RangeError);
  assert.throws(() => chunkPages([], { targetTokens: 0 }), RangeError);
  assert.throws(() => chunkPages([], { targetTokens: 100, overlapTokens: -1 }), RangeError);
  assert.throws(
    () => chunkPages([], { targetTokens: 100, maxTokens: 50 }),
    RangeError
  );
});
