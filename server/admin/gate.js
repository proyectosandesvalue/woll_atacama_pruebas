/**
 * Verificación de sesión + rol para `/api/admin/*` (Sprint 26-M).
 *
 * Se ejecuta antes del handler. Consulta el rol en la base en cada request
 * para que desactivar o degradar a un usuario tenga efecto inmediato, sin
 * esperar a que expire su cookie.
 */
import { getSession, getSessionSecret } from "./auth.js";
import { roleAllows } from "./roles.js";

/**
 * @param {{
 *   req: import("node:http").IncomingMessage,
 *   env: NodeJS.ProcessEnv,
 *   getDB: () => Promise<any>,
 *   requiredRole: "owner"|"editor",
 *   logger?: {error?: Function}
 * }} opts
 * @returns {Promise<{user?: {username: string, role: string}, session?: object, status?: number, error?: string}>}
 */
export async function checkAdminAccess({
  req,
  env,
  getDB,
  requiredRole,
  logger = console,
}) {
  let secret;
  try {
    secret = getSessionSecret(env);
  } catch {
    return { status: 503, error: "Panel admin no configurado." };
  }

  const session = getSession(req, secret);
  if (!session) {
    return { status: 401, error: "Sesión inválida o expirada." };
  }

  let db;
  try {
    db = await getDB();
  } catch {
    return { status: 503, error: "Panel admin no disponible." };
  }
  if (!db || typeof db.query !== "function") {
    return { status: 503, error: "Panel admin no disponible." };
  }

  try {
    const { rows } = await db.query(
      "select username, role, activo from admin.admin_users where username = $1",
      [session.sub]
    );
    const user = Array.isArray(rows) ? rows[0] : null;
    const active = user?.activo === true || user?.activo === "true";
    if (!user || !active) {
      return { status: 401, error: "Sesión inválida o expirada." };
    }
    if (!roleAllows(user.role, requiredRole)) {
      return { status: 403, error: "Permiso insuficiente." };
    }
    return {
      user: { username: user.username, role: user.role },
      session,
    };
  } catch (err) {
    logger.error?.(
      "[admin] no se pudo verificar el rol:",
      err?.message || err
    );
    return { status: 503, error: "No se pudo verificar el permiso." };
  }
}
