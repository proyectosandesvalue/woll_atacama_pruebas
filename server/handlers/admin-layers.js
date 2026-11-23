/**
 * Gestor de capas geográficas (Sprint 47).
 *
 * CRUD de metadatos, upload de GeoJSON y cola de importación. La carga real a
 * PostGIS y la generación de tiles corren en `scripts/layer-worker.mjs`.
 */

import { getDB as defaultGetDB } from "../db/pool.js";
import { recordAudit } from "../admin/auth.js";
import {
  deleteLayerZip,
  layerFileInfo,
  layerFileRelative,
  layerTileVersion,
  layerZipInfo,
  saveGeoJsonStream,
  saveZipStream,
  validateLayerKey,
  MAX_GEOJSON_BYTES,
  MAX_SHAPEFILE_BYTES,
} from "../admin/layer-files.js";
import {
  isPostgres,
  json,
  requireCsrf,
  requireSession,
} from "./admin.js";

const TYPES = new Set(["point", "line", "polygon", "heatmap", "wms"]);
const SOURCE_TYPES = new Set(["geojson", "postgis", "shapefile", "wms"]);
const MAX_CONFIG_BYTES = 200_000;

function parseId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function text(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeConfig(input) {
  if (input === undefined || input === null || input === "") return null;
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      throw new Error("La configuración debe ser JSON válido.");
    }
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("La configuración debe ser un objeto JSON.");
  }
  if (JSON.stringify(input).length > MAX_CONFIG_BYTES) {
    throw new Error("La configuración supera el límite de 200 KB.");
  }
  return input;
}

async function dbOrError(getDB) {
  let db;
  try {
    db = await getDB();
  } catch {
    return { error: json(503, { error: "PostgreSQL no disponible." }) };
  }
  if (!isPostgres(db)) {
    return { error: json(503, { error: "El gestor de capas requiere PostgreSQL." }) };
  }
  return { db };
}

async function audit(ctx, session, action, target, result, detail = {}) {
  let db = null;
  try {
    db = await defaultGetDB();
  } catch {
    return;
  }
  await recordAudit(db, {
    actor: session?.sub || null,
    action,
    target,
    result,
    ip: ctx.ip,
    detail,
  });
}

/**
 * GET /api/admin/layers
 */
export async function handleLayersGet(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  const { db, error } = await dbOrError(getDB);
  if (error) return error;

  try {
    const layers = await db.query(
      `SELECT id, layer_key, nombre, tipo, source_type, has_tiles, config,
              activo, created_at, updated_at
         FROM admin.layers
        ORDER BY nombre, layer_key`
    );
    const placements = await db.query(
      `SELECT p.id, p.layer_id, p.dimension_id, p.group_id, p.subgroup_id,
              p.scope, p.orden, d.key AS dimension_key,
              g.key AS group_key, s.key AS subgroup_key
         FROM admin.layer_placements p
         JOIN admin.dimensions d ON d.id = p.dimension_id
         LEFT JOIN admin.groups g ON g.id = p.group_id
         LEFT JOIN admin.subgroups s ON s.id = p.subgroup_id
        ORDER BY p.dimension_id, p.scope, p.orden`
    );
    const jobs = await db.query(
      `SELECT id, action, layer_key, status, payload, result,
              error_code, error_message, requested_by,
              created_at, started_at, finished_at, heartbeat_at
         FROM admin.layer_jobs
        ORDER BY id DESC
        LIMIT 25`
    );
    const workers = await db.query(
      "SELECT worker, last_seen_at, details FROM admin.worker_heartbeats WHERE worker = 'layer-worker'"
    );
    const dimensions = await db.query(
      "SELECT id, key, nombre FROM admin.dimensions WHERE activo ORDER BY orden, key"
    );

    const withFiles = await Promise.all(
      layers.map(async (layer) => ({
        ...layer,
        file: await layerFileInfo(layer.layer_key).catch(() => ({
          exists: false,
          bytes: 0,
          modified_at: null,
          file: null,
        })),
        upload: await layerZipInfo(layer.layer_key).catch(() => ({
          exists: false,
          bytes: 0,
          modified_at: null,
          file: null,
        })),
      }))
    );

    return json(200, {
      layers: withFiles,
      placements,
      jobs,
      dimensions,
      worker: workers[0] || null,
      limits: {
        maxGeoJsonBytes: MAX_GEOJSON_BYTES,
        maxShapefileBytes: MAX_SHAPEFILE_BYTES,
      },
    });
  } catch (err) {
    console.error("[admin:layers] error leyendo:", err?.message || err);
    return json(503, { error: "No se pudieron leer las capas." });
  }
}

