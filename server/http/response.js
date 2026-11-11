/**
 * Helpers de respuesta para el servidor Node.
 *
 * Todos los writers setean `Content-Length` y `X-Content-Type-Options` para
 * evitar respuestas ambiguas. `sendJson` no cachea por defecto; los handlers
 * pueden sobrescribir `Cache-Control`.
 */

function applyHeaders(res, headers = {}) {
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && value !== null) {
      res.setHeader(name, value);
    }
  }
}

function baseHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  };
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 * @param {Record<string, string|number>} [headers]
 */
export function sendJson(res, status, body, headers = {}) {
  const payload = Buffer.from(JSON.stringify(body ?? null));
  res.statusCode = status;
  applyHeaders(res, baseHeaders());
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", payload.length);
  applyHeaders(res, headers);
  res.end(payload);
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {Buffer|string} body
 * @param {Record<string, string|number>} [headers]
 */
export function sendBuffer(res, status, body, headers = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body ?? "");
  res.statusCode = status;
  applyHeaders(res, baseHeaders());
  res.setHeader("Content-Length", payload.length);
  applyHeaders(res, headers);
  res.end(payload);
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {number} [status]
 * @param {Record<string, string|number>} [headers]
 */
export function sendEmpty(res, status = 204, headers = {}) {
  res.statusCode = status;
  applyHeaders(res, baseHeaders());
  applyHeaders(res, headers);
  res.end();
}
