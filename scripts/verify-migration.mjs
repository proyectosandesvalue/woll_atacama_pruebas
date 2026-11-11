#!/usr/bin/env node
/**
 * Verifica una migración Supabase → PostgreSQL propio.
 *
 * Compara conteos por tabla, secuencias, geometrías, extensiones, roles y RPCs
 * entre una base origen y una destino. Pensado para ejecutarse después del
 * dump/restore y antes de promover staging.
 *
 * Uso:
 *   SOURCE_DATABASE_URL='postgres://...supabase...' \
 *   TARGET_DATABASE_URL='postgres://...local...' \
 *   node scripts/verify-migration.mjs
 *
 * Opciones:
 *   --ignore schema.tabla   Excluye una tabla (repetible)
 *   --json                  Salida JSON
 */

import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";

import { RPC_SIGNATURES, listRpcNames } from "../server/db/rpc-signatures.js";

const { Client } = pg;

const APP_SCHEMAS = ["public", "chat", "admin", "ingest", "rag"];
const REQUIRED_EXTENSIONS = ["postgis", "vector", "unaccent"];

const DEFAULT_IGNORES = new Set([
  "public.schema_migrations",
  "public.spatial_ref_sys",
  "public.spatial_ref_sys_srid_seq",
  "chat.chat_audit_runs",
  "chat.chat_audit_layers",
  "admin.unanswered_questions",
  "ingest.runs",
  "rag.ingestion_runs",
]);

function qi(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function tableRef(schema, table) {
  return `${qi(schema)}.${qi(table)}`;
}

function parseArgs(argv) {
  const opts = { ignore: new Set(), json: false, help: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--ignore") {
      const value = argv[++i];
      if (!value) throw new Error("--ignore requiere schema.tabla.");
      opts.ignore.add(value);
    } else if (arg.startsWith("--ignore=")) {
      opts.ignore.add(arg.slice(9));
    } else if (arg === "--json") {
      opts.json = true;
    } else if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else {
      throw new Error(`Argumento desconocido: ${arg}`);
    }
  }

  return opts;
}

function printHelp() {
  console.log(`Verifica Supabase -> PostgreSQL propio.

Variables:
  SOURCE_DATABASE_URL   conexión directa a Supabase/origen
  TARGET_DATABASE_URL   conexión al PostgreSQL destino

Opciones:
  --ignore schema.tabla  Excluye una tabla (repetible)
  --json                 Salida JSON
`);
}

async function connect(connectionString, applicationName) {
  const client = new Client({
    connectionString,
    application_name: applicationName,
    connectionTimeoutMillis: 15_000,
    statement_timeout: 120_000,
  });
  await client.connect();
  return client;
}

async function listTables(client) {
  const { rows } = await client.query(
    `SELECT table_schema, table_name
       FROM information_schema.tables
      WHERE table_schema = ANY($1::text[])
        AND table_type = 'BASE TABLE'
      ORDER BY 1, 2`,
    [APP_SCHEMAS]
  );
  return rows.map((row) => ({
    schema: row.table_schema,
    table: row.table_name,
    key: `${row.table_schema}.${row.table_name}`,
  }));
}

async function countRows(client, schema, table) {
  const { rows } = await client.query(
    `SELECT count(*)::bigint AS n FROM ${tableRef(schema, table)}`
  );
  return Number(rows[0].n);
}

async function geometryStats(client, schema, table, column) {
  const geom = `${qi(column)}`;
  const { rows } = await client.query(
    `SELECT count(*)::bigint AS total,
            count(*) FILTER (WHERE ${geom} IS NOT NULL AND NOT ST_IsValid(${geom}))::bigint AS invalid,
            count(*) FILTER (WHERE ${geom} IS NOT NULL AND ST_SRID(${geom}) <> 4326)::bigint AS wrong_srid
       FROM ${tableRef(schema, table)}`
  );
  return {
    total: Number(rows[0].total),
    invalid: Number(rows[0].invalid),
    wrong_srid: Number(rows[0].wrong_srid),
  };
}

async function listGeometryTables(client) {
  const { rows } = await client.query(
    `SELECT f_table_schema, f_table_name, f_geometry_column
       FROM geometry_columns
      WHERE f_table_schema = ANY($1::text[])
      ORDER BY 1, 2`,
    [APP_SCHEMAS]
  );
  return new Map(
    rows.map((row) => [
      `${row.f_table_schema}.${row.f_table_name}`,
      row.f_geometry_column,
    ])
  );
}

