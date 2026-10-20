/**
 * Handler puro del chat IA.
 *
 * Contiene el pipeline completo (excepto CORS y método HTTP, que son
 * responsabilidad del adapter de Vercel):
 *   1. Validar input (text + history) → 400 si falla.
 *   2. Detectar IP y país → 403 si no hay IP.
 *   3. Aplicar rate limit (LATAM o estricto) → 429 si excede.
 *   4. Filtro de scope determinístico → 403 si bloquea.
 *   5. Clasificador de dominio LLM → 403 si bloquea.
 *   6. Delegar al orquestador → 200.
 *
 * `handleChat(body, ctx)` devuelve `{ status, body }` para que el
 * adapter (Vercel, runner del golden set, servidor Node) lo use.
 *
 * `ctx` debe tener `{ ip, country }` (calculados por el adapter).
 * Opcionalmente `ctx.skipRateLimit` (para tests internos) y
 * `ctx.includeTrace` (para que el golden set verifique tools).
 */

import { runOrchestrator } from "../chat/orchestrator.js";
import { validateChatInput } from "../chat/input-validator.js";
import { checkRateLimit } from "../chat/rate-limiter.js";
import { isLatam } from "../chat/geo-filter.js";
import { scopeFilter } from "../chat/scope-filter.js";
import { classifyDomain } from "../chat/domain-classifier.js";

// ── Límites ──────────────────────────────────────────────────────
const LATAM_LIMIT = { perMinute: 20, perBurst: 5 };
const NON_LATAM_LIMIT = { perMinute: 3, perBurst: 1 };

// ── Mensajes estándar ────────────────────────────────────────────
const MSG_OUT_OF_SCOPE =
  "No puedo responder esa pregunta. Soy un asistente especializado " +
  "en el Visor Territorial de Atacama y solo puedo ayudarte con " +
  "consultas sobre los datos geoespaciales del portal.";

/**
 * Ejecuta el pipeline completo del chat.
 *
 * @param {object} body - Body de la petición `{ text, history, sessionId }`.
 * @param {object} ctx - Contexto `{ ip, country, skipRateLimit?, includeTrace? }`.
 * @returns {Promise<{status: number, body: object, headers?: object}>}
 */
export async function handleChat(body, ctx = {}) {
  try {
    // ── Paso 1: validar input ─────────────────────────────────
    const validation = validateChatInput(body);
    if (!validation.ok) {
      return { status: 400, body: { error: validation.error } };
    }

    const { text, history, sessionId } = validation;

    // ── Paso 2: detectar IP y país ────────────────────────────
    const ip = ctx.ip;
    const country = ctx.country;

    if (!ip) {
      return {
        status: 403,
        body: {
          error:
            "No se pudo identificar tu conexión. Verifica que no estés " +
            "usando un proxy que oculte tu IP.",
        },
      };
    }

    // ── Paso 3: rate limiting (saltable para tests internos) ──
    if (!ctx.skipRateLimit) {
      const limits = isLatam(country) ? LATAM_LIMIT : NON_LATAM_LIMIT;
      const rate = checkRateLimit(ip, limits.perMinute, limits.perBurst);

      if (!rate.ok) {
        return {
          status: 429,
          body: {
            error: `Demasiadas solicitudes. Intenta de nuevo en ${rate.retryAfterSeconds} segundos.`,
          },
          headers: { "Retry-After": String(rate.retryAfterSeconds) },
        };
      }
    }

    // ── Paso 4: scope filter (capa 1, rápida) ─────────────────
    const scope = scopeFilter(text);
    if (scope.blocked) {
      return { status: 403, body: { error: MSG_OUT_OF_SCOPE } };
    }

    // ── Paso 5: domain classifier (capa 2, LLM) ───────────────
    const domain = await classifyDomain(text, sessionId);
    if (domain === "OUT") {
      return { status: 403, body: { error: MSG_OUT_OF_SCOPE } };
    }

    // ── Paso 6: orquestador ───────────────────────────────────
    const payload = await runOrchestrator({ text, history, sessionId });
    const charts = Array.isArray(payload?.charts) ? payload.charts : [];
    const normalized = {
      reply: payload?.reply || "Sin respuesta.",
      notice: payload?.notice ?? null,
      geojson: payload?.geojson ?? null,
      geojson_meta: payload?.geojson_meta ?? null,
      geojson_layers: Array.isArray(payload?.geojson_layers)
        ? payload.geojson_layers
        : [],
      chart: charts.length === 1 ? charts[0] : null,
      charts,
    };

    // Solo en modo local (golden set), incluir trace para verificar tools.
    if (ctx.includeTrace) {
      normalized.trace = payload?.trace || [];
    }

    return { status: 200, body: normalized };

  } catch (err) {
    const errInfo = {
      message: err?.message || String(err),
      name: err?.name || "Error",
      stack: err?.stack
        ? String(err.stack).split("\n").slice(0, 3).join(" | ")
        : "",
    };
    console.error("[/api/chat] ERROR:", JSON.stringify(errInfo));

    const isConfigError =
      typeof err?.message === "string" &&
      err.message.includes("Variable de entorno");
    const status = isConfigError ? 503 : 500;
    return { status, body: { error: errInfo.message } };
  }
}