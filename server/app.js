/**
 * Aplicación HTTP del backend.
 *
 * Sin framework: un router mínimo, lectura de JSON con límite, CORS, manejo
 * uniforme de errores y respuestas. El servidor (`server/index.js`) solo la
 * monta y gestiona el ciclo de vida.
 */

import { getCountryFromRequest } from "./chat/geo-filter.js";
import { getDB as defaultGetDB } from "./db/pool.js";
import { HttpError } from "./http/errors.js";
import { parseQuery, readJsonBody } from "./http/body.js";
import { sendBuffer, sendEmpty, sendJson } from "./http/response.js";
import { matchRoute } from "./http/router.js";
import { routes as defaultRoutes } from "./routes/index.js";
import { applyCors } from "./utils/cors.js";
import { getClientIp } from "./utils/request.js";
import {
  buildAccessLogLine,
  createIpHasher,
  resolveRequestId,
} from "./utils/request-context.js";

/**
 * @param {{
 *   routes?: Array<object>,
 *   getDB?: () => Promise<object>,
 *   env?: NodeJS.ProcessEnv,
 *   logger?: {error: Function, warn?: Function}
 * }} [opts]
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>}
 */
export function createApp(opts = {}) {
  const {
    routes = defaultRoutes,
    getDB = defaultGetDB,
    env = process.env,
    logger = console,
    accessLog = (line) => console.log(line),
  } = opts;

  const hashIp = createIpHasher(env);
  const logRequests = String(env.LOG_REQUESTS ?? "1") !== "0";

  return async function app(req, res) {
    const startedAt = process.hrtime.bigint();
    const url = new URL(req.url || "/", "http://localhost");
    const pathname = url.pathname;
    const requestId = resolveRequestId(req.headers["x-request-id"]);
    res.setHeader("x-request-id", requestId);

    if (logRequests) {
      res.once("finish", () => {
        const durationMs =
          Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        accessLog(
          buildAccessLogLine({
            requestId,
            method: req.method || "GET",
            path: pathname,
            status: res.statusCode,
            durationMs,
            ipHash: hashIp(getClientIp(req, env)),
            country: getCountryFromRequest({ headers: req.headers }) || null,
          })
        );
      });
    }

    const match = matchRoute(routes, req.method, pathname);

    if (!match.route) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    const route = match.route;
    applyCors(req, res, {
      methods: `${route.method}, OPTIONS`,
      headers: route.cors?.headers || "Content-Type",
      env,
    });
    if (route.exposeHeaders) {
      res.setHeader("Access-Control-Expose-Headers", route.exposeHeaders);
    }

    if (req.method === "OPTIONS") {
      sendEmpty(res, 204);
      return;
    }

    if (!match.methodAllowed) {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    try {
      const ctx = {
        req,
        res,
        requestId,
        query: parseQuery(url.searchParams),
        ip: getClientIp(req, env),
        country: getCountryFromRequest({ headers: req.headers }),
        env,
        logger,
        getDB,
      };

      if (route.body === "json") {
        ctx.body = await readJsonBody(req, {
          limit: route.bodyLimit,
        });
      }

      const result = await route.handler(ctx);
      writeResult(res, result, logger);
    } catch (err) {
      if (res.headersSent) {
        res.end();
        return;
      }

      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.message });
        return;
      }

      logger.error?.(
        `[api] ${req.method} ${pathname} falló:`,
        err?.message || err
      );
      sendJson(res, 500, { error: "Error interno" });
    }
  };
}

function writeResult(res, result, logger = console) {
  if (!result) {
    sendEmpty(res, 204);
    return;
  }

  const { status = 200, body, headers = {} } = result;

  if (result.stream) {
    res.writeHead(status, headers);
    result.stream.on("error", (err) => {
      logger.error?.("[api] error en stream:", err?.message || err);
      res.destroy(err);
    });
    result.stream.pipe(res);
    return;
  }

  if (Buffer.isBuffer(body)) {
    sendBuffer(res, status, body, headers);
    return;
  }

  if (status === 204 || body === undefined) {
    sendEmpty(res, status, headers);
    return;
  }

  sendJson(res, status, body, headers);
}
