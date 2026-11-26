/**
 * Ruta POST /api/chat.
 *
 * El handler puro recibe el body ya parseado y el contexto de IP/país.
 */

import { handleChat } from "../handlers/chat.js";
import { handleChatFeedback } from "../handlers/feedback.js";

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


export const feedbackRoute = {
  method: "POST",
  path: "/api/chat/feedback",
  body: "json",
  bodyLimit: 2_000,
  cors: { headers: "Content-Type" },
  handler: async (ctx) =>
    handleChatFeedback(
      { body: ctx.body, ip: ctx.ip },
      { getDB: ctx.getDB }
    ),
};
