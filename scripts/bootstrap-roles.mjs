#!/usr/bin/env node
/**
 * Habilita LOGIN y setea passwords de los roles de servicio.
 *
 * Los roles `woll_api` y `woll_ingest` se crean NOLOGIN en
 * `000_compat_roles.sql`; este script los habilita con passwords que viven
 * solo en `.env`/variables de entorno. No se versionan.
 *
 * Uso:
 *   DATABASE_ADMIN_URL=... WOLL_API_PASSWORD=... WOLL_INGEST_PASSWORD=... \
 *     node scripts/bootstrap-roles.mjs
 */

import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";

const { Client } = pg;

function required(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Falta ${name}.`);
  }
  if (value === "CAMBIAR" || value.length < 12) {
    throw new Error(`${name} debe tener al menos 12 caracteres y no ser "CAMBIAR".`);
  }
  return value;
}

/**
 * @param {import("pg").Client} client
 * @param {string} role
 * @param {string} password
 */
async function setPassword(client, role, password) {
  const { rows } = await client.query(
    "SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', $1::text, $2::text) AS sql",
    [role, password]
  );
  await client.query(rows[0].sql);
}

export async function main(env = process.env) {
  const connectionString = env.DATABASE_ADMIN_URL || env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DATABASE_ADMIN_URL (o DATABASE_URL).");
  }

  const apiPassword = required("WOLL_API_PASSWORD");
  const ingestPassword = required("WOLL_INGEST_PASSWORD");

  const client = new Client({
    connectionString,
    application_name: "woll-bootstrap-roles",
    connectionTimeoutMillis: 10_000,
  });

  await client.connect();
  try {
    await setPassword(client, "woll_api", apiPassword);
    await setPassword(client, "woll_ingest", ingestPassword);
    console.log("Roles woll_api y woll_ingest habilitados con LOGIN.");
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(`[bootstrap-roles] ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
