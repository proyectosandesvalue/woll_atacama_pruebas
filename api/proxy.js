/**
 * Proxy cerrado para servicios geoespaciales externos.
 *
 * Uso:
 *   GET /api/proxy?source=copernicus-wms&REQUEST=GetMap&...
 *   GET /api/proxy?source=copernicus-wfs&REQUEST=GetFeature&...
 *   GET /api/proxy?source=copernicus-wmts&REQUEST=GetTile&...
 *   GET /api/proxy?source=worldview-snapshot&REQUEST=GetSnapshot&...
 *
 * El INSTANCE_ID de Copernicus se inyecta en el servidor; nunca viaja
 * desde el navegador. Ver server/proxy/services.js.
 */

import { handleProxy } from "../server/proxy/handler.js";
import { getClientIp } from "../server/utils/request.js";
import { applyCors } from "../server/utils/cors.js";

export default async function handler(req, res) {
  applyCors(req, res, {
    methods: "GET, OPTIONS",
    headers: "Content-Type, Accept",
    env: process.env,
  });

  res.setHeader("Access-Control-Expose-Headers", "Content-Length, Data-Present, Acquisition-Time, X-Proxy-Cache");
  res.setHeader("Referrer-Policy", "no-referrer");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    const result = await handleProxy(
      {
        query: req.query || {},
        ip: getClientIp(req),
        method: req.method,
      },
      { env: process.env }
    );

    res.status(result.status);
    for (const [name, value] of Object.entries(result.headers || {})) {
      res.setHeader(name, value);
    }
    return res.send(result.body);
  } catch (err) {
    console.error("[proxy] error no controlado:", err?.message || "desconocido");
    return res.status(500).json({
      ok: false,
      code: "INTERNAL_ERROR",
      error: "Error interno del proxy.",
    });
  }
}
