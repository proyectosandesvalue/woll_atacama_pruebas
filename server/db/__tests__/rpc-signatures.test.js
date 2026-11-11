import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  RPC_SIGNATURES,
  buildRpcCall,
  getRpcSignature,
  listRpcNames,
} from "../rpc-signatures.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SOURCE_DIRS = ["server", "scripts", "api"];

async function walk(dir) {
  const entries = await readdir(path.join(ROOT, dir), { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      files.push(...(await walk(relative)));
    } else if (/\.(m?js)$/.test(entry.name) && !entry.name.endsWith(".test.js")) {
      files.push(relative);
    }
  }

  return files;
}

async function rpcNamesInSource() {
  const names = new Set();

  for (const dir of SOURCE_DIRS) {
    for (const file of await walk(dir)) {
      const text = await readFile(path.join(ROOT, file), "utf8");
      for (const match of text.matchAll(/\.rpc\(\s*["']([^"']+)["']/g)) {
        names.add(match[1]);
      }
    }
  }

  return names;
}

test("todas las RPC usadas en el código están registradas", async () => {
  const used = await rpcNamesInSource();
  const missing = [...used].filter((name) => !RPC_SIGNATURES[name]);

  assert.deepEqual(missing, [], `Faltan firmas: ${missing.join(", ")}`);
  assert.ok(used.size >= 40, `Se esperaban >= 40 RPCs, se encontraron ${used.size}`);
});

test("cada firma tiene schema, params y tipo de retorno", () => {
  for (const name of listRpcNames()) {
    const signature = getRpcSignature(name);
    assert.equal(signature.schema, "public", `${name}: schema`);
    assert.equal(typeof signature.params, "object", `${name}: params`);
    assert.equal(signature.returns, "value", `${name}: returns`);
  }
});

test("construye una RPC con parámetros nombrados y casts", () => {
  const call = buildRpcCall("chat_query", {
    p_layer: "desaladoras",
    p_filters: { tipo: "salar" },
    p_limit: 20,
  });

  assert.equal(
    call.sql,
    "SELECT public.chat_query(p_layer => $1::text, p_filters => $2::jsonb, p_limit => $3::int) AS result"
  );
  assert.deepEqual(call.values, ["desaladoras", '{"tipo":"salar"}', 20]);
});

test("omite parámetros ausentes y respeta null", () => {
  const call = buildRpcCall("chat_query", {
    p_layer: "desaladoras",
    p_filters: null,
  });

  assert.equal(
    call.sql,
    "SELECT public.chat_query(p_layer => $1::text, p_filters => $2::jsonb) AS result"
  );
  assert.deepEqual(call.values, ["desaladoras", null]);
});

test("construye una RPC sin parámetros", () => {
  const call = buildRpcCall("chat_catalog");
  assert.equal(call.sql, "SELECT public.chat_catalog() AS result");
  assert.deepEqual(call.values, []);
});

test("preserva arrays para text[]", () => {
  const call = buildRpcCall("chat_count_near_layer", {
    p_layer_source: "derechos_agua_2025",
    p_layer_targets: ["hidrografia"],
    p_distance_m: 1000,
    p_filters: {},
  });

  assert.match(call.sql, /p_layer_targets => \$2::text\[\]/);
  assert.deepEqual(call.values[1], ["hidrografia"]);
});

test("rechaza RPCs y parámetros no registrados", () => {
  assert.throws(() => buildRpcCall("drop_all_tables"), /RPC no registrada/);
  assert.throws(
    () => buildRpcCall("chat_query", { p_layer: "x", p_sql: "DROP TABLE" }),
    /Parámetros no permitidos/
  );
});
