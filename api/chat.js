/**
 * Endpoint público del chat IA.
 *
 * Pipeline:
 *   1. CORS + método.
 *   2. Validar input (text + history) → 400 si falla.
 *   3. Detectar IP y país → 403 si no hay IP.
 *   4. Aplicar rate limit (LATAM o estricto) → 429 si excede.
 *   5. Filtro de scope determinístico → 403 si bloquea.
 *   6. Clasificador de dominio LLM → 403 si bloquea.
 *   7. Delegar al orquestador → 200.
 *
 * Compatible con Vercel Functions.
 */

import { runOrchestrator } from "../server/chat/orchestrator.js";
import { validateChatInput } from "../server/chat/input-validator.js";
import { checkRateLimit } from "../server/chat/rate-limiter.js";
import {
  isLatam,
  getCountryFromRequest,
  getIpFromRequest,
} from "../server/chat/geo-filter.js";
import { scopeFilter } from "../server/chat/scope-filter.js";
import { classifyDomain } from "../server/chat/domain-classifier.js";

// ── Límites ──────────────────────────────────────────────────────
const LATAM_LIMIT = { perMinute: 20, perBurst: 5 };
const NON_LATAM_LIMIT = { perMinute: 3, perBurst: 1 };

// ── Mensajes estándar ────────────────────────────────────────────
const MSG_OUT_OF_SCOPE =
  "No puedo responder esa pregunta. Soy un asistente especializado " +
  "en el Visor Territorial de Atacama y solo puedo ayudarte con " +
  "consultas sobre los datos geoespaciales del portal.";

export default async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // ── Paso 1: validar input ─────────────────────────────────
    const body = req.body || {};
    const validation = validateChatInput(body);

    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    const { text, history, sessionId } = validation;

    // ── Paso 2: detectar IP y país ────────────────────────────
    const ip = getIpFromRequest(req);
    const country = getCountryFromRequest(req);

    // Si no hay IP, no podemos identificar al usuario → rechazar.
    // (Podés cambiar esto a fail-open si preferís no bloquear en dev.)
    if (!ip) {
      return res.status(403).json({
        error:
          "No se pudo identificar tu conexión. Verifica que no estés " +
          "usando un proxy que oculte tu IP.",
      });
    }

    // ── Paso 3: rate limiting ─────────────────────────────────
    const limits = isLatam(country) ? LATAM_LIMIT : NON_LATAM_LIMIT;
    const rate = checkRateLimit(ip, limits.perMinute, limits.perBurst);

    if (!rate.ok) {
      res.setHeader("Retry-After", String(rate.retryAfterSeconds));
      return res.status(429).json({
        error: `Demasiadas solicitudes. Intenta de nuevo en ${rate.retryAfterSeconds} segundos.`,
      });
    }

    // ── Paso 4: scope filter (capa 1, rápida) ─────────────────
    const scope = scopeFilter(text);
    if (scope.blocked) {
      return res.status(403).json({ error: MSG_OUT_OF_SCOPE });
    }

    // ── Paso 5: domain classifier (capa 2, LLM) ───────────────
    const domain = await classifyDomain(text, sessionId);
    if (domain === "OUT") {
      return res.status(403).json({ error: MSG_OUT_OF_SCOPE });
    }

    // ── Paso 6: orquestador ───────────────────────────────────
    const payload = await runOrchestrator({ text, history, sessionId });
    const charts = Array.isArray(payload?.charts) ? payload.charts : [];
    const normalized = {
      reply: payload?.reply || "Sin respuesta.",
      geojson: payload?.geojson ?? null,
      chart: charts.length === 1 ? charts[0] : null,
      charts,
    };

    return res.status(200).json(normalized);
  } catch (err) {
  const errInfo = {
    message: err?.message || String(err),
    name: err?.name || "Error",
    stack: err?.stack ? String(err.stack).split("\n").slice(0, 3).join(" | ") : "",
  };
  console.error("[/api/chat] ERROR:", JSON.stringify(errInfo));

  const isConfigError =
    typeof err?.message === "string" &&
    err.message.includes("Variable de entorno");
  const status = isConfigError ? 503 : 500;
  return res.status(status).json({
    error: errInfo.message,
  });
}
}