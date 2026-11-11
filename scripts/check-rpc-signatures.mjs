#!/usr/bin/env node
/**
 * Verifica que todas las RPCs del registro existan en PostgreSQL.
 *
 * Se corre después de restaurar el dump de Supabase (26-E) y en CI/staging.
 * No valida el cuerpo de las funciones: solo que estén y que sus argumentos
 * declarados coincidan con los del registro.
 *
 * Uso:
 *   node --env-file=.env.local scripts/check-rpc-signatures.mjs
 */

import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";

import {
  RPC_SIGNATURES,
  listRpcNames,
} from "../server/db/rpc-signatures.js";

const { Client } = pg;

/**
 * @param {string} args
 * @returns {string[]}
 */
function argumentNames(args) {
  if (!args || !args.trim()) return [];
  return args
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean);
}

export async function main(env = process.env) {
  const connectionString = env.DATABASE_ADMIN_URL || env.DATABASE_URL;
  if (!connectionString) {
    console.error("Falta DATABASE_ADMIN_URL (o DATABASE_URL).");
    process.exitCode = 2;
    return;
  }

  const names = listRpcNames();
  const client = new Client({
    connectionString,
    application_name: "woll-check-rpcs",
    connectionTimeoutMillis: 10_000,
  });

  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT p.proname,
              pg_get_function_identity_arguments(p.oid) AS args
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = ANY($1::text[])`,
      [names]
    );

    // Puede haber overloads (Supabase dejó versiones viejas). Se pasa si
    // al menos una firma contiene todos los parámetros esperados.
    const found = new Map();
    for (const row of rows) {
      if (!found.has(row.proname)) found.set(row.proname, []);
      found.get(row.proname).push(row.args);
    }

    const missing = [];
    const argumentsMismatch = [];

    for (const name of names) {
      if (!found.has(name)) {
        missing.push(name);
        continue;
      }

      const expected = Object.keys(RPC_SIGNATURES[name].params);
      const matches = found
        .get(name)
        .some((args) => {
          const declared = new Set(argumentNames(args));
          return expected.every((param) => declared.has(param));
        });

      if (!matches) {
        const available = found.get(name).join(" | ");
        argumentsMismatch.push(
          `${name}: esperaba ${expected.join(", ")}; disponible: ${available || "(sin args)"}`
        );
      }
    }

    if (missing.length > 0) {
      console.error(`Faltan ${missing.length} RPC(s) en public:`);
      for (const name of missing) console.error(`  - ${name}`);
    }

    if (argumentsMismatch.length > 0) {
      console.error("Argumentos que no coinciden con el registro:");
      for (const line of argumentsMismatch) console.error(`  - ${line}`);
    }

    if (missing.length === 0 && argumentsMismatch.length === 0) {
      console.log(`OK: ${names.length}/${names.length} RPCs registradas y con argumentos esperados.`);
    } else {
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(`[check-rpcs] ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
