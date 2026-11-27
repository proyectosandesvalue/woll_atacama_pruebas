import test from "node:test";
import assert from "node:assert/strict";

import { isDocumentalQuestion } from "../router.js";

test("detecta preguntas documentales que no deben ir al pipeline de capas", () => {
  const questions = [
    "¿Qué método de riego predomina en el catastro 2024?",
    "¿Qué métodos de riego utilizados describe el informe 2024?",
    "¿Qué sistema de riego usa la mayoría de los predios?",
    "¿Qué dice el catastro 2024 sobre las especies que dominan?",
    "¿Cuáles son las especies con mayor superficie plantada en 2024?",
    "¿Qué infraestructura frutícola se describe en el informe 2018?",
    "¿Cuántos productores y predios se encuestaron en 2018?",
    "¿Cómo evolucionó la superficie de olivo entre 2018 y 2024?",
    "¿Qué producción y destino tuvo la fruticultura en 2024?",
  ];
  for (const q of questions) {
    assert.equal(isDocumentalQuestion(q), true, q);
  }
});

test("no desvía conteos, listados ni ubicaciones de capas", () => {
  const questions = [
    "¿Cuántos glaciares hay por comuna?",
    "¿Cuáles son los glaciares?",
    "¿Dónde están las plantas desaladoras?",
    "¿Cuántos registros por especie hay en el catastro?",
    "¿Cuántas hectáreas de vid de mesa hay por comuna?",
    "¿Cuántos derechos de agua hay en Copiapó?",
  ];
  for (const q of questions) {
    assert.equal(isDocumentalQuestion(q), false, q);
  }
});
