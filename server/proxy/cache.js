/**
 * Caché en memoria para respuestas pequeñas del proxy (JSON/XML/texto).
 *
 * No cachea imágenes: esas se delegan al navegador y a la CDN mediante
 * `Cache-Control`. El objetivo es evitar repetir GetCapabilities,
 * GetFeatureInfo y WFS en cada request.
 *
 * En Vercel el estado vive por instancia (no es distribuido). En el VPS
 * se puede sustituir por una caché en disco o Redis sin cambiar la
 * interfaz.
 */

const MAX_ENTRIES = 200;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ENTRY_BYTES = 256 * 1024;

/** @type {Map<string, {status:number, contentType:string, body:Buffer, headers:Record<string,string>, expiresAt:number, size:number}>} */
const store = new Map();
let totalBytes = 0;

function isCacheable(contentType, body) {
  if (!body || body.length === 0 || body.length > MAX_ENTRY_BYTES) return false;
  return /^application\/(json|geo\+json|xml)|^text\/(xml|plain)/i.test(contentType || "");
}

/**
 * @param {string} key
 * @param {number} now
 */
export function getCached(key, now = Date.now()) {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    store.delete(key);
    totalBytes -= entry.size;
    return null;
  }
  // Refrescar orden LRU.
  store.delete(key);
  store.set(key, entry);
  return entry;
}

/**
 * @param {string} key
 * @param {{status:number, contentType:string, body:Buffer, headers:Record<string,string>}} value
 * @param {number} ttlSeconds
 * @param {number} now
 */
export function setCached(key, value, ttlSeconds, now = Date.now()) {
  if (!isCacheable(value.contentType, value.body)) return false;

  const existing = store.get(key);
  if (existing) {
    store.delete(key);
    totalBytes -= existing.size;
  }

  const entry = {
    ...value,
    expiresAt: now + ttlSeconds * 1000,
    size: value.body.length,
  };

  store.set(key, entry);
  totalBytes += entry.size;

  while (store.size > MAX_ENTRIES || totalBytes > MAX_BYTES) {
    const oldestKey = store.keys().next().value;
    const oldest = store.get(oldestKey);
    store.delete(oldestKey);
    totalBytes -= oldest.size;
  }

  return true;
}

export function clearCache() {
  store.clear();
  totalBytes = 0;
}

export const CACHE_LIMITS = { MAX_ENTRIES, MAX_BYTES, MAX_ENTRY_BYTES };
