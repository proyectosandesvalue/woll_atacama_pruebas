/**
 * Configuración del visor desde `admin.config_snapshots`.
 *
 * `GET /api/config` devuelve el snapshot activo. Es público y cacheable;
 * el frontend cae a `allTemasConfig` si la API falla (INV-5).
 *
 * Sprint 14 (docs/specs/14-15-panel-admin.md).
 */

import { getDB as defaultGetDB } from "../db/pool.js";

const DEFAULT_MAX_AGE = 300;

function cacheSeconds(env = process.env) {
  const value = Number.parseInt(env.CONFIG_API_MAX_AGE, 10);
  if (!Number.isInteger(value) || value < 0) return DEFAULT_MAX_AGE;
  return Math.min(value, 3600);
}

/**
 * @param {{
 *   req: import("node:http").IncomingMessage,
 *   env?: NodeJS.ProcessEnv
 * }} ctx
 * @param {{ getDB?: () => Promise<object> }} [opts]
 */
export async function handleConfig(ctx, { getDB = defaultGetDB } = {}) {
  const headers = {
    "Cache-Control": `public, max-age=${cacheSeconds(ctx.env)}`,
    Vary: "Accept-Encoding",
  };

  let snapshot;
  try {
    const db = await getDB();
    snapshot = await db.rpc("chat_get_config_snapshot");
  } catch (err) {
    console.error("[config] no se pudo leer el snapshot:", err?.message || err);
    return {
      status: 503,
      body: { error: "Configuración no disponible." },
      headers: { ...headers, "Cache-Control": "no-store", "Retry-After": "30" },
    };
  }

  if (!snapshot || !snapshot.config || !snapshot.checksum) {
    return {
      status: 503,
      body: { error: "No hay snapshot de configuración activo." },
      headers: { ...headers, "Cache-Control": "no-store", "Retry-After": "30" },
    };
  }

  const etag = `"${snapshot.checksum}"`;
  const ifNoneMatch = String(ctx.req?.headers?.["if-none-match"] || "");
  if (ifNoneMatch.split(",").map((tag) => tag.trim()).includes(etag)) {
    return { status: 304, headers: { ...headers, ETag: etag } };
  }

  return {
    status: 200,
    body: snapshot,
    headers: { ...headers, ETag: etag },
  };
}
