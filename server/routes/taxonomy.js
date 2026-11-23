/**
 * Ruta de taxonomía nativa (Sprint 46-C).
 */

import { handleTaxonomy } from "../handlers/taxonomy.js";

export const taxonomyRoutes = [
  {
    method: "GET",
    path: "/api/taxonomy",
    cors: { headers: "Content-Type" },
    exposeHeaders: "ETag, Cache-Control, Retry-After",
    handler: (ctx) => handleTaxonomy(ctx, { getDB: ctx.getDB }),
  },
];
