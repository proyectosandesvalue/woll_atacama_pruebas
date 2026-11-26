/**
 * Valoración del chat (Sprint 31-D).
 *
 * El chat crea una fila con el contexto (ruta, tier, tools) y la valoración se
 * actualiza desde el visor. Nunca se guarda el texto de la pregunta ni de la
 * respuesta.
 */
import { getDB as defaultGetDB } from "../db/pool.js";
import { requireSession } from "./admin.js";
import { json } from "./admin.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASONS = new Set(["irrelevant", "incorrect", "incomplete", "other"]);
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 12;
const hits = new Map();

function allowFeedback(ip, now = Date.now()) {
  const key = String(ip || "unknown");
  const stamps = (hits.get(key) || []).filter((at) => now - at < RATE_WINDOW_MS);
  if (stamps.length >= RATE_MAX) return false;
  stamps.push(now);
  hits.set(key, stamps);
  return true;
}

export function _resetFeedbackLimiterForTests() {
  hits.clear();
}

/**
 * POST /api/chat/feedback
 */
export async function handleChatFeedback(ctx, { getDB = defaultGetDB } = {}) {
  const body = ctx.body || {};
  const responseId = String(body.response_id || "");
  const rating = String(body.rating || "");
  const reason = body.reason == null ? null : String(body.reason);

  if (!UUID_RE.test(responseId) || !["up", "down"].includes(rating)) {
    return { status: 400, body: { error: "Valoración inválida." } };
  }
  if (reason !== null && !REASONS.has(reason)) {
    return { status: 400, body: { error: "Motivo inválido." } };
  }
  if (!allowFeedback(ctx.ip)) {
    return { status: 429, body: { error: "Demasiadas valoraciones." } };
  }

  let db;
  try {
    db = await getDB();
  } catch {
    return { status: 503, body: { error: "Servicio no disponible." } };
  }
  if (!db || typeof db.query !== "function") {
    return { status: 503, body: { error: "Servicio no disponible." } };
  }

  try {
    await db.query(
      `UPDATE chat.feedback
          SET rating = $2,
              reason = $3,
              updated_at = now()
        WHERE response_id = $1`,
      [responseId, rating, rating === "down" ? reason : null]
    );
  } catch (err) {
    console.error("[feedback] no se pudo guardar:", err?.message || err);
    return { status: 503, body: { error: "No se pudo guardar la valoración." } };
  }

  return { status: 200, body: { ok: true } };
}

/**
 * GET /api/admin/feedback
 */
export async function handleAdminFeedback(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;

  let db;
  try {
    db = await getDB();
  } catch {
    return json(503, { error: "PostgreSQL no disponible." });
  }
  if (!db || typeof db.query !== "function") {
    return json(503, { error: "PostgreSQL no disponible." });
  }

  try {
    const totalsRows = await db.query(
      `SELECT
         count(*) FILTER (WHERE rating = 'up')::int AS up,
         count(*) FILTER (WHERE rating = 'down')::int AS down,
         count(*) FILTER (WHERE rating IS NULL)::int AS pending
       FROM chat.feedback
       WHERE created_at >= now() - interval '30 days'`
    );
    const reasonsRows = await db.query(
      `SELECT reason, count(*)::int AS count
         FROM chat.feedback
        WHERE rating = 'down' AND reason IS NOT NULL
          AND created_at >= now() - interval '30 days'
        GROUP BY reason ORDER BY count DESC`
    );
    const routesRows = await db.query(
      `SELECT coalesce(route, 'desconocida') AS route,
              count(*) FILTER (WHERE rating = 'up')::int AS up,
              count(*) FILTER (WHERE rating = 'down')::int AS down
         FROM chat.feedback
        WHERE created_at >= now() - interval '30 days'
        GROUP BY route ORDER BY route`
    );
    const rows = (value) => (Array.isArray(value) ? value : value?.rows || []);
    return json(200, {
      window_days: 30,
      totals: rows(totalsRows)[0] || { up: 0, down: 0, pending: 0 },
      reasons: rows(reasonsRows),
      routes: rows(routesRows),
    });
  } catch (err) {
    console.error("[feedback] error leyendo estadísticas:", err?.message || err);
    return json(503, { error: "No se pudieron leer las estadísticas." });
  }
}
