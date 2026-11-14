/**
 * CRUD de taxonomía normalizada (Sprint 46-B).
 *
 * Dimensiones, grupos, subgrupos y asignaciones de capas. Los cambios se
 * guardan en las tablas; la publicación compila y activa un snapshot para el
 * visor (scripts/taxonomy-compile.mjs --publish).
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { getDB as defaultGetDB } from "../db/pool.js";
import { recordAudit } from "../admin/auth.js";
import {
  isPostgres,
  json,
  requireCsrf,
  requireSession,
} from "./admin.js";

const KEY_RE = /^[a-z0-9][a-z0-9_-]{1,60}$/;

function parseId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function text(value, max = 160) {
  return String(value ?? "").trim().slice(0, max);
}

function order(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

async function dbOrError(ctx, getDB) {
  let db;
  try {
    db = await getDB();
  } catch {
    return { error: json(503, { error: "PostgreSQL no disponible." }) };
  }
  if (!isPostgres(db)) {
    return { error: json(503, { error: "La taxonomía requiere PostgreSQL." }) };
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

function validateDimension(body, { insert }) {
  const key = text(body.key, 60);
  if (insert && !KEY_RE.test(key)) {
    return { error: "La clave debe usar minúsculas, números, guiones o guiones bajos." };
  }
  const nombre = text(body.nombre, 160);
  if (!nombre) return { error: "El nombre es obligatorio." };
  return {
    value: {
      key,
      nombre,
      icono: text(body.icono, 80) || null,
      orden: order(body.orden),
      activo: body.activo !== false,
    },
  };
}

/**
 * GET /api/admin/taxonomy
 */
export async function handleTaxonomyGet(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  const { db, error } = await dbOrError(ctx, getDB);
  if (error) return error;

  try {
    const dimensions = await db.query(
      "SELECT id, key, nombre, icono, extra, orden, activo FROM admin.dimensions ORDER BY orden, key"
    );
    const groups = await db.query(
      `SELECT g.id, g.dimension_id, g.key, g.nombre, g.extra, g.orden, g.activo
         FROM admin.groups g ORDER BY g.dimension_id, g.orden, g.key`
    );
    const subgroups = await db.query(
      `SELECT s.id, s.group_id, s.key, s.nombre, s.extra, s.orden, s.activo
         FROM admin.subgroups s ORDER BY s.group_id, s.orden, s.key`
    );
    const layers = await db.query(
      `SELECT id, layer_key, nombre, tipo, source_type, has_tiles, activo
         FROM admin.layers ORDER BY nombre, layer_key`
    );
    const placements = await db.query(
      `SELECT p.id, p.layer_id, p.dimension_id, p.group_id, p.subgroup_id,
              p.scope, p.orden, p.activo, l.layer_key, l.nombre AS layer_nombre
         FROM admin.layer_placements p
         JOIN admin.layers l ON l.id = p.layer_id
        ORDER BY p.dimension_id, p.scope, p.group_id, p.subgroup_id, p.orden`
    );
    const initial = await db.query(
      `SELECT i.id, i.dimension_id, i.kind, i.group_id, i.layer_id, i.orden
         FROM admin.dimension_initial_items i
        ORDER BY i.dimension_id, i.orden`
    );
    return json(200, { dimensions, groups, subgroups, layers, placements, initial });
  } catch (err) {
    console.error("[admin:taxonomy] error leyendo:", err?.message || err);
    return json(503, { error: "No se pudo leer la taxonomía." });
  }
}

/**
 * POST/PUT /api/admin/taxonomy/dimensions
 */