async function listSequences(client) {
  const { rows } = await client.query(
    `SELECT schemaname, sequencename, last_value
       FROM pg_sequences
      WHERE schemaname = ANY($1::text[])
      ORDER BY 1, 2`,
    [APP_SCHEMAS]
  );
  return new Map(
    rows.map((row) => [
      `${row.schemaname}.${row.sequencename}`,
      row.last_value === null ? null : Number(row.last_value),
    ])
  );
}

async function listExtensions(client) {
  const { rows } = await client.query(
    `SELECT extname FROM pg_extension WHERE extname = ANY($1::text[]) ORDER BY 1`,
    [REQUIRED_EXTENSIONS]
  );
  return new Set(rows.map((row) => row.extname));
}

async function listRoles(client) {
  const { rows } = await client.query(
    `SELECT rolname, rolcanlogin, rolbypassrls, rolsuper
       FROM pg_roles
      WHERE rolname = ANY($1::text[])
      ORDER BY 1`,
    [["woll_api", "woll_ingest"]]
  );
  return new Map(rows.map((row) => [row.rolname, row]));
}

async function listRpcNamesInDB(client) {
  const { rows } = await client.query(
    `SELECT p.proname
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = ANY($1::text[])`,
    [listRpcNames()]
  );
  return new Set(rows.map((row) => row.proname));
}

function addIssue(result, message) {
  result.errors.push(message);
}

