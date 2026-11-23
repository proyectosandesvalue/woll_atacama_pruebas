#!/usr/bin/env node
/**
 * Worker de importación de capas GeoJSON (Sprint 47).
 *
 * Reclama jobs de `admin.layer_jobs`, ejecuta `load-layer --force --tiles` y
 * actualiza `admin.layers.config.source` con la versión de tiles generada.
 *
 * Uso:
 *   node --env-file=.env.local scripts/layer-worker.mjs
 *   node --env-file=.env.local scripts/layer-worker.mjs --once
 *
 * Variables:
 *   DATABASE_URL / WORKER_DATABASE_URL  cola admin.layer_jobs
 *   DATABASE_ADMIN_URL                  DDL/importación (fallback DATABASE_URL)
 *
 * Volúmenes requeridos: ./geojson y ./tiles.
 */

import { spawn, spawnSync } from "node:child_process";
import { lstat, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

import {
  readTileManifest,
  tileSlug,
  validateLayerKey,
} from "../server/admin/layer-files.js";

const { Pool } = pg;
const WORKER = "layer-worker";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function log(event, data = {}) {
  console.log(JSON.stringify({ event, worker: WORKER, ...data }));
}

function parseArgs(argv) {
  const opts = { once: false, pollMs: 2000, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--once") opts.once = true;
    else if (arg === "--poll") opts.pollMs = Math.max(500, Number(argv[++i]) || 2000);
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`Argumento desconocido: ${arg}`);
  }
  return opts;
}

function jobDatabaseUrl() {
  return process.env.WORKER_DATABASE_URL || process.env.DATABASE_URL || "";
}

function adminDatabaseUrl() {
  return process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL || "";
}

async function heartbeat(pool, details = {}) {
  await pool.query(
    `INSERT INTO admin.worker_heartbeats (worker, last_seen_at, details)
     VALUES ($1, now(), $2::jsonb)
     ON CONFLICT (worker) DO UPDATE
       SET last_seen_at = now(), details = EXCLUDED.details`,
    [WORKER, JSON.stringify(details)]
  );
}

async function claimJob(pool) {
  const { rows } = await pool.query(
    `WITH next AS (
       SELECT id FROM admin.layer_jobs
        WHERE status = 'queued'
        ORDER BY id
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE admin.layer_jobs j
        SET status = 'running', started_at = now(), heartbeat_at = now()
       FROM next
      WHERE j.id = next.id
      RETURNING j.*`
  );
  return rows[0] || null;
}

async function finishJob(pool, job, status, result, error = null) {
  await pool.query(
    `UPDATE admin.layer_jobs
        SET status = $2, result = $3::jsonb, error_code = $4,
            error_message = $5, finished_at = now(), heartbeat_at = now()
      WHERE id = $1`,
    [
      job.id,
      status,
      JSON.stringify(result || {}),
      error?.code || null,
      error ? String(error.message || "").slice(0, 800) : null,
    ]
  );
}

function runNode(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const append = (chunk) => {
      if (output.length < 12_000) output += chunk.toString();
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (err) => resolve({ code: -1, output: `${output}\n${err.message}` }));
    child.on("close", (code) => resolve({ code, output }));
  });
}

async function updateLayerSource(db, key, version, tiles) {
  const current = await db.query(
    "SELECT config FROM admin.layers WHERE layer_key = $1",
    [key]
  );
  if (current.rows.length === 0) throw new Error("La capa ya no existe.");
  const config = current.rows[0].config || {};
  const slug = tileSlug(key);

  if (tiles) {
    const manifest = await readTileManifest(key, version);
    config.source = {
      type: "postgis",
      idColumn: "gid",
      fallback: { type: "geojson", url: config.url || `geojson/uploads/${key}.geojson` },
      tiles: {
        mode: "static",
        version,
        layerName: key,
        urlTemplate: `/tiles/${slug}/${version}/{z}/{x}/{y}.mvt`,
        manifest: `/tiles/${slug}/${version}/manifest.json`,
        minZoom: manifest.minzoom ?? 0,
        maxZoom: manifest.maxzoom ?? 14,
      },
    };
  } else {
    config.source = {
      type: "postgis",
      idColumn: "gid",
      fallback: { type: "geojson", url: config.url || `geojson/uploads/${key}.geojson` },
    };
  }

  await db.query(
    `UPDATE admin.layers
        SET config = $2::jsonb,
            source_type = 'postgis',
            has_tiles = $3,
            updated_at = now(),
            updated_by = 'layer-worker'
      WHERE layer_key = $1`,
    [key, JSON.stringify(config), Boolean(tiles)]
  );
  return config;
}

