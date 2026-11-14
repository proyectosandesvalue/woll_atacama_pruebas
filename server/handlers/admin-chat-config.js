/**
 * CRUD de configuración del chat (Sprint 48).
 *
 * Prompts/instrucciones, settings, mensajes, datos no disponibles y golden
 * set. Las tools NO se editan: son código y allowlist de RPCs; solo se
 * exponen como inventario de lectura.
 */

import { getDB as defaultGetDB } from "../db/pool.js";
import { recordAudit } from "../admin/auth.js";
import { TOOL_DEFINITIONS } from "../chat/tools/index.js";
import {
  isPostgres,
  json,
  requireCsrf,
  requireSession,
} from "./admin.js";

const KEY_RE = /^[a-z][a-z0-9._-]{1,80}$/;
const ID_RE = /^[a-z0-9][a-z0-9_-]{1,100}$/;
const GOLDEN_ROUTES = new Set(["tool", "rag", "mixta", "abstencion", "fuera_de_alcance"]);

function text(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function parseJson(value, label) {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`${label} debe ser JSON válido.`);
    }
  }
  return value;
}

async function dbOrError(getDB) {
  let db;
  try {
    db = await getDB();
  } catch {
    return { error: json(503, { error: "PostgreSQL no disponible." }) };
  }
  if (!isPostgres(db)) {
    return { error: json(503, { error: "La configuración del chat requiere PostgreSQL." }) };
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
 * GET /api/admin/chat/tools — inventario de solo lectura.
 */
export function handleChatTools(ctx) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  return json(200, {
    items: TOOL_DEFINITIONS.map((tool) => ({
      name: tool.function?.name || "—",
      description: tool.function?.description || "",
      parameters: tool.function?.parameters || {},
    })),
    editable: false,
    reason: "Las tools son código: una tool = un archivo en server/chat/tools/ + registro.",
  });
}

/**
 * POST /api/admin/prompts — crea una versión nueva y la activa.
 */
export async function handlePromptCreate(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });

  const body = ctx.body || {};
  const id = text(body.id, 80);
  const content = String(body.content || "");
  const description = text(body.description, 500) || null;
  if (!KEY_RE.test(id)) return json(400, { error: "Id de prompt inválido." });
  if (!content.trim() || content.length > 200_000) {
    return json(400, { error: "El contenido es obligatorio y debe tener menos de 200 KB." });
  }

  const { db, error } = await dbOrError(getDB);
  if (error) return error;

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const next = await client.query(
      "SELECT COALESCE(MAX(version), 0) + 1 AS version FROM admin.prompt_templates WHERE id = $1",
      [id]
    );
    const version = Number(next.rows[0].version);
    await client.query(
      "UPDATE admin.prompt_templates SET activo = false WHERE id = $1 AND activo = true",
      [id]
    );
    await client.query(
      `INSERT INTO admin.prompt_templates
         (id, version, content, description, activo, updated_by)
       VALUES ($1, $2, $3, $4, true, $5)`,
      [id, version, content, description, auth.session.sub]
    );
    await client.query("COMMIT");
    await audit(ctx, auth.session, "chat.prompt.create", `${id}@v${version}`, "ok");
    return json(201, { item: { id, version, description, activo: true } });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[admin:chat] error creando prompt:", err?.message || err);
    return json(503, { error: "No se pudo guardar el prompt." });
  } finally {
    client.release();
  }
}

/**
 * POST /api/admin/prompts/activate — reactiva una versión creando una nueva.
 */
export async function handlePromptActivate(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });

  const id = text(ctx.body?.id, 80);
  const version = Number.parseInt(ctx.body?.version, 10);
  if (!KEY_RE.test(id) || !Number.isInteger(version)) {
    return json(400, { error: "Prompt o versión inválida." });
  }

  const { db, error } = await dbOrError(getDB);
  if (error) return error;
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const source = await client.query(
      "SELECT content, description FROM admin.prompt_templates WHERE id = $1 AND version = $2",
      [id, version]
    );
    if (source.rows.length === 0) {
      await client.query("ROLLBACK");
      return json(404, { error: "Versión no encontrada." });
    }
    const next = await client.query(
      "SELECT COALESCE(MAX(version), 0) + 1 AS version FROM admin.prompt_templates WHERE id = $1",
      [id]
    );
    const nextVersion = Number(next.rows[0].version);
    await client.query(
      "UPDATE admin.prompt_templates SET activo = false WHERE id = $1 AND activo = true",
      [id]
    );
    await client.query(
      `INSERT INTO admin.prompt_templates
         (id, version, content, description, activo, updated_by)
       VALUES ($1, $2, $3, $4, true, $5)`,
      [
        id,
        nextVersion,
        source.rows[0].content,
        `${source.rows[0].description || ""} (reactivada de v${version})`.trim(),
        auth.session.sub,
      ]
    );
    await client.query("COMMIT");
    await audit(ctx, auth.session, "chat.prompt.activate", `${id}@v${version}`, "ok", {
      new_version: nextVersion,
    });
    return json(200, { item: { id, version: nextVersion, activo: true } });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[admin:chat] error activando prompt:", err?.message || err);
    return json(503, { error: "No se pudo activar la versión." });
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/admin/prompts?id=&version=
 */
