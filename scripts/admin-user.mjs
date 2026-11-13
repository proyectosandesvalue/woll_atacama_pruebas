#!/usr/bin/env node
/**
 * Alta/actualización del usuario admin local.
 *
 * Uso:
 *   npm run admin:user -- --username admin --password '...'
 *   npm run admin:user -- --new-totp
 *
 * El password se guarda como hash scrypt en `admin.admin_users`. El secreto
 * TOTP NO se guarda en la base: se imprime una vez y se configura en
 * ADMIN_TOTP_SECRET del servidor.
 *
 * Sprint 15 (ADR 007).
 */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

import { generateTotpSecret, hashPassword } from "../server/admin/auth.js";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const opts = {
    username: process.env.ADMIN_USERNAME || "admin",
    password: process.env.ADMIN_PASSWORD || "",
    newTotp: false,
    disable: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--username") opts.username = argv[++i];
    else if (arg === "--password") opts.password = argv[++i];
    else if (arg === "--new-totp") opts.newTotp = true;
    else if (arg === "--disable") opts.disable = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`Argumento desconocido: ${arg}`);
  }
  return opts;
}

function connectionString() {
  return process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL || "";
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(
      "Uso: node scripts/admin-user.mjs --username admin --password '...' | --new-totp | --disable"
    );
    return;
  }

  if (opts.newTotp) {
    console.log(`ADMIN_TOTP_SECRET=${generateTotpSecret()}`);
    console.log(
      "Guardá el secreto en el entorno del servidor y enrolalo en tu app TOTP."
    );
    return;
  }

  if (!opts.username || opts.username.length > 80) {
    throw new Error("--username es obligatorio (máximo 80 caracteres).");
  }
  if (!opts.password && !opts.disable) {
    throw new Error("--password es obligatorio (o usá --disable).");
  }

  const url = connectionString();
  if (!url) {
    throw new Error("Falta DATABASE_ADMIN_URL o DATABASE_URL.");
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    if (opts.disable) {
      await client.query(
        "UPDATE admin.admin_users SET activo = false WHERE username = $1",
        [opts.username]
      );
      console.log(`[admin:user] ${opts.username} deshabilitado.`);
      return;
    }

    const passwordHash = hashPassword(opts.password);
    await client.query(
      `INSERT INTO admin.admin_users (username, password_hash, activo, updated_by)
       VALUES ($1, $2, true, 'cli')
       ON CONFLICT (username) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             activo = true,
             updated_by = 'cli'`,
      [opts.username, passwordHash]
    );
    console.log(`[admin:user] ${opts.username} creado/actualizado.`);
    console.log(
      "Recordá configurar ADMIN_SESSION_SECRET (32+ caracteres) y ADMIN_TOTP_SECRET."
    );
  } finally {
    await client.end().catch(() => {});
  }
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((err) => {
    console.error("[admin:user] error:", err?.message || err);
    process.exitCode = 1;
  });
}
