import test from "node:test";
import assert from "node:assert/strict";

import tool, { INDICATORS, parseArclimRows } from "../get-arclim-forecast.js";

test("ARClim expone los 26 indicadores del catálogo", () => {
  assert.equal(Object.keys(INDICATORS).length, 26);
  assert.ok(INDICATORS.hot_days);
  assert.ok(INDICATORS.spi);
  assert.ok(INDICATORS.huss_mean);
  assert.equal(
    tool.schema.function.parameters.properties.indicador.enum.length,
    26
  );
});

test("parseArclimRows convierte filas y tolera nulos", () => {
  const rows = parseArclimRows(
    [
      ["Copiapó", "1.5", null, "3.5"],
      ["Vallenar", 2, 4, 6],
      ["sin datos"],
    ],
    "hot_days"
  );
  assert.equal(rows.length, 2);
  assert.deepStrictEqual(rows[0], {
    comuna: "Copiapó",
    historico: 1.5,
    futuro_ssp245: null,
    futuro_ssp585: 3.5,
  });
  assert.deepStrictEqual(rows[1], {
    comuna: "Vallenar",
    historico: 2,
    futuro_ssp245: 4,
    futuro_ssp585: 6,
  });
});

test("parseArclimRows descarta indicadores desconocidos", () => {
  assert.deepStrictEqual(parseArclimRows([["Copiapó", 1, 2, 3]], "no_existe"), []);
});
