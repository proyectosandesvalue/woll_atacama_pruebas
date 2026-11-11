#!/usr/bin/env node
/**
 * Servidor Node persistente del VPS.
 *
 * Monta `createApp()` y gestiona el ciclo de vida: timeouts, cierre ordenado y
 * cierre del pool de PostgreSQL. Los estáticos los sirve Nginx (26-D); este
 * proceso solo atiende `/api/*`, `/healthz` y `/readyz`.
 */

import http from "node:http";

import { createApp } from "./app.js";
import { closeDB } from "./db/pool.js";

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";
const app = createApp();

const server = http.createServer(app);

// El chat tiene su propio budget (20 s); el proxy 25 s. Este límite es la red
// de seguridad para requests colgados.
server.requestTimeout = 120_000;
server.headersTimeout = 65_000;
server.keepAliveTimeout = 65_000;

server.on("clientError", (err, socket) => {
  if (socket.writable) {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  }
});

server.on("error", (err) => {
  console.error("[api] error del servidor:", err?.message || err);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  console.log(`[api] escuchando en http://${host}:${actualPort}`);
});

let shuttingDown = false;

/**
 * @param {string} signal
 */
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[api] ${signal}: cerrando servidor...`);

  const force = setTimeout(() => {
    console.error("[api] cierre forzado después de 10 s");
    process.exit(1);
  }, 10_000);
  force.unref();

  server.close(async () => {
    try {
      await closeDB();
    } catch (err) {
      console.error("[api] error cerrando la BD:", err?.message || err);
    } finally {
      clearTimeout(force);
      process.exit(0);
    }
  });

  // No aceptar conexiones nuevas y cortar las idle.
  server.closeIdleConnections?.();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (err) => {
  console.error("[api] unhandledRejection:", err?.message || err);
});
