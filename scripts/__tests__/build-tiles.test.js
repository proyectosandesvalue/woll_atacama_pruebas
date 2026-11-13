import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildManifest,
  buildTiles,
  clampTile,
  defaultMaxzoomFor,
  latToTile,
  lonToTile,
  parseArgs,
  simplifyTolerance,
  tileTasks,
} from "../build-tiles.mjs";
import { dateVersion } from "../tiles-sync.mjs";

const BBOX = { minx: -71.6, miny: -29.2, maxx: -70.3, maxy: -26.0 };

test("lonToTile y latToTile calculan el tile Web Mercator", () => {
  assert.equal(lonToTile(-180, 0), 0);
  assert.equal(lonToTile(0, 1), 1);
  assert.equal(lonToTile(179.9, 2), 3);
  assert.equal(latToTile(0, 0), 0);
  assert.equal(latToTile(85, 0), 0);
  assert.equal(latToTile(-85, 0), 0);
  assert.equal(latToTile(0, 1), 1);
});

test("clampTile limita al rango válido del zoom", () => {
  assert.equal(clampTile(-1, 3), 0);
  assert.equal(clampTile(99, 3), 7);
  assert.equal(clampTile(3, 3), 3);
});

test("tileTasks cubre el bbox sin salir del mundo", () => {
  const { tasks, counts } = tileTasks(BBOX, 0, 2);
  assert.equal(tasks.length, 3);
  assert.deepEqual(counts, { 0: 1, 1: 1, 2: 1 });
  assert.deepEqual(tasks[2], { z: 2, x: 1, y: 2 });
  assert.ok(tasks.every((tile) => tile.x >= 0 && tile.x < 2 ** tile.z));
  assert.ok(tasks.every((tile) => tile.y >= 0 && tile.y < 2 ** tile.z));
});

test("simplifyTolerance baja a la mitad por zoom", () => {
  assert.ok(simplifyTolerance(10) > simplifyTolerance(11));
  assert.equal(simplifyTolerance(11), simplifyTolerance(10) / 2);
  assert.ok(simplifyTolerance(14) > 0);
});

test("defaultMaxzoomFor usa 12 para puntos y 14 para el resto", () => {
  assert.equal(defaultMaxzoomFor("point"), 12);
  assert.equal(defaultMaxzoomFor("MULTIPOINT"), 12);
  assert.equal(defaultMaxzoomFor("polygon"), 14);
  assert.equal(defaultMaxzoomFor("line"), 14);
  assert.equal(defaultMaxzoomFor("GEOMETRY"), 14);
});

test("buildManifest suma tiles/bytes y es independiente del orden", () => {
  const base = {
    layer_id: "demo",
    version: "2026",
    bbox: BBOX,
    minzoom: 0,
    maxzoom: 1,
  };
  const a = buildManifest(base, [
    { z: 1, x: 0, y: 1, bytes: 20 },
    { z: 0, x: 0, y: 0, bytes: 10 },
  ]);
  const b = buildManifest(base, [
    { z: 0, x: 0, y: 0, bytes: 10 },
    { z: 1, x: 0, y: 1, bytes: 20 },
  ]);
  assert.equal(a.tiles, 2);
  assert.equal(a.bytes, 30);
  assert.equal(a.checksum, b.checksum);
  assert.equal(a.checksum.length, 64);
});

test("buildManifest cambia el checksum si cambia un tile", () => {
  const base = { layer_id: "demo", version: "2026", bbox: BBOX, minzoom: 0, maxzoom: 0 };
  const a = buildManifest(base, [{ z: 0, x: 0, y: 0, bytes: 10 }]);
  const b = buildManifest(base, [{ z: 0, x: 0, y: 0, bytes: 11 }]);
  assert.notEqual(a.checksum, b.checksum);
});

test("parseArgs valida argumentos y rechaza rutas inseguras", () => {
  const opts = parseArgs([
    "--layer", "borde_costero", "--version", "2026", "--minzoom", "0", "--maxzoom", "14",
  ]);
  assert.equal(opts.layer, "borde_costero");
  assert.equal(opts.maxzoom, 14);

  assert.throws(() => parseArgs([]), /Falta --layer/);
  assert.throws(() => parseArgs(["--layer", "../etc"]), /--layer/);
  assert.throws(() => parseArgs(["--layer", "x", "--version", "a/b"]), /--version/);
  assert.throws(() => parseArgs(["--layer", "x", "--maxzoom", "19"]), /--maxzoom/);
  assert.throws(() => parseArgs(["--layer", "x", "--minzoom", "5", "--maxzoom", "4"]), /--maxzoom/);
});

test("dateVersion usa YYYYMMDD en UTC", () => {
  assert.equal(dateVersion("2026-11-12T23:30:00Z"), "20261112");
  assert.equal(dateVersion("no-es-fecha"), "dev");
});

test("buildTiles genera tiles y manifest contra PostGIS", { skip: !process.env.TILES_TEST_DATABASE_URL }, async () => {
  const pg = await import("pg");
  const pool = new pg.default.Pool({
    connectionString: process.env.TILES_TEST_DATABASE_URL,
    max: 2,
  });
  const out = await mkdtemp(path.join(os.tmpdir(), "woll-tiles-"));

  try {
    const result = await buildTiles(
      pool,
      parseArgs([
        "--layer", "borde_costero",
        "--version", "test",
        "--minzoom", "6",
        "--maxzoom", "6",
        "--workers", "1",
        "--out", out,
      ]),
      { log: () => {}, warn: () => {} }
    );

    assert.equal(result.manifest.layer_id, "borde_costero");
    assert.ok(result.manifest.tiles > 0);
    assert.equal(result.manifest.minzoom, 6);
    assert.equal(result.manifest.maxzoom, 6);

    const onDisk = JSON.parse(await readFile(result.manifestPath, "utf8"));
    assert.equal(onDisk.checksum, result.manifest.checksum);
    assert.equal(onDisk.tiles, result.manifest.tiles);
  } finally {
    await pool.end();
    await rm(out, { recursive: true, force: true });
  }
});
