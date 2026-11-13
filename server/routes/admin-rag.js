/**
 * Rutas del panel para RAG (Sprint 45-A).
 */

import {
  handleRagChunks,
  handleRagJobCancel,
  handleRagJobsGet,
  handleRagManifestDelete,
  handleRagManifestSave,
  handleRagOverview,
  handleRagQueue,
  handleRagUpload,
} from "../handlers/admin-rag.js";

const jsonBody = { body: "json", bodyLimit: 20_000 };

export const adminRagRoutes = [
  {
    method: "GET",
    path: "/api/admin/rag/overview",
    handler: (ctx) => handleRagOverview(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "POST",
    path: "/api/admin/rag/upload",
    handler: (ctx) => handleRagUpload(ctx),
  },
  {
    method: "POST",
    path: "/api/admin/rag/manifest",
    ...jsonBody,
    handler: (ctx) => handleRagManifestSave(ctx),
  },
  {
    method: "DELETE",
    path: "/api/admin/rag/manifest",
    handler: (ctx) => handleRagManifestDelete(ctx),
  },
  {
    method: "POST",
    path: "/api/admin/rag/jobs",
    ...jsonBody,
    handler: (ctx) => handleRagQueue(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "GET",
    path: "/api/admin/rag/jobs",
    handler: (ctx) => handleRagJobsGet(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "POST",
    path: "/api/admin/rag/jobs/cancel",
    ...jsonBody,
    handler: (ctx) => handleRagJobCancel(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "GET",
    path: "/api/admin/rag/chunks",
    handler: (ctx) => handleRagChunks(ctx, { getDB: ctx.getDB }),
  },
];