export async function handleDimensionSave(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });

  const insert = ctx.req.method === "POST";
  const validated = validateDimension(ctx.body || {}, { insert });
  if (validated.error) return json(400, { error: validated.error });
  const value = validated.value;

  const { db, error } = await dbOrError(ctx, getDB);
  if (error) return error;

  try {
    if (insert) {
      const rows = await db.query(
        `INSERT INTO admin.dimensions (key, nombre, icono, orden, activo, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, key, nombre, icono, orden, activo`,
        [value.key, value.nombre, value.icono, value.orden, value.activo, auth.session.sub]
      );
      await audit(ctx, auth.session, "taxonomy.dimension.create", value.key, "ok");
      return json(201, { item: rows[0] });
    }

    const id = parseId(ctx.body?.id);
    if (!id) return json(400, { error: "Falta el id de la dimensión." });
    const rows = await db.query(
      `UPDATE admin.dimensions
          SET nombre = $2, icono = $3, orden = $4, activo = $5, updated_by = $6
        WHERE id = $1
        RETURNING id, key, nombre, icono, orden, activo`,
      [id, value.nombre, value.icono, value.orden, value.activo, auth.session.sub]
    );
    if (rows.length === 0) return json(404, { error: "Dimensión no encontrada." });
    await audit(ctx, auth.session, "taxonomy.dimension.update", String(id), "ok");
    return json(200, { item: rows[0] });
  } catch (err) {
    if (err?.code === "23505") return json(409, { error: "La clave ya existe." });
    console.error("[admin:taxonomy] error dimensión:", err?.message || err);
    return json(503, { error: "No se pudo guardar la dimensión." });
  }
}

/**
 * DELETE /api/admin/taxonomy/dimensions?id=
 */
export async function handleDimensionDelete(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });
  const id = parseId(ctx.query?.id);
  if (!id) return json(400, { error: "Falta el id." });
  const { db, error } = await dbOrError(ctx, getDB);
  if (error) return error;
  try {
    const rows = await db.query("DELETE FROM admin.dimensions WHERE id = $1 RETURNING key", [id]);
    if (rows.length === 0) return json(404, { error: "Dimensión no encontrada." });
    await audit(ctx, auth.session, "taxonomy.dimension.delete", rows[0].key, "ok");
    return json(200, { ok: true });
  } catch (err) {
    console.error("[admin:taxonomy] error borrando dimensión:", err?.message || err);
    return json(503, { error: "No se pudo borrar la dimensión." });
  }
}

function validateGroup(body, { insert }) {
  const key = text(body.key, 60);
  if (insert && !KEY_RE.test(key)) return { error: "Clave de grupo inválida." };
  const nombre = text(body.nombre, 160);
  if (!nombre) return { error: "El nombre del grupo es obligatorio." };
  const dimensionId = parseId(body.dimension_id);
  if (insert && !dimensionId) return { error: "Falta la dimensión." };
  return {
    value: {
      key,
      nombre,
      dimension_id: dimensionId,
      orden: order(body.orden),
      activo: body.activo !== false,
    },
  };
}

/**
 * POST/PUT /api/admin/taxonomy/groups
 */
export async function handleGroupSave(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });
  const insert = ctx.req.method === "POST";
  const validated = validateGroup(ctx.body || {}, { insert });
  if (validated.error) return json(400, { error: validated.error });
  const value = validated.value;
  const { db, error } = await dbOrError(ctx, getDB);
  if (error) return error;

  try {
    if (insert) {
      const rows = await db.query(
        `INSERT INTO admin.groups (dimension_id, key, nombre, orden, activo, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, dimension_id, key, nombre, orden, activo`,
        [value.dimension_id, value.key, value.nombre, value.orden, value.activo, auth.session.sub]
      );
      await audit(ctx, auth.session, "taxonomy.group.create", value.key, "ok");
      return json(201, { item: rows[0] });
    }

    const id = parseId(ctx.body?.id);
    if (!id) return json(400, { error: "Falta el id del grupo." });
    const rows = await db.query(
      `UPDATE admin.groups
          SET nombre = $2, orden = $3, activo = $4, updated_by = $5
        WHERE id = $1
        RETURNING id, dimension_id, key, nombre, orden, activo`,
      [id, value.nombre, value.orden, value.activo, auth.session.sub]
    );
    if (rows.length === 0) return json(404, { error: "Grupo no encontrado." });
    await audit(ctx, auth.session, "taxonomy.group.update", String(id), "ok");
    return json(200, { item: rows[0] });
  } catch (err) {
    if (err?.code === "23505") return json(409, { error: "La clave del grupo ya existe." });
    console.error("[admin:taxonomy] error grupo:", err?.message || err);
    return json(503, { error: "No se pudo guardar el grupo." });
  }
}

