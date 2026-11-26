#!/usr/bin/env node
/**
 * Avisa a los administradores que el backup semanal está listo.
 *
 * Se ejecuta desde `deploy/vps/notify-backup.sh` (ExecStartPost del servicio).
 * No incluye la passphrase ni el contenido; solo nombre, tamaño e instrucciones
 * de descarga.
 */
import path from "node:path";
import pg from "pg";
import { sendEmail } from "../server/notifications/index.js";

const { Pool } = pg;
const args = process.argv.slice(2);
function option(name, fallback = "") {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const file = option("--file");
const bytes = Number(option("--bytes", "0")) || 0;
if (!file) {
  console.error("[notify-backup] falta --file");
  process.exit(2);
}

const name = path.basename(file);
const mb = (bytes / (1024 * 1024)).toFixed(1);
const message = [
  `Backup semanal disponible: ${name} (${mb} MB).`,
  "Descárgalo desde tu PC con:",
  `scp woll-vps:${file} .`,
  "Verifica el checksum con:",
  `sha256sum -c ${name}.sha256`,
  "El archivo está cifrado con GPG; la passphrase está en tu gestor de contraseñas.",
].join(" ");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[notify-backup] falta DATABASE_URL");
  process.exit(2);
}

const pool = new Pool({
  connectionString,
  max: 1,
  application_name: "woll-notify-backup",
  connectionTimeoutMillis: 5000,
});

let recipients = [];
try {
  const { rows } = await pool.query(
    "select email from admin.admin_users where activo = true and email is not null"
  );
  recipients = [...new Set(rows.map((row) => row.email).filter(Boolean))];
} catch (err) {
  console.error("[notify-backup] no se pudieron leer los admins:", err?.message || err);
} finally {
  await pool.end().catch(() => {});
}

if (recipients.length === 0 && process.env.OPS_ALERT_EMAIL) {
  recipients = [process.env.OPS_ALERT_EMAIL];
}
if (recipients.length === 0) {
  console.error("[notify-backup] sin destinatarios");
  process.exit(0);
}

let sent = 0;
for (const to of recipients) {
  try {
    await sendEmail({
      to,
      template: "status",
      data: { title: "Backup semanal disponible", message },
    });
    sent += 1;
  } catch (err) {
    console.error(`[notify-backup] fallo enviando a ${to}:`, err?.message || err);
  }
}
console.log(`[notify-backup] avisos enviados: ${sent}/${recipients.length}`);
