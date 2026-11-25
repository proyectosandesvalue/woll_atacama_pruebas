/**
 * Endpoints del panel admin (Sprint 15).
 *
 * Solo lectura salvo login/logout. La autenticación es local: password scrypt
 * (TOTP opcional para flujos sensibles), sesión en cookie HttpOnly firmada y auditoría.
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
  hashIp,
  loginFailureBurst,
  recordAudit,
  recordLoginFailure,
  serializeSessionCookie,
  verifyPassword,
  verifyTotp,
} from "../admin/auth.js";
import {
  checkSendAllowed,
  createChallenge,
  recordSend,
  verifyChallenge,
} from "../admin/challenges.js";
import { sendEmail } from "../notifications/index.js";

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
let lastBurstEmailAt = 0;

export function _resetBurstNotifierForTests() {
  lastBurstEmailAt = 0;
}

async function notifyLoginBurst(ctx, db, username) {
  const now = Date.now();
  if (now - lastBurstEmailAt < 60 * 60_000) return;
  const burst = loginFailureBurst(now);
  if (!burst.burst) return;
  lastBurstEmailAt = now;
  try {
    const rows = await db.query(
      "select email from admin.admin_users where role = 'owner' and email is not null order by created_at limit 1"
    );
    const owner = (Array.isArray(rows) ? rows[0] : rows?.rows?.[0])?.email;
    if (!owner) return;
    await sendEmail({
      to: owner,
      template: "alert",
      data: {
        title: "Intentos de login sospechosos",
        lines: [
          `${burst.count} intentos fallidos en los últimos 15 minutos.`,
          `Último usuario: ${username}.`,
          "Revisa la auditoría del panel y considera bloquear el acceso.",
        ],
      },
      env: ctx.env,
    });
  } catch (err) {
    console.error(
      "[admin] no se pudo enviar la alerta de ráfaga:",
      err?.message || err
    );
  }
}

async function issueSession(ctx, db, user, secret, detail = {}) {
  const session = createSession({ user: user.username, secret });
  try {
    await db.query(
      "UPDATE admin.admin_users SET last_login_at = now() WHERE username = $1",
      [user.username]
    );
  } catch (err) {
    console.error("[admin] no se pudo actualizar last_login_at:", err?.message || err);
  }

  await audit(db, ctx, session, "admin.login", "ok", {
    username: user.username,
    ...detail,
  });

  return json(
    200,
    {
      user: user.username,
      role: user.role === "owner" ? "owner" : "editor",
      expiresAt: new Date(session.expiresAt).toISOString(),
      csrfToken: session.csrf,
    },
    {
      "Set-Cookie": serializeSessionCookie(session.token, cookieOptions(ctx.env)),
    }
  );
}

export async function handleAdminLogin(
  ctx,
  { getDB = defaultGetDB, sendEmailImpl = sendEmail } = {}
) {
  const body = ctx.body || {};
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const totp = String(body.totp || "").trim();
  const totpRequired = /^(1|true|yes)$/i.test(
    String(ctx.env?.ADMIN_TOTP_REQUIRED || "")
  );

  if (
    !username ||
    username.length > MAX_USERNAME ||
    !password ||
    password.length > MAX_PASSWORD
  ) {
    return json(400, { error: "Credenciales incompletas o inválidas." });
  }

  const key = `${ctx.ip || "unknown"}|${username.toLowerCase()}`;
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
      `SELECT username, password_hash, activo, role, email, two_factor
         FROM admin.admin_users
        WHERE username = $1`,
      [username]
    );
    user = rows[0];
  } catch (err) {
    console.error("[admin] error leyendo usuario:", err?.message || err);
    return json(503, { error: "Panel admin no disponible." });
  }

  const passwordOk =
    Boolean(user?.activo) && verifyPassword(password, user.password_hash);
  const mode =
    user?.two_factor === "totp"
      ? "totp"
      : user?.two_factor === "none"
        ? "none"
        : "email";

  let secondFactorOk = true;
  let secondFactorError = null;
  if (passwordOk && mode !== "email" && totpRequired) {
    const totpSecret = ctx.env?.ADMIN_TOTP_SECRET;
    if (!totpSecret) {
      console.error("[admin] falta ADMIN_TOTP_SECRET con ADMIN_TOTP_REQUIRED=1.");
      return json(503, { error: "Panel admin no configurado." });
    }
    try {
      secondFactorOk = verifyTotp(totpSecret, totp);
      if (!secondFactorOk) secondFactorError = "totp";
    } catch (err) {
      console.error("[admin] TOTP inválido en configuración:", err.message);
      return json(503, { error: "Panel admin no configurado." });
    }
  }

  if (!passwordOk || !secondFactorOk) {
    recordLoginFailure(key);
    await audit(db, ctx, null, "admin.login", "fail", {
      username,
      reason: passwordOk ? secondFactorError || "totp" : "password",
    });
    await notifyLoginBurst(ctx, db, username);
    return json(401, { error: "Usuario o contraseña incorrectos." });
  }

  clearLoginFailures(key);

  let secret;
  try {
    secret = getSessionSecret(ctx.env);
  } catch (err) {
    console.error("[admin] configuración de sesión inválida:", err.message);
    return json(503, { error: "Panel admin no configurado." });
  }

  if (mode === "email") {
    const email = String(user.email || "").trim();
    if (!email.includes("@")) {
      console.error(`[admin] usuario ${username} sin correo para 2FA.`);
      await audit(db, ctx, null, "admin.login", "fail", {
        username,
        reason: "missing_email",
      });
      return json(503, { error: "Panel admin no configurado." });
    }

    const sendAllowed = checkSendAllowed(username);
    if (!sendAllowed.allowed) {
      return json(
        429,
        { error: "Espera antes de pedir otro código." },
        { "Retry-After": String(sendAllowed.retryAfter) }
      );
    }

    let challenge;
    try {
      challenge = await createChallenge({
        db,
        username,
        secret,
        ipHash: hashIp(ctx.ip || ""),
      });
    } catch (err) {
      console.error("[admin] no se pudo crear el desafío:", err?.message || err);
      return json(503, { error: "No se pudo iniciar el segundo factor." });
    }

    try {
      await sendEmailImpl({
        to: email,
        template: "login-code",
        data: {
          code: challenge.code,
          minutes: 10,
          ipHint: ctx.country || null,
        },
        env: ctx.env,
      });
    } catch (err) {
      console.error("[admin] no se pudo enviar el código:", err?.message || err);
      await audit(db, ctx, null, "admin.login", "fail", {
        username,
        reason: "email_send",
      });
      return json(503, { error: "No se pudo enviar el código. Reintenta." });
    }

    recordSend(username);
    await audit(db, ctx, null, "admin.login.challenge", "ok", {
      username,
      channel: "email",
    });

    return json(202, {
      two_factor_required: true,
      challenge_id: challenge.id,
      expires_in: challenge.expiresInSeconds,
      channel: "email",
    });
  }

  return issueSession(ctx, db, user, secret);
}

/**
 * POST /api/admin/login/verify
 */
