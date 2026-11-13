/**
 * Rutas de capas desde PostGIS (Sprint 08-B/08-D).
 */

import { handleLayerExport } from "../handlers/layer-export.js";
import { handleLayerFeature, handleLayerFeatures } from "../handlers/layer-features.js";

export const layerRoutes = [
  {
    method: "GET",
    path: "/api/layer-features",
    cors: { headers: "Content-Type" },
    handler: async (ctx) => handleLayerFeatures(ctx.query, { getDB: ctx.getDB }),
  },
  {
    method: "GET",
    path: "/api/layer-feature",
    cors: { headers: "Content-Type" },
    handler: async (ctx) => handleLayerFeature(ctx.query, { getDB: ctx.getDB }),
  },
  {
    method: "GET",
    path: "/api/layer-export",
    cors: { headers: "Content-Type" },
    exposeHeaders: "Content-Disposition",
    handler: async (ctx) => handleLayerExport(ctx.query, { getDB: ctx.getDB }),
  },
];