const MAX_ZIP_ENTRIES = 100;
const MAX_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024;
const ZIP_EXTENSIONS = new Set([
  ".shp",
  ".shx",
  ".dbf",
  ".prj",
  ".cpg",
  ".sbn",
  ".sbx",
  ".xml",
]);

function runCli(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    code: result.status ?? -1,
    output: `${result.stdout || ""}${result.stderr || ""}`.trim(),
    error: result.error,
  };
}

export function validateZipEntries(names) {
  if (names.length === 0) throw new Error("El ZIP está vacío.");
  if (names.length > MAX_ZIP_ENTRIES) {
    throw new Error(`El ZIP supera las ${MAX_ZIP_ENTRIES} entradas.`);
  }

  for (const name of names) {
    if (
      name.startsWith("/") ||
      name.includes("\\") ||
      name.split("/").includes("..")
    ) {
      throw new Error(`Entrada de ZIP no permitida: ${name}`);
    }
    if (name.endsWith("/")) continue;
    const extension = path.extname(name).toLowerCase();
    if (!ZIP_EXTENSIONS.has(extension)) {
      throw new Error(`El ZIP contiene un archivo no permitido: ${name}`);
    }
  }

  return names;
}

export function validateUncompressedSize(total) {
  if (!Number.isFinite(total) || total < 0) {
    throw new Error("No se pudo medir el ZIP.");
  }
  if (total > MAX_UNCOMPRESSED_BYTES) {
    throw new Error("El ZIP supera 1 GB descomprimido.");
  }
  return total;
}

function listZipEntries(zipPath) {
  const namesResult = runCli("unzip", ["-Z1", zipPath]);
  if (namesResult.error?.code === "ENOENT") {
    throw new Error("unzip no está instalado en el worker.");
  }
  if (namesResult.code !== 0) {
    throw new Error(`No se pudo leer el ZIP: ${namesResult.output.slice(-800)}`);
  }

  const names = validateZipEntries(
    namesResult.output.split(/\r?\n/).filter(Boolean)
  );

  const listingResult = runCli("unzip", ["-l", zipPath]);
  if (listingResult.code !== 0) {
    throw new Error(`No se pudo medir el ZIP: ${listingResult.output.slice(-800)}`);
  }
  let total = 0;
  for (const line of listingResult.output.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+/);
    if (match) total += Number(match[1]);
  }
  validateUncompressedSize(total);

  return names;
}

async function extractZip(zipPath, destination) {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const result = runCli("unzip", ["-o", "-q", zipPath, "-d", destination]);
  if (result.code !== 0) {
    throw new Error(`No se pudo extraer el ZIP: ${result.output.slice(-800)}`);
  }
}

async function walkFiles(directory, out = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    const info = await lstat(full);
    if (info.isSymbolicLink()) {
      throw new Error(`El ZIP contiene un symlink: ${entry.name}`);
    }
    if (info.isDirectory()) await walkFiles(full, out);
    else if (info.isFile()) out.push(full);
  }
  return out;
}

export async function findShapefile(directory) {
  const files = await walkFiles(directory);
  const shapefiles = files.filter((file) => path.extname(file).toLowerCase() === ".shp");
  if (shapefiles.length !== 1) {
    throw new Error("El ZIP debe contener exactamente un archivo .shp.");
  }

  const shp = shapefiles[0];
  const base = path.basename(shp, path.extname(shp)).toLowerCase();
  const sameDir = files.filter((file) => path.dirname(file) === path.dirname(shp));
  for (const extension of [".dbf", ".shx", ".prj"]) {
    const match = sameDir.find(
      (file) =>
        path.extname(file).toLowerCase() === extension &&
        path.basename(file, path.extname(file)).toLowerCase() === base
    );
    if (!match) {
      throw new Error(`Falta el componente ${extension} del Shapefile.`);
    }
  }
  return shp;
}

async function shapefileToGeoJson(shpPath, outPath) {
  await mkdir(path.dirname(outPath), { recursive: true });
  const result = runCli("ogr2ogr", [
    "-f",
    "GeoJSON",
    "-t_srs",
    "EPSG:4326",
    outPath,
    shpPath,
  ]);
  if (result.error?.code === "ENOENT") {
    throw new Error("ogr2ogr no está instalado en el worker.");
  }
  if (result.code !== 0) {
    throw new Error(`ogr2ogr falló: ${result.output.slice(-1200)}`);
  }
}

