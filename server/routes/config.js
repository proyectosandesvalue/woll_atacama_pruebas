/**
 * Rutas de configuración del visor (Sprint 14).
 */

import { handleConfig } from "../handlers/config.js";

export const configRoutes = [
  {
    method: "GET",
    path: "/api/config",
    cors: { headers: "Content-Type" },
    exposeHeaders: "ETag, Cache-Control, Retry-After",
    handler: (ctx) => handleConfig(ctx, { getDB: ctx.getDB }),
  },
];
