#!/usr/bin/env node
/**
 * Auditoría de la base local (26-K).
 *
 * Reporta estructura, extensiones/schema de PostGIS, tablas, geometrías,
 * RAG/ingest y cobertura de capas contra allTemasConfig y geojson/.
 *
 * Uso:
 *   DATABASE_ADMIN_URL='postgres://...' node scripts/audit-db.mjs
 *   DATABASE_ADMIN_URL='...' node scripts/audit-db.mjs --json
 *   DATABASE_ADMIN_URL='...' node scripts/audit-db.mjs --output reports/audit.md
 */

import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

import { listRpcNames } from "../server/db/rpc-signatures.js";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SHELL_SCHEMAS = ["public", "chat", "admin", "ingest", "rag"];

function qi(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function ref(schema, table) {
  return `${qi(schema)}.${qi(table)}`;
}

function parseArgs(argv) {
  const opts = { json: false, output: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") opts.json = true;
    else if (arg === "--output") opts.output = argv[++i];
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`Argumento desconocido: ${arg}`);
  }
  return opts;
}

function printHelp() {
  console.log(`Auditoría de la base local — 26-K

Uso:
  DATABASE_ADMIN_URL='postgres://...' node scripts/audit-db.mjs [--json] [--output archivo]
`);
}

async function loadConfigLayers() {
  const mod = await import(
    pathToFileURL(path.join(ROOT, "js", "config", "allTemasConfig.js")).href
  );
  const all = mod.default ?? mod.allTemasConfig ?? {};
  const names = new Set();
  const dynamic = new Set();
  const wms = new Set();
  const sources = new Set();

  for (const [theme, tema] of Object.entries(all)) {
    if (!tema || typeof tema !== "object") continue;
    const capas = new Set();
    if (Array.isArray(tema.capas)) tema.capas.forEach((c) => capas.add(c));
    if (tema.estilo && typeof tema.estilo === "object") {
      Object.keys(tema.estilo).forEach((c) => capas.add(c));
    }
    for (const capa of capas) {
      if (!capa) continue;
      const style = tema.estilo?.[capa] || {};
      if (style.tipo === "wms" || style.type === "wms") {
        wms.add(capa);
        continue;
      }
      if (typeof style.url === "string" && style.url.endsWith(".geojson")) {
        sources.add(style.url.replace(/\.geojson$/, ""));
      }
      // Capas de estaciones y ARClim se sirven por API, no por tabla física.
      if (style.variable || (typeof style.url === "string" && style.url.startsWith("/api/"))) {
        dynamic.add(capa);
        continue;
      }
      names.add(capa);
    }
  }

  return { names, dynamic, wms, sources, themes: Object.keys(all).length };
}

