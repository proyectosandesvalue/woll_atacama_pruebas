/**
 * Endpoint público del chat IA.
 *
 * Adapter de Vercel: CORS, método HTTP y delegación a `handleChat()`.
 *
 * Compatible con Vercel Functions.
 */

import { handleChat } from "../server/handlers/chat.js";
import {
  getCountryFromRequest,
  getIpFromRequest,
} from "../server/chat/geo-filter.js";
import { applyCors } from "../server/utils/cors.js";

export default async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────
  applyCors(req, res, { methods: "POST, OPTIONS", headers: "Content-Type" });

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── Calcular IP y país ────────────────────────────────────
  const ip = getIpFromRequest(req);
  const country = getCountryFromRequest(req);

    // ── Delegar al handler puro ──────────────────────────────
  const result = await handleChat(req.body || {}, { ip, country });

  if (result.headers) {
    for (const [key, value] of Object.entries(result.headers)) {
      res.setHeader(key, value);
    }
  }

  // Si hay errorId, agregarlo al log del adapter (correlación).
  if (result.body?.errorId) {
    console.warn(
      `[/api/chat] request falló con errorId=${result.body.errorId}`
    );
  }

  return res.status(result.status).json(result.body);
}