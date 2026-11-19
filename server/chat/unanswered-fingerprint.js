/**
 * Normalización y fingerprint de preguntas sin respuesta.
 *
 * El fingerprint agrupa preguntas idénticas (mayúsculas/espacios) para contar
 * ocurrencias. No es un dato de seguridad: es una clave de deduplicación.
 * Se usa MD5 para que el backfill SQL (`md5(lower(btrim(question)))`) y el
 * runtime produzcan el mismo valor en preguntas normales.
 */
import { createHash } from "node:crypto";

/**
 * Limpia caracteres de control, recorta y limita a 1000 caracteres.
 * @param {unknown} value
 * @returns {string}
 */
export function sanitizeQuestion(value) {
  const text = String(value ?? "");
  let clean = "";
  for (const char of text) {
    const code = char.codePointAt(0);
    clean += code > 0x1f && code !== 0x7f ? char : " ";
  }
  return clean.trim().slice(0, 1000);
}

/**
 * @param {unknown} value
 * @returns {string} hash MD5 hexadecimal
 */
export function fingerprintQuestion(value) {
  return createHash("md5")
    .update(sanitizeQuestion(value).toLowerCase())
    .digest("hex");
}