async function listGeoJSONFiles() {
  const dir = path.join(ROOT, "geojson");
  const entries = await readdir(dir);
  return new Set(
    entries
      .filter((name) => name.endsWith(".geojson"))
      .map((name) => name.replace(/\.geojson$/, ""))
  );
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const opts = parseArgs(argv);
  if (opts.help) {
    printHelp();
    return;
  }

  const connectionString = env.DATABASE_ADMIN_URL || env.DATABASE_URL;
  if (!connectionString) throw new Error("Falta DATABASE_ADMIN_URL (o DATABASE_URL).");

  const client = new Client({
    connectionString,
    application_name: "woll-audit-db",
    connectionTimeoutMillis: 15_000,
    statement_timeout: 300_000,
  });
  await client.connect();

  const result = {
    generated_at: new Date().toISOString(),
    postgres: null,
    extensions: [],
    schemas: [],
    tables: [],
    geometry: { tables: 0, invalid: 0, wrong_srid: 0 },
    rls: { tables: 0 },
    roles: [],
    rag: {},
    ingest: {},
    catalog: { layers: 0 },
    layer_coverage: {},
    rpcs: { expected: listRpcNames().length, present: 0, missing: [] },
  };

  try {
    const version = await client.query("SELECT version() AS version");
    result.postgres = version.rows[0].version;

    const extensions = await client.query(
      `SELECT e.extname, n.nspname AS schema, e.extversion
         FROM pg_extension e
         JOIN pg_namespace n ON n.oid = e.extnamespace
        WHERE e.extname IN ('postgis','vector','unaccent')
        ORDER BY e.extname`
    );
    result.extensions = extensions.rows;

    const tables = await client.query(
      `SELECT table_schema, table_name,
              pg_total_relation_size(format('%I.%I', table_schema, table_name))::bigint AS bytes
         FROM information_schema.tables
        WHERE table_schema = ANY($1::text[])
          AND table_type = 'BASE TABLE'
        ORDER BY table_schema, table_name`,
      [SHELL_SCHEMAS]
    );

    for (const row of tables.rows) {
      const count = await client.query(
        `SELECT count(*)::bigint AS n FROM ${ref(row.table_schema, row.table_name)}`
      );
      result.tables.push({
        schema: row.table_schema,
        table: row.table_name,
        rows: Number(count.rows[0].n),
        bytes: Number(row.bytes),
      });
    }

    for (const schema of SHELL_SCHEMAS) {
      const rows = result.tables.filter((t) => t.schema === schema);
      result.schemas.push({
        schema,
        tables: rows.length,
        rows: rows.reduce((sum, t) => sum + t.rows, 0),
        bytes: rows.reduce((sum, t) => sum + t.bytes, 0),
      });
    }

    const geomTables = await client.query(
      `SELECT f_table_schema, f_table_name, f_geometry_column, srid, type
         FROM geometry_columns
        WHERE f_table_schema = 'public'
        ORDER BY f_table_name`
    );
    result.geometry.tables = geomTables.rows.length;
    for (const row of geomTables.rows) {
      const col = qi(row.f_geometry_column);
      const stats = await client.query(
        `SELECT count(*) FILTER (WHERE ${col} IS NOT NULL AND NOT ST_IsValid(${col}))::bigint AS invalid,
                count(*) FILTER (WHERE ${col} IS NOT NULL AND ST_SRID(${col}) <> 4326)::bigint AS wrong_srid
           FROM ${ref(row.f_table_schema, row.f_table_name)}`
      );
      result.geometry.invalid += Number(stats.rows[0].invalid);
      result.geometry.wrong_srid += Number(stats.rows[0].wrong_srid);
    }

    const rls = await client.query(
      `SELECT count(*)::int AS n FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ANY($1::text[]) AND c.relrowsecurity`,
      [SHELL_SCHEMAS]
    );
    result.rls.tables = Number(rls.rows[0].n);

    const roles = await client.query(
      `SELECT rolname, rolcanlogin, rolbypassrls, rolsuper
         FROM pg_roles WHERE rolname = ANY($1::text[]) ORDER BY 1`,
      [["woll_api", "woll_ingest"]]
    );
    result.roles = roles.rows;

    for (const [schema, table, key] of [
      ["rag", "documents", "documents"],
      ["rag", "chunks", "chunks"],
      ["rag", "ingestion_runs", "ingestion_runs"],
      ["ingest", "sources", "sources"],
      ["ingest", "endpoints", "endpoints"],
      ["ingest", "runs", "runs"],
      ["ingest", "indicator_values", "indicator_values"],
      ["ingest", "stations", "stations"],
    ]) {
      try {
        const q = await client.query(`SELECT count(*)::bigint AS n FROM ${ref(schema, table)}`);
        if (schema === "rag") result.rag[key] = Number(q.rows[0].n);
        else result.ingest[key] = Number(q.rows[0].n);
      } catch {
        if (schema === "rag") result.rag[key] = null;
        else result.ingest[key] = null;
      }
    }

    const catalog = await client.query("SELECT count(*)::int AS n FROM chat.chat_catalog");
    result.catalog.layers = Number(catalog.rows[0].n);

    const { names: configLayers, dynamic, wms, sources, themes } = await loadConfigLayers();
    const geojson = await listGeoJSONFiles();
    const dbTables = new Set(geomTables.rows.map((r) => r.f_table_name));
    const catalogLayers = new Set(
      (
        await client.query("SELECT layer_id FROM chat.chat_catalog")
      ).rows.map((r) => r.layer_id)
    );

    result.layer_coverage = {
      themes,
      config_layers: configLayers.size,
      dynamic_layers: dynamic.size,
      geojson_files: geojson.size,
      db_geometry_tables: dbTables.size,
      catalog_layers: catalogLayers.size,
      config_without_catalog: [...configLayers].filter((x) => !catalogLayers.has(x)).sort(),
      config_without_table: [...configLayers].filter((x) => !dbTables.has(x)).sort(),
      geojson_without_table: [...geojson]
        .filter((x) => !dbTables.has(x) && !sources.has(x))
        .sort(),
      orphan_geojson: [...geojson]
        .filter((x) => !dbTables.has(x) && !sources.has(x))
        .sort(),
      catalog_without_table: [...catalogLayers]
        .filter((x) => !dbTables.has(x) && !wms.has(x))
        .sort(),
      table_without_catalog: [...dbTables].filter((x) => !catalogLayers.has(x)).sort(),
    };

    const rpcRows = await client.query(
      `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])`,
      [listRpcNames()]
    );
    const present = new Set(rpcRows.rows.map((r) => r.proname));
    result.rpcs.present = present.size;
    result.rpcs.missing = listRpcNames().filter((name) => !present.has(name));
  } finally {
    await client.end();
  }

  if (opts.json) {
    const text = JSON.stringify(result, null, 2);
    if (opts.output) {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(path.resolve(opts.output), text, "utf8");
      console.log(`Auditoría escrita en ${opts.output}`);
    } else {
      console.log(text);
    }
    return;
  }

  const lines = [];
  lines.push("# Auditoría de la base local — 26-K");
  lines.push("");
  lines.push(`Generada: ${result.generated_at}`);
  lines.push("");
  lines.push("## PostgreSQL y extensiones");
  lines.push("");
  lines.push(`- ${result.postgres}`);
  for (const ext of result.extensions) {
    lines.push(`- ${ext.extname} ${ext.extversion} en schema \`${ext.schema}\``);
  }
  lines.push("");
  lines.push("## Schemas");
  lines.push("");
  lines.push("| Schema | Tablas | Filas | Tamaño |");
  lines.push("|---|---:|---:|---:|");
  for (const schema of result.schemas) {
    lines.push(
      `| ${schema.schema} | ${schema.tables} | ${schema.rows} | ${(schema.bytes / 1024 / 1024).toFixed(1)} MB |`
    );
  }
  lines.push("");
  lines.push("## Geometrías, RLS y roles");
  lines.push("");
  lines.push(`- Tablas con geometría: ${result.geometry.tables}`);
  lines.push(`- Geometrías inválidas: ${result.geometry.invalid}`);
  lines.push(`- SRID distinto de 4326: ${result.geometry.wrong_srid}`);
  lines.push(`- Tablas con RLS: ${result.rls.tables}`);
  for (const role of result.roles) {
    lines.push(
      `- ${role.rolname}: login=${role.rolcanlogin}, bypassrls=${role.rolbypassrls}, superuser=${role.rolsuper}`
    );
  }
  lines.push("");
  lines.push("## RAG e ingestas");
  lines.push("");
  lines.push(`- RAG: ${JSON.stringify(result.rag)}`);
  lines.push(`- Ingest: ${JSON.stringify(result.ingest)}`);
  lines.push(`- Catálogo: ${result.catalog.layers} capas`);
  lines.push("");
  lines.push("## Cobertura de capas");
  lines.push("");
  for (const [key, value] of Object.entries(result.layer_coverage)) {
    if (Array.isArray(value)) {
      lines.push(`### ${key} (${value.length})`);
      if (value.length === 0) lines.push("Sin faltantes.");
      for (const item of value) lines.push(`- ${item}`);
      lines.push("");
    } else {
      lines.push(`- ${key}: ${value}`);
    }
  }
  lines.push("");
  lines.push("## RPCs");
  lines.push("");
  lines.push(`- Presentes: ${result.rpcs.present}/${result.rpcs.expected}`);
  if (result.rpcs.missing.length > 0) {
    lines.push(`- Faltan: ${result.rpcs.missing.join(", ")}`);
  }

  const text = lines.join("\n");
  if (opts.output) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path.resolve(opts.output), text, "utf8");
    console.log(`Auditoría escrita en ${opts.output}`);
  } else {
    console.log(text);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(`[audit-db] ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
