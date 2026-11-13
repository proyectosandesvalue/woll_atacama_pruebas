/**
 * Endpoints del panel admin (Sprint 15).
 *
 * Solo lectura salvo login/logout. La autenticación es local: password scrypt
 * + TOTP, sesión en cookie HttpOnly firmada y auditoría en `admin.audit_log`.
 *
 * El panel requiere PostgreSQL (DB_DRIVER=postgres); en la demo Supabase no
 * se expone.
 */

import { getDB as defaultGetDB } from "../db/pool.js";
import {
  checkLoginAllowed,
  clearLoginFailures,
  clearSessionCookie,
  createSession,
  getSession,
  getSessionSecret,
  recordAudit,
  recordLoginFailure,
  serializeSessionCookie,
  verifyPassword,
  verifyTotp,
} from "../admin/auth.js";

const MAX_USERNAME = 80;
const MAX_PASSWORD = 256;
const MAX_TOTP = 12;

function baseHeaders() {
  return {
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
  };
}

export function json(status, body, headers = {}) {
  return { status, body, headers: { ...baseHeaders(), ...headers } };
}

export function isPostgres(db) {
  return Boolean(db && db.pool && typeof db.pool.query === "function");
}

function cookieOptions(env) {
  return {
    secure:
      env?.NODE_ENV === "production" || String(env?.COOKIE_SECURE) === "1",
  };
}

/**
 * @param {object} ctx
 * @returns {{session: object, secret: string}|{error: object}}
 */
export function requireSession(ctx) {
  let secret;
  try {
    secret = getSessionSecret(ctx.env);
  } catch (err) {
    console.error("[admin] configuración de sesión inválida:", err.message);
    return { error: json(503, { error: "Panel admin no configurado." }) };
  }

  const session = getSession(ctx.req, secret);
  if (!session) {
    return { error: json(401, { error: "Sesión inválida o expirada." }) };
  }
  return { session, secret };
}

export function requireCsrf(ctx, session) {
  const header = ctx.req?.headers?.["x-csrf-token"];
  return typeof header === "string" && header === session.csrf;
}

function auditContext(ctx, session, action, result, detail = {}) {
  return {
    actor: session?.sub || detail.username || null,
    action,
    target: detail.target || null,
    result,
    ip: ctx.ip,
    detail,
  };
}

async function audit(db, ctx, session, action, result, detail) {
  if (!db) return;
  await recordAudit(db, auditContext(ctx, session, action, result, detail));
}

/**
 * POST /api/admin/login
 */
export async function handleAdminLogin(ctx, { getDB = defaultGetDB } = {}) {
  const body = ctx.body || {};
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const totp = String(body.totp || "").trim();

  if (
    !username ||
    username.length > MAX_USERNAME ||
    !password ||
    password.length > MAX_PASSWORD ||
    !totp ||
    totp.length > MAX_TOTP
  ) {
    return json(400, { error: "Credenciales incompletas o inválidas." });
  }

  const key = `${ctx.ip || "unknown"}|${username.toLowerCase()}`;
  const allowed = checkLoginAllowed(key);
  if (!allowed.allowed) {
    return json(
      429,
      { error: "Demasiados intentos. Esperá unos minutos." },
      { "Retry-After": String(allowed.retryAfter) }
    );
  }

  let db;
  try {
    db = await getDB();
  } catch (err) {
    console.error("[admin] no se pudo conectar a la base:", err?.message || err);
    return json(503, { error: "Panel admin no disponible." });
  }

  if (!isPostgres(db)) {
    return json(503, { error: "El panel admin requiere PostgreSQL." });
  }

  let user;
  try {
    const rows = await db.query(
      `SELECT username, password_hash, activo
         FROM admin.admin_users
        WHERE username = $1`,
      [username]
    );
    user = rows[0];
  } catch (err) {
    console.error("[admin] error leyendo usuario:", err?.message || err);
    return json(503, { error: "Panel admin no disponible." });
  }

  const passwordOk = Boolean(user?.activo) && verifyPassword(password, user.password_hash);
  let totpOk = false;
  if (passwordOk) {
    const totpSecret = ctx.env?.ADMIN_TOTP_SECRET;
    if (!totpSecret) {
      console.error("[admin] falta ADMIN_TOTP_SECRET.");
      return json(503, { error: "Panel admin no configurado." });
    }
    try {
      totpOk = verifyTotp(totpSecret, totp);
    } catch (err) {
      console.error("[admin] TOTP inválido en configuración:", err.message);
      return json(503, { error: "Panel admin no configurado." });
    }
  }

  if (!passwordOk || !totpOk) {
    recordLoginFailure(key);
    await audit(db, ctx, null, "admin.login", "fail", {
      username,
      reason: passwordOk ? "totp" : "password",
    });
    return json(401, { error: "Usuario, password o TOTP incorrectos." });
  }

  clearLoginFailures(key);

  let session;
  try {
    const secret = getSessionSecret(ctx.env);
    session = createSession({ user: user.username, secret });
  } catch (err) {
    console.error("[admin] configuración de sesión inválida:", err.message);
    return json(503, { error: "Panel admin no configurado." });
  }

  try {
    await db.query(
      "UPDATE admin.admin_users SET last_login_at = now() WHERE username = $1",
      [user.username]
    );
  } catch (err) {
    console.error("[admin] no se pudo actualizar last_login_at:", err?.message || err);
  }

  await audit(db, ctx, session, "admin.login", "ok", { username: user.username });

  return json(
    200,
    {
      user: user.username,
      expiresAt: new Date(session.expiresAt).toISOString(),
      csrfToken: session.csrf,
    },
    {
      "Set-Cookie": serializeSessionCookie(session.token, cookieOptions(ctx.env)),
    }
  );
}

