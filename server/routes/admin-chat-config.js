/**
 * Rutas de configuración del chat (Sprint 48).
 */

import {
  handleChatTools,
  handleGoldenDelete,
  handleGoldenGet,
  handleGoldenSave,
  handleMessageDelete,
  handleMessageSave,
  handlePromptActivate,
  handlePromptCreate,
  handlePromptDelete,
  handleSettingDelete,
  handleSettingSave,
  handleUnavailableDelete,
  handleUnavailableSave,
} from "../handlers/admin-chat-config.js";

const jsonBody = { body: "json", bodyLimit: 250_000 };

export const adminChatConfigRoutes = [
  { method: "GET", path: "/api/admin/chat/tools", handler: (ctx) => handleChatTools(ctx) },
  {
    method: "POST",
    path: "/api/admin/prompts",
    ...jsonBody,
    handler: (ctx) => handlePromptCreate(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "POST",
    path: "/api/admin/prompts/activate",
    ...jsonBody,
    handler: (ctx) => handlePromptActivate(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "DELETE",
    path: "/api/admin/prompts",
    handler: (ctx) => handlePromptDelete(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "PUT",
    path: "/api/admin/settings",
    ...jsonBody,
    handler: (ctx) => handleSettingSave(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "DELETE",
    path: "/api/admin/settings",
    handler: (ctx) => handleSettingDelete(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "PUT",
    path: "/api/admin/messages",
    ...jsonBody,
    handler: (ctx) => handleMessageSave(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "DELETE",
    path: "/api/admin/messages",
    handler: (ctx) => handleMessageDelete(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "PUT",
    path: "/api/admin/unavailable",
    ...jsonBody,
    handler: (ctx) => handleUnavailableSave(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "DELETE",
    path: "/api/admin/unavailable",
    handler: (ctx) => handleUnavailableDelete(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "GET",
    path: "/api/admin/golden",
    handler: (ctx) => handleGoldenGet(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "PUT",
    path: "/api/admin/golden",
    ...jsonBody,
    handler: (ctx) => handleGoldenSave(ctx, { getDB: ctx.getDB }),
  },
  {
    method: "DELETE",
    path: "/api/admin/golden",
    handler: (ctx) => handleGoldenDelete(ctx, { getDB: ctx.getDB }),
  },
];
