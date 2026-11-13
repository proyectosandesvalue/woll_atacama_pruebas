#!/usr/bin/env node
/**
 * Ciclo de vida de los tiles pregenerados (Sprint 08-A / 08-G).
 *
 * Publica versiones inmutables por capa, detecta capas nuevas o editadas en
 * `chat.chat_catalog`, mantiene `tiles/index.json` y aplica retención.
 *
 * Uso:
 *   npm run tiles:sync -- --changed          # capas nuevas o editadas
 *   npm run tiles:sync -- --all              # todas las que no tengan tiles
 *   npm run tiles:sync -- --layer humedales --version 2026
 *   npm run tiles:sync -- --index            # solo regenera el índice
 *   npm run tiles:sync -- --check            # manifiestos vs archivos y BD
 *   npm run tiles:sync -- --prune --keep 2   # retención de versiones
 *
 * Flujo al agregar una capa:
 *   1. `npm run layer:load -- geojson/foo.geojson --table foo ... --tiles`
 *      (o `npm run tiles:sync -- --changed` después).
 *   2. Se genera `tiles/<layer>/<version>/...` y su manifest con checksum.
 *   3. Se regenera `tiles/index.json`; la config apunta a la versión activa.
 *   4. Nginx sirve la versión nueva con caché inmutable (URL nueva).
 *
 * Versiones: si no se pasa `--version`, una capa nueva usa la fecha de
 * `updated_at` (YYYYMMDD). Una versión publicada no se sobrescribe: para
 * republicar la misma edición hay que pasar `--force` explícitamente.
 *
 * Sprint 08-G.
 */

import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import {
  buildManifest,
  buildTiles,
  defaultMaxzoomFor,
  parseArgs as parseBuildArgs,
  tileSlug,
} from "./build-tiles.mjs";

const { Pool } = pg;
const MANIFEST = "manifest.json";
const INDEX = "index.json";

function parseArgs(argv) {
  const opts = {
    all: false,
    changed: false,
    index: false,
    check: false,
    prune: false,
    includePoints: false,
    force: false,
    dryRun: false,
    layer: null,
    version: null,
    maxzoom: null,
    minzoom: 0,
    workers: 2,
    out: "tiles",
    keep: 2,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--all") opts.all = true;
    else if (arg === "--changed") opts.changed = true;
    else if (arg === "--index") opts.index = true;
    else if (arg === "--check") opts.check = true;
    else if (arg === "--prune") opts.prune = true;
    else if (arg === "--include-points") opts.includePoints = true;
    else if (arg === "--force") opts.force = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--layer") opts.layer = argv[++i];
    else if (arg === "--version") opts.version = argv[++i];
    else if (arg === "--maxzoom") opts.maxzoom = Number(argv[++i]);
    else if (arg === "--minzoom") opts.minzoom = Number(argv[++i]);
    else if (arg === "--workers") opts.workers = Number(argv[++i]);
    else if (arg === "--out") opts.out = argv[++i];
    else if (arg === "--keep") opts.keep = Number(argv[++i]);
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`Argumento desconocido: ${arg}`);
  }

  if (opts.help) return opts;

  const actions = [opts.all, opts.changed, opts.index, opts.check, opts.prune, Boolean(opts.layer)];
  if (actions.filter(Boolean).length === 0) opts.changed = true;
  if (opts.maxzoom !== null && (!Number.isInteger(opts.maxzoom) || opts.maxzoom < 0 || opts.maxzoom > 18)) {
    throw new Error("--maxzoom debe ser un entero entre 0 y 18.");
  }
  if (!Number.isInteger(opts.keep) || opts.keep < 1) {
    throw new Error("--keep debe ser un entero >= 1.");
  }
  if (opts.version !== null && !/^[A-Za-z0-9._-]+$/.test(opts.version)) {
    throw new Error("--version solo admite letras, números, punto, guion y guion bajo.");
  }
  return opts;
}

