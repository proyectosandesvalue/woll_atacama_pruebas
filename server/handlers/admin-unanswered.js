/**
 * Cola de triage de preguntas sin respuesta (Sprint 50).
 *
 * El panel no crea tools ni código: clasifica la demanda, guarda el triage y
 * genera un brief Markdown para que el desarrollador lo implemente en otro
 * sprint. No se guardan datos personales.
 */

import { getDB as defaultGetDB } from "../db/pool.js";
import { recordAudit } from "../admin/auth.js";
import {
  isPostgres,
  json,
  requireCsrf,
  requireSession,
} from "./admin.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATUSES = new Set([
  "pending", "reviewing", "accepted", "planned", "resolved",
  "rejected", "duplicate", "archived", "in_progress", "wont_fix",
]);
const PRIORITIES = new Set(["alta", "media", "baja"]);
const DECISIONS = new Set([
  "new_tool", "new_layer", "new_document", "improve_prompt",
  "unavailable", "out_of_scope", "wont_fix", "duplicate",
]);
const REASONS = new Set([
  "no_data", "no_recipe", "no_tool", "no_document", "out_of_scope", "unknown",
]);
const RESOLUTION_TYPES = new Set([
  "data_added", "recipe_created", "tool_added", "document_added", "wont_fix",
]);
const SORTS = new Set(["last_seen_at", "occurrences", "created_at", "priority"]);

