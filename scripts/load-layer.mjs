#!/usr/bin/env node
/**
 * Carga una capa GeoJSON o Shapefile en PostGIS y la registra en el catálogo.
 *
 * Uso:
 *   node --env-file=.env.local scripts/load-layer.mjs geojson/foo.geojson \
 *     --table foo --dimension agua --display-name "Foo" [--force]
 *
 * Shapefile:
 *   node --env-file=.env.local scripts/load-layer.mjs ruta/foo.shp \
 *     --table foo --force
 *   Requiere `ogr2ogr` (GDAL) en el PATH o un contenedor equivalente.
 *
 * Qué hace:
 *   1. Crea `public.<table>` con `gid`, `geom` y columnas inferidas.
 *   2. Inserta las features en lotes con `ST_GeomFromGeoJSON`.
 *   3. Crea índice GIST y ejecuta ANALYZE.
 *   4. Hace UPSERT en `chat.chat_catalog` vía `chat_upsert_layer`.
 *   5. Refresca stats (`chat_refresh_stats`) salvo `--skip-stats`.
 *
 * Sprint 26-E.
 */

import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * @param {string} name
 * @returns {string}
 */
export function quoteIdent(name) {
  if (!IDENT_RE.test(name)) {
    throw new Error(
      `Identificador inválido: "${name}". Usa letras, números y guion bajo, empezando por letra o guion bajo.`
    );
  }
  return `"${name}"`;
}

/**
 * Las propiedades GeoJSON pueden tener espacios, tildes o mayúsculas; se
 * citan de forma segura en vez de renombrarlas.
 *
 * @param {string} name
 * @returns {string}
 */
export function quoteColumn(name) {
  const value = String(name);
  if (!value || value.includes("\u0000")) {
    throw new Error("Nombre de columna inválido.");
  }
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * @param {string} table
 * @returns {string}
 */
function qualifiedTable(table) {
  return `public.${quoteIdent(table)}`;
}

/**
 * Convierte una URL postgres:// en un DSN libpq para ogr2ogr, sin poner el
 * password en la línea de comandos (se pasa por PGPASSWORD).
 *
 * @param {string} connectionString
 * @returns {{dsn:string, password:string}}
 */
export function pgDsn(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_ADMIN_URL debe ser una URL postgres:// válida.");
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) {
    throw new Error("DATABASE_ADMIN_URL debe usar el esquema postgres://.");
  }
  const dbname = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!dbname) throw new Error("La URL de PostgreSQL no incluye database name.");
  const host = url.hostname || "127.0.0.1";
  const port = url.port || "5432";
  const user = decodeURIComponent(url.username);
  return {
    dsn: `PG:host=${host} port=${port} dbname=${dbname} user=${user}`,
    password: decodeURIComponent(url.password),
  };
}

/**
 * @param {unknown[]} values
 * @returns {"boolean"|"numeric"|"text"}
 */
export function inferColumnType(values) {
  const present = values.filter((value) => value !== null && value !== undefined);
  if (present.length === 0) return "text";
  if (present.every((value) => typeof value === "boolean")) return "boolean";
  if (
    present.every(
      (value) =>
        typeof value === "number" ||
        (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))
    )
  ) {
    return "numeric";
  }
  return "text";
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
export function normalizeValue(value) {
  if (value === undefined) return null;
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return value;
}

/**
 * @param {Array<{properties?: Record<string, unknown>}>} features
 * @param {{table:string, srid?:number}} opts
 */
