/**
 * Ruta POST /api/chat.
 *
 * El handler puro recibe el body ya parseado y el contexto de IP/país.
 */

import { handleChat } from "../handlers/chat.js";

export const chatRoute = {
  method: "POST",
  path: "/api/chat",
  body: "json",
  bodyLimit: 1_000_000,
  cors: { headers: "Content-Type" },
  handler: async (ctx) =>
    handleChat(ctx.body, {
      ip: ctx.ip,
      country: ctx.country,
    }),
};
