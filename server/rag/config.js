/**
 * Configuración del pipeline de ingesta RAG.
 *
 * Estas variables solo las lee la CLI de ingesta (scripts/). En el
 * Sprint 18, el runtime del chat necesitará únicamente EMBEDDINGS_* para
 * embeber la pregunta.
 */

const DEFAULTS = {
  targetTokens: 450,
  overlapTokens: 60,
  maxPdfMb: 25,
  maxPages: 300,
  minCharsPerPage: 80,
  insertBatch: 50,
};

function num(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new RangeError(`Variable de entorno inválida: ${name}=${raw}`);
  }
  return n;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{targetTokens:number, overlapTokens:number, maxPdfBytes:number,
 *   maxPages:number, minCharsPerPage:number, insertBatch:number}}
 */
export function getRagConfig(env = process.env) {
  const targetTokens = num(env, "RAG_CHUNK_TOKENS", DEFAULTS.targetTokens);
  const overlapTokens = num(env, "RAG_CHUNK_OVERLAP", DEFAULTS.overlapTokens);
  if (overlapTokens >= targetTokens) {
    throw new RangeError("RAG_CHUNK_OVERLAP debe ser menor que RAG_CHUNK_TOKENS.");
  }

  return {
    targetTokens,
    overlapTokens,
    maxPdfMb: num(env, "RAG_MAX_PDF_MB", DEFAULTS.maxPdfMb),
    maxPdfBytes: Math.round(num(env, "RAG_MAX_PDF_MB", DEFAULTS.maxPdfMb) * 1024 * 1024),
    maxPages: Math.floor(num(env, "RAG_MAX_PAGES", DEFAULTS.maxPages)),
    minCharsPerPage: Math.floor(num(env, "RAG_MIN_CHARS_PER_PAGE", DEFAULTS.minCharsPerPage)),
    insertBatch: Math.floor(num(env, "RAG_INSERT_BATCH", DEFAULTS.insertBatch)),
  };
}

export { DEFAULTS as RAG_DEFAULTS };
