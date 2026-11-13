/**
 * Rutas de capas desde PostGIS (Sprint 08-B/08-D).
 */

import { handleLayerFeatures } from "../handlers/layer-features.js";

export const layerRoutes = [
  {
    method: "GET",
    path: "/api/layer-features",
    cors: { headers: "Content-Type" },
    handler: async (ctx) => handleLayerFeatures(ctx.query, { getDB: ctx.getDB }),
  },
];
