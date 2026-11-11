#!/usr/bin/env node
/**
 * Extrae de Supabase las RPCs heredadas que no están en db/migrations/ y genera
 * una migración `039_legacy_rpcs.sql` con sus definiciones y grants.
 *
 * Uso:
 *   SOURCE_DATABASE_URL='postgres://...' node scripts/extract-legacy-rpcs.mjs
 *
 * Requiere conexión directa a PostgreSQL (DBeaver/CLI), no la API REST.
 * La URL no se escribe en el archivo generado.
 */

import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";

const { Client } = pg;

export const LEGACY_RPCS = [
  "admin_upsert_station",
  "chat_historical_climate",
  "chat_historical_stations",
  "chat_list_climate_stations",
  "chat_station_available_dates",
  "chat_station_details",
  "chat_station_series",
  "chat_station_weather",
  "chat_stations_map_data_at_date",
  "chat_variable_available_dates",
  "ingest_bulk_upsert_values",
  "ingest_update_run",
];

function parseArgs(argv) {
  const opts = {
    output: "db/migrations/039_legacy_rpcs.sql",
    force: false,
    names: LEGACY_RPCS,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--output") opts.output = argv[++i];
    else if (arg === "--force") opts.force = true;
    else if (arg === "--names") {
      opts.names = String(argv[++i] || "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
    } else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`Argumento desconocido: ${arg}`);
  }

  return opts;
}

function printHelp() {
  console.log(`Extrae RPCs heredadas de Supabase y genera una migración.

Uso:
  SOURCE_DATABASE_URL='postgres://...' node scripts/extract-legacy-rpcs.mjs

Opciones:
  --output <ruta>   Archivo de salida (default: db/migrations/039_legacy_rpcs.sql)
  --force            Sobrescribe si existe
  --names a,b,c      Nombres a extraer (default: las 12 RPCs heredadas)
`);
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const opts = parseArgs(argv);
  if (opts.help) {
    printHelp();
    return;
  }

  const connectionString = env.SOURCE_DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta SOURCE_DATABASE_URL (conexión directa a Supabase).");
  }

  const outputPath = path.resolve(opts.output);
  if (!opts.force) {
    try {
      await access(outputPath);
      throw new Error(`Ya existe ${opts.output}. Usa --force para sobrescribirlo.`);
    } catch (err) {
      if (err?.code !== "ENOENT") throw err;
    }
  }

  const client = new Client({
    connectionString,
    application_name: "woll-extract-legacy-rpcs",
    connectionTimeoutMillis: 15_000,
  });

  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT p.proname,
              pg_get_functiondef(p.oid) AS definition,
              pg_get_function_identity_arguments(p.oid) AS identity_args
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = ANY($1::text[])`,
      [opts.names]
    );

    const byName = new Map(rows.map((row) => [row.proname, row]));
    const missing = opts.names.filter((name) => !byName.has(name));
    if (missing.length > 0) {
      throw new Error(
        `Faltan en el origen: ${missing.join(", ")}. No se genera la migración.`
      );
    }

    const chunks = [
      "-- 039_legacy_rpcs.sql",
      "--",
      "-- RPCs heredadas que existían en Supabase pero no estaban versionadas en",
      "-- db/migrations/. Generado por scripts/extract-legacy-rpcs.mjs.",
      "--",
      "-- No editar a mano: si una definición cambia en el origen, regenerar y",
      "-- revisar el diff. Los grants se reaplican a woll_api y service_role.",
      "--",
      "-- Idempotente: CREATE OR REPLACE FUNCTION + REVOKE/GRANT.",
      "",
      "SET search_path TO public, chat, ingest, extensions;",
      "",
    ];

    for (const name of opts.names) {
      const row = byName.get(name);
      const definition = String(row.definition).trim();
      chunks.push(definition.endsWith(";") ? definition : `${definition};`);
      chunks.push(
        `\nREVOKE ALL ON FUNCTION public.${name}(${row.identity_args}) FROM PUBLIC, anon, authenticated;`
      );
      chunks.push(
        `GRANT EXECUTE ON FUNCTION public.${name}(${row.identity_args}) TO woll_api, service_role;`
      );
      chunks.push("");
    }

    chunks.push("-- Verificación rápida");
    chunks.push(
      `DO $$ BEGIN RAISE NOTICE '[039] RPCs heredadas aplicadas: ${opts.names.length}'; END $$;`
    );
    chunks.push("");

    await writeFile(outputPath, chunks.join("\n"), "utf8");
    console.log(`✓ ${opts.output}: ${opts.names.length} RPCs extraídas.`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(`[extract-legacy-rpcs] ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
