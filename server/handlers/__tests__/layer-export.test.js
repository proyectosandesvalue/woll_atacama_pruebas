import { test } from "node:test";
import assert from "node:assert/strict";

import {
  escapeCSV,
  handleLayerExport,
  parseColumns,
  parseFilter,
} from "../layer-export.js";

const COLUMNS = ["fid", "nombre", "zona", "superficie"];

test("parseFilter vacío no genera WHERE", () => {
  assert.deepEqual(parseFilter(undefined, COLUMNS), { where: "", params: [] });
});

test("parseFilter compila 'in' parametrizado", () => {
  const { where, params } = parseFilter(
    JSON.stringify({
      op: "and",
      conditions: [{ column: "zona", operator: "in", value: ["ZP", "ZT"] }],
    }),
    COLUMNS
  );
  assert.match(where, /"zona"::text = ANY\(\$1::text\[\]\)/);
  assert.deepEqual(params, [["ZP", "ZT"]]);
});

test("parseFilter compila comparaciones numéricas", () => {
  const { where, params } = parseFilter(
    JSON.stringify({
      op: "and",
      conditions: [{ column: "superficie", operator: ">=", value: 10 }],
    }),
    COLUMNS
  );
  assert.match(where, /"superficie"::numeric >= \$1::numeric/);
  assert.deepEqual(params, [10]);
});

test("parseFilter rechaza columnas, operadores y JSON inválidos", () => {
  assert.throws(
    () =>
      parseFilter(
        JSON.stringify({
          op: "and",
          conditions: [{ column: "geom", operator: "=", value: "x" }],
        }),
        COLUMNS
      ),
    /Columna no permitida/
  );
  assert.throws(
    () =>
      parseFilter(
        JSON.stringify({
          op: "and",
          conditions: [{ column: "zona", operator: "drop", value: "x" }],
        }),
        COLUMNS
      ),
    /Operador no permitido/
  );
  assert.throws(() => parseFilter("no-json", COLUMNS), /JSON válido/);
  assert.throws(
    () => parseFilter(JSON.stringify({ op: "or", conditions: [] }), COLUMNS),
    /op: 'and'/
  );
});

test("parseColumns valida y conserva encabezados", () => {
  assert.deepEqual(parseColumns(undefined, undefined, COLUMNS), {
    columns: COLUMNS,
    labels: COLUMNS,
  });
  assert.deepEqual(
    parseColumns('["zona","nombre"]', '["Zona","Nombre"]', COLUMNS),
    { columns: ["zona", "nombre"], labels: ["Zona", "Nombre"] }
  );
  assert.throws(() => parseColumns("geom", undefined, COLUMNS), /no permitida/);
  assert.throws(
    () => parseColumns('["zona"]', '["Zona","Otra"]', COLUMNS),
    /mismo largo/
  );
});

test("escapeCSV escapa comillas, saltos y nulos", () => {
  assert.equal(escapeCSV(null), '""');
  assert.equal(escapeCSV('a;b'), '"a;b"');
  assert.equal(escapeCSV('a"b'), '"a""b"');
  assert.equal(escapeCSV("a\nb\r"), '"a b"');
});

function createDB(responses) {
  return {
    query: async () => {
      const next = responses.shift();
      if (!next) throw new Error("query inesperada");
      return next;
    },
  };
}

test("handleLayerExport genera CSV en streaming", async () => {
  const db = createDB([
    [{ physical_table: "public.demo" }],
    [{ f_geometry_column: "geom" }],
    [{ column_name: "fid" }, { column_name: "nombre" }],
    [{ fid: 1, nombre: "A;B" }],
  ]);

  const result = await handleLayerExport(
    { layer_id: "demo", format: "csv" },
    { getDB: async () => db }
  );

  assert.equal(result.status, 200);
  assert.match(result.headers["Content-Type"], /text\/csv/);

  let body = "";
  for await (const chunk of result.stream) body += chunk;
  assert.match(body, /^\uFEFF"fid";"nombre"/);
  assert.match(body, /"1";"A;B"/);
});

test("handleLayerExport genera GeoJSON con filtro", async () => {
  const db = createDB([
    [{ physical_table: "public.demo" }],
    [{ f_geometry_column: "geom" }],
    [{ column_name: "fid" }, { column_name: "nombre" }],
    [{ feature: { type: "Feature", properties: { fid: 1 }, geometry: null } }],
  ]);

  const result = await handleLayerExport(
    { layer_id: "demo", format: "geojson" },
    { getDB: async () => db }
  );

  let body = "";
  for await (const chunk of result.stream) body += chunk;
  const parsed = JSON.parse(body);
  assert.equal(parsed.type, "FeatureCollection");
  assert.equal(parsed.features.length, 1);
});

test("handleLayerExport rechaza layer_id inválido", async () => {
  const result = await handleLayerExport(
    { layer_id: "../x" },
    { getDB: async () => createDB([]) }
  );
  assert.equal(result.status, 400);
});

test("handleLayerExport devuelve 404 si la capa no existe", async () => {
  const db = createDB([[]]);
  const result = await handleLayerExport(
    { layer_id: "no_existe" },
    { getDB: async () => db }
  );
  assert.equal(result.status, 404);
});