export function buildTablePlan(features, { table, srid = 4326 }) {
  const reserved = new Set(["gid", "geom", "geometry", "the_geom"]);
  const names = [];
  const seen = new Set();

  for (const feature of features) {
    const properties = feature?.properties || {};
    for (const name of Object.keys(properties)) {
      if (reserved.has(name.toLowerCase()) || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
  }

  const columns = names.map((name) => ({
    name,
    pgType: inferColumnType(
      features.map((feature) => feature?.properties?.[name])
    ),
  }));

  return {
    table,
    srid,
    columns,
    geometryType: "GEOMETRY",
  };
}

/**
 * Construye un INSERT para un lote de features.
 *
 * @param {ReturnType<typeof buildTablePlan>} plan
 * @param {Array<{geometry: object, properties?: Record<string, unknown>}>} features
 * @returns {{sql:string, values:unknown[]}}
 */
export function buildInsertBatch(plan, features) {
  const table = qualifiedTable(plan.table);
  const columns = plan.columns.map((column) => quoteColumn(column.name));
  const columnList = ["geom", ...columns].join(", ");
  const values = [];
  const rows = [];

  for (const feature of features) {
    const base = values.length;
    values.push(JSON.stringify(feature.geometry), plan.srid);
    const placeholders = [
      `ST_SetSRID(ST_GeomFromGeoJSON($${base + 1}), $${base + 2}::int)`,
    ];

    for (const column of plan.columns) {
      values.push(normalizeValue(feature?.properties?.[column.name]));
      placeholders.push(`$${values.length}`);
    }

    rows.push(`(${placeholders.join(", ")})`);
  }

  return {
    sql: `INSERT INTO ${table} (${columnList}) VALUES ${rows.join(", ")}`,
    values,
  };
}

function parseArgs(argv) {
  const opts = {
    file: null,
    table: null,
    layerId: null,
    dimension: "otros",
    displayName: null,
    srid: 4326,
    force: false,
    skipStats: false,
    tiles: false,
    tilesVersion: null,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!opts.file && !arg.startsWith("-")) {
      opts.file = arg;
    } else if (arg === "--table") {
      opts.table = argv[++i];
    } else if (arg === "--layer-id") {
      opts.layerId = argv[++i];
    } else if (arg === "--dimension") {
      opts.dimension = argv[++i];
    } else if (arg === "--display-name") {
      opts.displayName = argv[++i];
    } else if (arg === "--srid") {
      opts.srid = Number(argv[++i]);
    } else if (arg === "--force") {
      opts.force = true;
    } else if (arg === "--skip-stats") {
      opts.skipStats = true;
    } else if (arg === "--tiles") {
      opts.tiles = true;
    } else if (arg === "--tiles-version") {
      opts.tilesVersion = argv[++i];
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else {
      throw new Error(`Argumento desconocido: ${arg}`);
    }
  }

  if (opts.help) return opts;
  if (!opts.file) throw new Error("Falta el archivo de entrada.");
  if (!opts.table) {
    const base = path.basename(opts.file, path.extname(opts.file));
    opts.table = base
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^(\d)/, "_$1");
  }
  if (!Number.isInteger(opts.srid) || opts.srid <= 0) {
    throw new Error("--srid debe ser un entero positivo.");
  }
  opts.layerId = opts.layerId || opts.table;
  opts.displayName = opts.displayName || opts.table;
  return opts;
}

function printHelp() {
  console.log(`Carga de capas a PostGIS — Sprint 26-E

Uso:
  node --env-file=.env.local scripts/load-layer.mjs <archivo.geojson|.shp> [opciones]

Opciones:
  --table <nombre>          Tabla destino en public (default: nombre del archivo)
  --layer-id <id>           layer_id del catálogo (default: tabla)
  --dimension <dim>         Dimensión del visor (default: otros)
  --display-name <texto>    Nombre visible (default: tabla)
  --srid <n>                SRID de las geometrías GeoJSON (default: 4326)
  --force                   Reemplaza la tabla si existe
  --skip-stats              No ejecuta chat_refresh_stats
  --tiles                   Genera los tiles MVT después de cargar
  --tiles-version <v>       Versión/edición de los tiles (default: YYYYMMDD)
  --dry-run                 Muestra el plan sin escribir
  --help                    Esta ayuda

Variables:
  DATABASE_ADMIN_URL (preferida) o DATABASE_URL.
  Shapefile requiere ogr2ogr en PATH.
`);
}

async function tableExists(db, table) {
  const rows = await db.query(
    "SELECT to_regclass($1) AS table_name",
    [`public.${table}`]
  );
  return Boolean(rows[0]?.table_name);
}

async function createTable(db, plan) {
  const table = qualifiedTable(plan.table);
  const columns = plan.columns
    .map((column) => `${quoteColumn(column.name)} ${column.pgType}`)
    .join(",\n  ");

  await db.query(
    `CREATE TABLE ${table} (
       gid bigserial PRIMARY KEY,
       geom geometry(${plan.geometryType}, ${plan.srid})${columns ? `,\n  ${columns}` : ""}
     )`
  );
}

async function createGistIndex(db, table) {
  const indexName = `idx_${table}_geom`;
  await db.query(
    `CREATE INDEX IF NOT EXISTS ${quoteIdent(indexName)}
       ON ${qualifiedTable(table)} USING GIST (geom)`
  );
}

async function upsertCatalog(db, plan, opts) {
  const attributes = plan.columns.map((column) => ({
    name: column.name,
    type: column.pgType,
    descripcion: null,
  }));

  await db.rpc("chat_upsert_layer", {
    p_layer_id: opts.layerId,
    p_physical_table: `public.${plan.table}`,
    p_display_name: opts.displayName,
    p_dimension: opts.dimension,
    p_geometry_type: plan.geometryType,
    p_srid: plan.srid,
    p_description: null,
    p_attributes: attributes,
    p_enabled: true,
  });
}

async function loadGeoJSON(db, plan, features, opts) {
  const table = qualifiedTable(plan.table);
  const exists = await tableExists(db, plan.table);

  if (exists && !opts.force) {
    throw new Error(
      `La tabla ${plan.table} ya existe. Usa --force para reemplazarla.`
    );
  }

  if (opts.dryRun) {
    console.log(
      `[dry-run] ${plan.table}: ${features.length} features, ${plan.columns.length} columnas, SRID ${plan.srid}`
    );
    return;
  }

  await db.query("BEGIN");
  try {
    if (exists && opts.force) {
      await db.query(`DROP TABLE ${table} CASCADE`);
    }
    await createTable(db, plan);

    const batchSize = 500;
    for (let i = 0; i < features.length; i += batchSize) {
      const batch = features.slice(i, i + batchSize);
      const { sql, values } = buildInsertBatch(plan, batch);
      await db.query(sql, values);
    }

    await createGistIndex(db, plan.table);
    await db.query(`ANALYZE ${table}`);
    await upsertCatalog(db, plan, opts);
    await db.query("COMMIT");
    console.log(
      `✓ ${plan.table}: ${features.length} features, ${plan.columns.length} columnas.`
    );
  } catch (err) {
    await db.query("ROLLBACK").catch(() => {});
    throw err;
  }
}

async function loadShapefile(db, opts) {
  if (opts.dryRun) {
    console.log(
      `[dry-run] ${opts.table}: ogr2ogr ${opts.file} -> public.${opts.table} (EPSG:4326)`
    );
    return;
  }

  const target = pgDsn(opts.connectionString);
  const result = spawnSync(
    "ogr2ogr",
    [
      "-f",
      "PostgreSQL",
      target.dsn,
      opts.file,
      "-nln",
      opts.table,
      "-nlt",
      "PROMOTE_TO_MULTI",
      "-lco",
      "GEOMETRY_NAME=geom",
      "-lco",
      "FID=gid",
      "-lco",
      "SPATIAL_INDEX=GIST",
      "-t_srs",
      "EPSG:4326",
      opts.force ? "-overwrite" : "-append",
    ],
    {
      stdio: "inherit",
      env: { ...process.env, PGPASSWORD: target.password },
    }
  );

  if (result.error?.code === "ENOENT") {
    throw new Error(
      "ogr2ogr no está instalado. Instala GDAL o usa un contenedor con GDAL para cargar Shapefiles; para GeoJSON no se necesita."
    );
  }
  if (result.status !== 0) {
    throw new Error(`ogr2ogr falló con código ${result.status}.`);
  }

  const columns = await db.query(
    `SELECT column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
        AND column_name NOT IN ('gid','geom')
      ORDER BY ordinal_position`,
    [opts.table]
  );

  const plan = {
    table: opts.table,
    srid: 4326,
    geometryType: "GEOMETRY",
    columns: columns.map((row) => ({
      name: row.column_name,
      pgType: row.data_type,
    })),
  };

  await upsertCatalog(db, plan, opts);
  console.log(`✓ ${opts.table}: Shapefile cargado con ogr2ogr.`);
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const opts = parseArgs(argv);
  if (opts.help) {
    printHelp();
    return;
  }

  const connectionString = env.DATABASE_ADMIN_URL || env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DATABASE_ADMIN_URL (o DATABASE_URL).");
  }
  opts.connectionString = connectionString;

  const { createDriver } = await import("../server/db/drivers/postgres.js");
  const db = createDriver({ connectionString });

  try {
    const extension = path.extname(opts.file).toLowerCase();
    if (extension === ".shp") {
      await loadShapefile(db, opts);
    } else if (extension === ".geojson" || extension === ".json") {
      const raw = await readFile(opts.file, "utf8");
      const collection = JSON.parse(raw);
      if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
        throw new Error("El archivo debe ser una FeatureCollection GeoJSON.");
      }
      const features = collection.features.filter((feature) => feature?.geometry);
      if (features.length === 0) {
        throw new Error("La colección no tiene features con geometría.");
      }
      const plan = buildTablePlan(features, {
        table: opts.table,
        srid: opts.srid,
      });
      await loadGeoJSON(db, plan, features, opts);
    } else {
      throw new Error(`Extensión no soportada: ${extension}. Usa .geojson, .json o .shp.`);
    }

    if (!opts.skipStats && !opts.dryRun) {
      await db.rpc("chat_refresh_stats");
      console.log("Stats refrescadas.");
    }

    if (opts.tiles && !opts.dryRun) {
      const version =
        opts.tilesVersion || new Date().toISOString().slice(0, 10).replace(/-/g, "");
      console.log(`Generando tiles ${opts.layerId}/${version} (08-G)...`);
      const result = spawnSync(
        process.execPath,
        [
          path.join(path.dirname(fileURLToPath(import.meta.url)), "tiles-sync.mjs"),
          "--layer", opts.layerId,
          "--version", version,
        ],
        { env: process.env, stdio: "inherit" }
      );
      if (result.status !== 0) {
        console.error(
          "La capa quedó cargada, pero falló la generación de tiles. " +
            "Reintenta con `npm run tiles:sync -- --layer " + opts.layerId +
            " --version " + version + "`."
        );
        process.exitCode = 1;
      }
    }
  } finally {
    await db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(`[load-layer] ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