function printHelp() {
  console.log(`Ciclo de vida de tiles pregenerados

Uso:
  npm run tiles:sync -- [acción] [opciones]

Acciones (por defecto --changed):
  --changed         Capas nuevas o con updated_at posterior al manifest
  --all             Todas las capas sin tiles publicados
  --layer <id>      Una capa (requiere --version si ya está publicada)
  --index           Solo regenera tiles/index.json
  --check           Verifica manifiestos, archivos y conteo en la BD
  --prune           Aplica retención (ver --keep)

Opciones:
  --version <v>     Versión/edición a publicar (default: fecha de updated_at)
  --minzoom <n>     Zoom mínimo (default: 0)
  --maxzoom <n>     Zoom máximo (default: 14 polígonos/líneas, 12 puntos)
  --workers <n>     Consultas concurrentes por capa (default: 2)
  --out <dir>       Directorio de salida (default: tiles)
  --keep <n>        Versiones a conservar por capa (default: 2)
  --include-points  Genera tiles también para capas de puntos
  --force           Republica una versión existente
  --dry-run         Muestra el plan sin escribir ni borrar
  --help            Esta ayuda

Variables:
  DATABASE_ADMIN_URL (preferida) o DATABASE_URL.
`);
}

function logFor(layerId) {
  const prefix = `[tiles-sync] ${layerId}:`;
  return {
    log: (...args) => console.log(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
  };
}

async function listVersions(root) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const versions = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(root, entry.name, MANIFEST);
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      versions.push({ version: entry.name, manifest, manifestPath });
    } catch {
      // Directorio sin manifest válido: se ignora (puede ser una corrida cortada).
    }
  }

  return versions.sort((a, b) =>
    String(b.manifest.generated_at || "").localeCompare(String(a.manifest.generated_at || ""))
  );
}

export function dateVersion(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "dev";
  return value.toISOString().slice(0, 10).replace(/-/g, "");
}

function nextVersion(versions, base) {
  const used = new Set(versions.map((entry) => entry.version));
  if (!used.has(base)) return base;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error(`No hay versión libre a partir de ${base}.`);
}

function isStale(versions, updatedAt) {
  if (versions.length === 0) return true;
  const active = versions[0];
  const catalogTime = new Date(updatedAt).getTime();
  const manifestTime = new Date(active.manifest.generated_at).getTime();
  return Number.isFinite(catalogTime) && Number.isFinite(manifestTime)
    ? catalogTime > manifestTime
    : false;
}

async function listLayers(pool, opts) {
  if (opts.layer) {
    const { rows } = await pool.query(
      `SELECT layer_id, physical_table, geometry_type, updated_at, enabled,
              to_regclass(physical_table) IS NOT NULL AS has_table
         FROM chat.chat_catalog WHERE layer_id = $1`,
      [opts.layer]
    );
    if (rows.length === 0) throw new Error(`La capa ${opts.layer} no está en chat.chat_catalog.`);
    return rows;
  }

  const { rows } = await pool.query(
    `SELECT layer_id, physical_table, geometry_type, updated_at, enabled,
            to_regclass(physical_table) IS NOT NULL AS has_table
       FROM chat.chat_catalog
      WHERE enabled = true
      ORDER BY layer_id`
  );
  return rows;
}

async function buildLayer(pool, layer, opts) {
  const slug = tileSlug(layer.layer_id);
  const root = path.resolve(opts.out, slug);
  const versions = await listVersions(root);
  const stale = isStale(versions, layer.updated_at);
  const active = versions[0] || null;
  const isPoint = String(layer.geometry_type || "").toUpperCase().includes("POINT");

  if (isPoint && !opts.includePoints && !opts.layer) {
    return { skipped: "point" };
  }

  // Una versión explícita (edición/año) se publica aunque la capa esté al día.
  if (!opts.force && active && !stale && !opts.version) {
    return { skipped: "fresh", version: active.version };
  }

  let version = opts.version;
  if (version && !opts.force && versions.some((entry) => entry.version === version)) {
    throw new Error(
      `La versión ${layer.layer_id}/${version} ya está publicada. ` +
        "Usá otra --version o --force para republicarla."
    );
  }
  if (!version) {
    version = active && stale
      ? nextVersion(versions, dateVersion(layer.updated_at || new Date()))
      : active?.version || dateVersion(layer.updated_at || new Date());
    if (!opts.force && versions.some((entry) => entry.version === version)) {
      version = nextVersion(versions, version);
    }
  }

  const maxzoom = opts.maxzoom ?? defaultMaxzoomFor(layer.geometry_type);
  const { log, warn } = logFor(layer.layer_id);

  if (slug !== layer.layer_id) {
    log(`slug de tiles: ${slug}`);
  }

  if (opts.dryRun) {
    log(
      `plan: ${active ? `activa ${active.version}, ` : ""}` +
        `${stale ? "desactualizada" : "sin cambios"} → publicaría ${version} ` +
        `(z${opts.minzoom}-${maxzoom}, ${layer.geometry_type})`
    );
    return { planned: version };
  }

  const buildOpts = parseBuildArgs([
    "--layer", layer.layer_id,
    "--version", version,
    "--minzoom", String(opts.minzoom),
    "--maxzoom", String(maxzoom),
    "--workers", String(opts.workers),
    "--out", opts.out,
    ...(opts.force ? ["--overwrite"] : []),
  ]);

  const result = await buildTiles(pool, buildOpts, { log, warn });
  if (result.skipped === "empty") {
    return { skipped: "empty" };
  }
  return {
    version,
    previous: active?.version || null,
    tiles: result.manifest.tiles,
    bytes: result.manifest.bytes,
  };
}