function validateLayer(body, { insert }) {
  const key = text(body.key || body.layer_key, 60).toLowerCase();
  if (insert) {
    try {
      validateLayerKey(key);
    } catch (err) {
      return { error: err.message };
    }
  }
  const nombre = text(body.nombre, 200);
  if (!nombre) return { error: "El nombre es obligatorio." };
  const tipo = text(body.tipo, 20) || "polygon";
  if (!TYPES.has(tipo)) return { error: "Tipo de capa inválido." };
  const sourceType = text(body.source_type, 20) || "geojson";
  if (!SOURCE_TYPES.has(sourceType)) return { error: "Fuente inválida." };
  let config;
  try {
    config = normalizeConfig(body.config);
  } catch (err) {
    return { error: err.message };
  }
  return {
    value: {
      key,
      nombre,
      tipo,
      source_type: sourceType,
      has_tiles: body.has_tiles === true,
      activo: body.activo !== false,
      config: config || {},
    },
  };
}

/**
 * POST/PUT /api/admin/layers
 */
export async function handleLayerSave(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });

  const insert = ctx.req.method === "POST";
  const validated = validateLayer(ctx.body || {}, { insert });
  if (validated.error) return json(400, { error: validated.error });
  const value = validated.value;

  const { db, error } = await dbOrError(getDB);
  if (error) return error;

  try {
    if (insert) {
      const config = {
        ...value.config,
        url: value.config.url || layerFileRelative(value.key),
        type: value.config.type || value.tipo,
        nombrePersonalizado: value.config.nombrePersonalizado || value.nombre,
      };
      const rows = await db.query(
        `INSERT INTO admin.layers
           (layer_key, nombre, tipo, source_type, has_tiles, config, activo, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
         RETURNING id, layer_key, nombre, tipo, source_type, has_tiles, config, activo`,
        [
          value.key,
          value.nombre,
          value.tipo,
          value.source_type,
          value.has_tiles,
          JSON.stringify(config),
          value.activo,
          auth.session.sub,
        ]
      );
      await audit(ctx, auth.session, "layer.create", value.key, "ok");
      return json(201, { item: rows[0] });
    }

    const id = parseId(ctx.body?.id);
    if (!id) return json(400, { error: "Falta el id de la capa." });
    const rows = await db.query(
      `UPDATE admin.layers
          SET nombre = $2, tipo = $3, source_type = $4, has_tiles = $5,
              config = $6::jsonb, activo = $7, updated_by = $8
        WHERE id = $1
        RETURNING id, layer_key, nombre, tipo, source_type, has_tiles, config, activo`,
      [
        id,
        value.nombre,
        value.tipo,
        value.source_type,
        value.has_tiles,
        JSON.stringify(value.config),
        value.activo,
        auth.session.sub,
      ]
    );
    if (rows.length === 0) return json(404, { error: "Capa no encontrada." });
    await audit(ctx, auth.session, "layer.update", rows[0].layer_key, "ok");
    return json(200, { item: rows[0] });
  } catch (err) {
    if (err?.code === "23505") return json(409, { error: "La clave de capa ya existe." });
    console.error("[admin:layers] error guardando:", err?.message || err);
    return json(503, { error: "No se pudo guardar la capa." });
  }
}

/**
 * DELETE /api/admin/layers?id= (archiva; no borra la tabla PostGIS)
 */
