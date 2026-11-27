-- 066_rag_unpublish.sql
--
-- Sprint 18-F: despublicar una versión RAG desde el panel.
--
-- - `admin.rag_jobs.action` acepta `unpublish`.
-- - `rag.ingestion_runs.status` acepta `unpublished` para dejar traza.
--
-- Idempotente: drop/add de los CHECK.

ALTER TABLE admin.rag_jobs
  DROP CONSTRAINT IF EXISTS rag_jobs_action_check;

ALTER TABLE admin.rag_jobs
  ADD CONSTRAINT rag_jobs_action_check
  CHECK (action IN ('dry_run', 'ingest', 'reingest', 'unpublish'));

ALTER TABLE rag.ingestion_runs
  DROP CONSTRAINT IF EXISTS ingestion_runs_status_check;

ALTER TABLE rag.ingestion_runs
  ADD CONSTRAINT ingestion_runs_status_check
  CHECK (status IN ('ready', 'skipped', 'needs_ocr', 'rejected', 'failed', 'unpublished'));
