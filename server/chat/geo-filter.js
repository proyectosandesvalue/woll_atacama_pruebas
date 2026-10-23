/**
 * Filtro geográfico del chat.
 *
 * Decide si una request viene de Latinoamérica basándose en el header
 * del proveedor de hosting:
 *   - Vercel: `x-vercel-ip-country`.
 *   - Cloudflare: `cf-ipcountry`.
 *   - Ninguno (`GEO_PROVIDER=none`): tratar como LATAM (fail-open).
 *
 * También extrae la IP real del cliente, contando desde la derecha de
 * `x-forwarded-for` según `TRUST_PROXY_HOPS` (cuántos proxies hay antes
 * del backend). En Vercel son 2 saltos (CDN + edge).
 *
 * Uso:
 *   - IPs de LATAM → límite normal (20/min, 5/10s).
 *   - IPs fuera de LATAM → límite estricto (3/min, 1/10s).
 *   - Header de país ausente + GEO_PROVIDER=none → tratar como LATAM.
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

const DEBUG = /^(1|true|yes)$/i.test(process.env.ORCHESTRATOR_DEBUG || "");
function dbg(...args) {
  if (DEBUG) console.log("[geo-filter]", ...args);
}

/**
 * Devuelve true si el código de país es de LATAM.
 *
 * Si el código es `null`/`undefined` (header ausente), el resultado
 * depende de `GEO_PROVIDER`:
 *   - `vercel` o `cloudflare`: se asume LATAM (fail-open, no bloquear
 *     al desarrollador local).
 *   - `none`: se asume LATAM (no hay geo, no se puede restringir).
 *   - Cualquier otro valor: se asume no-LATAM (comportamiento viejo).
 *
 * @param {string|null|undefined} countryCode
 * @returns {boolean}
 */
export function isLatam(countryCode) {
  if (!countryCode || typeof countryCode !== "string") {
    // Sin país: fail-open, tratar como LATAM.
    // El único caso en el que aplicamos el límite estricto es si el
    // país está presente y NO es LATAM.
    dbg("isLatam: sin código de país, fail-open → LATAM");
    return true;
  }
  return LATAM_COUNTRIES.has(countryCode.toUpperCase());
}

/**
 * Extrae el código de país del request.
 *
 * Según `GEO_PROVIDER`:
 *   - `vercel`: lee `x-vercel-ip-country`.
 *   - `cloudflare`: lee `cf-ipcountry`.
 *   - `none` o no configurado: devuelve `undefined`.
 *
 * @param {object} req
 * @returns {string|undefined}
 */
export function getCountryFromRequest(req) {
  const headers = req?.headers || {};
  const provider = (process.env.GEO_PROVIDER || "vercel").toLowerCase();

  if (provider === "vercel") {
    const value = headers["x-vercel-ip-country"];
    if (typeof value === "string" && value.length === 2) {
      return value.toUpperCase();
    }
  } else if (provider === "cloudflare") {
    const value = headers["cf-ipcountry"];
    if (typeof value === "string" && value.length === 2) {
      return value.toUpperCase();
    }
  }

  return undefined;
}

/**
 * Extrae la IP real del cliente.
 *
 * `x-forwarded-for` puede tener varios valores separados por coma,
 * en el orden en que los proxies fueron agregando la IP. Ejemplo:
 *   "cliente, proxy1, proxy2"
 *
 * Para obtener la IP real del cliente (y no la de un proxy intermedio
 * o la de un atacante que falsificó el header), contamos desde la
 * DERECHA según `TRUST_PROXY_HOPS`:
 *   - `TRUST_PROXY_HOPS=0`: el header no es confiable, usar `x-real-ip`.
 *   - `TRUST_PROXY_HOPS=1`: tomar el último valor del header.
 *   - `TRUST_PROXY_HOPS=2`: tomar el penúltimo (Vercel tiene 2 saltos).
 *
 * Si el header no existe o `TRUST_PROXY_HOPS` no aplica, usar
 * `x-real-ip`. Si tampoco existe, devolver `undefined`.
 *
 * @param {object} req
 * @returns {string|undefined}
 */
export function getIpFromRequest(req) {
  const headers = req?.headers || {};
  const hops = Number(process.env.TRUST_PROXY_HOPS) || 2; // Vercel: 2 por defecto

  const forwarded = headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    const parts = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (parts.length > 0) {
      // Contar desde la derecha: hops = 2 → parts[length - 1 - 1] = penúltimo.
      const index = Math.max(0, parts.length - 1 - hops + 1);
      const ip = parts[index];
      if (ip) {
        dbg(`getIpFromRequest: IP real (hops=${hops}, index=${index}) = ${ip}`);
        return ip;
      }
    }
  }

  const real = headers["x-real-ip"];
  if (typeof real === "string" && real.length > 0) {
    dbg(`getIpFromRequest: IP de x-real-ip = ${real.trim()}`);
    return real.trim();
  }

  dbg("getIpFromRequest: no se encontró IP");
  return undefined;
}

export const GEO_CONFIG = {
  LATAM_COUNTRIES,
  DEFAULT_TRUST_PROXY_HOPS: 2,
};