function text(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function headers() {
  return { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
}

function noStore(status, body) {
  return json(status, body, headers());
}

async function dbOrError(getDB) {
  let db;
  try {
    db = await getDB();
  } catch {
    return { error: noStore(503, { error: "PostgreSQL no disponible." }) };
  }
  if (!isPostgres(db)) {
    return { error: noStore(503, { error: "La demanda requiere PostgreSQL." }) };
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

function parseJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

/**
 * Quita columnas privadas aunque una RPC las devuelva por error.
 */
export function publicUnanswered(row) {
  if (!row || typeof row !== "object") return null;
  const copy = { ...row };
  delete copy.user_email;
  delete copy.session_id;
  delete copy.context;
  for (const key of ["classification", "route"]) {
    if (typeof copy[key] === "string") {
      try {
        copy[key] = JSON.parse(copy[key]);
      } catch {
        copy[key] = null;
      }
    }
  }
  return copy;
}

function parseListQuery(query = {}) {
  const status = text(query.status, 30);
  const reason = text(query.reason, 30);
  const priority = text(query.priority, 20);
  const decision = text(query.decision, 30);
  const sort = text(query.sort, 30) || "last_seen_at";
  const requestedLimit = Number.parseInt(query.limit, 10);
  const requestedOffset = Number.parseInt(query.offset, 10);

  return {
    p_status: status && status !== "all" ? status : null,
    p_reason: reason && reason !== "all" ? reason : null,
    p_priority: priority && priority !== "all" ? priority : null,
    p_decision: decision && decision !== "all" ? decision : null,
    p_query: text(query.q, 200) || null,
    p_limit: Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 200)
      : 50,
    p_offset: Number.isFinite(requestedOffset)
      ? Math.max(requestedOffset, 0)
      : 0,
    p_sort: SORTS.has(sort) ? sort : "last_seen_at",
  };
}

/**
 * GET /api/admin/unanswered
 */
export async function handleAdminUnansweredList(
  ctx,
  { getDB = defaultGetDB } = {}
) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;

  const params = parseListQuery(ctx.query);
  if (params.p_status && !STATUSES.has(params.p_status)) {
    return noStore(400, { error: "Estado inválido." });
  }
  if (params.p_reason && !REASONS.has(params.p_reason)) {
    return noStore(400, { error: "Razón inválida." });
  }
  if (params.p_priority && !PRIORITIES.has(params.p_priority)) {
    return noStore(400, { error: "Prioridad inválida." });
  }
  if (params.p_decision && !DECISIONS.has(params.p_decision)) {
    return noStore(400, { error: "Decisión inválida." });
  }

  const { db, error } = await dbOrError(getDB);
  if (error) return error;

  try {
    const result = await db.rpc("admin_list_unanswered", params);
    const data = typeof result === "string" ? JSON.parse(result) : result || {};
    const items = Array.isArray(data.items) ? data.items : [];
    return noStore(200, {
      items: items.map(publicUnanswered),
      total: Number(data.total) || items.length,
      limit: params.p_limit,
      offset: params.p_offset,
    });
  } catch (err) {
    console.error("[admin:demand] error listando:", err?.message || err);
    return noStore(503, { error: "No se pudo leer la demanda." });
  }
}

/**
 * GET /api/admin/unanswered/stats
 */
export async function handleAdminUnansweredStats(
  ctx,
  { getDB = defaultGetDB } = {}
) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;

  const { db, error } = await dbOrError(getDB);
  if (error) return error;

  try {
    const stats = await db.rpc("admin_unanswered_stats");
    return noStore(
      200,
      typeof stats === "string" ? JSON.parse(stats) : stats || {}
    );
  } catch (err) {
    console.error("[admin:demand] error leyendo stats:", err?.message || err);
    return noStore(503, { error: "No se pudieron leer las métricas." });
  }
}

/**
 * PUT /api/admin/unanswered
 */
export async function handleAdminUnansweredUpdate(
  ctx,
  { getDB = defaultGetDB } = {}
) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) {
    return noStore(403, { error: "Token CSRF inválido." });
  }

  const body = ctx.body || {};
  const id = text(body.id, 40);
  const status = text(body.status, 30);
  const priority = text(body.priority, 20) || null;
  const decision = text(body.decision, 30) || null;
  const sprintTarget = text(body.sprint_target, 80) || null;
  const notes = text(body.notes, 4000) || null;
  const resolutionType = text(body.resolution_type, 30) || null;
  const resolutionNote = text(body.resolution_note, 2000) || null;

  if (!UUID_RE.test(id)) return noStore(400, { error: "Id inválido." });
  if (!STATUSES.has(status)) return noStore(400, { error: "Estado inválido." });
  if (priority && !PRIORITIES.has(priority)) {
    return noStore(400, { error: "Prioridad inválida." });
  }
  if (decision && !DECISIONS.has(decision)) {
    return noStore(400, { error: "Decisión inválida." });
  }
  if (resolutionType && !RESOLUTION_TYPES.has(resolutionType)) {
    return noStore(400, { error: "Tipo de resolución inválido." });
  }

  const { db, error } = await dbOrError(getDB);
  if (error) return error;

  try {
    const row = await db.rpc("admin_update_unanswered", {
      p_id: id,
      p_status: status,
      p_priority: priority,
      p_decision: decision,
      p_sprint_target: sprintTarget,
      p_notes: notes,
      p_resolution_type: resolutionType,
      p_resolution_note: resolutionNote,
      p_actor: auth.session.sub,
    });
    if (!row) return noStore(404, { error: "Pregunta no encontrada." });

    await audit(ctx, auth.session, "demand.update", id, "ok", {
      status,
      priority,
      decision,
      sprint_target: sprintTarget,
    });
    return noStore(200, {
      item: publicUnanswered(typeof row === "string" ? JSON.parse(row) : row),
    });
  } catch (err) {
    console.error("[admin:demand] error actualizando:", err?.message || err);
    return noStore(503, { error: "No se pudo guardar el triage." });
  }
}

