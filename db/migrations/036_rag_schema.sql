-- =====================================================================
-- 036_rag_schema.sql
-- Esquema RAG: documentos públicos versionados, chunks con embeddings
-- (pgvector) y bitácora de ingesta.
--
-- Requisitos:
--   - PostgreSQL >= 14
--   - pgvector >= 0.5 (índice HNSW)
--
-- Portabilidad:
--   - Funciona en Postgres propio y en Supabase.
--   - La extensión se instala en el schema `extensions` cuando es
--     posible; el search_path de la sesión incluye ese schema para
--     resolver el tipo `vector`.
--   - No usa RPCs ni NOTIFY pgrst: la ingesta y la lectura del Sprint 18
--     usan conexión directa con pg (rol rag_writer / chat_ro).
--
-- Idempotente: se puede aplicar dos veces (CONTRACT §9.1).
--
-- Roles:
--   - rag_writer: escritura de ingesta (NOLOGIN; el operador crea el
--     usuario de login y lo hace miembro).
--   - chat_ro: lectura de documentos listos (NOLOGIN).
--   Las contraseñas NUNCA viven en una migración. Ver
--   `db/roles/rag_roles.example.sql`.
-- =====================================================================

SET search_path TO public, extensions;

-- ── Extensiones ──────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS extensions;

-- Si la extensión ya existe en otro schema, este CREATE es un no-op.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ── Schema ───────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS rag;

COMMENT ON SCHEMA rag IS
  'RAG: documentos públicos versionados y chunks vectorizados. trust_level=untrusted por defecto.';

-- ── Roles de mínimo privilegio (sin login) ───────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rag_writer') THEN
    CREATE ROLE rag_writer NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chat_ro') THEN
    CREATE ROLE chat_ro NOLOGIN;
  END IF;
END $$;

-- ── Documentos ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rag.documents (
  document_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text        NOT NULL,
  version           integer     NOT NULL CHECK (version > 0),
  title             text        NOT NULL,
  source_url        text        NOT NULL,
  publisher         text,
  license           text        NOT NULL,
  language          text        NOT NULL DEFAULT 'es',
  published_at      date,
  sha256            char(64)    NOT NULL CHECK (length(sha256) = 64),
  page_count        integer     CHECK (page_count IS NULL OR page_count > 0),
  trust_level       text        NOT NULL DEFAULT 'untrusted'
                    CHECK (trust_level IN ('untrusted', 'reviewed')),
  copyright_cleared boolean     NOT NULL,
  status            text        NOT NULL
                    CHECK (status IN ('ready', 'superseded', 'needs_ocr', 'failed')),
  tags              text[]      NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_rag_documents_slug_version UNIQUE (slug, version)
);

-- Un slug puede tener a lo sumo una versión "ready".
CREATE UNIQUE INDEX IF NOT EXISTS uq_rag_documents_ready_slug
  ON rag.documents (slug) WHERE status = 'ready';

