/**
 * Retrieval híbrido sobre `rag.chunks` (Sprint 18-C).
 *
 * Este módulo es puro respecto de la infraestructura: recibe un cliente con
 * `query(text, params)` y un embedder con `embed(texts, { taskType })`. No
 * importa `pg` ni lee variables de entorno, para poder testearlo sin BD y
 * mantener la regla del CONTRACT §4.4.
 *
 * Estrategia:
 *   1. Top 20 por similitud coseno (pgvector).
 *   2. Top 20 por texto completo en español (`tsv` + `plainto_tsquery`).
 *   3. Fusión RRF (Reciprocal Rank Fusion).
 *   4. Corte por umbral semántico; la vía léxica solo refuerza chunks que ya
 *      tienen una similitud mínima.
 *
 * El contenido de los pasajes es `untrusted`: el llamador debe delimitarlo y
 * nunca interpretarlo como instrucciones.
 */

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 8;
// Calibrado con el corpus de catastro: las preguntas respondibles quedan
// sobre 0,65 y las preguntas sin documento caen bajo 0,60.
const DEFAULT_MIN_SCORE = 0.62;
const MIN_LEX_SCORE = 0.4;
const MAX_QUERY_CHARS = 500;
const MIN_QUERY_CHARS = 3;
const CANDIDATES = 20;
const RRF_K = 60;

/**
 * @param {{query?: unknown, limit?: unknown, year?: unknown}} input
 * @param {NodeJS.ProcessEnv} [env]
 */
export function normalizeRetrievalParams(input = {}, env = process.env) {
  const rawQuery = typeof input.query === "string" ? input.query : "";
  const query = rawQuery.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_CHARS);
  if (query.length < MIN_QUERY_CHARS) {
    throw new RangeError(`La consulta debe tener al menos ${MIN_QUERY_CHARS} caracteres.`);
  }

  const envLimit = Number(env.RAG_TOP_K);
  const envMinScore = Number(env.RAG_MIN_SCORE);
  const rawLimit = input.limit === undefined || input.limit === null
    ? (Number.isFinite(envLimit) ? envLimit : DEFAULT_LIMIT)
    : Number(input.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(1, Math.floor(rawLimit)), MAX_LIMIT)
    : DEFAULT_LIMIT;

  let year = null;
  if (input.year !== undefined && input.year !== null && String(input.year).trim() !== "") {
    const n = Number(input.year);
    if (!Number.isInteger(n) || n < 1900 || n > 2100) {
      throw new RangeError("year debe ser un año entre 1900 y 2100.");
    }
    year = n;
  }

  const minScore = Number.isFinite(envMinScore)
    ? Math.min(Math.max(envMinScore, 0), 1)
    : DEFAULT_MIN_SCORE;

  return { query, limit, year, minScore };
}

/**
 * Reciprocal Rank Fusion para dos rankings 1-based.
 * @param {number|null|undefined} rankA
 * @param {number|null|undefined} rankB
 */
export function rrfScore(rankA, rankB, k = RRF_K) {
  const a = Number.isFinite(rankA) && rankA > 0 ? 1 / (k + rankA) : 0;
  const b = Number.isFinite(rankB) && rankB > 0 ? 1 / (k + rankB) : 0;
  return a + b;
}

/**
 * Convierte una fila SQL en un pasaje trazable y seguro para el prompt.
 * @param {object} row
 * @param {number} index
 */
export function toPassage(row, index) {
  return {
    citation_id: `doc-${index + 1}`,
    document_slug: row.slug,
    title: row.title,
    publisher: row.publisher || null,
    published_at: row.published_at
      ? new Date(row.published_at).toISOString().slice(0, 10)
      : null,
    source_url: row.source_url,
    page_start: Number(row.page_start),
    page_end: Number(row.page_end),
    section: row.section || null,
    score: Number(Number(row.vec_score).toFixed(4)),
    rrf_score: Number(Number(row.rrf).toFixed(6)),
    trust: row.trust_level || "untrusted",
    content: String(row.content || ""),
  };
}

/**
 * Ejecuta el retrieval híbrido.
 *
 * @param {{
 *   db: { query: (text: string, params: unknown[]) => Promise<object[]> },
 *   embedder: { dim?: number, embed: (texts: string[], opts?: object) => Promise<number[][]> },
 *   query: string,
 *   limit?: number,
 *   year?: number|null,
 *   minScore?: number,
 * }} input
 * @returns {Promise<{query:string,count:number,passages:object[],reason:string|null}>}
 */
