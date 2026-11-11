/**
 * Ruta GET /api/proxy.
 *
 * El handler puro devuelve `{status, headers, body}` con body binario. La ruta
 * solo agrega el contexto de query/IP/método.
 */

import { handleProxy } from "../proxy/handler.js";

export const proxyRoute = {
  method: "GET",
  path: "/api/proxy",
  cors: { headers: "Content-Type, Accept" },
  exposeHeaders:
    "Content-Length, Data-Present, Acquisition-Time, X-Proxy-Cache",
  handler: async (ctx) =>
    handleProxy(
      {
        query: ctx.query,
        ip: ctx.ip,
        method: ctx.req.method,
      },
      { env: ctx.env }
    ),
};
