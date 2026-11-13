#!/usr/bin/env node
/**
 * Generador de tiles MVT pregenerados desde PostGIS.
 *
 * Genera `tiles/<layer>/<version>/<z>/<x>/<y>.mvt` y un `manifest.json` con
 * bbox, zooms, cantidad de tiles, bytes, columnas y checksum. Está pensado
 * para correr offline (máquina de desarrollo o VPS en una ventana de
 * mantenimiento); Nginx sirve los tiles sin tocar PostgreSQL.
 *
 * Optimización: por cada zoom se materializa una sola vez la geometría
 * simplificada en 3857 (con índice GIST) y los tiles se recortan desde esa
 * tabla. Evita repetir `ST_Transform`/`ST_Simplify` por tile (~4-5x más rápido
 * en capas poligonales pesadas).
 *
 * Uso:
 *   node --env-file=.env.local scripts/build-tiles.mjs \
 *     --layer borde_costero --version 2026 --minzoom 0 --maxzoom 14
 *
 *   --dry-run        Cuenta tiles y muestra el plan, sin escribir.
 *   --publish        Imprime el snippet de `source.tiles` para la config.
 *   --overwrite      Permite reescribir una versión ya publicada.
 *   --force          Permite superar el límite de tiles.
 *   --no-simplify    No simplifica geometrías por zoom.
 *
 * Requiere un rol con permiso de crear tablas temporales (DATABASE_ADMIN_URL).
 *
 * Sprint 08-0 / 08-A.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";

const { Pool } = pg;
const MAX_TILES_DEFAULT = 20000;
const ID_PRIORITY = ["fid", "gid", "id"];

/**
 * Slug ASCII para directorios y URLs de tiles. El `layer_id` del catálogo
 * puede tener tildes o `ñ` (p. ej. `prc_chañaral`); la URL no.
 */
export function tileSlug(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "layer";
}

export function parseArgs(argv) {
  const opts = {
    layer: null,
    table: null,
    version: "dev",
    minzoom: 0,
    maxzoom: 10,
    out: "tiles",
    workers: 2,
    maxTiles: null,
    dryRun: false,
    publish: false,
    overwrite: false,
    force: false,
    simplify: true,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--layer") opts.layer = argv[++i];
    else if (arg === "--table") opts.table = argv[++i];
    else if (arg === "--version") opts.version = argv[++i];
    else if (arg === "--minzoom") opts.minzoom = Number(argv[++i]);
    else if (arg === "--maxzoom") opts.maxzoom = Number(argv[++i]);
    else if (arg === "--out") opts.out = argv[++i];
    else if (arg === "--workers") opts.workers = Number(argv[++i]);
    else if (arg === "--max-tiles") opts.maxTiles = Number(argv[++i]);
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--publish") opts.publish = true;
    else if (arg === "--overwrite") opts.overwrite = true;
    else if (arg === "--force") opts.force = true;
    else if (arg === "--no-simplify") opts.simplify = false;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`Argumento desconocido: ${arg}`);
  }

  if (opts.help) return opts;
  if (!opts.layer) throw new Error("Falta --layer.");
  if (!/^[\p{L}\p{N}_-]+$/u.test(opts.layer)) {
    throw new Error("--layer solo admite letras, números, guion y guion bajo.");
  }
  if (!/^[A-Za-z0-9._-]+$/.test(opts.version)) {
    throw new Error("--version solo admite letras, números, punto, guion y guion bajo.");
  }
  if (!Number.isInteger(opts.minzoom) || opts.minzoom < 0 || opts.minzoom > 18) {
    throw new Error("--minzoom debe ser un entero entre 0 y 18.");
  }
  if (!Number.isInteger(opts.maxzoom) || opts.maxzoom < opts.minzoom || opts.maxzoom > 18) {
    throw new Error("--maxzoom debe ser un entero entre minzoom y 18.");
  }
  if (!Number.isInteger(opts.workers) || opts.workers < 1 || opts.workers > 16) {
    throw new Error("--workers debe ser un entero entre 1 y 16.");
  }
  if (opts.maxTiles !== null && (!Number.isInteger(opts.maxTiles) || opts.maxTiles < 1)) {
    throw new Error("--max-tiles debe ser un entero >= 1.");
  }

  return opts;
}

