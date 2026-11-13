/**
 * Tiles MVT on-demand desde PostGIS (Sprint 08-A.5 / 08-B dinámico).
 *
 * `GET /api/layer-tiles?layer_id=...&z=&x=&y=`
 *
 * Solo para capas dinámicas o filtros que cambian la geometría. Las capas
 * estáticas siguen usando tiles pregenerados. Nginx cachea por URL (incluye
 * z/x/y y, a futuro, filter) con TTL corto.
 */

import { getDB as defaultGetDB } from "../db/pool.js";
import {
  pickOrderColumn,
  quoteIdent,
  resolveLayer,
} from "./layer-export.js";

const LAYER_RE = /^[\p{L}\p{N}_-]+$/u;
const MAX_ZOOM = 18;

function parseTileInteger(value, fallback = null) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

/**
 * @param {Record<string, unknown>} query
 * @param {{getDB?: () => Promise<object>}} [opts]
 */
export async function handleLayerTiles(query = {}, opts = {}) {
  const { getDB = defaultGetDB } = opts;
  const layerId = query.layer_id ? String(query.layer_id) : "";
  const z = parseTileInteger(query.z);
  const x = parseTileInteger(query.x);
  const y = parseTileInteger(query.y);

  if (!layerId || !LAYER_RE.test(layerId)) {
    return { status: 400, body: { error: "layer_id inválido o faltante." } };
  }
  if (z === null || z < 0 || z > MAX_ZOOM || x === null || y === null) {
    return { status: 400, body: { error: "z/x/y inválidos." } };
  }
  const maxIndex = 2 ** z - 1;
  if (x < 0 || x > maxIndex || y < 0 || y > maxIndex) {
    return { status: 400, body: { error: "z/x/y fuera de rango." } };
  }

  try {
    const db = await getDB();
    const meta = await resolveLayer(db, layerId);
    const featureId = pickOrderColumn(meta.columns);
    const properties = meta.columns
      .map((column) => `t.${quoteIdent(column)}`)
      .join(", ");
    const table = `${quoteIdent(meta.schema)}.${quoteIdent(meta.table)}`;
    const featureIdArg = featureId
      ? `, '${String(featureId).replace(/'/g, "''")}'`
      : "";

    const sql = `
      WITH bounds AS (
        SELECT ST_TileEnvelope($1::int, $2::int, $3::int) AS geom
      ), mvtgeom AS (
        SELECT ST_AsMVTGeom(
                 ST_Transform(t.${quoteIdent(meta.geomColumn)}, 3857),
                 b.geom,
                 4096,
                 256,
                 true
               ) AS geom${properties ? `, ${properties}` : ""}
          FROM ${table} t, bounds b
         WHERE ST_Intersects(
                 t.${quoteIdent(meta.geomColumn)},
                 ST_Transform(b.geom, 4326)
               )
      )
      SELECT ST_AsMVT(mvtgeom.*, $4::text, 4096, 'geom'${featureIdArg}) AS tile
        FROM mvtgeom
       WHERE ST_IsEmpty(geom) = false`;

    const rows = await db.query(sql, [z, x, y, layerId]);
    const tile = rows[0]?.tile;

    if (!tile || tile.length === 0) {
      return { status: 204 };
    }

    return {
      status: 200,
      body: tile,
      headers: {
        "Content-Type": "application/vnd.mapbox-vector-tile",
        "Cache-Control": "public, max-age=60",
      },
    };
  } catch (err) {
    const status = err?.status || 500;
    if (status >= 500) console.error("[layer-tiles] Error:", err?.message || err);
    return { status, body: { error: status >= 500 ? "Error interno" : err.message } };
  }
}
