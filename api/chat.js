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

const DEFAULT_ALLOWED_ORIGINS = [
  "https://wollatacamapruebas.vercel.app",
  "https://wollatacama.vercel.app",
  "http://localhost:8099",
  "http://localhost:3000",
];

function getAllowedOrigins() {
  const env = process.env.ALLOWED_ORIGINS;
  if (typeof env === "string" && env.length > 0) {
    return env
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return DEFAULT_ALLOWED_ORIGINS;
}

function getOriginHeader(req) {
  const origin = req?.headers?.origin;
  if (typeof origin !== "string" || origin.length === 0) return null;
  const allowed = getAllowedOrigins();
  return allowed.includes(origin) ? origin : null;
}

export default async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────
  const allowedOrigin = getOriginHeader(req);
  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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

  return res.status(result.status).json(result.body);
}