function printHelp() {
  console.log(`Generador de tiles MVT pregenerados

Uso:
  node --env-file=.env.local scripts/build-tiles.mjs --layer <id> [opciones]

Opciones:
  --version <v>     Versión/edición (default: dev)
  --table <tabla>   Tabla física (default: chat_catalog / public.<layer>)
  --minzoom <n>     Zoom mínimo (default: 0)
  --maxzoom <n>     Zoom máximo (default: 10)
  --out <dir>       Directorio de salida (default: tiles)
  --workers <n>     Consultas concurrentes (default: 2)
  --max-tiles <n>   Límite de tiles por capa (default: 20000)
  --dry-run         Cuenta tiles sin escribir
  --publish         Imprime el snippet de configuración
  --overwrite       Permite reescribir una versión publicada
  --force           Supera el límite de tiles
  --no-simplify     No simplifica geometrías
  --help            Esta ayuda

Variables:
  DATABASE_ADMIN_URL (preferida) o DATABASE_URL.
`);
}

function qi(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function validTableName(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(name)) {
    throw new Error(`Nombre de tabla inválido: ${name}`);
  }
  return name;
}

function tableRef(name) {
  const parts = validTableName(name).split(".");
  return parts.length === 2 ? `${qi(parts[0])}.${qi(parts[1])}` : `public.${qi(parts[0])}`;
}

export function lonToTile(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

export function latToTile(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z
  );
}

export function clampTile(value, z) {
  return Math.min(Math.max(value, 0), 2 ** z - 1);
}

export function tileTasks(bbox, minzoom, maxzoom) {
  const tasks = [];
  const counts = {};

  for (let z = minzoom; z <= maxzoom; z += 1) {
    const minX = clampTile(lonToTile(bbox.minx, z), z);
    const maxX = clampTile(lonToTile(bbox.maxx, z), z);
    const minY = clampTile(latToTile(bbox.maxy, z), z);
    const maxY = clampTile(latToTile(bbox.miny, z), z);
    let count = 0;

    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        tasks.push({ z, x, y });
        count += 1;
      }
    }

    counts[z] = count;
  }

  return { tasks, counts };
}

/** Tolerancia en metros para simplificar a un zoom dado (medio píxel del tile). */
export function simplifyTolerance(z) {
  return (40075016.686 / (4096 * 2 ** z)) * 0.5;
}

/** Zoom máximo por defecto según el tipo de geometría. */
export function defaultMaxzoomFor(geometryType) {
  const type = String(geometryType || "").toUpperCase();
  if (type.includes("POINT")) return 12;
  return 14;
}

export function buildManifest(base, tiles) {
  const sorted = [...tiles].sort((a, b) => (a.z - b.z) || (a.x - b.x) || (a.y - b.y));
  const digest = createHash("sha256");
  digest.update(
    JSON.stringify({
      layer_id: base.layer_id,
      version: base.version,
      bbox: base.bbox,
      minzoom: base.minzoom,
      maxzoom: base.maxzoom,
    })
  );
  for (const tile of sorted) {
    digest.update(`${tile.z}/${tile.x}/${tile.y}:${tile.bytes}\n`);
  }
  return {
    ...base,
    tiles: sorted.length,
    bytes: sorted.reduce((total, tile) => total + tile.bytes, 0),
    checksum: digest.digest("hex"),
  };
}

async function resolveLayer(pool, layerId, tableArg) {
  if (tableArg) {
    return { layerId, physicalTable: tableArg };
  }

  const { rows } = await pool.query(
    "SELECT physical_table FROM chat.chat_catalog WHERE layer_id = $1",
    [layerId]
  );
  if (rows.length > 0 && rows[0].physical_table) {
    return { layerId, physicalTable: rows[0].physical_table };
  }
  return { layerId, physicalTable: `public.${layerId}` };
}

async function resolveGeometry(pool, physicalTable) {
  const parts = validTableName(physicalTable).split(".");
  const schema = parts.length === 2 ? parts[0] : "public";
  const table = parts.length === 2 ? parts[1] : parts[0];
  const { rows } = await pool.query(
    `SELECT f_geometry_column, srid, type
       FROM geometry_columns
      WHERE f_table_schema = $1 AND f_table_name = $2
      LIMIT 1`,
    [schema, table]
  );

  if (rows.length === 0) {
    throw new Error(`No se encontró geometría para ${physicalTable}.`);
  }

  return {
    geomColumn: rows[0].f_geometry_column,
    srid: Number(rows[0].srid),
    geometryType: rows[0].type,
  };
}

