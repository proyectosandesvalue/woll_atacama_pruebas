-- =====================================================================
-- db/roles/rag_roles.example.sql
-- Roles de LOGIN para el VPS. NO es una migración: se ejecuta una vez
-- por entorno, como superusuario, y las contraseñas se toman del gestor
-- de secretos (nunca se versionan).
--
-- Sustituye los placeholders antes de ejecutar. Los roles NOLOGIN
-- (rag_writer, chat_ro) los crea la migración 036.
--
--   psql "$DATABASE_URL_SUPERUSER" -f db/roles/rag_roles.example.sql
-- =====================================================================

-- Ingesta (CLI scripts/ingest_docs.mjs).
CREATE ROLE rag_ingest LOGIN PASSWORD 'REEMPLAZAR_CON_SECRETO' IN ROLE rag_writer;

-- Lectura del chat / panel (Sprint 18 y Sprint 15).
CREATE ROLE chat_api LOGIN PASSWORD 'REEMPLAZAR_CON_SECRETO' IN ROLE chat_ro;

-- Endurecimiento: sin CREATE sobre public y sin acceso a otros schemas.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE woll TO rag_ingest, chat_api;

-- Verificación:
--   SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname IN ('rag_ingest','chat_api');
--   \du rag_ingest
