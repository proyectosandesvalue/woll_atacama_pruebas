/**
 * Recuperación de contraseña del panel (Sprint 26-M).
 *
 * Flujo:
 *   1. El usuario pide el enlace con su correo.
 *   2. Se envía un enlace de un solo uso (30 min) si la cuenta existe.
 *   3. El usuario define una contraseña nueva y se revocan sus dispositivos.
 *
 * Las respuestas del paso 1 son siempre genéricas para no enumerar cuentas.
 */
import { getDB as defaultGetDB } from "../db/pool.js";
import {
  checkLoginAllowed,
  clearLoginFailures,
  hashIp,
  hashPassword,
  recordAudit,
  recordLoginFailure,
} from "../admin/auth.js";
import {
  checkResetRequestAllowed,
  createResetToken,
  markResetUsed,
  recordResetRequest,
  RESET_TTL_SECONDS,
  verifyResetToken,
} from "../admin/password-reset.js";
import { revokeUserDevices } from "../admin/devices.js";
import { sendEmail } from "../notifications/index.js";
import { isPostgres, json } from "./admin.js";

const MAX_EMAIL = 160;

function baseUrl(env) {
  const explicit = String(env?.PUBLIC_BASE_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const domain = String(env?.DOMAIN || "").trim();
  if (domain) return `https://${domain}`;
  return "http://localhost:3000";
}

/**
 * POST /api/admin/password/forgot
 */
export async function handlePasswordForgot(
  ctx,
  { getDB = defaultGetDB, sendEmailImpl = sendEmail } = {}
) {
  const email = String(ctx.body?.email || "").trim().toLowerCase();
  const generic = json(202, { ok: true });

  if (!email || email.length > MAX_EMAIL || !email.includes("@")) {
    return generic;
  }

  const key = `${ctx.ip || "unknown"}|${email}`;
  const allowed = checkResetRequestAllowed(key);
  if (!allowed.allowed) return generic;
  recordResetRequest(key);

  let db;
  try {
    db = await getDB();
  } catch {
    return generic;
  }
  if (!isPostgres(db)) return generic;

  let user;
  try {
    const rows = await db.query(
      `SELECT username, email, activo
         FROM admin.admin_users
        WHERE lower(username) = $1 OR lower(email) = $1
        LIMIT 1`,
      [email]
    );
    user = Array.isArray(rows) ? rows[0] : rows?.rows?.[0];
  } catch {
    return generic;
  }

  const active = user?.activo === true || user?.activo === "true";
  if (!user || !active || !String(user.email || "").includes("@")) {
    return generic;
  }

  try {
    const reset = await createResetToken({
      db,
      username: user.username,
      secret: ctx.env?.ADMIN_SESSION_SECRET,
      ipHash: hashIp(ctx.ip || ""),
    });
    const link = `${baseUrl(ctx.env)}/admin.html?reset=${encodeURIComponent(reset.value)}`;
    await sendEmailImpl({
      to: user.email,
      template: "password-reset",
      data: { link, minutes: Math.round(RESET_TTL_SECONDS / 60) },
      env: ctx.env,
    });
    await recordAudit(db, {
      actor: user.username,
      action: "admin.password.reset.request",
      result: "ok",
      ip: ctx.ip,
    });
  } catch (err) {
    console.error(
      "[admin] no se pudo enviar el enlace de recuperación:",
      err?.message || err
    );
  }

  return generic;
}

/**
 * POST /api/admin/password/reset
 */
export async function handlePasswordReset(ctx, { getDB = defaultGetDB } = {}) {
  const token = String(ctx.body?.token || "");
  const password = String(ctx.body?.password || "");

  if (!token || token.length > 200 || password.length < 8 || password.length > 256) {
    return json(400, {
      error: "La contraseña debe tener al menos 8 caracteres.",
    });
  }

  const key = `${ctx.ip || "unknown"}|password-reset`;
  const allowed = checkLoginAllowed(key);
  if (!allowed.allowed) {
    return json(
      429,
      { error: "Demasiados intentos. Espera unos minutos." },
      { "Retry-After": String(allowed.retryAfter) }
    );
  }

  let db;
  try {
    db = await getDB();
  } catch {
    return json(503, { error: "Panel admin no disponible." });
  }
  if (!isPostgres(db)) {
    return json(503, { error: "El panel admin requiere PostgreSQL." });
  }

  const result = await verifyResetToken({
    db,
    value: token,
    secret: ctx.env?.ADMIN_SESSION_SECRET,
  }).catch(() => ({ ok: false, reason: "error" }));

  if (!result.ok) {
    recordLoginFailure(key);
    return json(400, { error: "El enlace es inválido o expiró." });
  }

  let user;
  try {
    const rows = await db.query(
      "SELECT username, email, activo FROM admin.admin_users WHERE username = $1",
      [result.username]
    );
    user = Array.isArray(rows) ? rows[0] : rows?.rows?.[0];
  } catch {
    return json(503, { error: "Panel admin no disponible." });
  }
  const active = user?.activo === true || user?.activo === "true";
  if (!user || !active) {
    return json(400, { error: "El enlace es inválido o expiró." });
  }

  try {
    const passwordHash = hashPassword(password);
    await db.query(
      `UPDATE admin.admin_users
          SET password_hash = $2, updated_by = 'reset'
        WHERE username = $1 AND activo = true`,
      [user.username, passwordHash]
    );
    await markResetUsed(db, result.id);
    await db.query(
      "UPDATE admin.password_resets SET used_at = now() WHERE username = $1 AND used_at IS NULL",
      [user.username]
    );
    await revokeUserDevices(db, user.username).catch(() => {});
  } catch (err) {
    console.error("[admin] error restableciendo contraseña:", err?.message || err);
    return json(503, { error: "No se pudo restablecer la contraseña." });
  }

  clearLoginFailures(key);

  await recordAudit(db, {
    actor: user.username,
    action: "admin.password.reset",
    result: "ok",
    ip: ctx.ip,
  });

  if (String(user.email || "").includes("@")) {
    try {
      await sendEmail({
        to: user.email,
        template: "status",
        data: {
          title: "Contraseña restablecida",
          message:
            "Tu contraseña fue restablecida. Si no fuiste tú, avisa al owner y revisa el acceso al correo.",
        },
        env: ctx.env,
      });
    } catch (err) {
      console.error("[admin] no se pudo avisar el cambio:", err?.message || err);
    }
  }

  return json(200, { ok: true });
}