CREATE INDEX IF NOT EXISTS idx_rag_documents_status
  ON rag.documents (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rag_documents_sha256
  ON rag.documents (sha256);

-- ── Chunks ───────────────────────────────────────────────────────────
-- vector(1024): compatible con BAAI/bge-m3 y con
-- text-embedding-3-small usando dimensions=1024.
-- Cambiar la dimensión exige migración nueva y re-ingesta total.
CREATE TABLE IF NOT EXISTS rag.chunks (
  chunk_id        bigint    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id     uuid      NOT NULL REFERENCES rag.documents(document_id) ON DELETE CASCADE,
  ordinal         integer   NOT NULL CHECK (ordinal >= 0),
  page_start      integer   NOT NULL CHECK (page_start > 0),
  page_end        integer   NOT NULL CHECK (page_end > 0),
  section         text,
  content         text      NOT NULL CHECK (length(content) > 0),
  token_estimate  integer   NOT NULL CHECK (token_estimate > 0),
  content_sha256  char(64)  NOT NULL CHECK (length(content_sha256) = 64),
  embedding       vector(1024) NOT NULL,
  embedding_model text      NOT NULL,
  tsv             tsvector  GENERATED ALWAYS AS (to_tsvector('spanish', content)) STORED,
  CONSTRAINT uq_rag_chunks_doc_ordinal UNIQUE (document_id, ordinal),
  CONSTRAINT ck_rag_chunks_pages CHECK (page_end >= page_start)
);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_document ON rag.chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_tsv ON rag.chunks USING gin (tsv);

-- HNSW coseno. Si el pgvector instalado es < 0.5, este CREATE falla:
-- actualizar la extensión antes de aplicar la migración.
CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding
  ON rag.chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ── Corridas de ingesta (sin contenido de documentos) ────────────────
CREATE TABLE IF NOT EXISTS rag.ingestion_runs (
  run_id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id     uuid        REFERENCES rag.documents(document_id) ON DELETE SET NULL,
  slug            text        NOT NULL,
  status          text        NOT NULL
                  CHECK (status IN ('ready', 'skipped', 'needs_ocr', 'rejected', 'failed')),
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  chunks_total    integer     CHECK (chunks_total IS NULL OR chunks_total >= 0),
  embedding_model text,
  est_tokens      integer     CHECK (est_tokens IS NULL OR est_tokens >= 0),
  est_cost_usd    numeric(12, 6) CHECK (est_cost_usd IS NULL OR est_cost_usd >= 0),
  error_code      text
);

CREATE INDEX IF NOT EXISTS idx_rag_runs_slug
  ON rag.ingestion_runs (slug, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_rag_runs_started
  ON rag.ingestion_runs (started_at DESC);

-- ── Seguridad: RLS ───────────────────────────────────────────────────
ALTER TABLE rag.documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag.chunks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag.ingestion_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_documents_writer ON rag.documents;
DROP POLICY IF EXISTS p_documents_ro     ON rag.documents;
DROP POLICY IF EXISTS p_chunks_writer    ON rag.chunks;
DROP POLICY IF EXISTS p_chunks_ro        ON rag.chunks;
DROP POLICY IF EXISTS p_runs_writer      ON rag.ingestion_runs;
DROP POLICY IF EXISTS p_runs_ro          ON rag.ingestion_runs;

CREATE POLICY p_documents_writer ON rag.documents
  FOR ALL TO rag_writer USING (true) WITH CHECK (true);

CREATE POLICY p_documents_ro ON rag.documents
  FOR SELECT TO chat_ro USING (status = 'ready');

CREATE POLICY p_chunks_writer ON rag.chunks
  FOR ALL TO rag_writer USING (true) WITH CHECK (true);

-- chat_ro solo ve chunks de documentos ready y nunca los de versiones
-- superseded/failed/needs_ocr.
CREATE POLICY p_chunks_ro ON rag.chunks
  FOR SELECT TO chat_ro
  USING (EXISTS (
    SELECT 1 FROM rag.documents d
     WHERE d.document_id = chunks.document_id
       AND d.status = 'ready'
  ));

CREATE POLICY p_runs_writer ON rag.ingestion_runs
  FOR ALL TO rag_writer USING (true) WITH CHECK (true);

CREATE POLICY p_runs_ro ON rag.ingestion_runs
  FOR SELECT TO chat_ro USING (true);

-- ── Grants ───────────────────────────────────────────────────────────
REVOKE ALL ON SCHEMA rag FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA rag FROM PUBLIC;

GRANT USAGE ON SCHEMA rag TO rag_writer, chat_ro;

-- El tipo `vector` vive en el schema extensions; los roles necesitan
-- USAGE para resolverlo (casts `::vector` y operador `<=>`).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    GRANT USAGE ON SCHEMA extensions TO rag_writer, chat_ro;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON rag.documents, rag.chunks, rag.ingestion_runs TO rag_writer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA rag TO rag_writer;

GRANT SELECT ON rag.documents, rag.chunks, rag.ingestion_runs TO chat_ro;

-- Compatibilidad con el stack Supabase actual (transición al VPS).
-- service_role tiene BYPASSRLS; solo se le da lectura.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE ON SCHEMA rag TO service_role;
    GRANT SELECT ON rag.documents, rag.chunks, rag.ingestion_runs TO service_role;
  END IF;
END $$;

-- Si en el futuro se agregan tablas, no heredar permisos por accidente.
ALTER DEFAULT PRIVILEGES IN SCHEMA rag REVOKE ALL ON TABLES FROM PUBLIC;

DO $$ BEGIN
  RAISE NOTICE '[036] schema rag listo (documents, chunks, ingestion_runs)';
END $$;
