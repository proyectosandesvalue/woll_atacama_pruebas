/**
 * Roles del panel admin (Sprint 26-M).
 *
 * El servidor es la fuente de verdad: `createApp` consulta el rol en la base
 * para cada request de `/api/admin/*`. La UI solo oculta secciones.
 *
 * Regla por defecto: **owner**. Un endpoint nuevo sin clasificar queda
 * cerrado al editor hasta que se le asigne explícitamente.
 */

const PUBLIC_ADMIN_PATHS = new Set([
  "/api/admin/login",
  "/api/admin/login/verify",
  "/api/admin/logout",
  "/api/admin/session",
]);

const OWNER_PREFIXES = [
  "/api/admin/apis",
  "/api/admin/audit",
  "/api/admin/chat",
  "/api/admin/prompts",
  "/api/admin/settings",
  "/api/admin/messages",
  "/api/admin/unavailable",
  "/api/admin/golden",
  "/api/admin/users",
];

const EDITOR_PREFIXES = [
  "/api/admin/layers",
  "/api/admin/rag",
  "/api/admin/taxonomy",
  "/api/admin/unanswered",
  "/api/admin/config",
];

const OWNER_EXACT = new Set(["/api/admin/taxonomy/publish"]);

/**
 * Rol mínimo requerido para una ruta del panel.
 *
 * @param {string|undefined} method
 * @param {string} pathname
 * @returns {"owner"|"editor"|null} null = login/logout/sesión
 */
export function requiredAdminRole(method, pathname) {
  if (typeof pathname !== "string" || !pathname.startsWith("/api/admin/")) {
    return null;
  }
  if (PUBLIC_ADMIN_PATHS.has(pathname)) return null;
  if (OWNER_EXACT.has(pathname)) return "owner";

  const matches = (prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`);

  for (const prefix of OWNER_PREFIXES) {
    if (matches(prefix)) return "owner";
  }
  for (const prefix of EDITOR_PREFIXES) {
    if (matches(prefix)) return "editor";
  }
  return "owner";
}

/**
 * Indica si un rol cumple el mínimo requerido.
 *
 * @param {string|undefined} role
 * @param {"owner"|"editor"} required
 * @returns {boolean}
 */
export function roleAllows(role, required) {
  if (required === "editor") return role === "owner" || role === "editor";
  return role === "owner";
}
