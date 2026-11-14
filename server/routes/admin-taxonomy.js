/**
 * Rutas del módulo de taxonomía (Sprint 46-B).
 */

import {
  handleDimensionDelete,
  handleDimensionSave,
  handleGroupDelete,
  handleGroupSave,
  handlePlacementDelete,
  handlePlacementSave,
  handleSubgroupDelete,
  handleSubgroupSave,
  handleTaxonomyGet,
  handleTaxonomyPublish,
} from "../handlers/admin-taxonomy.js";

const jsonBody = { body: "json", bodyLimit: 20_000 };

export const adminTaxonomyRoutes = [
  {
    method: "GET",
    path: "/api/admin/taxonomy",
    handler: (ctx) => handleTaxonomyGet(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "POST",
    path: "/api/admin/taxonomy/dimensions",
    ...jsonBody,
    handler: (ctx) => handleDimensionSave(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "PUT",
    path: "/api/admin/taxonomy/dimensions",
    ...jsonBody,
    handler: (ctx) => handleDimensionSave(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "DELETE",
    path: "/api/admin/taxonomy/dimensions",
    handler: (ctx) => handleDimensionDelete(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "POST",
    path: "/api/admin/taxonomy/groups",
    ...jsonBody,
    handler: (ctx) => handleGroupSave(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "PUT",
    path: "/api/admin/taxonomy/groups",
    ...jsonBody,
    handler: (ctx) => handleGroupSave(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "DELETE",
    path: "/api/admin/taxonomy/groups",
    handler: (ctx) => handleGroupDelete(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "POST",
    path: "/api/admin/taxonomy/subgroups",
    ...jsonBody,
    handler: (ctx) => handleSubgroupSave(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "PUT",
    path: "/api/admin/taxonomy/subgroups",
    ...jsonBody,
    handler: (ctx) => handleSubgroupSave(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "DELETE",
    path: "/api/admin/taxonomy/subgroups",
    handler: (ctx) => handleSubgroupDelete(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "POST",
    path: "/api/admin/taxonomy/placements",
    ...jsonBody,
    handler: (ctx) => handlePlacementSave(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "DELETE",
    path: "/api/admin/taxonomy/placements",
    handler: (ctx) => handlePlacementDelete(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "POST",
    path: "/api/admin/taxonomy/publish",
    ...jsonBody,
    handler: (ctx) => handleTaxonomyPublish(ctx),
  },
];