async function resolveColumns(pool, physicalTable, geomColumn) {
  const parts = validTableName(physicalTable).split(".");
  const schema = parts.length === 2 ? parts[0] : "public";
  const table = parts.length === 2 ? parts[1] : parts[0];
  const { rows } = await pool.query(
    `SELECT column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
        AND column_name <> $3
        AND data_type NOT IN ('USER-DEFINED')
      ORDER BY ordinal_position`,
    [schema, table, geomColumn]
  );
  return rows;
}

function pickFeatureId(columns) {
  const integerTypes = new Set(["integer", "bigint", "smallint"]);
  for (const name of ID_PRIORITY) {
    const column = columns.find((row) => row.column_name === name);
    if (column && integerTypes.has(column.data_type)) return column.column_name;
  }
  const gid = columns.find(
    (row) => /(^|_)id$/i.test(row.column_name) && integerTypes.has(row.data_type)
  );
  return gid ? gid.column_name : null;
}

async function resolveBbox(pool, physicalTable, geomColumn) {
  const ref = tableRef(physicalTable);
  const { rows } = await pool.query(
    `SELECT ST_XMin(e) AS minx, ST_YMin(e) AS miny,
            ST_XMax(e) AS maxx, ST_YMax(e) AS maxy
       FROM (SELECT ST_Extent(${qi(geomColumn)}) AS e FROM ${ref}) s`
  );
  const row = rows[0];
  if (!row || row.minx === null) throw new Error(`La tabla ${physicalTable} está vacía.`);
  return {
    minx: Number(row.minx),
    miny: Number(row.miny),
    maxx: Number(row.maxx),
    maxy: Number(row.maxy),
  };
}

const WORK_TABLE = "woll_tiles_work";

async function prepareWorkTable(client, { table, geomColumn, columns, geometryType, tolerance, simplify }) {
  const ref = tableRef(table);
  const isPoint = String(geometryType).toUpperCase().includes("POINT");
  const geomExpr =
    simplify && !isPoint
      ? `ST_Simplify(ST_Transform(t.${qi(geomColumn)}, 3857), $1::float8)`
      : `ST_Transform(t.${qi(geomColumn)}, 3857)`;
  const properties = columns.map((column) => `t.${qi(column.column_name)}`).join(", ");

  await client.query(`DROP TABLE IF EXISTS pg_temp.${WORK_TABLE}`);
  await client.query(
    `CREATE TEMP TABLE ${WORK_TABLE} AS
       SELECT ${geomExpr} AS g3857${properties ? `, ${properties}` : ""}
         FROM ${ref} t`,
    simplify && !isPoint ? [tolerance] : []
  );
  await client.query(
    `DELETE FROM pg_temp.${WORK_TABLE} WHERE g3857 IS NULL OR ST_IsEmpty(g3857)`
  );
  await client.query(
    `CREATE INDEX ON pg_temp.${WORK_TABLE} USING GIST (g3857)`
  );
  await client.query(`ANALYZE pg_temp.${WORK_TABLE}`);
}

function buildTileSql({ columns, layerId, featureId }) {
  const properties = columns.map((column) => `t.${qi(column.column_name)}`).join(", ");
  const featureIdArg = featureId ? `, '${String(featureId).replace(/'/g, "''")}'` : "";

  return `WITH bounds AS (
    SELECT ST_TileEnvelope($1::int, $2::int, $3::int) AS geom
  ), mvtgeom AS (
    SELECT ST_AsMVTGeom(t.g3857, b.geom, 4096, 256, true) AS geom${properties ? `, ${properties}` : ""}
      FROM pg_temp.${WORK_TABLE} t, bounds b
     WHERE ST_Intersects(t.g3857, b.geom)
  )
  SELECT ST_AsMVT(mvtgeom.*, $4::text, 4096, 'geom'${featureIdArg}) AS tile
    FROM mvtgeom
   WHERE ST_IsEmpty(geom) = false`;
}

/**
 * Tiles que tocan el bbox de alguna feature (no todo el bbox de la capa).
 * Evita consultar decenas de miles de tiles vacíos en capas dispersas.
 */
