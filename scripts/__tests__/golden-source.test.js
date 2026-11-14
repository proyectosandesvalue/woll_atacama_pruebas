import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadGoldenCases } from "../lib/golden-source.mjs";
import {
  normalizeGoldenCases,
  seedGoldenCases,
} from "../golden-seed.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GOLDEN = path.join(ROOT, "server", "chat", "__evals__", "golden.json");

const FILE = {
  version: 2,
  cases: [{ id: "caso-json", level: 1, tier: 1, question: "¿Pregunta?" }],
};

const readFileMock = async () => JSON.stringify(FILE);

test("golden source usa el JSON si se fuerza --from-json", async () => {
  let called = false;
  const result = await loadGoldenCases({
    fromJson: true,
    getDB: async () => {
      called = true;
      return {};
    },
    readFile: readFileMock,
    goldenPath: "ignorado.json",
  });
  assert.equal(result.source, "json");
  assert.equal(result.cases[0].id, "caso-json");
  assert.equal(called, false);
});

test("golden source lee admin.golden_cases cuando hay casos activos", async () => {
  const result = await loadGoldenCases({
    getDB: async () => ({
      pool: { query: async () => [] },
      query: async () => [{ id: "caso-db", level: 1, tier: 2, question: "¿Otra?" }],
    }),
    readFile: readFileMock,
    goldenPath: "ignorado.json",
  });
  assert.equal(result.source, "db");
  assert.equal(result.cases[0].id, "caso-db");
});

test("golden source cae al JSON si la tabla está vacía", async () => {
  const result = await loadGoldenCases({
    getDB: async () => ({
      pool: { query: async () => [] },
      query: async () => [],
    }),
    readFile: readFileMock,
    goldenPath: "ignorado.json",
  });
  assert.equal(result.source, "json");
  assert.equal(result.cases[0].id, "caso-json");
});

test("golden source cae al JSON si la BD falla", async () => {
  const result = await loadGoldenCases({
    getDB: async () => {
      throw new Error("sin conexión");
    },
    readFile: readFileMock,
    goldenPath: "ignorado.json",
  });
  assert.equal(result.source, "json");
});

test("golden source cae al JSON si el driver no es PostgreSQL", async () => {
  const result = await loadGoldenCases({
    getDB: async () => ({ query: async () => [{ id: "no-deberia" }] }),
    readFile: readFileMock,
    goldenPath: "ignorado.json",
  });
  assert.equal(result.source, "json");
});

test("golden source rechaza un archivo sin cases[]", async () => {
  await assert.rejects(
    () =>
      loadGoldenCases({
        getDB: async () => ({}),
        readFile: async () => JSON.stringify({ version: 1 }),
        goldenPath: "ignorado.json",
      }),
    /cases/
  );
});

test("golden seed normaliza todos los casos del archivo real", async () => {
  const golden = JSON.parse(await readFile(GOLDEN, "utf8"));
  const rows = normalizeGoldenCases(golden);
  assert.ok(rows.length > 0);
  assert.equal(rows.length, golden.cases.length);

  const ids = new Set(rows.map((row) => row[0]));
  assert.equal(ids.size, rows.length, "los ids del golden set deben ser únicos");
  for (const row of rows) {
    assert.ok(row[1] >= 1 && row[1] <= 3, "level fuera de rango");
    assert.ok(row[2] >= 1 && row[2] <= 6, "tier fuera de rango");
    assert.equal(typeof JSON.parse(row[7]), "object");
  }
});

test("golden seed convierte tier nulo en 1 y omite historial vacío", () => {
  const rows = normalizeGoldenCases({
    cases: [
      { id: "caso-null", question: "¿Pregunta?", tier: null, expected: undefined },
    ],
  });
  assert.equal(rows[0][2], 1);
  assert.equal(rows[0][7], "{}");
  assert.equal(rows[0][9], null);
});

test("golden seed ejecuta BEGIN, un INSERT por caso y COMMIT", async () => {
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [] };
    },
  };
  await seedGoldenCases(client, [["caso-1"], ["caso-2"]]);
  assert.equal(calls[0].sql, "BEGIN");
  assert.equal(calls.filter((call) => call.sql.includes("INSERT INTO admin.golden_cases")).length, 2);
  assert.equal(calls.at(-1).sql, "COMMIT");
});

test("golden seed hace ROLLBACK si un INSERT falla", async () => {
  const calls = [];
  const client = {
    query: async (sql) => {
      calls.push(sql);
      if (sql.includes("INSERT INTO admin.golden_cases")) {
        throw new Error("falló el insert");
      }
      return { rows: [] };
    },
  };
  await assert.rejects(() => seedGoldenCases(client, [["caso-1"]]), /insert/);
  assert.ok(calls.includes("ROLLBACK"));
  assert.ok(!calls.includes("COMMIT"));
});