export async function handlePromptDelete(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });
  const id = text(ctx.query?.id, 80);
  const version = Number.parseInt(ctx.query?.version, 10);
  if (!KEY_RE.test(id) || !Number.isInteger(version)) {
    return json(400, { error: "Prompt o versión inválida." });
  }

  const { db, error } = await dbOrError(getDB);
  if (error) return error;
  try {
    const rows = await db.query(
      "DELETE FROM admin.prompt_templates WHERE id = $1 AND version = $2 AND activo = false RETURNING id",
      [id, version]
    );
    if (rows.length === 0) {
      return json(409, { error: "No se puede borrar la versión activa o no existe." });
    }
    await audit(ctx, auth.session, "chat.prompt.delete", `${id}@v${version}`, "ok");
    return json(200, { ok: true });
  } catch (err) {
    console.error("[admin:chat] error borrando prompt:", err?.message || err);
    return json(503, { error: "No se pudo borrar la versión." });
  }
}

function validateSetting(body) {
  const key = text(body.key, 80);
  if (!KEY_RE.test(key)) return { error: "Clave de setting inválida." };
  if (body.value === undefined) return { error: "Falta el valor." };
  const type = text(body.type, 20) || (
    typeof body.value === "boolean" ? "boolean"
      : typeof body.value === "number" ? "number"
        : typeof body.value === "object" ? "json"
          : "string"
  );
  if (!["string", "number", "boolean", "json"].includes(type)) {
    return { error: "Tipo de setting inválido." };
  }
  return {
    value: {
      key,
      value: body.value,
      type,
      description: text(body.description, 500) || null,
      editable: body.editable !== false,
    },
  };
}

/**
 * PUT /api/admin/settings
 */
export async function handleSettingSave(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });
  const validated = validateSetting(ctx.body || {});
  if (validated.error) return json(400, { error: validated.error });
  const value = validated.value;
  const { db, error } = await dbOrError(getDB);
  if (error) return error;

  try {
    const rows = await db.query(
      `INSERT INTO admin.settings (key, value, type, description, editable, updated_by)
       VALUES ($1, $2::jsonb, $3, $4, $5, $6)
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             type = EXCLUDED.type,
             description = EXCLUDED.description,
             editable = EXCLUDED.editable,
             updated_at = now(),
             updated_by = EXCLUDED.updated_by
         WHERE admin.settings.editable = true
       RETURNING key, value, type, description, editable`,
      [
        value.key,
        JSON.stringify(value.value),
        value.type,
        value.description,
        value.editable,
        auth.session.sub,
      ]
    );
    if (rows.length === 0) return json(409, { error: "El setting no es editable." });
    await audit(ctx, auth.session, "chat.setting.save", value.key, "ok");
    return json(200, { item: rows[0] });
  } catch (err) {
    console.error("[admin:chat] error guardando setting:", err?.message || err);
    return json(503, { error: "No se pudo guardar el setting." });
  }
}

/**
 * DELETE /api/admin/settings?key=
 */
export async function handleSettingDelete(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });
  const key = text(ctx.query?.key, 80);
  if (!KEY_RE.test(key)) return json(400, { error: "Clave inválida." });
  const { db, error } = await dbOrError(getDB);
  if (error) return error;
  try {
    const rows = await db.query(
      "DELETE FROM admin.settings WHERE key = $1 AND editable = true RETURNING key",
      [key]
    );
    if (rows.length === 0) return json(409, { error: "El setting no existe o no es editable." });
    await audit(ctx, auth.session, "chat.setting.delete", key, "ok");
    return json(200, { ok: true });
  } catch (err) {
    console.error("[admin:chat] error borrando setting:", err?.message || err);
    return json(503, { error: "No se pudo borrar el setting." });
  }
}

