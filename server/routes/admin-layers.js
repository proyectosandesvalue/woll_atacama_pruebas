/**
 * Rutas del gestor de capas (Sprint 47).
 */

import {
  handleLayerArchive,
  handleLayerJobCancel,
  handleLayerJobsGet,
  handleLayerQueue,
  handleLayerSave,
  handleLayerUpload,
  handleLayersGet,
} from "../handlers/admin-layers.js";

const jsonBody = { body: "json", bodyLimit: 250_000 };

export const adminLayerRoutes = [
  {
    method: "GET",
    path: "/api/admin/layers",
    handler: (ctx) => handleLayersGet(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "POST",
    path: "/api/admin/layers",
    ...jsonBody,
    handler: (ctx) => handleLayerSave(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "PUT",
    path: "/api/admin/layers",
    ...jsonBody,
    handler: (ctx) => handleLayerSave(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "DELETE",
    path: "/api/admin/layers",
    handler: (ctx) => handleLayerArchive(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "POST",
    path: "/api/admin/layers/upload",
    handler: (ctx) => handleLayerUpload(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "POST",
    path: "/api/admin/layers/jobs",
    ...jsonBody,
    handler: (ctx) => handleLayerQueue(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "GET",
    path: "/api/admin/layers/jobs",
    handler: (ctx) => handleLayerJobsGet(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "POST",
    path: "/api/admin/layers/jobs/cancel",
    ...jsonBody,
    handler: (ctx) => handleLayerJobCancel(ctx, { getDB: ctx.getDB }),
  },
];
