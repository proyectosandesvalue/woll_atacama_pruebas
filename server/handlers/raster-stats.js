/**
 * Estadísticas zonales de rásteres precalculados (Sprint 49).
 *
 * `GET /api/raster-stats?layer_id=...&version=...&admin_level=comuna`
 *
 * Lee `public.raster_stats`. No calcula nada: el CSV se produce en QGIS y se
 * carga con `raster:publish --stats-csv`. Si se omite `version`, usa la última
 * versión con `computed_at` para esa capa y nivel.
 */

import { getDB as defaultGetDB } from "../db/pool.js";

const LAYER_RE = /^[a-z0-9_-]+$/;
const VERSION_RE = /^[A-Za-z0-9._-]+$/;
const ADMIN_LEVELS = new Set(["comuna", "provincia", "region"]);
const MAX_ROWS = 5000;

/**
 * @param {Record<string, unknown>} query
 * @param {{getDB?: () => Promise<object>}} [opts]
 */
export async function handleRasterStats(query = {}, opts = {}) {
  const { getDB = defaultGetDB } = opts;
  const layerId = query.layer_id ? String(query.layer_id) : "";
  const version = query.version ? String(query.version) : "";
  const adminLevel = query.admin_level ? String(query.admin_level).toLowerCase() : "comuna";

  if (!layerId) {
    return { status: 400, body: { error: "Falta layer_id." } };
  }
  if (!LAYER_RE.test(layerId)) {
    return { status: 400, body: { error: "layer_id inválido." } };
  }
  if (version && !VERSION_RE.test(version)) {
    return { status: 400, body: { error: "version inválida." } };
  }
  if (!ADMIN_LEVELS.has(adminLevel)) {
    return { status: 400, body: { error: "admin_level inválido." } };
  }

  try {
    const db = await getDB();
    let resolvedVersion = version;

    if (!resolvedVersion) {
      const latest = await db.query(
        `SELECT version
           FROM public.raster_stats
          WHERE layer_id = $1 AND admin_level = $2
          ORDER BY computed_at DESC
          LIMIT 1`,
        [layerId, adminLevel]
      );
      resolvedVersion = latest[0]?.version || null;
    }

    if (!resolvedVersion) {
      return {
        status: 200,
        headers: { "Cache-Control": "public, max-age=300" },
        body: {
          ok: true,
          data: { layer_id: layerId, version: null, admin_level: adminLevel, rows: [] },
        },
      };
    }

    const rows = await db.query(
      `SELECT admin_code, admin_name, class_id, class_label, class_min, class_max,
              hectares, mean, min, max, p10, p90, computed_at
         FROM public.raster_stats
        WHERE layer_id = $1 AND version = $2 AND admin_level = $3
        ORDER BY admin_name, class_id
        LIMIT $4`,
      [layerId, resolvedVersion, adminLevel, MAX_ROWS]
    );

    return {
      status: 200,
      headers: { "Cache-Control": "public, max-age=300" },
      body: {
        ok: true,
        data: {
          layer_id: layerId,
          version: resolvedVersion,
          admin_level: adminLevel,
          rows,
        },
      },
    };
  } catch (err) {
    console.error("[raster-stats] Error:", err?.message || err);
    return { status: 500, body: { error: "Error interno" } };
  }
}