/**
 * PUT /api/admin/messages
 */
export async function handleMessageSave(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });
  const key = text(ctx.body?.key, 80);
  const content = String(ctx.body?.content || "");
  if (!KEY_RE.test(key) || !content.trim() || content.length > 20_000) {
    return json(400, { error: "Mensaje inválido." });
  }
  const { db, error } = await dbOrError(getDB);
  if (error) return error;
  try {
    const rows = await db.query(
      `INSERT INTO admin.messages (key, content, description, updated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO UPDATE
         SET content = EXCLUDED.content,
             description = EXCLUDED.description,
             updated_at = now(),
             updated_by = EXCLUDED.updated_by
       RETURNING key, content, description`,
      [key, content, text(ctx.body?.description, 500) || null, auth.session.sub]
    );
    await audit(ctx, auth.session, "chat.message.save", key, "ok");
    return json(200, { item: rows[0] });
  } catch (err) {
    console.error("[admin:chat] error guardando mensaje:", err?.message || err);
    return json(503, { error: "No se pudo guardar el mensaje." });
  }
}

export async function handleMessageDelete(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });
  const key = text(ctx.query?.key, 80);
  if (!KEY_RE.test(key)) return json(400, { error: "Clave inválida." });
  const { db, error } = await dbOrError(getDB);
  if (error) return error;
  try {
    const rows = await db.query("DELETE FROM admin.messages WHERE key = $1 RETURNING key", [key]);
    if (rows.length === 0) return json(404, { error: "Mensaje no encontrado." });
    await audit(ctx, auth.session, "chat.message.delete", key, "ok");
    return json(200, { ok: true });
  } catch (err) {
    console.error("[admin:chat] error borrando mensaje:", err?.message || err);
    return json(503, { error: "No se pudo borrar el mensaje." });
  }
}

function arrayOfStrings(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

/**
 * PUT /api/admin/unavailable
 */
export async function handleUnavailableSave(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });
  const id = text(ctx.body?.id, 100);
  const descripcion = text(ctx.body?.descripcion, 1000);
  const motivo = text(ctx.body?.motivo, 40) || "dato_inexistente";
  const source = text(ctx.body?.source, 20) || "manual";
  if (!ID_RE.test(id) || !descripcion) return json(400, { error: "Datos no disponibles inválidos." });
  if (!["dato_inexistente", "sin_receta", "fuente_no_ingerida"].includes(motivo)) {
    return json(400, { error: "Motivo inválido." });
  }
  if (!["manual", "catalog", "ingest", "recipe"].includes(source)) {
    return json(400, { error: "Origen inválido." });
  }

  const { db, error } = await dbOrError(getDB);
  if (error) return error;
  try {
    const rows = await db.query(
      `INSERT INTO admin.unavailable_data
         (id, descripcion, palabras, capas_relacionadas, existe, motivo,
          activo, source, verificado_en, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_DATE, $9)
       ON CONFLICT (id) DO UPDATE
         SET descripcion = EXCLUDED.descripcion,
             palabras = EXCLUDED.palabras,
             capas_relacionadas = EXCLUDED.capas_relacionadas,
             existe = EXCLUDED.existe,
             motivo = EXCLUDED.motivo,
             activo = EXCLUDED.activo,
             source = EXCLUDED.source,
             verificado_en = CURRENT_DATE,
             updated_at = now(),
             updated_by = EXCLUDED.updated_by
       RETURNING id, descripcion, palabras, capas_relacionadas, existe, motivo, activo, source, verificado_en`,
      [
        id,
        descripcion,
        arrayOfStrings(ctx.body?.palabras),
        arrayOfStrings(ctx.body?.capas_relacionadas),
        text(ctx.body?.existe, 200) || null,
        motivo,
        ctx.body?.activo !== false,
        source,
        auth.session.sub,
      ]
    );
    await audit(ctx, auth.session, "chat.unavailable.save", id, "ok");
    return json(200, { item: rows[0] });
  } catch (err) {
    console.error("[admin:chat] error guardando unavailable:", err?.message || err);
    return json(503, { error: "No se pudo guardar el registro." });
  }
}

