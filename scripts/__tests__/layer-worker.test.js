import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  findShapefile,
  validateUncompressedSize,
  validateZipEntries,
} from "../layer-worker.mjs";

test("validateZipEntries acepta los componentes de un Shapefile", () => {
  assert.deepEqual(
    validateZipEntries(["capa.shp", "capa.dbf", "capa.shx", "capa.prj", "capa.cpg"]),
    ["capa.shp", "capa.dbf", "capa.shx", "capa.prj", "capa.cpg"]
  );
});

test("validateZipEntries rechaza paths y extensiones peligrosas", () => {
  assert.throws(() => validateZipEntries(["../capa.shp"]), /no permitida/);
  assert.throws(() => validateZipEntries(["/etc/passwd"]), /no permitida/);
  assert.throws(() => validateZipEntries(["capa\\mal.shp"]), /no permitida/);
  assert.throws(() => validateZipEntries(["capa.exe"]), /no permitido/);
  assert.throws(() => validateZipEntries([]), /vacío/);
});

test("validateZipEntries limita la cantidad de entradas", () => {
  const many = Array.from({ length: 101 }, (_, index) => `capa_${index}.shp`);
  assert.throws(() => validateZipEntries(many), /100 entradas/);
});

test("validateUncompressedSize rechaza más de 1 GB", () => {
  assert.equal(validateUncompressedSize(1024), 1024);
  assert.throws(() => validateUncompressedSize(1024 * 1024 * 1024 + 1), /1 GB/);
  assert.throws(() => validateUncompressedSize(Number.NaN), /medir/);
});

test("findShapefile exige un solo .shp con sus componentes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "woll-shp-"));
  try {
    await writeFile(path.join(root, "capa.shp"), "shp");
    await writeFile(path.join(root, "capa.dbf"), "dbf");
    await writeFile(path.join(root, "capa.shx"), "shx");
    await writeFile(path.join(root, "capa.prj"), "prj");
    assert.equal(await findShapefile(root), path.join(root, "capa.shp"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("findShapefile rechaza .prj faltante y múltiples .shp", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "woll-shp-"));
  try {
    await writeFile(path.join(root, "capa.shp"), "shp");
    await writeFile(path.join(root, "capa.dbf"), "dbf");
    await writeFile(path.join(root, "capa.shx"), "shx");
    await assert.rejects(findShapefile(root), /\.prj/);

    await writeFile(path.join(root, "capa.prj"), "prj");
    await writeFile(path.join(root, "otra.shp"), "shp");
    await assert.rejects(findShapefile(root), /exactamente un archivo \.shp/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
