/**
 * Editor de metadatos de procedencia de capas (Sprint 47-E).
 *
 * Actualiza las columnas de `chat.chat_catalog` que alimentan
 * `get_layer_metadata` y las citas del chat. No toca la capa física ni el
 * catálogo de capas; solo la procedencia declarada.
 */

import { getDB as defaultGetDB } from "../db/pool.js";
import { recordAudit } from "../admin/auth.js";
import {
  isPostgres,
  json,
  requireCsrf,
  requireSession,
} from "./admin.js";

const LIMITS = Object.freeze({
  source: 200,
  source_url: 500,
  scale: 120,
  license: 200,
  method: 500,
  coverage: 500,
  limitations: 1000,
});

const SELECT_COLUMNS = `
  layer_id, display_name, dimension, geometry_type,
  source, source_url, data_updated_at, scale, license, method,
  coverage, limitations, updated_at
`;

function text(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function nullableText(value, max) {
  const out = text(value, max);
  return out || null;
}

function normalizeUrl(value) {
  const url = text(value, LIMITS.source_url);
  if (!url) return null;
  if (!/^https:\/\//i.test(url)) {
    throw new Error("source_url debe usar https://.");
  }
  return url;
}

function normalizeDate(value) {
  const raw = text(value, 10);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error("data_updated_at debe tener formato YYYY-MM-DD.");
  }
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    throw new Error("data_updated_at no es una fecha válida.");
  }
  return raw;
}

async function dbOrError(getDB) {
  let db;
  try {
    db = await getDB();
  } catch {
    return { error: json(503, { error: "PostgreSQL no disponible." }) };
  }
  if (!isPostgres(db)) {
    return {
      error: json(503, {
        error: "El editor de metadatos requiere PostgreSQL.",
      }),
    };
  }
  return { db };
}

async function audit(ctx, session, target, detail = {}) {
  let db = null;
  try {
    db = await defaultGetDB();
  } catch {
    return;
  }
  await recordAudit(db, {
    actor: session?.sub || null,
    action: "layer.metadata.update",
    target,
    result: "ok",
    ip: ctx.ip,
    detail,
  });
}

/**
 * GET /api/admin/layer-metadata
 */
export async function handleLayerMetadataGet(
  ctx,
  { getDB = defaultGetDB } = {}
) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  const { db, error } = await dbOrError(getDB);
  if (error) return error;

  try {
    const items = await db.query(
      `SELECT ${SELECT_COLUMNS}
         FROM chat.chat_catalog
        ORDER BY dimension, display_name, layer_id`
    );
    return json(200, { items, editable: true });
  } catch (err) {
    console.error("[admin:layer-metadata] error leyendo:", err?.message || err);
    return json(503, { error: "No se pudieron leer los metadatos." });
  }
}

/**
 * PUT /api/admin/layer-metadata
 */
export async function handleLayerMetadataSave(
  ctx,
  { getDB = defaultGetDB } = {}
) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) {
    return json(403, { error: "Token CSRF inválido." });
  }

  const body = ctx.body || {};
  const layerId = text(body.layer_id, 100);
  if (!layerId) {
    return json(400, { error: "Falta layer_id." });
  }

  let values;
  try {
    values = {
      source: nullableText(body.source, LIMITS.source),
      source_url: normalizeUrl(body.source_url),
      data_updated_at: normalizeDate(body.data_updated_at),
      scale: nullableText(body.scale, LIMITS.scale),
      license: nullableText(body.license, LIMITS.license),
      method: nullableText(body.method, LIMITS.method),
      coverage: nullableText(body.coverage, LIMITS.coverage),
      limitations: nullableText(body.limitations, LIMITS.limitations),
    };
  } catch (err) {
    return json(400, { error: err.message });
  }

  const { db, error } = await dbOrError(getDB);
  if (error) return error;

  try {
    const rows = await db.query(
      `UPDATE chat.chat_catalog
          SET source = $2,
              source_url = $3,
              data_updated_at = $4,
              scale = $5,
              license = $6,
              method = $7,
              coverage = $8,
              limitations = $9,
              updated_at = now()
        WHERE layer_id = $1
        RETURNING ${SELECT_COLUMNS}`,
      [
        layerId,
        values.source,
        values.source_url,
        values.data_updated_at,
        values.scale,
        values.license,
        values.method,
        values.coverage,
        values.limitations,
      ]
    );

    if (!rows || rows.length === 0) {
      return json(404, { error: "La capa no existe en el catálogo." });
    }

    await audit(ctx, auth.session, layerId, {
      fields: Object.keys(values).filter((key) => values[key] !== null),
    });
    return json(200, { item: rows[0] });
  } catch (err) {
    console.error("[admin:layer-metadata] error guardando:", err?.message || err);
    return json(503, { error: "No se pudieron guardar los metadatos." });
  }
}
