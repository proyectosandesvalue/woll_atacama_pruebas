/**
 * Rutas de la cola de demanda (Sprint 50).
 */

import {
  handleAdminUnansweredBrief,
  handleAdminUnansweredList,
  handleAdminUnansweredStats,
  handleAdminUnansweredUpdate,
} from "../handlers/admin-unanswered.js";

const jsonBody = { body: "json", bodyLimit: 25_000 };

export const adminUnansweredRoutes = [
  {
    method: "GET",
    path: "/api/admin/unanswered",
    handler: (ctx) => handleAdminUnansweredList(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "GET",
    path: "/api/admin/unanswered/stats",
    handler: (ctx) => handleAdminUnansweredStats(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "GET",
    path: "/api/admin/unanswered/brief",
    handler: (ctx) => handleAdminUnansweredBrief(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "PUT",
    path: "/api/admin/unanswered",
    ...jsonBody,
    handler: (ctx) => handleAdminUnansweredUpdate(ctx, { getDB: ctx.getDB }),
  },
];