export function candidateTilesSql() {
  return `WITH extents AS (
    SELECT ST_XMin(Box2D(g3857)) AS minx, ST_YMin(Box2D(g3857)) AS miny,
           ST_XMax(Box2D(g3857)) AS maxx, ST_YMax(Box2D(g3857)) AS maxy
      FROM pg_temp.${WORK_TABLE}
     WHERE ST_IsEmpty(g3857) = false
  ), tiles AS (
    SELECT DISTINCT x, y
      FROM extents,
      LATERAL generate_series(
        greatest(0.0, floor((minx + 20037508.342789244) / (40075016.68557849 / 2^$1::int)))::int,
        least(2^$1::int - 1.0, floor((maxx + 20037508.342789244) / (40075016.68557849 / 2^$1::int)))::int
      ) AS x,
      LATERAL generate_series(
        greatest(0.0, floor((20037508.342789244 - maxy) / (40075016.68557849 / 2^$1::int)))::int,
        least(2^$1::int - 1.0, floor((20037508.342789244 - miny) / (40075016.68557849 / 2^$1::int)))::int
      ) AS y
  )
  SELECT x, y FROM tiles ORDER BY x, y`;
}

async function countFeatures(pool, physicalTable) {
  const { rows } = await pool.query(`SELECT count(*)::bigint AS n FROM ${tableRef(physicalTable)}`);
  return Number(rows[0].n);
}

async function manifestExists(root) {
  try {
    await readFile(path.join(root, "manifest.json"), "utf8");
    return true;
  } catch {
    return false;
  }
}

