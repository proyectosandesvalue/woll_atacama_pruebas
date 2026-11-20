import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildRasterManifest } from "../lib/raster-utils.mjs";
import { main } from "../raster-sync.mjs";

async function writeVersion(root, layer, version, { generatedAt, bytes = 3, format = "webp" }) {
  const dir = path.join(root, layer, version);
  await mkdir(path.join(dir, "8", "0"), { recursive: true });
  const tile = path.join(dir, "8", "0", "1.webp");
  await writeFile(tile, Buffer.alloc(bytes, 1));
  const manifest = buildRasterManifest(
    {
      layer_id: layer,
      version,
      bbox: [-71, -30, -70, -29],
      tile_url_template: `/raster/${layer}/${version}/{z}/{x}/{y}.${format}`,
      generated_at: generatedAt,
      tiles: { format, minzoom: 8, maxzoom: 8 },
    },
    [{ rel: "8/0/1.webp", bytes }]
  );
  await writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

test("raster:sync --index publica índice con la versión más reciente", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "woll-raster-sync-"));
  try {
    await writeVersion(root, "aptitud", "2026-10", { generatedAt: "2026-10-01T00:00:00Z" });
    await writeVersion(root, "aptitud", "2026-11", { generatedAt: "2026-11-01T00:00:00Z" });

    await main(["--index", "--out", root]);

    const index = JSON.parse(await readFile(path.join(root, "index.json"), "utf8"));
    assert.equal(index.layers.length, 1);
    assert.equal(index.layers[0].layer_id, "aptitud");
    assert.equal(index.layers[0].active_version, "2026-11");
    assert.equal(index.layers[0].versions[0].tiles, 1);
    assert.equal(index.layers[0].versions[0].url_template, "/raster/aptitud/2026-11/{z}/{x}/{y}.webp");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("raster:sync --prune --keep 1 conserva la versión reciente", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "woll-raster-sync-"));
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "woll-raster-data-"));
  try {
    await writeVersion(root, "aptitud", "2026-10", { generatedAt: "2026-10-01T00:00:00Z" });
    await writeVersion(root, "aptitud", "2026-11", { generatedAt: "2026-11-01T00:00:00Z" });

    await main([
      "--prune",
      "--keep", "1",
      "--out", root,
      "--data-out", dataRoot,
    ]);

    const oldManifest = await readFile(
      path.join(root, "aptitud", "2026-10", "manifest.json"),
      "utf8"
    ).catch(() => null);
    const newManifest = await readFile(
      path.join(root, "aptitud", "2026-11", "manifest.json"),
      "utf8"
    ).catch(() => null);
    assert.equal(oldManifest, null);
    assert.ok(newManifest);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(dataRoot, { recursive: true, force: true });
  }
});