async function processShapefileJob(job, payload, env, db) {
  const key = job.layer_key;
  validateLayerKey(key);
  const version = payload.version;
  if (!version) throw new Error("Falta la versión de tiles.");

  const zipRel = String(payload.file || "");
  if (!zipRel.startsWith("geojson/private/") || !zipRel.endsWith(".zip") || zipRel.includes("..")) {
    throw new Error("ZIP de capa inválido.");
  }
  const privateRoot = path.resolve(ROOT, "geojson", "private");
  const zipPath = path.resolve(ROOT, zipRel);
  if (!zipPath.startsWith(`${privateRoot}${path.sep}`)) {
    throw new Error("ZIP fuera de la carpeta privada.");
  }
  const zipInfo = await stat(zipPath);
  if (!zipInfo.isFile()) throw new Error("El ZIP no existe.");

  listZipEntries(zipPath);
  const extractDir = path.join(privateRoot, key);
  const tempGeoJson = path.join(privateRoot, `${key}.geojson.tmp`);

  try {
    await extractZip(zipPath, extractDir);
    const shp = await findShapefile(extractDir);
    await shapefileToGeoJson(shp, tempGeoJson);

    const args = [
      path.join(ROOT, "scripts", "load-layer.mjs"),
      shp,
      "--table", key,
      "--layer-id", key,
      "--dimension", payload.dimension_key || "otros",
      "--display-name", payload.display_name || key,
      "--force",
    ];
    if (payload.tiles !== false) {
      args.push("--tiles", "--tiles-version", version);
    }
    const run = await runNode(args, env);
    if (run.code !== 0) {
      throw new Error(`load-layer/Shapefile falló: ${run.output.slice(-1200)}`);
    }

    const geoJsonRel = `geojson/uploads/${key}.geojson`;
    const geoJsonPath = path.join(ROOT, geoJsonRel);
    await mkdir(path.dirname(geoJsonPath), { recursive: true });
    await rename(tempGeoJson, geoJsonPath);

    const current = await db.query(
      "SELECT config FROM admin.layers WHERE layer_key = $1",
      [key]
    );
    if (current.rows.length === 0) throw new Error("La capa ya no existe.");
    const config = {
      ...(current.rows[0].config || {}),
      url: geoJsonRel,
      upload: {
        format: "shapefile",
        file: zipRel,
        bytes: zipInfo.size,
      },
    };
    await db.query(
      `UPDATE admin.layers
          SET config = $2::jsonb, updated_at = now(), updated_by = 'layer-worker'
        WHERE layer_key = $1`,
      [key, JSON.stringify(config)]
    );

    const source = await updateLayerSource(db, key, version, payload.tiles !== false);
    return {
      format: "shapefile",
      version,
      tiles: source.source?.tiles || null,
      geojson: geoJsonRel,
      zip: zipRel,
    };
  } finally {
    await rm(extractDir, { recursive: true, force: true }).catch(() => {});
    await rm(tempGeoJson, { force: true }).catch(() => {});
  }
}

