/**
 * Base del proxy de servicios externos.
 *
 * En producción se usa la misma origen (`/api/proxy`).
 * En desarrollo local se apunta al proxy persistente de `scripts/dev-proxy.mjs`
 * (puerto 3001) para no ejecutar una Function de Vercel por cada tile.
 */

const isBrowser = typeof window !== "undefined";
const isLocal =
  isBrowser &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
  window.location.port !== "3001";

export const PROXY_BASE = isLocal ? "http://localhost:3001" : "";
export const PROXY_URL = `${PROXY_BASE}/api/proxy`;
