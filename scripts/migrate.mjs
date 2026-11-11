#!/usr/bin/env node
/**
 * Runner de migraciones portable para PostgreSQL propio.
 *
 * Uso:
 *   npm run migrate
 *   npm run migrate:status
 *   node scripts/migrate.mjs --dry-run
 *   node scripts/migrate.mjs --to 010
 *
 * Requiere DATABASE_ADMIN_URL (preferida) o DATABASE_URL. La conexión debe
 * poder crear extensiones/roles y ejecutar DDL; el API usa `woll_api`, que no
 * tiene esos permisos.
 *
 * Cada migración se aplica en una transacción y se registra en
 * public.schema_migrations con su checksum. Si una migración ya aplicada cambió,
 * el runner aborta: las migraciones aplicadas son inmutables (CONTRACT §5.1).
 */

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

export const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");
export const MIGRATIONS_TABLE = "public.schema_migrations";

/**
 * @param {string} sql
 * @returns {string} SHA-256 hex del contenido de la migración.
 */
export function checksum(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

/**
 * @param {string[]} argv
 * @returns {{status:boolean,dryRun:boolean,to:string|null,help:boolean}}
 */
export function parseArgs(argv = []) {
  const opts = { status: false, dryRun: false, to: null, help: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--status") {
      opts.status = true;
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--to") {
      opts.to = normalizeTo(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith("--to=")) {
      opts.to = normalizeTo(arg.slice(5));
    } else {
      throw new Error(`Argumento desconocido: ${arg}`);
    }
  }

  return opts;
}

/**
 * @param {string|undefined} value
 * @returns {string} Prefijo de 3 dígitos.
 */
function normalizeTo(value) {
  if (!value || !/^\d{3}/.test(String(value))) {
    throw new Error("--to requiere un prefijo de 3 dígitos (ej. 010).");
  }
  return String(value).slice(0, 3);
}

/**
 * @param {string} file
 * @returns {number|null}
 */
export function versionNumber(file) {
  const match = path.basename(file).match(/^(\d{3})_/);
  return match ? Number(match[1]) : null;
}

/**
 * @param {string[]} files
 * @param {string|null} to
 * @returns {string[]}
 */
export function selectFiles(files, to = null) {
  const max = to ? Number(to) : Number.POSITIVE_INFINITY;
  return files.filter((file) => {
    const version = versionNumber(file);
    return version !== null && version <= max;
  });
}

/**
 * @param {string} [dir]
 * @returns {Promise<string[]>} Archivos `NNN_*.sql` ordenados.
 */
export async function listMigrationFiles(dir = MIGRATIONS_DIR) {
  const entries = await readdir(dir);
  return entries.filter((file) => /^\d{3}_.*\.sql$/.test(file)).sort();
}

/**
 * @param {string} metaUrl
 * @param {string|undefined} argv1
 * @returns {boolean}
 */
export function isMain(metaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  return pathToFileURL(path.resolve(argv1)).href === metaUrl;
}

async function ensureTable(client) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
       version      text PRIMARY KEY,
       checksum     text NOT NULL,
       applied_at   timestamptz NOT NULL DEFAULT now(),
       execution_ms integer
     )`
  );
}

async function getApplied(client) {
  const { rows } = await client.query(
    `SELECT version, checksum, applied_at
       FROM ${MIGRATIONS_TABLE}
      ORDER BY version`
  );
  return new Map(rows.map((row) => [row.version, row]));
}

async function tableExists(client) {
  const { rows } = await client.query(
    "SELECT to_regclass($1) AS table_name",
    [MIGRATIONS_TABLE]
  );
  return Boolean(rows[0]?.table_name);
}

/**
 * @param {string[]} files
 * @param {Map<string, {checksum:string, applied_at:Date}>} applied
 * @param {string} dir
 */
async function buildPlan(files, applied, dir) {
  const plan = [];

  for (const file of files) {
    const sql = await readFile(path.join(dir, file), "utf8");
    const sum = checksum(sql);
    const previous = applied.get(file);

    let status = "pending";
    if (previous) {
      status = previous.checksum === sum ? "applied" : "changed";
    }

    plan.push({
      file,
      sql,
      checksum: sum,
      status,
      appliedAt: previous?.applied_at || null,
    });
  }

  return plan;
}

/**
 * @param {import("pg").Client} client
 * @param {{file:string,sql:string,checksum:string}} item
 * @param {(line:string)=>void} log
 */
async function applyOne(client, item, log) {
  const started = Date.now();

  await client.query("BEGIN");
  try {
    // Las migraciones pueden tardar (índices/extensiones); el lock se acota
    // para no bloquear el arranque indefinidamente.
    await client.query("SET LOCAL statement_timeout = 0");
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query(item.sql);

    const executionMs = Date.now() - started;
    await client.query(
      `INSERT INTO ${MIGRATIONS_TABLE} (version, checksum, execution_ms)
       VALUES ($1, $2, $3)`,
      [item.file, item.checksum, executionMs]
    );
    await client.query("COMMIT");
    log(`+ ${item.file} (${executionMs} ms)`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Migración ${item.file} falló: ${detail}`);
  }
}

