import { test } from "node:test";
import assert from "node:assert/strict";

import { fastClassify } from "../classifier-fast.js";

test("clasifica proximidad derechos-río con 1 km", () => {
  const result = fastClassify(
    "¿Cuántos derechos de agua hay a menos de 1 km de un río?"
  );

  assert.equal(result.domain, "IN");
  assert.equal(result.pipeline, "proximidad_conteo");
  assert.equal(result.slots.layer_id_source, "derechos_agua_2025");
  assert.deepEqual(result.slots.layer_id_targets, ["hidrografia"]);
  assert.equal(result.slots.distance_m, 1000);
});

test("convierte metros y kilómetros decimales", () => {
  const metros = fastClassify(
    "¿Cuántos humedales hay a menos de 500 m de un río?"
  );
  assert.equal(metros.slots.distance_m, 500);

  const km = fastClassify(
    "¿Cuántos glaciares hay a menos de 2,5 km de un río?"
  );
  assert.equal(km.slots.distance_m, 2500);
});

test("no aplica si hay historial", () => {
  const result = fastClassify(
    "¿Cuántos derechos de agua hay a menos de 1 km de un río?",
    [{ role: "user", content: "otra pregunta" }]
  );

  assert.equal(result, null);
});

test("no aplica sin fuente, target o distancia explícita", () => {
  assert.equal(
    fastClassify("¿Cuántos derechos de agua hay cerca de algo?"),
    null
  );
  assert.equal(
    fastClassify("¿Cuántos derechos de agua hay a menos de 1 km?"),
    null
  );
  assert.equal(
    fastClassify("¿Cuántos elementos hay a menos de 1 km de un río?"),
    null
  );
});
