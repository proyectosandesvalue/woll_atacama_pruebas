/**
 * Rutas de estadísticas de rásteres precalculados (Sprint 49).
 */

import { handleRasterStats } from "../handlers/raster-stats.js";

export const rasterRoutes = [
  {
    method: "GET",
    path: "/api/raster-stats",
    cors: { headers: "Content-Type" },
    handler: async (ctx) => handleRasterStats(ctx.query, { getDB: ctx.getDB }),
  },
];
