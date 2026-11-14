-- =====================================================================
-- 000_compat_roles.sql
--
-- Base portable para PostgreSQL propio (VPS / Docker).
--
-- Objetivo:
--   1. Crear el schema `extensions` y las extensiones que el proyecto usa.
--   2. Crear los roles que las migraciones 001-037 esperan encontrar
--      (`anon`, `authenticated`, `service_role`) y los roles de login del
--      servidor propio (`woll_api`, `woll_ingest`).
--   3. Fijar `search_path` para resolver `geometry`, `vector` y `unaccent`.
--   4. Dejar permisos por defecto para que las funciones/tablas creadas en
--      las migraciones siguientes sean accesibles con mínimo privilegio.
--
-- Idempotente: se puede aplicar dos veces.
--
-- Los passwords NO se crean aquí. `scripts/bootstrap-roles.sh` los setea
-- desde variables de entorno y les habilita LOGIN.
-- =====================================================================

SET search_path TO public, extensions;

-- ── Schemas ──────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS chat;
CREATE SCHEMA IF NOT EXISTS admin;
CREATE SCHEMA IF NOT EXISTS ingest;
CREATE SCHEMA IF NOT EXISTS rag;

-- ── Extensiones ──────────────────────────────────────────────────────
-- PostGIS vive en `public` para igualar Supabase: las tablas del dump usan
-- `public.geometry`. pgvector y unaccent van en `extensions`.
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- ── Roles de compatibilidad (NOLOGIN) ────────────────────────────────
-- Supabase los trae; en PostgreSQL propio hay que crearlos para que los
-- GRANT/REVOKE de 001-037 no fallen. No se les da login.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

-- ── Roles de login del servidor propio (NOLOGIN hasta bootstrap) ─────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'woll_api') THEN
    CREATE ROLE woll_api NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'woll_ingest') THEN
    CREATE ROLE woll_ingest NOLOGIN;
  END IF;
END $$;

-- El API y la ingesta nunca son superusuarios ni bypassean RLS.
ALTER ROLE woll_api
  NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
ALTER ROLE woll_ingest
  NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

-- ── search_path ──────────────────────────────────────────────────────
DO $$
BEGIN
  EXECUTE format(
    'ALTER DATABASE %I SET search_path TO public, extensions',
    current_database()
  );
END $$;

ALTER ROLE woll_api SET search_path TO public, extensions;
ALTER ROLE woll_ingest SET search_path TO public, extensions, ingest;

-- ── Acceso a schemas ─────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public, extensions TO woll_api, woll_ingest;
GRANT USAGE ON SCHEMA chat, admin TO woll_api;
GRANT USAGE ON SCHEMA rag TO woll_api;
GRANT USAGE ON SCHEMA chat TO woll_ingest;
GRANT USAGE ON SCHEMA ingest TO woll_ingest;

-- ── Permisos existentes (idempotencia si se re-ejecuta) ──────────────
GRANT SELECT ON ALL TABLES IN SCHEMA public TO woll_api;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO woll_api;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA chat TO woll_api;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA admin TO woll_api;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ingest
  TO woll_ingest;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ingest TO woll_ingest;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO woll_ingest;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA chat TO woll_ingest;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ingest TO woll_ingest;

-- ── Permisos por defecto para objetos futuros ────────────────────────
-- El runner de migraciones corre como `postgres`; estos defaults aplican a
-- las tablas/funciones que creen 001-037 y a las tablas restauradas después.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO woll_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO woll_api, woll_ingest;
ALTER DEFAULT PRIVILEGES IN SCHEMA chat
  GRANT EXECUTE ON FUNCTIONS TO woll_api, woll_ingest;
ALTER DEFAULT PRIVILEGES IN SCHEMA admin
  GRANT EXECUTE ON FUNCTIONS TO woll_api;

ALTER DEFAULT PRIVILEGES IN SCHEMA ingest
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO woll_ingest;
ALTER DEFAULT PRIVILEGES IN SCHEMA ingest
  GRANT USAGE, SELECT ON SEQUENCES TO woll_ingest;
ALTER DEFAULT PRIVILEGES IN SCHEMA ingest
  GRANT EXECUTE ON FUNCTIONS TO woll_ingest;

-- ── Hardening básico del schema public ───────────────────────────────
-- En PostgreSQL 15+ el owner es pg_database_owner; se quita CREATE a PUBLIC
-- para que nadie cree objetos arbitrarios en public.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

COMMENT ON SCHEMA extensions IS
  'Extensiones compartidas: pgvector y unaccent (PostGIS vive en public).';
COMMENT ON ROLE woll_api IS
  'API Node: solo lectura/execute; sin BYPASSRLS ni superuser.';
COMMENT ON ROLE woll_ingest IS
  'Ingestas: escritura en ingest.* y execute de RPCs; sin BYPASSRLS.';
