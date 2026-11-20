#!/usr/bin/env node
/**
 * Ciclo de vida de los rásteres precalculados (Sprint 49).
 *
 *   npm run raster:sync -- --index
 *   npm run raster:sync -- --check
 *   npm run raster:sync -- --prune --keep 2 --dry-run
 *   npm run raster:sync -- --prune --prune-sources
 *
 * No calcula rásteres ni toca PostgreSQL: solo lee manifests, verifica tiles
 * y aplica retención. El cálculo y la publicación viven en raster-publish.mjs.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildRasterIndex,
  formatBytes,
  parseSyncArgs,
  readManifests,
  verifyVersion,
} from "./lib/raster-utils.mjs";

function printHelp() {
  console.log(`Ciclo de vida de rásteres precalculados

Uso:
  npm run raster:sync -- [acción] [opciones]

Acciones (por defecto --index):
  --index            Regenera raster/index.json.
  --check            Verifica tiles, bytes y checksum contra el manifest.
  --prune            Aplica retención de versiones (ver --keep).
  --prune-sources    También borra las fuentes COG de las versiones podadas.

Opciones:
  --layer <id>       Limita a una capa.
  --version <v>      Limita a una versión (para --check).
  --keep <n>         Versiones de tiles a conservar (default: 2).
  --out <dir>        Directorio de tiles (default: raster).
  --data-out <dir>   Directorio de fuentes (default: data/raster).
  --dry-run          Muestra el plan sin escribir ni borrar.
  --help             Esta ayuda.
`);
}

async function writeIndex(outDir, dryRun) {
  const layers = await readManifests(outDir);
  const index = buildRasterIndex(layers);
  if (dryRun) {
    console.log(`[raster-sync] índice: ${layers.length} capas (dry-run, no se escribe)`);
    return index;
  }
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "index.json"), JSON.stringify(index, null, 2));
  console.log(`[raster-sync] índice escrito: ${layers.length} capas`);
  return index;
}

async function checkAll(outDir, opts) {
  const layers = await readManifests(outDir);
  let failures = 0;
  let checked = 0;

  for (const layer of layers) {
    if (opts.layer && layer.layer_id !== opts.layer) continue;
    for (const entry of layer.versions) {
      if (opts.version && entry.version !== opts.version) continue;
      checked += 1;
      const manifest = JSON.parse(await readFile(entry.manifestPath, "utf8"));
      const errors = await verifyVersion(
        path.join(outDir, layer.layer_slug, entry.version),
        manifest
      );
      if (errors.length > 0) {
        failures += 1;
        console.error(
          `[raster-sync] ${layer.layer_id}/${entry.version}: ${errors.join("; ")}`
        );
      } else {
        console.log(
          `[raster-sync] ${layer.layer_id}/${entry.version}: ok ` +
            `(${manifest.tiles.count} tiles, ${formatBytes(manifest.tiles.bytes)})`
        );
      }
    }
  }

  console.log(
    `[raster-sync] verificación: ${checked} versiones, ` +
      `${failures === 0 ? "sin errores" : `${failures} con errores`}`
  );
  return failures;
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function pruneAll(outDir, dataDir, opts) {
  const layers = await readManifests(outDir);
  let removedTiles = 0;
  let removedSources = 0;

  for (const layer of layers) {
    if (opts.layer && layer.layer_id !== opts.layer) continue;
    for (const entry of layer.versions.slice(opts.keep)) {
      const tileTarget = path.resolve(outDir, layer.layer_slug, entry.version);
      if (!inside(path.resolve(outDir), tileTarget)) {
        throw new Error(`Ruta de tiles fuera de ${outDir}: ${tileTarget}`);
      }
      console.log(
        `[raster-sync] prune ${layer.layer_id}/${entry.version} ` +
          `(${opts.dryRun ? "dry-run" : "borrando"})`
      );
      if (!opts.dryRun) await rm(tileTarget, { recursive: true, force: true });
      removedTiles += 1;

      if (opts.pruneSources) {
        const sourceTarget = path.resolve(dataDir, layer.layer_slug, entry.version);
        if (!inside(path.resolve(dataDir), sourceTarget)) {
          throw new Error(`Ruta de fuente fuera de ${dataDir}: ${sourceTarget}`);
        }
        console.log(
          `[raster-sync] prune source ${layer.layer_id}/${entry.version} ` +
            `(${opts.dryRun ? "dry-run" : "borrando"})`
        );
        if (!opts.dryRun) await rm(sourceTarget, { recursive: true, force: true });
        removedSources += 1;
      }
    }
  }

  console.log(
    `[raster-sync] retención: ${removedTiles} versiones de tiles ` +
      `${opts.dryRun ? "a borrar" : "borradas"}` +
      (opts.pruneSources
        ? `, ${removedSources} fuentes ${opts.dryRun ? "a borrar" : "borradas"}`
        : " (fuentes conservadas)") +
      ` (keep=${opts.keep})`
  );
  return { removedTiles, removedSources };
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseSyncArgs(argv);
  if (opts.help) {
    printHelp();
    return;
  }

  const outDir = path.resolve(opts.out);
  const dataDir = path.resolve(opts.dataOut);
  let failures = 0;

  if (opts.check) failures = await checkAll(outDir, opts);
  if (opts.prune) await pruneAll(outDir, dataDir, opts);
  if (opts.index) await writeIndex(outDir, opts.dryRun);

  if (failures > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(`[raster-sync] ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
