#!/usr/bin/env node
/**
 * Chequeo operativo del VPS (Sprint 31-B).
 *
 * Corre dentro del contenedor `ops-check` (imagen de la API), sin socket de
 * Docker. Valida API, Nginx, certificado TLS, disco, backup, heartbeats de
 * workers y backlog de colas.
 *
 * Uso:
 *   node scripts/ops-check.mjs
 *
 * Salida: JSON por stdout; exit 1 si hay alertas.
 * Alerta opcional: OPS_ALERT_WEBHOOK (POST {"text": ...}), nunca se registra
 * la URL ni el contenido de la respuesta.
 */
import tls from "node:tls";
import pg from "pg";
import { collectChecks, evaluateChecks } from "../server/ops/checks.js";

const { Pool } = pg;

function certDays({ host, port, servername, timeoutMs = 5000 }) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host,
        port,
        servername,
        // El chequeo solo lee la fecha de expiración; el certificado puede ser
        // autofirmado durante la etapa previa al DNS definitivo.
        rejectUnauthorized: false,
        timeout: timeoutMs,
      },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        const validTo = cert?.valid_to ? new Date(cert.valid_to).getTime() : NaN;
        if (!Number.isFinite(validTo)) {
          reject(new Error("certificado sin valid_to"));
          return;
        }
        resolve((validTo - Date.now()) / 86_400_000);
      }
    );
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("timeout TLS"));
    });
    socket.on("error", reject);
  });
}

function thresholdsFromEnv(env = process.env) {
  const num = (name, fallback) => {
    const value = Number(env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    maxDiskPct: num("OPS_MAX_DISK_PCT", 80),
    maxBackupHours: num("OPS_MAX_BACKUP_HOURS", 26),
    minCertDays: num("OPS_MIN_CERT_DAYS", 14),
    maxHeartbeatMinutes: num("OPS_MAX_HEARTBEAT_MIN", 10),
    maxBacklog: num("OPS_MAX_BACKLOG", 25),
  };
}

async function notify(webhook, alerts) {
  if (!webhook) return;
  const text =
    `[WOLL] ops-check: ${alerts.length} alerta(s)\n` +
    alerts.map((a) => `- ${a.check}: ${a.message}`).join("\n");
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    console.error("[ops-check] no se pudo enviar la alerta al webhook");
  }
}

async function main() {
  const env = process.env;
  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    console.error("[ops-check] falta DATABASE_URL");
    process.exit(2);
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    application_name: env.PG_APPLICATION_NAME || "woll-ops",
    connectionTimeoutMillis: 5000,
  });
  const db = { query: (sql) => pool.query(sql) };

  const metrics = await collectChecks({
    env,
    db,
    certDays: () =>
      certDays({
        host: env.OPS_CERT_HOST || "nginx",
        port: Number(env.OPS_CERT_PORT) || 443,
        servername: env.OPS_CERT_SERVERNAME || "localhost",
      }),
  });

  const thresholds = thresholdsFromEnv(env);
  const result = evaluateChecks(metrics, thresholds);
  const output = {
    ts: new Date().toISOString(),
    ok: result.ok,
    alerts: result.alerts,
    checks: {
      api: metrics.apiOk,
      nginx: metrics.nginxOk,
      cert_days: metrics.certDays,
      disk_used_pct: metrics.diskUsedPct,
      backup_age_hours: metrics.backupAgeHours,
      workers: metrics.workers,
      backlog: metrics.backlog,
    },
    thresholds: result.thresholds,
  };

  console.log(JSON.stringify(output));
  await notify(env.OPS_ALERT_WEBHOOK, result.alerts);
  await pool.end();
  process.exit(result.ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error("[ops-check] error:", err?.message || err);
  process.exit(2);
});