/**
 * POST /api/admin/logout
 */
export async function handleAdminLogout(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) {
    return json(403, { error: "Token CSRF inválido." });
  }

  let db = null;
  try {
    db = await getDB();
  } catch {
    // El logout debe funcionar aunque la BD no responda.
  }
  await audit(db, ctx, auth.session, "admin.logout", "ok", {});

  return json(
    200,
    { ok: true },
    { "Set-Cookie": clearSessionCookie(cookieOptions(ctx.env)) }
  );
}

/**
 * GET /api/admin/session
 */
export function handleAdminSession(ctx) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  return json(200, {
    user: auth.session.sub,
    expiresAt: new Date(auth.session.exp * 1000).toISOString(),
    csrfToken: auth.session.csrf,
  });
}

/**
 * GET /api/admin/config
 */
export async function handleAdminConfig(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;

  try {
    const db = await getDB();
    const [snapshot, layers] = await Promise.all([
      db.rpc("chat_get_config_snapshot"),
      db.rpc("chat_list_config_layers"),
    ]);
    if (!snapshot) {
      return json(503, { error: "No hay snapshot de configuración activo." });
    }
    return json(200, { snapshot, layers: layers || [] });
  } catch (err) {
    console.error("[admin] error leyendo configuración:", err?.message || err);
    return json(503, { error: "No se pudo leer la configuración." });
  }
}

async function queryAdminTable(ctx, { getDB }, sql, params = []) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;

  try {
    const db = await getDB();
    if (!isPostgres(db)) {
      return json(503, { error: "El panel admin requiere PostgreSQL." });
    }
    const rows = await db.query(sql, params);
    return json(200, { items: rows });
  } catch (err) {
    console.error("[admin] error de lectura:", err?.message || err);
    return json(503, { error: "No se pudo leer la información." });
  }
}

/**
 * GET /api/admin/prompts
 */
export function handleAdminPrompts(ctx, opts = {}) {
  return queryAdminTable(
    ctx,
    opts,
    `SELECT id, version, content, description, activo, created_at, updated_at, updated_by
       FROM admin.prompt_templates
      ORDER BY id, version DESC`
  );
}

/**
 * GET /api/admin/settings
 */
export function handleAdminSettings(ctx, opts = {}) {
  return queryAdminTable(
    ctx,
    opts,
    `SELECT key, value, type, description, editable, updated_at, updated_by
       FROM admin.settings
      ORDER BY key`
  );
}

/**
 * GET /api/admin/messages
 */
export function handleAdminMessages(ctx, opts = {}) {
  return queryAdminTable(
    ctx,
    opts,
    `SELECT key, content, description, updated_at, updated_by
       FROM admin.messages
      ORDER BY key`
  );
}

/**
 * GET /api/admin/unavailable
 */
export function handleAdminUnavailable(ctx, opts = {}) {
  return queryAdminTable(
    ctx,
    opts,
    `SELECT id, descripcion, palabras, capas_relacionadas, existe, motivo,
            activo, verificado_en, source, updated_at, updated_by
       FROM admin.unavailable_data
      ORDER BY id`
  );
}

/**
 * GET /api/admin/audit?limit=50
 */
export async function handleAdminAudit(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;

  const requested = Number.parseInt(ctx.query?.limit, 10);
  const limit = Number.isInteger(requested)
    ? Math.min(Math.max(requested, 1), 200)
    : 50;

  try {
    const db = await getDB();
    if (!isPostgres(db)) {
      return json(503, { error: "El panel admin requiere PostgreSQL." });
    }
    const rows = await db.query(
      `SELECT id, at, actor, action, target, result, ip_hash, detail
         FROM admin.audit_log
        ORDER BY at DESC, id DESC
        LIMIT $1`,
      [limit]
    );
    return json(200, { items: rows });
  } catch (err) {
    console.error("[admin] error leyendo auditoría:", err?.message || err);
    return json(503, { error: "No se pudo leer la auditoría." });
  }
}
