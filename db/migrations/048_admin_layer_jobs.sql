-- 048_admin_layer_jobs.sql
--
-- Cola de importación/carga de capas geográficas y generación de tiles.
-- Sprint 47 (docs/specs/45-panel-admin-operaciones/47-gestor-capas.md).
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS admin.layer_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action text NOT NULL DEFAULT 'import'
    CHECK (action IN ('import', 'tiles')),
  layer_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by text,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  heartbeat_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_layer_jobs_queue
  ON admin.layer_jobs (status, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_layer_jobs_active_key
  ON admin.layer_jobs (layer_key)
  WHERE status IN ('queued', 'running');

REVOKE ALL ON TABLE admin.layer_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE admin.layer_jobs TO woll_api;
GRANT USAGE, SELECT ON SEQUENCE admin.layer_jobs_id_seq TO woll_api;
