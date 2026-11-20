#!/usr/bin/env node
/**
 * Publicador de ráster precalculado (Sprint 49).
 *
 * No calcula pendientes, sombras ni MCDA: recibe un GeoTIFF/COG ya producido
 * en QGIS/GDAL/GRASS, lo normaliza a COG, genera tiles WebP/PNG con GDAL en un
 * contenedor efímero y escribe el manifest + `raster/index.json`.
 *
 * Uso:
 *   npm run raster:publish -- \
 *     --file ./aptitud_jojoba.tif --layer aptitud_jojoba --version 2026-11 \
 *     --name "Aptitud para jojoba" --license "Uso institucional" \
 *     --producer "QGIS 3.40" --method "Weighted overlay" \
 *     --stats-csv ./aptitud_jojoba_stats.csv
 *
 * Requiere Podman o Docker para ejecutar GDAL. No instala GDAL en el host.
 */

import { createHash } from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import {
  buildRasterIndex,
  buildRasterManifest,
  defaultLegend,
  estimateTileCount,
  formatBytes,
  normalizeLegend,
  parseGdalInfo,
  parsePublishArgs,
  parseStatsCsv,
  readManifests,
  walkTiles,
} from "./lib/raster-utils.mjs";

const { Pool } = pg;

function which(command) {
  const result = spawnSync("sh", ["-c", `command -v ${command}`], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function detectEngine(preferred) {
  const candidate = preferred || process.env.RASTER_ENGINE || "";
  if (candidate) {
    if (!["podman", "docker"].includes(candidate)) {
      throw new Error("RASTER_ENGINE debe ser podman o docker.");
    }
    if (!which(candidate)) throw new Error(`No se encontró ${candidate} en PATH.`);
    return candidate;
  }
  if (which("podman")) return "podman";
  if (which("docker")) return "docker";
  throw new Error(
    "No se encontró Podman ni Docker. Instala uno para ejecutar GDAL en un contenedor."
  );
}

function mount(engine, source, target, { readOnly = false } = {}) {
  const options = [];
  if (readOnly) options.push("ro");
  if (engine === "podman" && process.platform === "linux") options.push("Z");
  return options.length > 0 ? `${source}:${target}:${options.join(",")}` : `${source}:${target}`;
}

function runEngine(engine, image, args, mounts = [], workdir = "/data") {
  const commandArgs = ["run", "--rm"];
  for (const item of mounts) {
    commandArgs.push("-v", mount(engine, item.source, item.target, { readOnly: item.readOnly }));
  }
  if (workdir) commandArgs.push("-w", workdir);
  commandArgs.push(image, ...args);
  try {
    return execFileSync(engine, commandArgs, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    const stderr = String(err.stderr || "").trim();
    throw new Error(
      `Falló ${engine} ${args[0]}: ${stderr || err.message || "sin detalle"}`
    );
  }
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const digest = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("data", (chunk) => digest.update(chunk));
    stream.on("end", () => resolve(digest.digest("hex")));
    stream.on("error", reject);
  });
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function gdalInfo(engine, image, inputDir, inputName) {
  const output = runEngine(
    engine,
    image,
    ["gdalinfo", "-json", "-mm", `/src/${inputName}`],
    [{ source: inputDir, target: "/src", readOnly: true }],
    "/src"
  );
  return JSON.parse(output);
}

function gdalTranslate(engine, image, inputDir, inputName, dataDir, versionRel) {
  runEngine(
    engine,
    image,
    [
      "gdal_translate",
      "-of",
      "COG",
      "-co",
      "COMPRESS=DEFLATE",
      "-co",
      "OVERVIEWS=AUTO",
      `/src/${inputName}`,
      `/data/${versionRel}/source.tif`,
    ],
    [
      { source: inputDir, target: "/src", readOnly: true },
      { source: dataDir, target: "/data" },
    ]
  );
}

function gdal2tiles(engine, image, outDir, dataDir, versionRel, opts, maxzoom, format) {
  const driver = format === "png" ? "PNG" : "WEBP";
  const processes = Math.max(1, Math.min(4, os.cpus().length));
  runEngine(
    engine,
    image,
    [
      "gdal2tiles.py",
      "--profile=mercator",
      "--xyz",
      `--zoom=${opts.minzoom}-${maxzoom}`,
      `--resampling=${opts.resampling}`,
      `--tiledriver=${driver}`,
      `--processes=${processes}`,
      `/data-src/${versionRel}/source.tif`,
      `/data-out/${versionRel}`,
    ],
    [
      { source: dataDir, target: "/data-src", readOnly: true },
      { source: outDir, target: "/data-out" },
    ],
    "/data-out"
  );
}

async function loadStats(rows, env) {
  const connectionString = env.DATABASE_ADMIN_URL || env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DATABASE_ADMIN_URL (o DATABASE_URL) para cargar --stats-csv.");
  }

  const pool = new Pool({
    connectionString,
    application_name: "woll-raster-publish",
    max: 1,
    statement_timeout: 60_000,
    connectionTimeoutMillis: 10_000,
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // La versión publicada debe tener exactamente las filas del CSV; si se
    // republica con menos clases/comunas, no deben quedar filas viejas.
    await client.query(
      "DELETE FROM public.raster_stats WHERE layer_id = $1 AND version = $2",
      [rows[0].layer_id, rows[0].version]
    );
    for (const row of rows) {
      await client.query(
        `INSERT INTO public.raster_stats (
           layer_id, version, admin_level, admin_code, admin_name,
           class_id, class_label, class_min, class_max,
           hectares, mean, min, max, p10, p90
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (layer_id, version, admin_level, admin_code, class_id)
         DO UPDATE SET
           admin_name = EXCLUDED.admin_name,
           class_label = EXCLUDED.class_label,
           class_min = EXCLUDED.class_min,
           class_max = EXCLUDED.class_max,
           hectares = EXCLUDED.hectares,
           mean = EXCLUDED.mean,
           min = EXCLUDED.min,
           max = EXCLUDED.max,
           p10 = EXCLUDED.p10,
           p90 = EXCLUDED.p90,
           computed_at = now()`,
        [
          row.layer_id,
          row.version,
          row.admin_level,
          row.admin_code,
          row.admin_name,
          row.class_id,
          row.class_label,
          row.class_min,
          row.class_max,
          row.hectares,
          row.mean,
          row.min,
          row.max,
          row.p10,
          row.p90,
        ]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

async function writeIndex(outDir) {
  const layers = await readManifests(outDir);
  const index = buildRasterIndex(layers);
  await writeFile(path.join(outDir, "index.json"), JSON.stringify(index, null, 2));
  return index;
}

function printHelp() {
  console.log(`Publicador de ráster precalculado

Uso:
  npm run raster:publish -- --file <tif> --layer <id> --version <v> [opciones]

Obligatorios:
  --file <ruta>       GeoTIFF/COG de entrada.
  --layer <slug>      Identificador de capa (minúsculas, números, guion bajo).
  --version <v>       Versión inmutable (ej. 2026-11).
  --name <texto>      Nombre visible.
  --license <texto>   Licencia o condiciones de uso.
  --producer <texto>  Productor (QGIS/GDAL/GRASS).
  --method <texto>    Método o modelo usado.

Opcionales:
  --description <texto>   Descripción de la ficha.
  --attribution <texto>   Atribución del mapa (default: WOLL Atacama).
  --created-at <fecha>    Fecha del producto (default: hoy).
  --legend <json>         Leyenda gradient/classes (default: gradiente neutro).
  --model <json>          Criterios, pesos y restricciones del MCDA.
  --stats-csv <csv>       Estadísticas por comuna/provincia/región.
  --minzoom <n>           Zoom mínimo (default: 8).
  --maxzoom <n>           Zoom máximo (default: 13).
  --format <webp|png>     Formato de tile (default: webp).
  --resampling <método>   near, bilinear, average, cubic o mode (default: bilinear).
  --max-tiles <n>         Límite de tiles (default: 20000).
  --max-mb <n>            Tamaño máximo de la fuente (default: 2048).
  --engine <podman|docker> Motor de contenedor (default: autodetecta).
  --gdal-image <imagen>   Imagen con GDAL.
  --out <dir>             Directorio de tiles (default: raster).
  --data-out <dir>        Directorio de fuentes (default: data/raster).
  --dry-run               Valida y estima sin escribir.
  --force                 Republica una versión existente.
  --help                  Esta ayuda.
`);
}

export async function publish(opts, env = process.env) {
  const input = path.resolve(opts.file);
  const inputStat = await stat(input);
  if (!inputStat.isFile()) throw new Error(`No es un archivo: ${input}`);
  if (inputStat.size > opts.maxMb * 1024 * 1024) {
    throw new Error(`El archivo supera ${opts.maxMb} MB.`);
  }

  const engine = detectEngine(opts.engine);
  const image = opts.gdalImage || env.RASTER_GDAL_IMAGE || "ghcr.io/osgeo/gdal:alpine-normal-latest";
  const inputDir = path.dirname(input);
  const inputName = path.basename(input);
  const cwd = process.cwd();
  const outDir = path.resolve(opts.out);
  const dataDir = path.resolve(opts.dataOut);
  const slug = opts.layer;
  const outRel = path.relative(cwd, path.join(outDir, slug, opts.version)).split(path.sep).join("/");
  const dataRel = path.relative(cwd, path.join(dataDir, slug, opts.version)).split(path.sep).join("/");
  const versionRel = path.join(slug, opts.version).split(path.sep).join("/");

  if (outRel.startsWith("..") || dataRel.startsWith("..")) {
    throw new Error("--out y --data-out deben quedar dentro del directorio actual.");
  }

  const info = gdalInfo(engine, image, inputDir, inputName);
  const meta = parseGdalInfo(info);
  // gdal2tiles (GDAL 3.14) solo soporta WebP para 3/4 bandas. Un ráster
  // temático de 1 banda o paleta se publica como PNG.
  const tileFormat = opts.format === "webp" && meta.band_count < 3 ? "png" : opts.format;
  if (tileFormat !== opts.format) {
    console.warn(
      `[raster-publish] Ráster de ${meta.band_count} banda(s): se usa PNG ` +
        "(WebP requiere 3 o 4 bandas)."
    );
  }
  const estimate = estimateTileCount(meta.bbox, opts.minzoom, opts.maxzoom);

  const sourceManifestPath = path.join(outDir, slug, opts.version, "manifest.json");
  const existing = await stat(sourceManifestPath).then(() => true).catch(() => false);
  if (existing && !opts.force) {
    throw new Error(
      `La versión ${slug}/${opts.version} ya está publicada. Usa otra --version o --force.`
    );
  }

  let legend;
  if (opts.legendFile) {
    legend = normalizeLegend(await readJson(opts.legendFile), meta.values.min, meta.values.max);
  } else {
    legend = defaultLegend(meta.values.min, meta.values.max);
  }
  const model = opts.modelFile ? await readJson(opts.modelFile) : null;

  let stats = null;
  if (opts.statsCsv) {
    stats = parseStatsCsv(await readFile(opts.statsCsv, "utf8"), {
      layerId: opts.layer,
      version: opts.version,
    });
  }

  if (opts.dryRun) {
    return {
      dryRun: true,
      engine,
      image,
      input: inputName,
      layer: slug,
      version: opts.version,
      crs: meta.crs,
      bbox: meta.bbox,
      size: [meta.width, meta.height],
      resolution_m: meta.resolution_m,
      values: meta.values,
      band_count: meta.band_count,
      format: tileFormat,
      estimated_tiles: estimate.total,
      zooms: estimate.zooms,
      stats_rows: stats?.length ?? 0,
      out: outRel,
      data: dataRel,
    };
  }

  // Una corrida cortada sin manifest no debe bloquear la publicación.
  await rm(path.join(outDir, slug, opts.version), { recursive: true, force: true });
  await rm(path.join(dataDir, slug, opts.version), { recursive: true, force: true });

  await mkdir(path.join(dataDir, slug, opts.version), { recursive: true });
  gdalTranslate(engine, image, inputDir, inputName, dataDir, versionRel);
  const sourcePath = path.join(dataDir, slug, opts.version, "source.tif");
  const sourceChecksum = await sha256File(sourcePath);

  let maxzoom = opts.maxzoom;
  let tiles = [];
  while (true) {
    await rm(path.join(outDir, slug, opts.version), { recursive: true, force: true });
    await mkdir(path.join(outDir, slug, opts.version), { recursive: true });
    gdal2tiles(engine, image, outDir, dataDir, versionRel, opts, maxzoom, tileFormat);
    tiles = await walkTiles(path.join(outDir, slug, opts.version), tileFormat);
    if (tiles.length === 0) {
      throw new Error("GDAL no generó tiles. Revisa la extensión y el CRS del ráster.");
    }
    if (tiles.length <= opts.maxTiles) break;
    if (maxzoom <= opts.minzoom) {
      throw new Error(
        `El ráster genera ${tiles.length} tiles en z${opts.minzoom}, sobre el límite ${opts.maxTiles}.`
      );
    }
    console.warn(
      `[raster-publish] ${tiles.length} tiles supera el límite ${opts.maxTiles}; ` +
        `se reintenta con maxzoom ${maxzoom - 1}.`
    );
    maxzoom -= 1;
  }

  if (stats && stats.length > 0) {
    await loadStats(stats, env);
  }

  const manifestBase = {
    layer_id: opts.layer,
    version: opts.version,
    name: opts.name,
    description: opts.description || "",
    source: {
      file: inputName,
      producer: opts.producer,
      method: opts.method,
      created_at: opts.createdAt || new Date().toISOString().slice(0, 10),
      license: opts.license,
      attribution: opts.attribution,
    },
    crs: meta.crs,
    bbox: meta.bbox,
    resolution_m: meta.resolution_m,
    width: meta.width,
    height: meta.height,
    nodata: meta.nodata,
    values: meta.values,
    legend,
    ...(model ? { model } : {}),
    tiles: {
      format: tileFormat,
      minzoom: opts.minzoom,
      maxzoom,
      maxzoom_requested: opts.maxzoom,
    },
    tile_url_template: `/raster/${slug}/${opts.version}/{z}/{x}/{y}.${tileFormat}`,
    generated_at: new Date().toISOString(),
    checksum: sourceChecksum,
  };
  const manifest = buildRasterManifest(manifestBase, tiles);
  const manifestPath = path.join(outDir, slug, opts.version, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  const index = await writeIndex(outDir);

  return {
    layer: opts.layer,
    version: opts.version,
    tiles: manifest.tiles.count,
    bytes: manifest.tiles.bytes,
    format: manifest.tiles.format,
    mb: Number((manifest.tiles.bytes / 1024 / 1024).toFixed(2)),
    maxzoom: manifest.tiles.maxzoom,
    maxzoom_requested: manifest.tiles.maxzoom_requested,
    stats_rows: stats?.length ?? 0,
    manifest: manifestPath,
    index_layers: index.layers.length,
    config: {
      nombre: opts.name,
      tipo: "raster",
      source: {
        type: "raster",
        raster: {
          mode: "static",
          version: opts.version,
          layerName: slug,
          urlTemplate: manifest.tile_url_template,
          manifest: `/raster/${slug}/${opts.version}/manifest.json`,
          minZoom: opts.minzoom,
          maxZoom: maxzoom,
          bounds: [
            [meta.bbox[1], meta.bbox[0]],
            [meta.bbox[3], meta.bbox[2]],
          ],
          opacity: 0.75,
          attribution: opts.attribution,
        },
      },
    },
  };
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const opts = parsePublishArgs(argv);
  if (opts.help) {
    printHelp();
    return;
  }

  const result = await publish(opts, env);
  if (result.dryRun) {
    console.log(JSON.stringify({ event: "dry-run", ...result }, null, 2));
    return;
  }

  console.log(
    JSON.stringify(
      {
        event: "published",
        layer: result.layer,
        version: result.version,
        tiles: result.tiles,
        format: result.format,
        bytes: result.bytes,
        size: formatBytes(result.bytes),
        maxzoom: result.maxzoom,
        maxzoom_requested: result.maxzoom_requested,
        stats_rows: result.stats_rows,
        manifest: result.manifest,
        index_layers: result.index_layers,
      },
      null,
      2
    )
  );
  console.log("\nSnippet para la config de la capa:\n");
  console.log(JSON.stringify(result.config, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(`[raster-publish] ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