async function processJob(job, { db }) {
  const payload = job.payload || {};
  const key = job.layer_key;
  const adminUrl = adminDatabaseUrl();
  if (!adminUrl) throw new Error("Falta DATABASE_ADMIN_URL/DATABASE_URL.");

  const env = {
    ...process.env,
    DATABASE_ADMIN_URL: adminUrl,
    DATABASE_URL: adminUrl,
  };

  if (job.action === "import" && payload.format === "shapefile") {
    return processShapefileJob(job, payload, env, db);
  }

  if (job.action === "tiles") {
    const version = payload.version;
    if (!version) throw new Error("Falta la versión de tiles.");
    const run = await runNode(
      [path.join(ROOT, "scripts", "tiles-sync.mjs"), "--layer", key, "--version", version, "--force"],
      env
    );
    if (run.code !== 0) throw new Error(`tiles-sync falló: ${run.output.slice(-1200)}`);
    const config = await updateLayerSource(db, key, version, true);
    return { version, tiles: config.source?.tiles || null };
  }

  const file = String(payload.file || "");
  if (!file.startsWith("geojson/uploads/") || file.includes("..")) {
    throw new Error("Archivo de capa inválido.");
  }
  const version = payload.version;
  if (!version) throw new Error("Falta la versión de tiles.");
  if (payload.tiles === false) {
    const run = await runNode(
      [
        path.join(ROOT, "scripts", "load-layer.mjs"),
        file,
        "--table", key,
        "--layer-id", key,
        "--dimension", payload.dimension_key || "otros",
        "--display-name", payload.display_name || key,
        "--force",
      ],
      env
    );
    if (run.code !== 0) throw new Error(`load-layer falló: ${run.output.slice(-1200)}`);
    await updateLayerSource(db, key, version, false);
    return { version, tiles: false };
  }

  const run = await runNode(
    [
      path.join(ROOT, "scripts", "load-layer.mjs"),
      file,
      "--table", key,
      "--layer-id", key,
      "--dimension", payload.dimension_key || "otros",
      "--display-name", payload.display_name || key,
      "--force",
      "--tiles",
      "--tiles-version", version,
    ],
    env
  );
  if (run.code !== 0) throw new Error(`load-layer/tiles falló: ${run.output.slice(-1200)}`);

  const config = await updateLayerSource(db, key, version, true);
  return {
    version,
    tiles: config.source?.tiles || null,
    output: run.output.slice(-1000),
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(
      "Uso: node scripts/layer-worker.mjs [--once] [--poll 2000]\n" +
        "Requiere DATABASE_URL (cola) y DATABASE_ADMIN_URL (DDL/importación)."
    );
    return;
  }

  const url = jobDatabaseUrl();
  if (!url) throw new Error("Falta DATABASE_URL/WORKER_DATABASE_URL.");
  const jobPool = new Pool({
    connectionString: url,
    max: 2,
    application_name: `${WORKER}-jobs`,
    connectionTimeoutMillis: 10_000,
  });
  const adminUrl = adminDatabaseUrl();
  if (!adminUrl) throw new Error("Falta DATABASE_ADMIN_URL/DATABASE_URL.");
  const db = new Pool({
    connectionString: adminUrl,
    max: 2,
    application_name: WORKER,
    connectionTimeoutMillis: 10_000,
    options: "-c search_path=public,extensions",
  });

  await heartbeat(jobPool, { pid: process.pid, poll_ms: opts.pollMs });
  const stale = await jobPool.query(
    `UPDATE admin.layer_jobs
        SET status = 'failed', finished_at = now(),
            error_code = 'STALE_HEARTBEAT',
            error_message = 'Worker sin heartbeat por más de 10 minutos.'
      WHERE status = 'running'
        AND (heartbeat_at IS NULL OR heartbeat_at < now() - interval '10 minutes')
      RETURNING id`
  );
  if (stale.rowCount > 0) log("worker.recovered_stale", { jobs: stale.rowCount });
  const gdal = runCli("ogr2ogr", ["--version"]);
  log("worker.gdal", {
    available: gdal.code === 0,
    version: gdal.code === 0 ? gdal.output.split(/\r?\n/)[0] : null,
  });
  log("worker.start", { once: opts.once, poll_ms: opts.pollMs });

  let running = true;
  const stop = () => { running = false; };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  let exitCode = 0;
  while (running) {
    const job = await claimJob(jobPool);
    if (!job) {
      if (opts.once) break;
      await heartbeat(jobPool, { pid: process.pid, poll_ms: opts.pollMs });
      await new Promise((resolve) => setTimeout(resolve, opts.pollMs));
      continue;
    }

    log("job.start", { id: job.id, layer: job.layer_key, action: job.action });
    const timer = setInterval(() => {
      heartbeat(jobPool, { pid: process.pid }).catch(() => {});
    }, 15_000);
    timer.unref?.();

    try {
      const result = await processJob(job, { jobPool, db });
      await finishJob(jobPool, job, "succeeded", result);
      log("job.finish", { id: job.id, status: "succeeded", layer: job.layer_key });
    } catch (err) {
      exitCode = 1;
      await finishJob(jobPool, job, "failed", {}, err);
      log("job.fail", {
        id: job.id,
        layer: job.layer_key,
        code: err?.code || "INTERNAL",
        message: String(err?.message || "").slice(0, 300),
        ...(process.env.LAYER_DEBUG === "1"
          ? { stack: String(err?.stack || "").split("\n").slice(0, 6) }
          : {}),
      });
    } finally {
      clearInterval(timer);
    }

    if (opts.once) break;
    await heartbeat(jobPool, { pid: process.pid, poll_ms: opts.pollMs });
  }

  await jobPool.end().catch(() => {});
  await db.end().catch(() => {});
  if (opts.once) process.exitCode = exitCode;
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((err) => {
    log("worker.fatal", { message: String(err?.message || err).slice(0, 300) });
    process.exitCode = 1;
  });
}
