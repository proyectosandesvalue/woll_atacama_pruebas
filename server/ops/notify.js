/**
 * Notificaciones de ops-check con estado y cooldown (Sprint 31-B).
 *
 * - Envía al cambiar de `ok` a `failing`.
 * - Mientras sigue fallando, recuerda cada `cooldownHours`.
 * - Envía un aviso de recuperación al volver a `ok`.
 *
 * El estado vive en `admin.notify_state` para sobrevivir reinicios.
 */

export const DEFAULT_COOLDOWN_HOURS = 6;

/**
 * @param {{
 *   alerts: Array<{check: string, message: string}>,
 *   state: Record<string, {state: string, last_sent_at: string|null}>,
 *   now?: number,
 *   cooldownHours?: number
 * }} opts
 */
export function planNotifications({
  alerts,
  state = {},
  now = Date.now(),
  cooldownHours = DEFAULT_COOLDOWN_HOURS,
}) {
  const active = new Set(alerts.map((a) => a.check));
  const toNotify = [];
  for (const alert of alerts) {
    const previous = state[alert.check];
    const lastSent = previous?.last_sent_at
      ? new Date(previous.last_sent_at).getTime()
      : 0;
    const due =
      !previous ||
      previous.state !== "failing" ||
      now - lastSent >= cooldownHours * 3_600_000;
    if (due) toNotify.push(alert);
  }

  const recovered = Object.entries(state)
    .filter(([key, value]) => value.state === "failing" && !active.has(key))
    .map(([key]) => ({ check: key }));

  return { toNotify, recovered };
}

async function saveState(db, key, state, now) {
  await db.query(
    `INSERT INTO admin.notify_state (key, state, last_sent_at)
     VALUES ($1, $2, to_timestamp($3 / 1000.0))
     ON CONFLICT (key) DO UPDATE
       SET state = EXCLUDED.state,
           last_sent_at = EXCLUDED.last_sent_at,
           updated_at = now()`,
    [key, state, now]
  );
}

/**
 * @param {{
 *   db: {query: Function},
 *   alerts: Array<{check: string, message: string}>,
 *   sendEmail: Function,
 *   env?: NodeJS.ProcessEnv,
 *   now?: number,
 *   cooldownHours?: number
 * }} opts
 */
export async function notifyOpsAlerts({
  db,
  alerts,
  sendEmail,
  env = process.env,
  now = Date.now(),
  cooldownHours = DEFAULT_COOLDOWN_HOURS,
}) {
  const recipient = String(env.OPS_ALERT_EMAIL || "").trim();
  if (!recipient) return { skipped: true, sent: 0 };

  const result = await db.query(
    "select key, state, last_sent_at from admin.notify_state"
  );
  const rows = Array.isArray(result) ? result : result?.rows || [];
  const state = Object.fromEntries(
    rows.map((row) => [
      row.key,
      { state: row.state, last_sent_at: row.last_sent_at },
    ])
  );

  const { toNotify, recovered } = planNotifications({
    alerts,
    state,
    now,
    cooldownHours,
  });

  if (toNotify.length > 0) {
    await sendEmail({
      to: recipient,
      template: "alert",
      data: {
        title: `ops-check: ${toNotify.length} alerta(s)`,
        lines: toNotify.map((a) => `${a.check}: ${a.message}`),
      },
      env,
    });
    for (const alert of toNotify) {
      await saveState(db, alert.check, "failing", now);
    }
  }

  if (recovered.length > 0) {
    await sendEmail({
      to: recipient,
      template: "status",
      data: {
        title: "ops-check: servicios recuperados",
        message: recovered.map((r) => r.check).join(", "),
      },
      env,
    });
    for (const item of recovered) {
      await saveState(db, item.check, "ok", now);
    }
  }

  return {
    skipped: false,
    sent: toNotify.length + (recovered.length > 0 ? 1 : 0),
    alerts: toNotify.length,
    recovered: recovered.length,
  };
}
