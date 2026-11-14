/**
 * Rutas del gestor de APIs externas (Sprint 45-B).
 */

import {
  handleAdminApisList,
  handleAdminApisTest,
  handleAdminApisUpdate,
} from "../handlers/admin-apis.js";

export const adminApiRoutes = [
  {
    method: "GET",
    path: "/api/admin/apis",
    handler: (ctx) => handleAdminApisList(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "PUT",
    path: "/api/admin/apis",
    body: "json",
    bodyLimit: 10_000,
    handler: (ctx) => handleAdminApisUpdate(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "POST",
    path: "/api/admin/apis/test",
    body: "json",
    bodyLimit: 1_000,
    handler: (ctx) => handleAdminApisTest(ctx, { getDB: ctx.getDB }),
  },
];