export async function handleGroupDelete(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });
  const id = parseId(ctx.query?.id);
  if (!id) return json(400, { error: "Falta el id." });
  const { db, error } = await dbOrError(ctx, getDB);
  if (error) return error;
  try {
    const rows = await db.query("DELETE FROM admin.groups WHERE id = $1 RETURNING key", [id]);
    if (rows.length === 0) return json(404, { error: "Grupo no encontrado." });
    await audit(ctx, auth.session, "taxonomy.group.delete", rows[0].key, "ok");
    return json(200, { ok: true });
  } catch (err) {
    console.error("[admin:taxonomy] error borrando grupo:", err?.message || err);
    return json(503, { error: "No se pudo borrar el grupo." });
  }
}

/**
 * POST/PUT /api/admin/taxonomy/subgroups
 */
export async function handleSubgroupSave(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });
  const insert = ctx.req.method === "POST";
  const body = ctx.body || {};
  const key = text(body.key, 60);
  const nombre = text(body.nombre, 160);
  const groupId = parseId(body.group_id);
  if (insert && !KEY_RE.test(key)) return json(400, { error: "Clave de subgrupo inválida." });
  if (!nombre) return json(400, { error: "El nombre del subgrupo es obligatorio." });
  if (insert && !groupId) return json(400, { error: "Falta el grupo." });

  const { db, error } = await dbOrError(ctx, getDB);
  if (error) return error;
  try {
    if (insert) {
      const rows = await db.query(
        `INSERT INTO admin.subgroups (group_id, key, nombre, orden, activo, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, group_id, key, nombre, orden, activo`,
        [groupId, key, nombre, order(body.orden), body.activo !== false, auth.session.sub]
      );
      await audit(ctx, auth.session, "taxonomy.subgroup.create", key, "ok");
      return json(201, { item: rows[0] });
    }

    const id = parseId(body.id);
    if (!id) return json(400, { error: "Falta el id del subgrupo." });
    const rows = await db.query(
      `UPDATE admin.subgroups
          SET nombre = $2, orden = $3, activo = $4, updated_by = $5
        WHERE id = $1
        RETURNING id, group_id, key, nombre, orden, activo`,
      [id, nombre, order(body.orden), body.activo !== false, auth.session.sub]
    );
    if (rows.length === 0) return json(404, { error: "Subgrupo no encontrado." });
    await audit(ctx, auth.session, "taxonomy.subgroup.update", String(id), "ok");
    return json(200, { item: rows[0] });
  } catch (err) {
    if (err?.code === "23505") return json(409, { error: "La clave del subgrupo ya existe." });
    console.error("[admin:taxonomy] error subgrupo:", err?.message || err);
    return json(503, { error: "No se pudo guardar el subgrupo." });
  }
}

export async function handleSubgroupDelete(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });
  const id = parseId(ctx.query?.id);
  if (!id) return json(400, { error: "Falta el id." });
  const { db, error } = await dbOrError(ctx, getDB);
  if (error) return error;
  try {
    const rows = await db.query("DELETE FROM admin.subgroups WHERE id = $1 RETURNING key", [id]);
    if (rows.length === 0) return json(404, { error: "Subgrupo no encontrado." });
    await audit(ctx, auth.session, "taxonomy.subgroup.delete", rows[0].key, "ok");
    return json(200, { ok: true });
  } catch (err) {
    console.error("[admin:taxonomy] error borrando subgrupo:", err?.message || err);
    return json(503, { error: "No se pudo borrar el subgrupo." });
  }
}

