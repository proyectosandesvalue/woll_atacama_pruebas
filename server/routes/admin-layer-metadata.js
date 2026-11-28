/**
 * Rutas del editor de metadatos de capas (Sprint 47-E).
 */

import {
  handleLayerMetadataGet,
  handleLayerMetadataSave,
} from "../handlers/admin-layer-metadata.js";

const jsonBody = { body: "json", bodyLimit: 20_000 };

export const adminLayerMetadataRoutes = [
  {
    method: "GET",
    path: "/api/admin/layer-metadata",
    handler: (ctx) => handleLayerMetadataGet(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "PUT",
    path: "/api/admin/layer-metadata",
    ...jsonBody,
    handler: (ctx) => handleLayerMetadataSave(ctx, { getDB: ctx.getDB }),
  },
];