function briefDate(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

function asObject(value) {
  if (!value) return {};
  return typeof value === "string" ? parseJson(value) || {} : value;
}

/**
 * Genera el brief Markdown sin datos personales.
 * @param {object} row
 * @returns {{filename: string, markdown: string}}
 */
export function buildUnansweredBrief(row) {
  const classification = asObject(row.classification);
  const route = asObject(row.route);
  const question = String(row.question || "").replace(/```/g, "'''");
  const slug = `demanda-${row.id}`;
  const golden = {
    id: slug,
    level: 2,
    tier: 2,
    intent_esperado: classification.intent || "dato_simple",
    fuente_esperada: route.pipeline ? "db" : "no_disponible",
    category: "demanda",
    route: row.decision === "new_document" ? "rag" : "tool",
    question,
    expected: {
      tools_any: ["<tool_a_definir>"],
      reply_must_not_contain: ["no puedo responder"],
    },
    notes: `Generado desde la demanda ${row.id}.`,
  };

  const lines = [
    `# Demanda: ${question}`,
    "",
    "## Datos del registro",
    "",
    `- **ID:** ${row.id}`,
    `- **Ocurrencias:** ${row.occurrences ?? 1}`,
    `- **Primera vez:** ${briefDate(row.first_seen_at)}`,
    `- **Última vez:** ${briefDate(row.last_seen_at)}`,
    `- **Estado:** ${row.status || "pending"}`,
    `- **Prioridad:** ${row.priority || "sin definir"}`,
    `- **Decisión:** ${row.decision || "sin definir"}`,
    `- **Sprint destino:** ${row.sprint_target || "sin definir"}`,
    `- **Razón:** ${row.reason || "unknown"}${
      row.reason_detail ? ` — ${row.reason_detail}` : ""
    }`,
    `- **Intent:** ${classification.intent || "—"}`,
    `- **Pipeline:** ${classification.pipeline || route.pipeline || "—"}`,
    `- **Confianza:** ${classification.confidence ?? "—"}`,
    "",
    "## Pregunta",
    "",
    question,
    "",
    "## Ruta y contexto técnico",
    "",
    "```json",
    JSON.stringify({ classification, route }, null, 2),
    "```",
    "",
    "## Propuesta de herramienta",
    "",
    "1. Revisar si una tool existente cubre la pregunta con otra capa o filtro.",
    "2. Si no, definir la RPC tipada (SQL/PostGIS) y su contrato de parámetros.",
    "3. Crear la tool en `server/chat/tools/` y registrarla en `index.js`.",
    "4. Agregar el caso al golden set y documentar la ruta en el prompt.",
    "5. Probar el caso con `npm run eval:chat -- --id " + slug + "`.",
    "",
    "## Criterios de aceptación",
    "",
    "- La pregunta se responde con datos reales y evidencia.",
    "- Si no hay datos, el chat se abstiene con el motivo.",
    "- El caso del golden set pasa y no degrada otras rutas.",
    "",
    "## Caso de golden set propuesto",
    "",
    "```json",
    JSON.stringify(golden, null, 2),
    "```",
    "",
    "## Notas de triage",
    "",
    row.notes || "—",
    "",
    "---",
    "",
    "_Brief generado por el panel admin. El panel no crea tools; la"
      + " implementación se hace en el sprint indicado._",
    "",
  ];

  return { filename: `${slug}.md`, markdown: lines.join("\n") };
}

/**
 * GET /api/admin/unanswered/brief?id=
 */
export async function handleAdminUnansweredBrief(
  ctx,
  { getDB = defaultGetDB } = {}
) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;

  const id = text(ctx.query?.id, 40);
  if (!UUID_RE.test(id)) return noStore(400, { error: "Id inválido." });

  const { db, error } = await dbOrError(getDB);
  if (error) return error;

  try {
    const rows = await db.query(
      `SELECT id, question, occurrences, first_seen_at, last_seen_at,
              reason, reason_detail, status, priority, decision, sprint_target,
              notes, classification, route
         FROM admin.unanswered_questions
        WHERE id = $1`,
      [id]
    );
    const row = rows[0];
    if (!row) return noStore(404, { error: "Pregunta no encontrada." });

    return noStore(200, buildUnansweredBrief(row));
  } catch (err) {
    console.error("[admin:demand] error generando brief:", err?.message || err);
    return noStore(503, { error: "No se pudo generar el brief." });
  }
}