export async function handleUnavailableDelete(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });
  const id = text(ctx.query?.id, 100);
  if (!ID_RE.test(id)) return json(400, { error: "Id inválido." });
  const { db, error } = await dbOrError(getDB);
  if (error) return error;
  try {
    const rows = await db.query("DELETE FROM admin.unavailable_data WHERE id = $1 RETURNING id", [id]);
    if (rows.length === 0) return json(404, { error: "Registro no encontrado." });
    await audit(ctx, auth.session, "chat.unavailable.delete", id, "ok");
    return json(200, { ok: true });
  } catch (err) {
    console.error("[admin:chat] error borrando unavailable:", err?.message || err);
    return json(503, { error: "No se pudo borrar el registro." });
  }
}

/**
 * GET /api/admin/golden
 */
export async function handleGoldenGet(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  const { db, error } = await dbOrError(getDB);
  if (error) return error;
  try {
    const rows = await db.query(
      `SELECT id, level, tier, intent_esperado, fuente_esperada, category,
              question, expected, notes, history, route, activo, updated_at, updated_by
         FROM admin.golden_cases
        ORDER BY level, id`
    );
    return json(200, { items: rows });
  } catch (err) {
    console.error("[admin:chat] error leyendo golden:", err?.message || err);
    return json(503, { error: "No se pudo leer el golden set." });
  }
}

/**
 * PUT /api/admin/golden
 */
export async function handleGoldenSave(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });
  const body = ctx.body || {};
  const id = text(body.id, 100);
  const question = text(body.question, 1000);
  const level = Number.parseInt(body.level, 10) || 1;
  const tier = Number.parseInt(body.tier, 10) || 1;
  const route = body.route === undefined || body.route === null || body.route === ""
    ? null
    : text(body.route, 40);
  if (!ID_RE.test(id) || !question) return json(400, { error: "Caso inválido." });
  if (level < 1 || level > 3) return json(400, { error: "Level fuera de rango." });
  if (tier < 1 || tier > 6) return json(400, { error: "Tier fuera de rango." });
  if (route && !GOLDEN_ROUTES.has(route)) return json(400, { error: "Ruta inválida." });

  let expected;
  let history;
  try {
    expected = parseJson(body.expected, "expected");
    history = parseJson(body.history, "history");
  } catch (err) {
    return json(400, { error: err.message });
  }
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    return json(400, { error: "expected debe ser un objeto JSON." });
  }

  const { db, error } = await dbOrError(getDB);
  if (error) return error;
  try {
    const rows = await db.query(
      `INSERT INTO admin.golden_cases
         (id, level, tier, intent_esperado, fuente_esperada, category,
          question, expected, notes, history, route, activo, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE
         SET level = EXCLUDED.level, tier = EXCLUDED.tier,
             intent_esperado = EXCLUDED.intent_esperado,
             fuente_esperada = EXCLUDED.fuente_esperada,
             category = EXCLUDED.category, question = EXCLUDED.question,
             expected = EXCLUDED.expected, notes = EXCLUDED.notes,
             history = EXCLUDED.history, route = EXCLUDED.route,
             activo = EXCLUDED.activo,
             updated_at = now(), updated_by = EXCLUDED.updated_by
       RETURNING id, level, tier, intent_esperado, fuente_esperada, category,
                 question, expected, notes, history, route, activo`,
      [
        id,
        level,
        tier,
        text(body.intent_esperado, 100) || null,
        text(body.fuente_esperada, 100) || null,
        text(body.category, 100) || null,
        question,
        JSON.stringify(expected),
        text(body.notes, 1000) || null,
        history === undefined || history === null ? null : JSON.stringify(history),
        route,
        body.activo !== false,
        auth.session.sub,
      ]
    );
    await audit(ctx, auth.session, "chat.golden.save", id, "ok");
    return json(200, { item: rows[0] });
  } catch (err) {
    console.error("[admin:chat] error guardando golden:", err?.message || err);
    return json(503, { error: "No se pudo guardar el caso." });
  }
}

export async function handleGoldenDelete(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) return json(403, { error: "Token CSRF inválido." });
  const id = text(ctx.query?.id, 100);
  if (!ID_RE.test(id)) return json(400, { error: "Id inválido." });
  const { db, error } = await dbOrError(getDB);
  if (error) return error;
  try {
    const rows = await db.query("DELETE FROM admin.golden_cases WHERE id = $1 RETURNING id", [id]);
    if (rows.length === 0) return json(404, { error: "Caso no encontrado." });
    await audit(ctx, auth.session, "chat.golden.delete", id, "ok");
    return json(200, { ok: true });
  } catch (err) {
    console.error("[admin:chat] error borrando golden:", err?.message || err);
    return json(503, { error: "No se pudo borrar el caso." });
  }
}
