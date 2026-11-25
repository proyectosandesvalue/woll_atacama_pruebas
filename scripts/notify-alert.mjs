#!/usr/bin/env node
/**
 * Envía un aviso operativo por correo (backup, ingestas, systemd).
 *
 * Uso:
 *   node scripts/notify-alert.mjs --title "Backup falló" --message "..."
 */
import { sendEmail } from "../server/notifications/index.js";

const args = process.argv.slice(2);
function option(name, fallback = "") {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const title = option("--title", "Aviso WOLL Atacama");
const message = option("--message", "");
const to = String(process.env.OPS_ALERT_EMAIL || "").trim();

if (!to) {
  console.error("[notify-alert] falta OPS_ALERT_EMAIL");
  process.exit(2);
}

try {
  await sendEmail({
    to,
    template: "alert",
    data: { title, lines: message ? [message] : [] },
  });
  console.log("[notify-alert] enviado");
} catch (err) {
  console.error("[notify-alert] error:", err?.message || err);
  process.exit(1);
}