async function readAllManifests(out) {
  let layers;
  try {
    layers = await readdir(out, { withFileTypes: true });
  } catch {
    return [];
  }

  const result = [];
  for (const layer of layers) {
    if (!layer.isDirectory()) continue;
    const versions = await listVersions(path.join(out, layer.name));
    if (versions.length === 0) continue;
    const manifestLayerId = versions[0].manifest.layer_id || layer.name;
    result.push({
      layer_id: manifestLayerId,
      tile_slug: layer.name,
      active_version: versions[0].version,
      versions: versions.map(({ version, manifest }) => ({
        version,
        manifest: `/tiles/${layer.name}/${version}/${MANIFEST}`,
        url_template: manifest.tile_url_template,
        tiles: manifest.tiles,
        bytes: manifest.bytes,
        checksum: manifest.checksum,
        minzoom: manifest.minzoom,
        maxzoom: manifest.maxzoom,
        maxzoom_requested: manifest.maxzoom_requested ?? manifest.maxzoom,
        feature_count: manifest.feature_count,
        generated_at: manifest.generated_at,
      })),
    });
  }

  return result.sort((a, b) => a.layer_id.localeCompare(b.layer_id));
}

async function writeIndex(out, opts) {
  const layers = await readAllManifests(out);
  const index = {
    generated_at: new Date().toISOString(),
    layers,
  };
  const target = path.join(out, INDEX);
  if (opts.dryRun) {
    console.log(`[tiles-sync] índice: ${layers.length} capas (dry-run, no se escribe)`);
    return index;
  }
  await writeFile(target, JSON.stringify(index, null, 2));
  console.log(`[tiles-sync] índice escrito: ${target} (${layers.length} capas)`);
  return index;
}

async function walkTiles(root, current = root, records = []) {
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    return records;
  }

  for (const entry of entries) {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await walkTiles(root, full, records);
    } else if (entry.name.endsWith(".mvt")) {
      const rel = path.relative(root, full);
      const [z, x, file] = rel.split(path.sep);
      const info = await stat(full);
      records.push({
        z: Number(z),
        x: Number(x),
        y: Number(path.basename(file, ".mvt")),
        bytes: info.size,
      });
    }
  }
  return records;
}

async function verifyLayer(pool, out, slug, entry) {
  const errors = [];
  const records = await walkTiles(path.join(out, slug, entry.version));
  const manifest = entry.manifestData;
  const rebuilt = buildManifest(
    {
      layer_id: manifest.layer_id,
      version: manifest.version,
      bbox: manifest.bbox,
      minzoom: manifest.minzoom,
      maxzoom: manifest.maxzoom,
    },
    records
  );

  if (records.length !== manifest.tiles) {
    errors.push(`tiles: manifest ${manifest.tiles}, en disco ${records.length}`);
  }
  if (rebuilt.bytes !== manifest.bytes) {
    errors.push(`bytes: manifest ${manifest.bytes}, en disco ${rebuilt.bytes}`);
  }
  if (rebuilt.checksum !== manifest.checksum) {
    errors.push("checksum no coincide (tiles alterados o manifest editado)");
  }

  const physical = String(manifest.physical_table || "");
  if (/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(physical)) {
    const [schema, table] = physical.includes(".")
      ? physical.split(".")
      : ["public", physical];
    const { rows } = await pool
      .query(`SELECT count(*)::bigint AS n FROM "${schema}"."${table}"`)
      .catch(() => ({ rows: [{ n: null }] }));
    if (rows[0]?.n !== null && Number(rows[0].n) !== manifest.feature_count) {
      errors.push(`features: manifest ${manifest.feature_count}, BD ${rows[0].n}`);
    }
  }

  return errors;
}