export async function buildTiles(pool, opts, { log = console.log, warn = console.warn } = {}) {
  const { layerId, physicalTable } = await resolveLayer(pool, opts.layer, opts.table);
  const slug = tileSlug(layerId);
  const { geomColumn, srid, geometryType } = await resolveGeometry(pool, physicalTable);
  if (srid !== 4326) {
    throw new Error(`${physicalTable}: SRID ${srid}, se esperaba 4326.`);
  }
  const columnRows = await resolveColumns(pool, physicalTable, geomColumn);
  const featureId = pickFeatureId(columnRows);
  const bbox = await resolveBbox(pool, physicalTable, geomColumn);
  const { tasks, counts } = tileTasks(bbox, opts.minzoom, opts.maxzoom);
  const featureCount = await countFeatures(pool, physicalTable);
  const plan = {
    event: "plan",
    layer: layerId,
    tile_slug: slug,
    table: physicalTable,
    geometry_type: geometryType,
    features: featureCount,
    columns: columnRows.length,
    feature_id: featureId,
    bbox,
    zooms: counts,
    total_tiles: tasks.length,
  };

  log(JSON.stringify(plan, null, 2));

  const maxTiles = opts.maxTiles ?? MAX_TILES_DEFAULT;
  if (tasks.length > maxTiles) {
    warn(
      `[build-tiles] El bbox de la capa cubre ${tasks.length} tiles (límite ` +
        `${maxTiles}). Se generarán solo los tiles que tocan features; ` +
        "el límite se aplica al conteo real."
    );
  }

  if (opts.dryRun) {
    log("Dry-run: no se escribieron tiles.");
    return { plan, dryRun: true };
  }

  const root = path.resolve(opts.out, slug, opts.version);
  if (!opts.overwrite && (await manifestExists(root))) {
    throw new Error(
      `La versión ${slug}/${opts.version} ya tiene manifest. ` +
        "Una versión publicada no se sobrescribe: usá otra --version o --overwrite."
    );
  }
  await mkdir(root, { recursive: true });

  const columns = columnRows.map((row) => ({ column_name: row.column_name }));
  const sql = buildTileSql({ columns, layerId: slug, featureId });
  const tileRecords = [];
  let processed = 0;
  let totalCandidates = 0;
  let effectiveMaxzoom = opts.maxzoom;
  const started = Date.now();

  const clientCount = Math.max(1, Math.min(opts.workers, 8));
  const clients = await Promise.all(
    Array.from({ length: clientCount }, () => pool.connect())
  );

  try {
    for (let z = opts.minzoom; z <= opts.maxzoom; z += 1) {
      const tolerance = simplifyTolerance(z);
      await Promise.all(
        clients.map((client) =>
          prepareWorkTable(client, {
            table: physicalTable,
            geomColumn,
            columns,
            geometryType,
            tolerance,
            simplify: opts.simplify,
          })
        )
      );

      const candidates = await clients[0].query(candidateTilesSql(), [z]);
      const zoomTasks = candidates.rows.map((row) => ({
        z,
        x: Number(row.x),
        y: Number(row.y),
      }));
      if (!opts.force && totalCandidates + zoomTasks.length > maxTiles) {
        if (tileRecords.length === 0) {
          throw new Error(
            `La capa supera el límite de ${maxTiles} tiles incluso en ` +
              `z${z}. Usá --force o subí el límite.`
          );
        }
        effectiveMaxzoom = z - 1;
        warn(
          `[build-tiles] z${z} sumaría ${zoomTasks.length} tiles y supera el límite ` +
            `${maxTiles}; se publica hasta z${effectiveMaxzoom}. ` +
            "Usá --force para el zoom completo."
        );
        break;
      }
      totalCandidates += zoomTasks.length;

      let cursor = 0;
      const worker = async (client) => {
        while (cursor < zoomTasks.length) {
          const task = zoomTasks[cursor];
          cursor += 1;
          const { rows } = await client.query(sql, [z, task.x, task.y, slug]);
          const tile = rows[0]?.tile;
          processed += 1;

          if (tile && tile.length > 0) {
            const dir = path.join(root, String(z), String(task.x));
            await mkdir(dir, { recursive: true });
            await writeFile(path.join(dir, `${task.y}.mvt`), tile);
            tileRecords.push({ z, x: task.x, y: task.y, bytes: tile.length });
          }

          if (processed % 500 === 0) {
            log(
              `  ${processed}/${totalCandidates} tiles (${tileRecords.length} escritos)`
            );
          }
        }
      };

      await Promise.all(clients.map((client) => worker(client)));
      log(
        `  z${z}: ${zoomTasks.length} tiles con cobertura, ` +
          `${tileRecords.length} escritos acumulados`
      );
    }
  } finally {
    await Promise.all(clients.map((client) => client.release()));
  }

  const manifest = buildManifest(
    {
      layer_id: layerId,
      tile_slug: slug,
      version: opts.version,
      physical_table: physicalTable,
      geometry_type: geometryType,
      srid,
      bbox,
      feature_count: featureCount,
      minzoom: opts.minzoom,
      maxzoom: effectiveMaxzoom,
      maxzoom_requested: opts.maxzoom,
      columns: columnRows.map((row) => row.column_name),
      feature_id: featureId,
      simplified: opts.simplify,
      generated_at: new Date().toISOString(),
      tile_url_template: `/tiles/${slug}/${opts.version}/{z}/{x}/{y}.mvt`,
    },
    tileRecords
  );

  const manifestPath = path.join(root, "manifest.json");
  await mkdir(root, { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  log(
    JSON.stringify(
      {
        event: "done",
        layer: layerId,
        tile_slug: slug,
        version: opts.version,
        maxzoom: manifest.maxzoom,
        wrote: manifest.tiles,
        bytes: manifest.bytes,
        mb: Number((manifest.bytes / 1024 / 1024).toFixed(2)),
        seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
        manifest: manifestPath,
      },
      null,
      2
    )
  );

  if (opts.publish) {
    log(
      JSON.stringify(
        {
          source: {
            type: "postgis",
            table: physicalTable,
            geometry_column: geomColumn,
            srid,
            tiles: {
              mode: "static",
              version: opts.version,
              url_template: manifest.tile_url_template,
              manifest: `/tiles/${slug}/${opts.version}/manifest.json`,
              minzoom: opts.minzoom,
              maxzoom: opts.maxzoom,
            },
          },
        },
        null,
        2
      )
    );
  }

  return { plan, manifest, manifestPath, root, tiles: tileRecords.length };
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const opts = parseArgs(argv);
  if (opts.help) {
    printHelp();
    return;
  }

  const connectionString = env.DATABASE_ADMIN_URL || env.DATABASE_URL;
  if (!connectionString) throw new Error("Falta DATABASE_ADMIN_URL (o DATABASE_URL).");

  const pool = new Pool({
    connectionString,
    application_name: "woll-build-tiles",
    max: Math.max(2, opts.workers),
    statement_timeout: 120_000,
    connectionTimeoutMillis: 10_000,
  });

  try {
    await buildTiles(pool, opts);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(`[build-tiles] ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
