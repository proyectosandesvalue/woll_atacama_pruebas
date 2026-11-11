import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checksum,
  parseArgs,
  selectFiles,
  versionNumber,
} from "../../../scripts/migrate.mjs";

test("parsea --status, --dry-run y --to", () => {
  assert.deepEqual(parseArgs(["--status", "--dry-run", "--to", "010"]), {
    status: true,
    dryRun: true,
    to: "010",
    help: false,
  });

  assert.deepEqual(parseArgs(["--to=001"]), {
    status: false,
    dryRun: false,
    to: "001",
    help: false,
  });
});

test("rechaza --to sin tres dígitos y argumentos desconocidos", () => {
  assert.throws(() => parseArgs(["--to", "10"]), /3 dígitos/);
  assert.throws(() => parseArgs(["--nope"]), /Argumento desconocido/);
});

test("ordena y filtra por prefijo numérico", () => {
  const files = [
    "010_chat_layer_features.sql",
    "001_chat_fase1.sql",
    "000_compat_roles.sql",
    "no-es-migracion.sql",
  ];

  assert.deepEqual(selectFiles(files), [
    "010_chat_layer_features.sql",
    "001_chat_fase1.sql",
    "000_compat_roles.sql",
  ]);

  assert.deepEqual(selectFiles(files, "001"), [
    "001_chat_fase1.sql",
    "000_compat_roles.sql",
  ]);
});

test("extrae el número de versión", () => {
  assert.equal(versionNumber("000_compat_roles.sql"), 0);
  assert.equal(versionNumber("037_proximity_geography.sql"), 37);
  assert.equal(versionNumber("foo.sql"), null);
});

test("el checksum es estable y cambia con el contenido", () => {
  const a = checksum("SELECT 1;");
  const b = checksum("SELECT 1;");
  const c = checksum("SELECT 2;");

  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.length, 64);
});
