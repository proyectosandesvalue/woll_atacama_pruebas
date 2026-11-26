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
import { sendEmail } from "../server/notifications/index.js";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const opts = {
    username: process.env.ADMIN_USERNAME || "admin",
    password: process.env.ADMIN_PASSWORD || "",
    newTotp: false,
    disable: false,
    email: process.env.ADMIN_EMAIL || "",
    role: process.env.ADMIN_ROLE || "",
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--username") opts.username = argv[++i];
    else if (arg === "--password") opts.password = argv[++i];
    else if (arg === "--new-totp") opts.newTotp = true;
    else if (arg === "--disable") opts.disable = true;
    else if (arg === "--email") opts.email = argv[++i];
    else if (arg === "--role") opts.role = argv[++i];
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`Argumento desconocido: ${arg}`);
  }
  return opts;
}

function connectionString() {
  return process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL || "";
}

async function notifyUser(to, title, message) {
  if (!to) {
    console.warn("[admin:user] sin correo registrado; no se envía aviso.");
    return;
  }
  try {
    await sendEmail({
      to,
      template: "status",
      data: { title, message },
    });
    console.log(`[admin:user] aviso enviado a ${to}.`);
  } catch (err) {
    console.warn(`[admin:user] no se pudo enviar el aviso: ${err?.message || err}`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(
      "Uso: node scripts/admin-user.mjs --username admin --password '...' [--email x@y] [--role owner|editor] | --new-totp | --disable"
    );
    return;
  }

  if (opts.newTotp) {
    console.log(`ADMIN_TOTP_SECRET=${generateTotpSecret()}`);
    console.log(
      "Guarda el secreto en el entorno del servidor y enrólalo en tu app TOTP."
    );
    return;
  }

  if (!opts.username || opts.username.length > 80) {
    throw new Error("--username es obligatorio (máximo 80 caracteres).");
  }
  if (!opts.password && !opts.disable) {
    throw new Error("--password es obligatorio (o usa --disable).");
  }
  if (opts.role && !["owner", "editor"].includes(opts.role)) {
    throw new Error("--role debe ser owner o editor.");
  }

  const url = connectionString();
  if (!url) {
    throw new Error("Falta DATABASE_ADMIN_URL o DATABASE_URL.");
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const beforeResult = await client.query(
      "SELECT username, email, role, activo FROM admin.admin_users WHERE username = $1",
      [opts.username]
    );
    const previous = beforeResult.rows[0] || null;

    if (opts.disable) {
      await client.query(
        "UPDATE admin.admin_users SET activo = false, updated_by = 'cli' WHERE username = $1",
        [opts.username]
      );
      await client
        .query(
          "UPDATE admin.trusted_devices SET revoked_at = now() WHERE username = $1 AND revoked_at IS NULL",
          [opts.username]
        )
        .catch(() => {});
      console.log(`[admin:user] ${opts.username} deshabilitado.`);
      await notifyUser(previous?.email, "Cuenta desactivada", "Tu acceso al panel fue desactivado.");
      return;
    }

    const passwordHash = hashPassword(opts.password);
    await client.query(
      `INSERT INTO admin.admin_users
         (username, password_hash, activo, role, email, updated_by)
       VALUES ($1, $2, true, COALESCE($3, 'editor'), $4, 'cli')
       ON CONFLICT (username) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             activo = true,
             role = COALESCE($3, admin.admin_users.role),
             email = COALESCE($4, admin.admin_users.email),
             updated_by = 'cli'`,
      [opts.username, passwordHash, opts.role || null, opts.email || null]
    );
    await client
      .query(
        "UPDATE admin.trusted_devices SET revoked_at = now() WHERE username = $1 AND revoked_at IS NULL",
        [opts.username]
      )
      .catch(() => {});
    console.log(`[admin:user] ${opts.username} creado/actualizado.`);

    const recipient = opts.email || previous?.email;
    if (!previous) {
      await notifyUser(
        recipient,
        "Cuenta creada en el panel",
        "Se creó tu acceso al panel de WOLL Atacama. La contraseña te la entrega el owner por un canal seguro."
      );
    } else {
      const changes = [];
      changes.push("Contraseña actualizada.");
      if (opts.role && opts.role !== previous.role) {
        changes.push(`Rol cambiado a ${opts.role}.`);
      }
      if (opts.email && opts.email !== previous.email) {
        changes.push(`Correo de contacto actualizado a ${opts.email}.`);
      }
      if (!previous.activo) changes.push("Cuenta reactivada.");
      await notifyUser(recipient, "Cambios en tu cuenta del panel", changes.join(" "));
    }
    console.log(
      "Recuerda configurar ADMIN_SESSION_SECRET (32+ caracteres). " +
        "ADMIN_TOTP_SECRET es opcional y solo se usa en flujos sensibles."
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