async function checkAll(pool, out) {
  const layers = await readAllManifests(out);
  let failed = 0;

  for (const layer of layers) {
    for (const entry of layer.versions) {
      const manifestPath = path.join(out, layer.tile_slug, entry.version, MANIFEST);
      const manifestData = JSON.parse(await readFile(manifestPath, "utf8"));
      const errors = await verifyLayer(pool, out, layer.tile_slug, {
        ...entry,
        manifestData,
      });
      if (errors.length > 0) {
        failed += 1;
        console.error(`[tiles-sync] ${layer.layer_id}/${entry.version}: ${errors.join("; ")}`);
      } else {
        console.log(
          `[tiles-sync] ${layer.layer_id}/${entry.version}: ok ` +
            `(${entry.tiles} tiles, ${(entry.bytes / 1024 / 1024).toFixed(2)} MB)`
        );
      }
    }
  }

  console.log(
    `[tiles-sync] verificación: ${layers.length} capas, ` +
      `${failed === 0 ? "sin errores" : `${failed} versiones con errores`}`
  );
  return failed;
}

async function pruneAll(out, keep, dryRun) {
  const layers = await readAllManifests(out);
  let removed = 0;

  for (const layer of layers) {
    const versions = await listVersions(path.join(out, layer.tile_slug));
    for (const entry of versions.slice(keep)) {
      const target = path.join(out, layer.tile_slug, entry.version);
      console.log(`[tiles-sync] prune ${layer.layer_id}/${entry.version}`);
      if (!dryRun) await rm(target, { recursive: true, force: true });
      removed += 1;
    }
  }

  console.log(`[tiles-sync] retención: ${removed} versiones ${dryRun ? "a borrar" : "borradas"} (keep=${keep})`);
  return removed;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const opts = parseArgs(argv);
  if (opts.help) {
    printHelp();
    return;
  }

  const connectionString = env.DATABASE_ADMIN_URL || env.DATABASE_URL;
  if (!connectionString) throw new Error("Falta DATABASE_ADMIN_URL (o DATABASE_URL).");

  const pool = new Pool({
    connectionString,
    application_name: "woll-tiles-sync",
    max: Math.max(2, opts.workers),
    statement_timeout: 120_000,
    connectionTimeoutMillis: 10_000,
  });

  let failures = 0;

  try {
    if (opts.check) {
      failures = await checkAll(pool, opts.out);
    }

    if (opts.prune) {
      await pruneAll(opts.out, opts.keep, opts.dryRun);
    }

    if (opts.all || opts.changed || opts.layer) {
      const layers = await listLayers(pool, opts);
      for (const layer of layers) {
        if (!layer.enabled) {
          console.log(`[tiles-sync] ${layer.layer_id}: deshabilitada, se omite.`);
          continue;
        }
        if (!layer.has_table) {
          console.log(
            `[tiles-sync] ${layer.layer_id}: sin tabla física (WMS), se omite.`
          );
          continue;
        }
        try {
          const result = await buildLayer(pool, layer, opts);
          if (result.skipped) {
            const reason = {
              point: "punto, sin tiles",
              empty: "tabla vacía, sin tiles",
              fresh: `al día (${result.version})`,
            }[result.skipped];
            console.log(`[tiles-sync] ${layer.layer_id}: ${reason}`);
          }
        } catch (err) {
          failures += 1;
          console.error(
            `[tiles-sync] ${layer.layer_id}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    if (!opts.dryRun) await writeIndex(opts.out, opts);
  } finally {
    await pool.end();
  }

  if (failures > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(`[tiles-sync] ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