export async function handleLayerArchive(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });
  const id = parseId(ctx.query?.id);
  if (!id) return json(400, { error: "Falta el id." });
  const { db, error } = await dbOrError(getDB);
  if (error) return error;

  try {
    const rows = await db.query(
      "UPDATE admin.layers SET activo = false, updated_by = $2 WHERE id = $1 RETURNING layer_key",
      [id, auth.session.sub]
    );
    if (rows.length === 0) return json(404, { error: "Capa no encontrada." });
    await audit(ctx, auth.session, "layer.archive", rows[0].layer_key, "ok");
    return json(200, { ok: true, layer_key: rows[0].layer_key });
  } catch (err) {
    console.error("[admin:layers] error archivando:", err?.message || err);
    return json(503, { error: "No se pudo archivar la capa." });
  }
}

/**
 * POST /api/admin/layers/upload?key=
 */
export async function handleLayerUpload(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });

  const key = String(ctx.query?.key || "").toLowerCase();
  try {
    validateLayerKey(key);
  } catch (err) {
    return json(400, { error: err.message });
  }

  const contentType = String(ctx.req?.headers?.["content-type"] || "").toLowerCase();
  const isZip =
    contentType.includes("application/zip") ||
    contentType.includes("application/x-zip-compressed");

  if (
    !isZip &&
    contentType &&
    !contentType.includes("application/geo+json") &&
    !contentType.includes("application/json")
  ) {
    return json(415, { error: "El upload debe ser GeoJSON o un ZIP de Shapefile." });
  }

  const declared = Number(ctx.req?.headers?.["content-length"] || 0);
  const maxBytes = isZip ? MAX_SHAPEFILE_BYTES : MAX_GEOJSON_BYTES;
  if (Number.isFinite(declared) && declared > maxBytes) {
    return json(413, {
      error: isZip
        ? "El ZIP supera el límite de 200 MB."
        : "El GeoJSON supera el límite de 100 MB.",
    });
  }

  let saved;
  try {
    saved = isZip
      ? await saveZipStream(ctx.req, key, { maxBytes })
      : await saveGeoJsonStream(ctx.req, key, { maxBytes });
  } catch (err) {
    const status = /límite/i.test(err.message) ? 413 : 400;
    return json(status, { error: err.message });
  }

  const name = text(ctx.query?.name, 200) || key;
  const { db, error } = await dbOrError(getDB);
  if (error) return error;

  try {
    const existing = await db.query(
      "SELECT id, config FROM admin.layers WHERE layer_key = $1",
      [key]
    );
    const previousConfig = existing[0]?.config || {};
    const config = {
      ...previousConfig,
      // El ZIP se procesa en el worker; el fallback público es el GeoJSON
      // que ese worker genera a partir del Shapefile.
      url: layerFileRelative(key),
      type: previousConfig.type || saved.type || "polygon",
      nombrePersonalizado: previousConfig.nombrePersonalizado || name,
    };
    if (isZip) {
      config.upload = {
        format: "shapefile",
        file: saved.file,
        bytes: saved.bytes,
      };
    } else {
      delete config.upload;
    }

    const sourceType = isZip ? "shapefile" : "geojson";
    const rows = await db.query(
      `INSERT INTO admin.layers
         (layer_key, nombre, tipo, source_type, has_tiles, config, activo, updated_by)
       VALUES ($1, $2, $3, $4, false, $5::jsonb, true, $6)
       ON CONFLICT (layer_key) DO UPDATE
         SET nombre = COALESCE(NULLIF(admin.layers.nombre, ''), EXCLUDED.nombre),
             tipo = EXCLUDED.tipo,
             source_type = EXCLUDED.source_type,
             has_tiles = false,
             config = $5::jsonb,
             activo = true,
             updated_at = now(),
             updated_by = EXCLUDED.updated_by
       RETURNING id, layer_key, nombre, tipo, source_type, has_tiles, config, activo`,
      [key, name, config.type, sourceType, JSON.stringify(config), auth.session.sub]
    );
    await audit(ctx, auth.session, "layer.upload", key, "ok", {
      bytes: saved.bytes,
      format: isZip ? "shapefile" : "geojson",
      ...(isZip ? {} : { features: saved.features }),
    });
    if (!isZip) await deleteLayerZip(key).catch(() => {});
    return json(201, { item: rows[0], file: saved.file, ...saved });
  } catch (err) {
    console.error("[admin:layers] error registrando upload:", err?.message || err);
    return json(503, { error: "El archivo se guardó, pero no se pudo registrar la capa." });
  }
}

