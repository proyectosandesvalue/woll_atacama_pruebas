#!/usr/bin/env node
/**
 * Purga de datos operativos según la política de retención (Sprint 32-B).
 *
 * Uso:
 *   npm run retention:run -- --dry-run
 *   npm run retention:run -- --unanswered-days 365 --audit-days 730
 *
 * Requiere DATABASE_ADMIN_URL (o DATABASE_URL). No imprime la URL ni
 * contenido de preguntas: solo los conteos que devuelve la RPC.
 */

import { pathToFileURL } from "node:url";
import pg from "pg";

const { Client } = pg;

const DEFAULTS = {
  unansweredDays: 365,
  auditDays: 730,
  dryRun: false,
};

export function parsePositiveDays(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 3650) {
    throw new Error(`${name} debe ser un entero entre 1 y 3650.`);
  }
  return n;
}

export function parseArgs(argv = [], env = process.env) {
  const opts = {
    unansweredDays: parsePositiveDays(
      env.RETENTION_UNANSWERED_DAYS || DEFAULTS.unansweredDays,
      "RETENTION_UNANSWERED_DAYS"
    ),
    auditDays: parsePositiveDays(
      env.RETENTION_AUDIT_DAYS || DEFAULTS.auditDays,
      "RETENTION_AUDIT_DAYS"
    ),
    dryRun: /^(1|true|yes)$/i.test(String(env.RETENTION_DRY_RUN || "")),
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--unanswered-days") {
      opts.unansweredDays = parsePositiveDays(argv[++i], "--unanswered-days");
    } else if (arg === "--audit-days") {
      opts.auditDays = parsePositiveDays(argv[++i], "--audit-days");
    } else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`Argumento desconocido: ${arg}`);
  }

  return opts;
}

export function resolveConnection(env = process.env) {
  const url = env.DATABASE_ADMIN_URL || env.DATABASE_URL || "";
  if (!url) {
    throw new Error(
      "Falta DATABASE_ADMIN_URL o DATABASE_URL para ejecutar la retención."
    );
  }
  return url;
}

export async function runRetention(client, opts) {
  const { rows } = await client.query(
    "SELECT public.admin_purge_retention($1, $2, $3) AS result",
    [opts.unansweredDays, opts.auditDays, opts.dryRun]
  );
  return rows[0]?.result ?? null;
}

export function helpText() {
  return [
    "Uso: npm run retention:run -- [opciones]",
    "",
    "Opciones:",
    "  --dry-run                 Cuenta filas sin borrar",
    "  --unanswered-days <n>     Días de preguntas sin respuesta (default 365)",
    "  --audit-days <n>          Días de auditoría admin (default 730)",
    "  --help, -h                Muestra esta ayuda",
    "",
    "Variables: DATABASE_ADMIN_URL o DATABASE_URL;",
    "           RETENTION_UNANSWERED_DAYS, RETENTION_AUDIT_DAYS, RETENTION_DRY_RUN.",
  ].join("\n");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(helpText());
    return;
  }

  const connectionString = resolveConnection();
  const client = new Client({ connectionString });

  try {
    await client.connect();
    const result = await runRetention(client, opts);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.end().catch(() => {});
  }
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().catch((err) => {
    console.error(`[retention] ${err?.message || err}`);
    process.exitCode = 1;
  });
}
