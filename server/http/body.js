/**
 * Lectura y parseo del cuerpo de requests Node.
 *
 * Límite duro por defecto: 1 MB (el chat acepta textos cortos). Los bodies
 * grandes se rechazan antes de parsear para no consumir memoria.
 */

import { HttpError } from "./errors.js";

export const DEFAULT_BODY_LIMIT = 1_000_000;

/**
 * Lee un body JSON de un `IncomingMessage`.
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {{limit?: number}} [opts]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function readJsonBody(req, { limit = DEFAULT_BODY_LIMIT } = {}) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (contentType && !contentType.includes("application/json")) {
    throw new HttpError(415, "Content-Type debe ser application/json.");
  }

  const declared = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(declared) && declared > limit) {
    throw new HttpError(413, "Cuerpo demasiado grande.");
  }

  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) {
      throw new HttpError(413, "Cuerpo demasiado grande.");
    }
    chunks.push(chunk);
  }

  if (total === 0) return {};

  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "JSON inválido.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "El cuerpo debe ser un objeto JSON.");
  }

  return parsed;
}

/**
 * Convierte `URLSearchParams` en un objeto plano. Si una clave se repite,
 * conserva el último valor (igual que `req.query` de Vercel en estos
 * endpoints, que no usan parámetros repetidos).
 *
 * @param {URLSearchParams} searchParams
 * @returns {Record<string, string>}
 */
export function parseQuery(searchParams) {
  return Object.fromEntries(searchParams.entries());
}
