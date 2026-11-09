/**
 * Proxy persistente para desarrollo local.
 *
 * `vercel dev` ejecuta una Function por cada tile, lo que satura el proceso
 * cuando hay varias capas Sentinel. Este servidor mantiene el proxy en un
 * único proceso Node, reutiliza conexiones y evita ese cuello de botella.
 *
 * Uso:
 *   node --env-file=.env.staging scripts/dev-proxy.mjs
 *   npm run dev:proxy
 *
 * El frontend local (localhost:3000 o localhost:8099) apunta a
 * http://localhost:3001/api/proxy automáticamente.
 */

import http from "node:http";

import { handleProxy } from "../server/proxy/handler.js";
import { getClientIp } from "../server/utils/request.js";
import { getOriginHeader } from "../server/utils/cors.js";

const port = Number(process.env.PROXY_PORT || 3001);
const maxConcurrent = Math.max(1, Number(process.env.PROXY_DEV_CONCURRENCY || 6));
let active = 0;
const waiters = [];

async function acquireSlot() {
  if (active < maxConcurrent) {
    active += 1;
    return;
  }
  await new Promise((resolve) => waiters.push(resolve));
  active += 1;
}

function releaseSlot() {
  active = Math.max(0, active - 1);
  const next = waiters.shift();
  if (next) next();
}

function setCors(req, res) {
  const origin = getOriginHeader({ headers: req.headers });
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Content-Length, Data-Present, Acquisition-Time, X-Proxy-Cache"
  );
  res.setHeader("Referrer-Policy", "no-referrer");
}

const server = http.createServer(async (req, res) => {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, code: "METHOD_NOT_ALLOWED", error: "Solo GET." }));
    return;
  }

  try {
    const url = new URL(req.url || "/", "http://localhost");
    const query = Object.fromEntries(url.searchParams);

    await acquireSlot();
    let result;
    try {
      result = await handleProxy(
        {
          query,
          ip: getClientIp({ headers: req.headers }),
          method: req.method,
        },
        { env: process.env }
      );
    } finally {
      releaseSlot();
    }

    res.writeHead(result.status, result.headers || {});
    res.end(result.body);
  } catch (err) {
    console.error("[dev-proxy] error no controlado:", err?.message || "desconocido");
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, code: "INTERNAL_ERROR", error: "Error interno." }));
  }
});

server.listen(port, () => {
  console.log(`[dev-proxy] escuchando en http://localhost:${port}/api/proxy`);
  if (!process.env.COPERNICUS_INSTANCE_ID && !process.env.INSTANCE_ID) {
    console.warn("[dev-proxy] falta COPERNICUS_INSTANCE_ID o INSTANCE_ID en el entorno.");
  }
});