export async function handleAdminLoginVerify(
  ctx,
  { getDB = defaultGetDB } = {}
) {
  const body = ctx.body || {};
  const challengeId = String(body.challenge_id || "").trim();
  const code = String(body.code || "").trim();

  if (
    challengeId.length < 10 ||
    challengeId.length > 64 ||
    !/^\d{6}$/.test(code)
  ) {
    return json(400, { error: "Código inválido." });
  }

  const key = `${ctx.ip || "unknown"}|verify|${challengeId}`;
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

  let secret;
  try {
    secret = getSessionSecret(ctx.env);
  } catch {
    return json(503, { error: "Panel admin no configurado." });
  }

  const result = await verifyChallenge({
    db,
    id: challengeId,
    code,
    secret,
  }).catch((err) => {
    console.error("[admin] error verificando desafío:", err?.message || err);
    return { ok: false, reason: "error" };
  });

  if (!result.ok) {
    recordLoginFailure(key);
    await audit(db, ctx, null, "admin.login.verify", "fail", {
      reason: result.reason,
    });
    return json(401, { error: "Código inválido o expirado." });
  }

  let user;
  try {
    const rows = await db.query(
      "SELECT username, role, activo FROM admin.admin_users WHERE username = $1",
      [result.username]
    );
    user = Array.isArray(rows) ? rows[0] : rows?.rows?.[0];
  } catch {
    return json(503, { error: "Panel admin no disponible." });
  }

  const active = user?.activo === true || user?.activo === "true";
  if (!user || !active) {
    return json(401, { error: "Código inválido o expirado." });
  }

  clearLoginFailures(key);
  return issueSession(ctx, db, user, secret, { method: "email" });
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
export async function handleAdminSession(ctx) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;

  let role = "editor";
  try {
    const db = await ctx.getDB();
    const result = await db.query(
      "select username, role, activo from admin.admin_users where username = $1",
      [auth.session.sub]
    );
    const rows = Array.isArray(result) ? result : result?.rows;
    const user = rows?.[0];
    const active = user?.activo === true || user?.activo === "true";
    if (!user || !active) {
      return json(401, { error: "Sesión inválida o expirada." });
    }
    role = user.role === "owner" ? "owner" : "editor";
  } catch (err) {
    console.error("[admin] no se pudo leer el rol:", err?.message || err);
    return json(503, { error: "No se pudo verificar el permiso." });
  }

  return json(200, {
    user: auth.session.sub,
    role,
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