/**
 * POST /api/admin/layers/jobs
 */
export async function handleLayerQueue(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });

  const body = ctx.body || {};
  const key = String(body.layer_key || body.key || "").toLowerCase();
  try {
    validateLayerKey(key);
  } catch (err) {
    return json(400, { error: err.message });
  }

  const { db, error } = await dbOrError(getDB);
  if (error) return error;

  try {
    const layer = await db.query(
      "SELECT id, layer_key, nombre, config FROM admin.layers WHERE layer_key = $1",
      [key]
    );
    if (layer.length === 0) return json(404, { error: "Capa no encontrada." });
    const config = layer[0].config || {};
    const upload = config.upload || null;
    const isShapefile = upload?.format === "shapefile";
    const file = isShapefile ? String(upload.file || "") : String(config.url || "");

    if (isShapefile) {
      if (!file.startsWith("geojson/private/") || file.includes("..")) {
        return json(400, { error: "El ZIP de la capa no es válido." });
      }
    } else if (!file.startsWith("geojson/uploads/")) {
      return json(400, { error: "La capa no tiene un GeoJSON subido desde el panel." });
    }

    const version = layerTileVersion();
    const payload = {
      format: isShapefile ? "shapefile" : "geojson",
      file,
      dimension_key: text(body.dimension_key, 60) || "otros",
      display_name: text(body.display_name, 200) || layer[0].nombre || key,
      tiles: body.tiles !== false,
      version,
    };
    const rows = await db.query(
      `INSERT INTO admin.layer_jobs (action, layer_key, status, payload, requested_by)
       VALUES ('import', $1, 'queued', $2::jsonb, $3)
       RETURNING id, action, layer_key, status, payload, created_at`,
      [key, JSON.stringify(payload), auth.session.sub]
    );
    await audit(ctx, auth.session, "layer.import.queue", key, "ok", { version });
    return json(201, { job: rows[0] });
  } catch (err) {
    if (err?.code === "23505") return json(409, { error: "Ya hay un job activo para esta capa." });
    console.error("[admin:layers] error encolando:", err?.message || err);
    return json(503, { error: "No se pudo encolar la importación." });
  }
}

/**
 * GET /api/admin/layers/jobs?id=
 */
export async function handleLayerJobsGet(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  const { db, error } = await dbOrError(getDB);
  if (error) return error;

  const id = parseId(ctx.query?.id);
  try {
    if (id) {
      const rows = await db.query(
        `SELECT id, action, layer_key, status, payload, result,
                error_code, error_message, requested_by,
                created_at, started_at, finished_at, heartbeat_at
           FROM admin.layer_jobs WHERE id = $1`,
        [id]
      );
      if (rows.length === 0) return json(404, { error: "Job no encontrado." });
      return json(200, { job: rows[0] });
    }
    const rows = await db.query(
      `SELECT id, action, layer_key, status, payload, result,
              error_code, error_message, requested_by,
              created_at, started_at, finished_at, heartbeat_at
         FROM admin.layer_jobs ORDER BY id DESC LIMIT 25`
    );
    return json(200, { items: rows });
  } catch (err) {
    console.error("[admin:layers] error leyendo jobs:", err?.message || err);
    return json(503, { error: "No se pudieron leer los trabajos." });
  }
}

export async function handleLayerJobCancel(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });
  const id = parseId(ctx.body?.id);
  if (!id) return json(400, { error: "Falta el id del job." });
  const { db, error } = await dbOrError(getDB);
  if (error) return error;

  try {
    const rows = await db.query(
      `UPDATE admin.layer_jobs
          SET status = 'cancelled', finished_at = now()
        WHERE id = $1 AND status = 'queued'
        RETURNING id, status`,
      [id]
    );
    if (rows.length === 0) return json(409, { error: "El job no está en cola." });
    await audit(ctx, auth.session, "layer.import.cancel", String(id), "ok");
    return json(200, { job: rows[0] });
  } catch (err) {
    console.error("[admin:layers] error cancelando:", err?.message || err);
    return json(503, { error: "No se pudo cancelar el trabajo." });
  }
}
