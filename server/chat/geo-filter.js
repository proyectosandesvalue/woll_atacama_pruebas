/**
 * Filtro geográfico del chat.
 *
 * Decide si una request viene de Latinoamérica basándose en el header
 * `x-vercel-ip-country` que Vercel inyecta automáticamente.
 *
 * Uso:
 *   - IPs de LATAM → límite normal (20/min, 5/10s).
 *   - IPs fuera de LATAM → límite estricto (3/min, 1/10s).
 *
 * Si el header no está presente (ej. desarrollo local con `vercel dev`),
 * se trata como LATAM para no bloquear al desarrollador.
 */

/**
 * Códigos ISO 3166-1 alpha-2 de países considerados LATAM.
 */
const LATAM_COUNTRIES = new Set([
  // Sudamérica
  "AR", "BO", "BR", "CL", "CO", "EC", "GY", "PY", "PE", "SR", "UY", "VE",
  // Centroamérica y Caribe
  "BZ", "CR", "SV", "GT", "HN", "NI", "PA",
  "CU", "DO", "HT", "JM", "TT", "PR",
  // Norteamérica (México)
  "MX",
]);

/**
 * Devuelve true si el código de país es de LATAM.
 *
 * @param {string|undefined} countryCode - Código ISO de 2 letras, mayúsculas.
 * @returns {boolean}
 */
export function isLatam(countryCode) {
  if (!countryCode || typeof countryCode !== "string") return false;
  return LATAM_COUNTRIES.has(countryCode.toUpperCase());
}

/**
 * Extrae el código de país del request.
 *
 * En Vercel, el header `x-vercel-ip-country` viene poblado automáticamente.
 * En desarrollo local puede no estar.
 *
 * @param {object} req - Request object con `headers`.
 * @returns {string|undefined} Código ISO o undefined.
 */
export function getCountryFromRequest(req) {
  const headers = req?.headers || {};
  const value = headers["x-vercel-ip-country"];
  if (typeof value === "string" && value.length === 2) {
    return value.toUpperCase();
  }
  return undefined;
}

/**
 * Extrae la IP del request.
 *
 * En Vercel, la IP viene en `x-forwarded-for` (primer valor) o en
 * `x-real-ip`. En desarrollo local suele estar vacío.
 *
 * @param {object} req
 * @returns {string|undefined}
 */
export function getIpFromRequest(req) {
  const headers = req?.headers || {};

  const forwarded = headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }

  const real = headers["x-real-ip"];
  if (typeof real === "string" && real.length > 0) {
    return real.trim();
  }

  return undefined;
}

export const GEO_CONFIG = {
  LATAM_COUNTRIES,
};