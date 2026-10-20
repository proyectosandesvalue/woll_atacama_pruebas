/**
 * Endpoint público del chat IA.
 *
 * Adapter de Vercel: CORS, método HTTP y delegación a `handleChat()`.
 *
 * Compatible con Vercel Functions.
 */

import { handleChat } from "../server/handlers/chat.js";
import { getCountryFromRequest, getIpFromRequest } from "../server/chat/geo-filter.js";

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

  // ── Calcular IP y país ────────────────────────────────────────
  const ip = getIpFromRequest(req);
  const country = getCountryFromRequest(req);

  // ── Delegar al handler puro ──────────────────────────────────
  const result = await handleChat(req.body || {}, { ip, country });

  if (result.headers) {
    for (const [key, value] of Object.entries(result.headers)) {
      res.setHeader(key, value);
    }
  }

  return res.status(result.status).json(result.body);
}