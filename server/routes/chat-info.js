/**
 * Ruta GET /api/chat/info.
 *
 * Aviso público del proveedor LLM para el modal de información del chat.
 * No consulta la base de datos ni el proveedor; solo lee variables de entorno
 * no secretas.
 */

import { handleChatInfo } from "../handlers/chat-info.js";

export const chatInfoRoute = {
  method: "GET",
  path: "/api/chat/info",
  cors: { headers: "Content-Type" },
  exposeHeaders: "Cache-Control",
  handler: (ctx) => handleChatInfo(undefined, { env: ctx.env }),
};