export async function searchDocuments({
  db,
  embedder,
  query,
  limit,
  year,
  minScore,
}) {
  if (!db || typeof db.query !== "function") {
    throw new TypeError("searchDocuments requiere un cliente con query().");
  }
  if (!embedder || typeof embedder.embed !== "function") {
    throw new TypeError("searchDocuments requiere un embedder.");
  }

  const params = normalizeRetrievalParams({ query, limit, year });
  const effectiveMinScore =
    minScore === undefined || minScore === null
      ? params.minScore
      : Math.min(Math.max(Number(minScore), 0), 1);

  const vectors = await embedder.embed([params.query], {
    taskType: "RETRIEVAL_QUERY",
  });
  const vector = vectors?.[0];
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error("El proveedor de embeddings devolvió un vector vacío.");
  }
  if (embedder.dim && vector.length !== embedder.dim) {
    throw new Error(
      `Dimensión de embedding inesperada: ${vector.length} (se esperaba ${embedder.dim}).`
    );
  }

  const rows = await db.query(RETRIEVAL_SQL, [
    JSON.stringify(vector),
    params.query,
    effectiveMinScore,
    params.limit,
    params.year,
  ]);

  const passages = (rows || []).map(toPassage);
  return {
    query: params.query,
    count: passages.length,
    passages,
    reason: passages.length > 0 ? null : "sin_evidencia",
  };
}

/**
 * SQL fijo y parametrizado. No se interpola texto del usuario.
 *
 * $1 vector de la consulta
 * $2 texto para tsv
 * $3 umbral semántico
 * $4 límite final
 * $5 año opcional (published_at)
 */
export const RETRIEVAL_SQL = `
WITH params AS (
  SELECT $1::vector AS qvec,
         plainto_tsquery('spanish', $2) AS qts
),
vec AS (
  SELECT c.chunk_id,
         row_number() OVER (ORDER BY c.embedding <=> p.qvec) AS rank,
         1 - (c.embedding <=> p.qvec) AS score
    FROM rag.chunks c
    JOIN rag.documents d ON d.document_id = c.document_id
    CROSS JOIN params p
   WHERE d.status = 'ready'
     AND ($5::int IS NULL OR EXTRACT(YEAR FROM d.published_at)::int = $5)
   ORDER BY c.embedding <=> p.qvec
   LIMIT ${CANDIDATES}
),
lex AS (
  SELECT c.chunk_id,
         row_number() OVER (
           ORDER BY ts_rank_cd(c.tsv, p.qts) DESC,
                    c.chunk_id
         ) AS rank
    FROM rag.chunks c
    JOIN rag.documents d ON d.document_id = c.document_id
    CROSS JOIN params p
   WHERE d.status = 'ready'
     AND c.tsv @@ p.qts
     AND ($5::int IS NULL OR EXTRACT(YEAR FROM d.published_at)::int = $5)
   ORDER BY ts_rank_cd(c.tsv, p.qts) DESC
   LIMIT ${CANDIDATES}
),
merged AS (
  SELECT COALESCE(v.chunk_id, l.chunk_id) AS chunk_id,
         COALESCE(v.rank, NULL) AS vec_rank,
         COALESCE(l.rank, NULL) AS lex_rank,
         COALESCE(v.score, NULL) AS vec_score,
         COALESCE(1.0 / (${RRF_K} + v.rank), 0)
           + COALESCE(1.0 / (${RRF_K} + l.rank), 0) AS rrf
    FROM vec v
    FULL OUTER JOIN lex l ON v.chunk_id = l.chunk_id
)
SELECT m.chunk_id,
       m.rrf,
       m.vec_score,
       c.ordinal,
       c.page_start,
       c.page_end,
       c.section,
       c.content,
       d.slug,
       d.title,
       d.publisher,
       d.published_at,
       d.source_url,
       d.trust_level
  FROM merged m
  JOIN rag.chunks c ON c.chunk_id = m.chunk_id
  JOIN rag.documents d ON d.document_id = c.document_id
 WHERE m.vec_score >= $3
    OR (m.lex_rank <= 3 AND m.vec_score >= ${MIN_LEX_SCORE})
 ORDER BY m.rrf DESC, m.vec_score DESC
 LIMIT $4
`;

export const RETRIEVAL_DEFAULTS = {
  limit: DEFAULT_LIMIT,
  maxLimit: MAX_LIMIT,
  minScore: DEFAULT_MIN_SCORE,
  minQueryChars: MIN_QUERY_CHARS,
  maxQueryChars: MAX_QUERY_CHARS,
};
