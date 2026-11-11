/**
 * Adapter delgado para las Vercel Functions que solo delegan en un handler
 * puro de `server/handlers/`.
 *
 * Mantiene la demo Vercel operativa sin duplicar la lógica de estaciones o
 * ARClim. El servidor Node del VPS usa las mismas funciones desde
 * `server/routes/`.
 */

import { applyCors } from "../utils/cors.js";

/**
 * @param {object} req
 * @param {object} res
 * @param {(query: Record<string, unknown>) => Promise<{status:number, body:unknown, headers?: Record<string,string>}>} handler
 * @param {{methods?: string, headers?: string}} [opts]
 */
export async function respondWithHandler(req, res, handler, opts = {}) {
  const { methods = "GET, OPTIONS", headers = "Content-Type" } = opts;
  applyCors(req, res, { methods, headers });

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const allowed = methods
    .split(",")
    .map((method) => method.trim())
    .filter(Boolean);

  if (!allowed.includes(req.method)) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const result = await handler(req.query || {});
    res.status(result.status);
    for (const [name, value] of Object.entries(result.headers || {})) {
      res.setHeader(name, value);
    }

    if (Buffer.isBuffer(result.body)) {
      return res.send(result.body);
    }
    return res.json(result.body);
  } catch (err) {
    console.error("[api] error no controlado:", err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Error interno" });
    }
    return res.end();
  }
}
