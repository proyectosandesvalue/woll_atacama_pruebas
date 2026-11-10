/**
 * Caché en memoria del catálogo de capas (`chat_catalog`).
 *
 * El catálogo cambia solo cuando se corre `npm run catalog` o una ingesta.
 * Sin caché, `handleChat`, `buildSystemPrompt` y `buildEvidence` consultan
 * la misma RPC varias veces por request.
 *
 * La caché es por instancia (Vercel/serverless). TTL configurable con
 * `CHAT_CATALOG_TTL_MS`; default 5 minutos.
 */

import { getDB } from "../db/pool.js";

const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * Crea una caché testeable.
 *
 * @param {{
 *   load: () => Promise<any[]>,
 *   ttlMs?: number,
 *   now?: () => number
 * }} opts
 */
export function createCatalogCache({ load, ttlMs = DEFAULT_TTL_MS, now = Date.now }) {
  let cached = null;

  return {
    async get() {
      const current = now();
      if (cached && current - cached.at < ttlMs) {
        return cached.value;
      }
      const value = await load();
      cached = { at: current, value };
      return value;
    },
    reset() {
      cached = null;
    },
  };
}

const ttlFromEnv = Number(process.env.CHAT_CATALOG_TTL_MS);
const defaultCache = createCatalogCache({
  load: async () => {
    const db = await getDB();
    return (await db.rpc("chat_catalog")) ?? [];
  },
  ttlMs: Number.isFinite(ttlFromEnv) && ttlFromEnv > 0 ? ttlFromEnv : DEFAULT_TTL_MS,
});

export function getCatalog() {
  return defaultCache.get();
}

export function resetCatalogCache() {
  defaultCache.reset();
}

export const CATALOG_CACHE_TTL_MS =
  Number.isFinite(ttlFromEnv) && ttlFromEnv > 0 ? ttlFromEnv : DEFAULT_TTL_MS;
