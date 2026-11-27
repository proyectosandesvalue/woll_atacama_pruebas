/**
 * Adapter de Vercel para GET /api/chat/info.
 *
 * La demo/staging usa Functions; producción usa el router Node persistente.
 * El handler puro es el mismo en ambos entornos.
 */

import { handleChatInfo } from "../server/handlers/chat-info.js";
import { applyCors } from "../server/utils/cors.js";

export default async function handler(req, res) {
  applyCors(req, res, { methods: "GET, OPTIONS", headers: "Content-Type" });

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const result = await handleChatInfo(undefined, { env: process.env });

  for (const [key, value] of Object.entries(result.headers || {})) {
    res.setHeader(key, value);
  }
  res.setHeader("Access-Control-Expose-Headers", "Cache-Control");

  return res.status(result.status).json(result.body);
}