/**
 * POST /api/admin/taxonomy/placements
 * DELETE /api/admin/taxonomy/placements?id=
 */
export async function handlePlacementSave(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });
  const body = ctx.body || {};
  const layerId = parseId(body.layer_id);
  const dimensionId = parseId(body.dimension_id);
  const scope = String(body.scope || "");
  if (!layerId || !dimensionId || !["master", "group", "subgroup"].includes(scope)) {
    return json(400, { error: "Faltan capa, dimensión o scope válido." });
  }
  const groupId = scope === "master" ? null : parseId(body.group_id);
  const subgroupId = scope === "subgroup" ? parseId(body.subgroup_id) : null;
  if (scope !== "master" && !groupId) return json(400, { error: "Falta el grupo." });
  if (scope === "subgroup" && !subgroupId) return json(400, { error: "Falta el subgrupo." });

  const { db, error } = await dbOrError(ctx, getDB);
  if (error) return error;
  try {
    const rows = await db.query(
      `INSERT INTO admin.layer_placements
         (layer_id, dimension_id, group_id, subgroup_id, scope, orden, activo, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7)
       ON CONFLICT DO NOTHING
       RETURNING id, layer_id, dimension_id, group_id, subgroup_id, scope, orden, activo`,
      [layerId, dimensionId, groupId, subgroupId, scope, order(body.orden), auth.session.sub]
    );
    if (rows.length === 0) return json(409, { error: "La capa ya está asignada en ese lugar." });
    await audit(ctx, auth.session, "taxonomy.placement.create", String(layerId), "ok", {
      scope,
    });
    return json(201, { item: rows[0] });
  } catch (err) {
    console.error("[admin:taxonomy] error asignación:", err?.message || err);
    return json(503, { error: "No se pudo asignar la capa." });
  }
}

export async function handlePlacementDelete(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });
  const id = parseId(ctx.query?.id);
  if (!id) return json(400, { error: "Falta el id." });
  const { db, error } = await dbOrError(ctx, getDB);
  if (error) return error;
  try {
    const rows = await db.query("DELETE FROM admin.layer_placements WHERE id = $1 RETURNING id", [id]);
    if (rows.length === 0) return json(404, { error: "Asignación no encontrada." });
    await audit(ctx, auth.session, "taxonomy.placement.delete", String(id), "ok");
    return json(200, { ok: true });
  } catch (err) {
    console.error("[admin:taxonomy] error borrando asignación:", err?.message || err);
    return json(503, { error: "No se pudo quitar la asignación." });
  }
}

/**
 * POST /api/admin/taxonomy/publish
 */
export async function handleTaxonomyPublish(ctx) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });

  const script = path.join(process.cwd(), "scripts", "taxonomy-compile.mjs");
  const env = {
    ...process.env,
    DATABASE_ADMIN_URL:
      ctx.env?.DATABASE_ADMIN_URL || ctx.env?.DATABASE_URL || process.env.DATABASE_URL,
    DATABASE_URL: ctx.env?.DATABASE_URL || process.env.DATABASE_URL,
  };

  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, [script, "--publish", "--by", auth.session.sub], {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const append = (chunk) => {
      if (output.length < 8000) output += chunk.toString();
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ ok: false, output: `${output}\nTimeout al publicar.` });
    }, 60000);
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, output: err.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output });
    });
  });

  await audit(
    ctx,
    auth.session,
    "taxonomy.publish",
    "config_snapshot",
    result.ok ? "ok" : "fail",
    { output: result.output.slice(0, 500) }
  );

  if (!result.ok) {
    return json(500, {
      error: "No se pudo publicar la taxonomía.",
      output: result.output,
    });
  }
  return json(200, { ok: true, output: result.output });
}
