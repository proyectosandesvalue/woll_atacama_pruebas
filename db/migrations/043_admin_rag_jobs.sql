-- 043_admin_rag_jobs.sql
--
-- Cola de ingesta RAG y heartbeat de workers.
-- Sprint 45-A (docs/specs/45-panel-admin-operaciones/00-spec-madre.md).
--
-- El API encola; `scripts/rag-worker.mjs` reclama con FOR UPDATE SKIP LOCKED.
-- Los secretos (RAG_DATABASE_URL, EMBEDDINGS_*) viven en el entorno.
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS admin.rag_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action text NOT NULL DEFAULT 'ingest'
    CHECK (action IN ('dry_run', 'ingest', 'reingest')),
  slug text NOT NULL,
  force boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued', 'running', 'succeeded', 'skipped',
      'needs_ocr', 'rejected', 'failed', 'cancelled'
    )),
  requested_by text,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  heartbeat_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_rag_jobs_queue
  ON admin.rag_jobs (status, id);

CREATE INDEX IF NOT EXISTS idx_rag_jobs_slug
  ON admin.rag_jobs (slug, created_at DESC);

-- Un solo job activo por slug: evita dobles ingestas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rag_jobs_active_slug
  ON admin.rag_jobs (slug)
  WHERE status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS admin.worker_heartbeats (
  worker text PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

REVOKE ALL ON TABLE admin.rag_jobs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE admin.worker_heartbeats FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE admin.rag_jobs TO woll_api;
GRANT SELECT, INSERT, UPDATE ON TABLE admin.worker_heartbeats TO woll_api;
GRANT USAGE, SELECT ON SEQUENCE admin.rag_jobs_id_seq TO woll_api;
