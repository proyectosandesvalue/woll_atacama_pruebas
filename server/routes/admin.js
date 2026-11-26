/**
 * Rutas del panel admin (Sprint 15).
 *
 * No se anuncian por CORS: el panel vive en el mismo origen. Los endpoints
 * de lectura exigen sesión; login/logout son los únicos POST.
 */

import {
  handleAdminAudit,
  handleAdminConfig,
  handleAdminLogin,
  handleAdminLoginVerify,
  handleAdminLogout,
  handleAdminMessages,
  handleAdminPrompts,
  handleAdminSession,
  handleAdminSettings,
  handleAdminUnavailable,
} from "../handlers/admin.js";
import {
  handlePasswordForgot,
  handlePasswordReset,
} from "../handlers/admin-password.js";
import { handleAdminFeedback } from "../handlers/feedback.js";

const jsonBody = { body: "json", bodyLimit: 10_000 };

export const adminRoutes = [
  {
    method: "POST",
    path: "/api/admin/login",
    ...jsonBody,
    handler: (ctx) => handleAdminLogin(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "POST",
    path: "/api/admin/password/forgot",
    ...jsonBody,
    handler: (ctx) => handlePasswordForgot(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "POST",
    path: "/api/admin/password/reset",
    ...jsonBody,
    handler: (ctx) => handlePasswordReset(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "POST",
    path: "/api/admin/login/verify",
    ...jsonBody,
    handler: (ctx) => handleAdminLoginVerify(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "POST",
    path: "/api/admin/logout",
    ...jsonBody,
    handler: (ctx) => handleAdminLogout(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "GET",
    path: "/api/admin/session",
    handler: (ctx) => handleAdminSession(ctx),
  },
  {
    method: "GET",
    path: "/api/admin/config",
    handler: (ctx) => handleAdminConfig(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "GET",
    path: "/api/admin/prompts",
    handler: (ctx) => handleAdminPrompts(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "GET",
    path: "/api/admin/settings",
    handler: (ctx) => handleAdminSettings(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "GET",
    path: "/api/admin/messages",
    handler: (ctx) => handleAdminMessages(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "GET",
    path: "/api/admin/unavailable",
    handler: (ctx) => handleAdminUnavailable(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "GET",
    path: "/api/admin/feedback",
    handler: (ctx) => handleAdminFeedback(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "GET",
    path: "/api/admin/audit",
    handler: (ctx) => handleAdminAudit(ctx, { getDB: ctx.getDB }),
  },
];
