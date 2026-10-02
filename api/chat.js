/**
 * Endpoint público del chat IA.
 *
 * Recibe {text, history} del frontend y devuelve {reply, chart, geojson}.
 * Esta Function es DELGADA: delega toda la lógica al orquestador.
 *
 * Variables de entorno requeridas:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   LLM_BASE_URL, LLM_MODEL, LLM_API_KEY
 *
 * Compatible con Vercel Functions.
 */

import { runOrchestrator } from "../server/chat/orchestrator.js";

const MAX_HISTORY_ITEMS = 20;

export default async function handler(req, res) {
  // CORS (la función se sirve en /api/chat; misma origin en Vercel)
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
    const body = req.body || {};
    const text = typeof body.text === "string" ? body.text : "";
    const history = Array.isArray(body.history)
      ? body.history.slice(-MAX_HISTORY_ITEMS)
      : [];

    if (!text.trim()) {
      return res.status(400).json({ error: "Falta el campo 'text'." });
    }

    const payload = await runOrchestrator({ text, history });

    return res.status(200).json(payload);
  } catch (err) {
    console.error("[/api/chat] error:", err);
    // Distinguimos config faltante (503) de error genérico (500).
    const isConfigError =
      typeof err?.message === "string" &&
      err.message.includes("Variable de entorno");
    const status = isConfigError ? 503 : 500;
    return res.status(status).json({
      error: err?.message || "Error interno del chat.",
    });
  }
}