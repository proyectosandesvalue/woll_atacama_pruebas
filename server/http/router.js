/**
 * Router mínimo por método + path exacto.
 *
 * No hay parámetros de ruta: los 10 endpoints actuales usan query string.
 * `OPTIONS` se resuelve contra cualquier ruta existente para el preflight.
 */

/**
 * @param {Array<{method:string,path:string}>} routes
 * @param {string|undefined} method
 * @param {string} pathname
 * @returns {{route: object|null, methodAllowed: boolean, pathExists: boolean}}
 */
export function matchRoute(routes, method, pathname) {
  const candidates = routes.filter((route) => route.path === pathname);

  if (candidates.length === 0) {
    return { route: null, methodAllowed: false, pathExists: false };
  }

  if (method === "OPTIONS") {
    return { route: candidates[0], methodAllowed: true, pathExists: true };
  }

  const route = candidates.find((candidate) => candidate.method === method);
  return {
    route: route || candidates[0],
    methodAllowed: Boolean(route),
    pathExists: true,
  };
}
