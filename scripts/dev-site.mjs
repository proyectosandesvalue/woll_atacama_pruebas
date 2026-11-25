#!/usr/bin/env node
/**
 * dev-site.mjs — Previsualización local de la portada Geodatos y el visor.
 *
 * Reproduce las rutas del VPS sin Nginx:
 *   /              -> geodatos.html
 *   /geodatos.html -> geodatos.html
 *   /visor         -> index.html (la URL se mantiene en /visor)
 *   /visor/        -> 301 a /visor
 *   /api/*         -> proxy a http://127.0.0.1:3000
 *
 * Uso:
 *   npm run dev:site
 *   PORT=8099 API_ORIGIN=http://127.0.0.1:3000 npm run dev:site
 */

import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8099);
const HOST = process.env.HOST || "127.0.0.1";
const API_ORIGIN = process.env.API_ORIGIN || "http://127.0.0.1:3000";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".geojson": "application/geo+json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mvt": "application/vnd.mapbox-vector-tile",
  ".pdf": "application/pdf",
};

function safeFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const resolved = path.resolve(ROOT, `.${decoded}`);
  if (resolved !== ROOT && !resolved.startsWith(`${ROOT}${path.sep}`)) {
    return null;
  }
  return resolved;
}

async function sendFile(req, res, file, status = 200) {
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return false;
  res.writeHead(status, {
    "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
    "cache-control": "no-store",
  });
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  createReadStream(file).pipe(res);
  return true;
}

function proxyApi(req, res) {
  const target = new URL(API_ORIGIN);
  const proxyReq = http.request(
    {
      hostname: target.hostname,
      port: target.port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    }
    res.end("API local no disponible en " + API_ORIGIN);
  });

  req.pipe(proxyReq);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (pathname.startsWith("/api/")) {
    proxyApi(req, res);
    return;
  }

  if (pathname === "/") {
    await sendFile(req, res, path.join(ROOT, "geodatos.html"));
    return;
  }

  if (pathname === "/geodatos.html") {
    await sendFile(req, res, path.join(ROOT, "geodatos.html"));
    return;
  }

  if (pathname === "/visor/") {
    res.writeHead(301, { location: `/visor${url.search}` });
    res.end();
    return;
  }

  if (pathname === "/visor") {
    await sendFile(req, res, path.join(ROOT, "index.html"));
    return;
  }

  const file = safeFile(pathname);
  if (!file) {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("Ruta inválida");
    return;
  }

  if (!(await sendFile(req, res, file))) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("No encontrado");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Geodatos local: http://${HOST}:${PORT}/`);
  console.log(`Visor local:    http://${HOST}:${PORT}/visor`);
  console.log(`API proxy:      ${API_ORIGIN}`);
});