function addInfo(result, message) {
  result.info.push(message);
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const opts = parseArgs(argv);
  if (opts.help) {
    printHelp();
    return;
  }

  const sourceUrl = env.SOURCE_DATABASE_URL;
  const targetUrl = env.TARGET_DATABASE_URL || env.DATABASE_ADMIN_URL;
  if (!sourceUrl || !targetUrl) {
    throw new Error("Faltan SOURCE_DATABASE_URL y TARGET_DATABASE_URL (o DATABASE_ADMIN_URL).");
  }

  const ignore = new Set([...DEFAULT_IGNORES, ...opts.ignore]);
  const result = {
    ok: true,
    source: "source",
    target: "target",
    tables: { compared: 0, mismatches: [] },
    sequences: { compared: 0, mismatches: [] },
    geometry: { compared: 0, mismatches: [] },
    extensions: { required: REQUIRED_EXTENSIONS, target: [], missing: [] },
    roles: { problems: [] },
    rpcs: { targetMissing: [], sourceMissing: [] },
    errors: [],
    info: [],
  };

  const source = await connect(sourceUrl, "woll-verify-source");
  const target = await connect(targetUrl, "woll-verify-target");

  try {
    const [sourceTables, targetTables] = await Promise.all([
      listTables(source),
      listTables(target),
    ]);
    const sourceMap = new Map(sourceTables.map((row) => [row.key, row]));
    const targetMap = new Map(targetTables.map((row) => [row.key, row]));

    for (const key of sourceMap.keys()) {
      if (ignore.has(key)) continue;
      if (!targetMap.has(key)) {
        addIssue(result, `Falta la tabla destino ${key}`);
      }
    }
    for (const key of targetMap.keys()) {
      if (!sourceMap.has(key) && !ignore.has(key) && key !== "public.schema_migrations") {
        addInfo(result, `Tabla extra en destino: ${key}`);
      }
    }

    for (const [key, row] of sourceMap) {
      if (ignore.has(key) || !targetMap.has(key)) continue;
      const [sourceCount, targetCount] = await Promise.all([
        countRows(source, row.schema, row.table),
        countRows(target, row.schema, row.table),
      ]);
      result.tables.compared += 1;
      if (sourceCount !== targetCount) {
        result.tables.mismatches.push({ table: key, source: sourceCount, target: targetCount });
        addIssue(result, `Conteo distinto ${key}: ${sourceCount} vs ${targetCount}`);
      }
    }

    const [sourceGeom, targetGeom] = await Promise.all([
      listGeometryTables(source),
      listGeometryTables(target),
    ]);
    for (const [key, column] of sourceGeom) {
      if (ignore.has(key) || !targetGeom.has(key)) continue;
      const [schema, table] = key.split(".");
      const targetColumn = targetGeom.get(key);
      const [sourceStats, targetStats] = await Promise.all([
        geometryStats(source, schema, table, column),
        geometryStats(target, schema, table, targetColumn),
      ]);
      result.geometry.compared += 1;
      if (
        sourceStats.invalid !== targetStats.invalid ||
        sourceStats.wrong_srid !== targetStats.wrong_srid
      ) {
        result.geometry.mismatches.push({
          table: key,
          source: sourceStats,
          target: targetStats,
        });
        addIssue(result, `Geometrías distintas en ${key}`);
      }
    }

    const [sourceSeq, targetSeq] = await Promise.all([
      listSequences(source),
      listSequences(target),
    ]);
    for (const [key, value] of sourceSeq) {
      if (ignore.has(key)) continue;
      if (!targetSeq.has(key)) {
        addInfo(result, `Secuencia solo en origen: ${key}`);
        continue;
      }
      result.sequences.compared += 1;
      if (targetSeq.get(key) !== value) {
        result.sequences.mismatches.push({
          sequence: key,
          source: value,
          target: targetSeq.get(key),
        });
        addIssue(result, `Secuencia distinta ${key}: ${value} vs ${targetSeq.get(key)}`);
      }
    }

    const [sourceExt, targetExt] = await Promise.all([
      listExtensions(source),
      listExtensions(target),
    ]);
    result.extensions.target = [...targetExt].sort();
    for (const ext of REQUIRED_EXTENSIONS) {
      if (!targetExt.has(ext)) {
        result.extensions.missing.push(ext);
        addIssue(result, `Falta extensión ${ext} en destino`);
      }
    }
    for (const ext of REQUIRED_EXTENSIONS) {
      if (!sourceExt.has(ext)) addInfo(result, `Extensión ${ext} no está en el origen`);
    }

    const targetRoles = await listRoles(target);
    for (const role of ["woll_api", "woll_ingest"]) {
      const row = targetRoles.get(role);
      if (!row) {
        result.roles.problems.push(`${role} no existe`);
        addIssue(result, `Falta rol ${role}`);
      } else if (row.rolbypassrls || row.rolsuper) {
        result.roles.problems.push(`${role} tiene BYPASSRLS o superuser`);
        addIssue(result, `Rol ${role} con privilegios excesivos`);
      }
    }

    const [sourceRpcs, targetRpcs] = await Promise.all([
      listRpcNamesInDB(source),
      listRpcNamesInDB(target),
    ]);
    for (const name of Object.keys(RPC_SIGNATURES)) {
      if (!targetRpcs.has(name)) result.rpcs.targetMissing.push(name);
      if (!sourceRpcs.has(name)) result.rpcs.sourceMissing.push(name);
    }
    if (result.rpcs.targetMissing.length > 0) {
      addIssue(
        result,
        `Faltan RPCs en destino: ${result.rpcs.targetMissing.join(", ")}`
      );
    }
    if (result.rpcs.sourceMissing.length > 0) {
      addInfo(
        result,
        `RPCs del registro que no están en el origen: ${result.rpcs.sourceMissing.join(", ")}`
      );
    }
  } finally {
    await Promise.all([source.end(), target.end()]);
  }

  result.ok = result.errors.length === 0;

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("== Tablas ==");
    console.log(`Comparadas: ${result.tables.compared}`);
    for (const mismatch of result.tables.mismatches) {
      console.log(
        `  ✗ ${mismatch.table}: origen=${mismatch.source} destino=${mismatch.target}`
      );
    }
    console.log("\n== Geometrías ==");
    console.log(`Comparadas: ${result.geometry.compared}`);
    for (const mismatch of result.geometry.mismatches) {
      console.log(`  ✗ ${mismatch.table}: ${JSON.stringify(mismatch)}`);
    }
    console.log("\n== Secuencias ==");
    console.log(`Comparadas: ${result.sequences.compared}`);
    for (const mismatch of result.sequences.mismatches) {
      console.log(
        `  ✗ ${mismatch.sequence}: origen=${mismatch.source} destino=${mismatch.target}`
      );
    }
    console.log("\n== Extensiones ==");
    console.log(`Destino: ${result.extensions.target.join(", ") || "(ninguna)"}`);
    if (result.extensions.missing.length > 0) {
      console.log(`Faltan: ${result.extensions.missing.join(", ")}`);
    }
    console.log("\n== Roles ==");
    console.log(result.roles.problems.length === 0 ? "OK" : result.roles.problems.join("; "));
    console.log("\n== RPCs ==");
    console.log(
      result.rpcs.targetMissing.length === 0
        ? "Todas las RPCs del registro están en destino."
        : `Faltan: ${result.rpcs.targetMissing.join(", ")}`
    );
    if (result.info.length > 0) {
      console.log("\n== Información ==");
      for (const line of result.info) console.log(`  - ${line}`);
    }
    console.log(`\nResultado: ${result.ok ? "OK" : "FALLÓ"}`);
  }

  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(`[verify-migration] ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
