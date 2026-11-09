/**
 * Handler puro de `/api/proxy`.
 *
 * Recibe { query, ip } y devuelve { status, headers, body } para que el
 * adapter de Vercel (o el servidor Node del Sprint 26) lo escriba. No
 * depende de `req`/`res`.
 *
 * Garantías:
 *   - Solo GET.
 *   - Solo servicios de la allowlist; nunca URLs arbitrarias.
 *   - Solo parámetros permitidos por servicio.
 *   - Timeout, límite de tamaño y allowlist de content-types.
 *   - Caché en memoria para JSON/XML pequeños.
 *   - Rate limit por IP (no distribuido en Vercel).
 *   - Los errores no exponen la URL upstream ni el INSTANCE_ID.
 */

import { ProxyError } from "./errors.js";
import { prepareUpstream } from "./services.js";
import { checkProxyRateLimit } from "./rate-limiter.js";
import { getCached, setCached } from "./cache.js";

const DEFAULT_TIMEOUT_MS = 25000;
const MAX_TIMEOUT_MS = 60000;

function positiveInt(value, fallback, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

function isAllowedContentType(contentType) {
  const mime = String(contentType || "").split(";")[0].trim().toLowerCase();
  return (
    mime.startsWith("image/") ||
    mime === "application/json" ||
    mime === "application/geo+json" ||
    mime === "application/xml" ||
    mime === "text/xml" ||
    mime === "text/plain" ||
    mime === "application/vnd.ogc.gml" ||
    mime === "application/vnd.ogc.wms_xml" ||
    mime === "application/zip" ||
    mime === "application/x-esri-shape"
  );
}

function jsonResponse(status, code, message, extraHeaders = {}) {
  return {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
    body: Buffer.from(JSON.stringify({ ok: false, code, error: message })),
  };
}

function ttlFor(source, params, now) {
  const request = String(params.REQUEST || "").toUpperCase();

  if (source === "worldview-snapshot") {
    const today = new Date(now).toISOString().slice(0, 10);
    return params.TIME < today ? 604800 : 3600;
  }
  if (request === "GETCAPABILITIES") return 21600;
  if (request === "GETFEATUREINFO") return 60;
  if (source === "copernicus-wfs") return 300;
  return 3600;
}

function cacheControlFor(contentType, ttl) {
  const isImage = String(contentType).toLowerCase().startsWith("image/");
  const maxAge = isImage ? Math.min(ttl, 3600) : Math.min(ttl, 300);
  return `public, max-age=${maxAge}, s-maxage=${ttl}, stale-while-revalidate=86400`;
}

/**
 * Sentinel Hub documenta Retry-After en milisegundos; el estándar HTTP
 * lo define en segundos. Si el valor es grande, se interpreta como ms.
 */
function normalizeRetryAfter(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return String(value > 300 ? Math.ceil(value / 1000) : Math.ceil(value));
}

/**
 * @param {{query?:Record<string, any>, ip?:string, method?:string}} request
 * @param {{
 *   env?:NodeJS.ProcessEnv,
 *   fetch?:Function,
 *   now?:number|Function,
 *   cache?:boolean
 * }} [deps]
 */
export async function handleProxy(request, deps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetch || fetch;
  const now = typeof deps.now === "function" ? deps.now() : deps.now ?? Date.now();
  const query = request?.query || {};
  const method = String(request?.method || "GET").toUpperCase();

  if (method !== "GET") {
    return jsonResponse(405, "METHOD_NOT_ALLOWED", "Solo se permite GET.", {
      Allow: "GET, OPTIONS",
    });
  }

  let prepared;
  try {
    prepared = prepareUpstream(query.source, env, query);
  } catch (err) {
    if (err instanceof ProxyError) {
      return jsonResponse(err.status, err.code, err.message);
    }
    console.error("[proxy] error preparando la petición:", err?.message || "desconocido");
    return jsonResponse(500, "INTERNAL_ERROR", "Error interno del proxy.");
  }

  const { url, service, params } = prepared;
  const source = String(query.source);
  const cacheKey = url.toString();
  const useCache = deps.cache !== false;

  if (useCache) {
    const cached = getCached(cacheKey, now);
    if (cached) {
      return {
        status: cached.status,
        headers: { ...cached.headers, "X-Proxy-Cache": "HIT" },
        body: cached.body,
      };
    }
  }

  const rate = checkProxyRateLimit(request?.ip, { env, now });
  if (!rate.ok) {
    return jsonResponse(429, "RATE_LIMITED", "Demasiadas peticiones al proxy.", {
      "Retry-After": String(rate.retryAfterSeconds),
    });
  }

  const timeoutMs = positiveInt(env.PROXY_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);

  let upstream;
  try {
    upstream = await fetchImpl(url, {
      method: "GET",
      headers: {
        "User-Agent": "WollAtacamaProxy/1.0 (+https://wollatacamapruebas.vercel.app)",
        Accept: "image/*,application/json,application/xml,text/xml,text/plain,*/*",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    console.warn(
      `[proxy] ${source}: ${timeout ? "timeout" : "network error"}` +
        (err?.message ? ` (${err.message})` : "")
    );
    return jsonResponse(
      timeout ? 504 : 502,
      timeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_NETWORK",
      timeout ? "El servicio externo no respondió a tiempo." : "No se pudo contactar al servicio externo."
    );
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    return jsonResponse(502, "UPSTREAM_REDIRECT", "El servicio externo redirigió la petición.");
  }

  const contentType = upstream.headers?.get?.("content-type") || "application/octet-stream";

  if (!isAllowedContentType(contentType)) {
    console.warn(
      `[proxy] ${source}: content-type no permitido (${contentType.split(";")[0]}) status=${upstream.status}`
    );
    return jsonResponse(502, "UPSTREAM_CONTENT_TYPE", "El servicio externo devolvió un formato no permitido.");
  }

  const declaredLength = Number(upstream.headers?.get?.("content-length") || 0);
  if (declaredLength > service.maxBytes) {
    return jsonResponse(502, "UPSTREAM_TOO_LARGE", "La respuesta del servicio externo supera el límite.");
  }

  let body;
  try {
    body = Buffer.from(await upstream.arrayBuffer());
  } catch {
    return jsonResponse(502, "UPSTREAM_READ_ERROR", "No se pudo leer la respuesta del servicio externo.");
  }

  if (body.length > service.maxBytes) {
    return jsonResponse(502, "UPSTREAM_TOO_LARGE", "La respuesta del servicio externo supera el límite.");
  }

  const isOk = upstream.status >= 200 && upstream.status < 300;
  const ttl = ttlFor(source, params, now);
  const headers = {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "X-Proxy-Service": source,
    "X-Proxy-Cache": "MISS",
  };

  if (isOk) {
    headers["Cache-Control"] = cacheControlFor(contentType, ttl);
    headers["CDN-Cache-Control"] = `public, s-maxage=${ttl}, stale-while-revalidate=86400`;
  } else {
    headers["Cache-Control"] = "no-store";
  }

  for (const name of ["data-present", "acquisition-time", "etag", "last-modified"]) {
    const value = upstream.headers?.get?.(name);
    if (value) headers[name] = value;
  }

  if (upstream.status === 429) {
    const retryAfter = normalizeRetryAfter(upstream.headers?.get?.("retry-after"));
    if (retryAfter) headers["Retry-After"] = retryAfter;
  }

  if (useCache && isOk) {
    setCached(cacheKey, { status: upstream.status, contentType, body, headers }, ttl, now);
  }

  return { status: upstream.status, headers, body };
}