/**
 * @param {object} opts
 * @param {string} opts.connectionString
 * @param {string} [opts.dir]
 * @param {boolean} [opts.dryRun]
 * @param {string|null} [opts.to]
 * @param {(line:string)=>void} [opts.log]
 */
export async function runMigrations({
  connectionString,
  dir = MIGRATIONS_DIR,
  dryRun = false,
  to = null,
  log = console.log,
}) {
  const files = selectFiles(await listMigrationFiles(dir), to);
  if (files.length === 0) {
    log("No hay migraciones para aplicar.");
    return { applied: 0, skipped: 0 };
  }

  const client = new Client({
    connectionString,
    application_name: "woll-migrate",
    connectionTimeoutMillis: 10_000,
  });

  await client.connect();
  try {
    // En dry-run no se crea la tabla de control: no debe haber escrituras.
    const exists = await tableExists(client);
    if (!exists && !dryRun) {
      await ensureTable(client);
    }
    const applied = exists ? await getApplied(client) : new Map();
    const plan = await buildPlan(files, applied, dir);
    const changed = plan.filter((item) => item.status === "changed");

    if (changed.length > 0) {
      throw new Error(
        `Migraciones ya aplicadas con contenido distinto: ${changed
          .map((item) => item.file)
          .join(", ")}. No se editan migraciones aplicadas (CONTRACT §5.1).`
      );
    }

    const pending = plan.filter((item) => item.status === "pending");
    if (pending.length === 0) {
      log("No hay migraciones pendientes.");
      return { applied: 0, skipped: plan.length };
    }

    for (const item of plan) {
      if (item.status === "applied") {
        log(`= ${item.file}`);
        continue;
      }
      if (dryRun) {
        log(`+ ${item.file} (dry-run)`);
        continue;
      }
      await applyOne(client, item, log);
    }

    log(
      dryRun
        ? `Dry-run: ${pending.length} migración(es) pendiente(s).`
        : `Migraciones aplicadas: ${pending.length}.`
    );
    return { applied: dryRun ? 0 : pending.length, skipped: plan.length - pending.length };
  } finally {
    await client.end();
  }
}

/**
 * @param {object} opts
 * @param {string} opts.connectionString
 * @param {string} [opts.dir]
 * @param {string|null} [opts.to]
 * @param {(line:string)=>void} [opts.log]
 */
export async function printStatus({
  connectionString,
  dir = MIGRATIONS_DIR,
  to = null,
  log = console.log,
}) {
  const files = selectFiles(await listMigrationFiles(dir), to);
  const client = new Client({
    connectionString,
    application_name: "woll-migrate-status",
    connectionTimeoutMillis: 10_000,
  });

  await client.connect();
  try {
    const exists = await tableExists(client);
    const applied = exists ? await getApplied(client) : new Map();
    const plan = await buildPlan(files, applied, dir);

    log("version                                         estado     aplicada");
    log("----------------------------------------------  ---------  -------------------");
    for (const item of plan) {
      const state =
        item.status === "changed" ? "CAMBIADA" : item.status === "applied" ? "aplicada" : "pendiente";
      const appliedAt = item.appliedAt
        ? new Date(item.appliedAt).toISOString().replace("T", " ").slice(0, 19)
        : "-";
      log(`${item.file.padEnd(46)}  ${state.padEnd(9)}  ${appliedAt}`);
    }

    const pending = plan.filter((item) => item.status === "pending").length;
    const changed = plan.filter((item) => item.status === "changed").length;
    log(`\nTotal: ${plan.length} · pendientes: ${pending} · cambiadas: ${changed}`);
    return { pending, changed, total: plan.length };
  } finally {
    await client.end();
  }
}

function printHelp() {
  console.log(`Runner de migraciones — WOLL Atacama

Uso:
  node scripts/migrate.mjs              Aplica migraciones pendientes
  node scripts/migrate.mjs --status     Muestra aplicadas/pendientes
  node scripts/migrate.mjs --dry-run    Lista lo que aplicaría, sin escribir
  node scripts/migrate.mjs --to 010     Aplica hasta el prefijo indicado
  node scripts/migrate.mjs --help       Esta ayuda

Conexión:
  DATABASE_ADMIN_URL (preferida) o DATABASE_URL.
  Debe ser un rol con permisos de DDL; no uses woll_api.
`);
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const opts = parseArgs(argv);

  if (opts.help) {
    printHelp();
    return;
  }

  const connectionString = env.DATABASE_ADMIN_URL || env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      "Falta DATABASE_ADMIN_URL (o DATABASE_URL). Configúrala en .env.local o en el entorno."
    );
    process.exitCode = 2;
    return;
  }

  if (opts.status) {
    const result = await printStatus({
      connectionString,
      to: opts.to,
    });
    if (result.changed > 0) {
      process.exitCode = 1;
    }
    return;
  }

  await runMigrations({
    connectionString,
    dryRun: opts.dryRun,
    to: opts.to,
  });
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(`[migrate] ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
