-- =====================================================================
-- 008_wrappers_faltantes.sql
-- Migración fase 3.1: wrappers de PostgREST para RPCs que faltaban.
--
-- Contexto:
--   La migración 005 creó wrappers en public.* para 6 RPCs del chat.
--   Pero otras RPCs siguen viviendo solo en chat.* y PostgREST no las
--   expone (solo expone public.*). Este archivo crea los wrappers
--   faltantes:
--     - chat_columns_for_table (creada en 003)
--     - chat_table_exists (creada en 003)
--     - chat_refresh_stats (creada en 001)
--     - chat_aggregate_by_admin_and_column (creada en 006)
--     - chat_count_near_layer (creada en 006)
--     - chat_aggregate_near_layer (creada en 006)
--
-- Idempotente: re-ejecutable.
-- =====================================================================

SET search_path TO public, chat, extensions;

-- ─────────────────────────────────────────────────────────────────────
-- 1. public.chat_columns_for_table(p_schema, p_table) → wrapper
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.chat_columns_for_table(
  p_schema text,
  p_table  text
) RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, chat, extensions
AS $$
  SELECT chat.chat_columns_for_table(p_schema, p_table);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. public.chat_table_exists(p_schema, p_table) → wrapper
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.chat_table_exists(
  p_schema text,
  p_table  text
) RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, chat, extensions
AS $$
  SELECT chat.chat_table_exists(p_schema, p_table);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. public.chat_refresh_stats() → wrapper
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.chat_refresh_stats()
RETURNS void
LANGUAGE sql VOLATILE
SECURITY DEFINER SET search_path = public, chat, extensions
AS $$
  SELECT chat.chat_refresh_stats();
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. public.chat_aggregate_by_admin_and_column(...) → wrapper
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.chat_aggregate_by_admin_and_column(
  p_layer       text,
  p_admin_level text,
  p_group_by    text,
  p_metric      text  DEFAULT 'count',
  p_field       text  DEFAULT NULL,
  p_filters     jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, chat, extensions
AS $$
  SELECT chat.chat_aggregate_by_admin_and_column(
    p_layer, p_admin_level, p_group_by, p_metric, p_field, p_filters);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. public.chat_count_near_layer(...) → wrapper
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.chat_count_near_layer(
  p_layer_source  text,
  p_layer_targets text[],
  p_distance_m    double precision,
  p_filters       jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, chat, extensions
AS $$
  SELECT chat.chat_count_near_layer(
    p_layer_source, p_layer_targets, p_distance_m, p_filters);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 6. public.chat_aggregate_near_layer(...) → wrapper
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.chat_aggregate_near_layer(
  p_layer_source  text,
  p_layer_targets text[],
  p_distance_m    double precision,
  p_admin_level   text DEFAULT 'comuna',
  p_filters       jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, chat, extensions
AS $$
  SELECT chat.chat_aggregate_near_layer(
    p_layer_source, p_layer_targets, p_distance_m, p_admin_level, p_filters);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 7. Grants: solo service_role
-- ─────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.chat_columns_for_table(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_table_exists(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_refresh_stats() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_aggregate_by_admin_and_column(text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_count_near_layer(text, text[], double precision, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_aggregate_near_layer(text, text[], double precision, text, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.chat_columns_for_table(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_table_exists(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_refresh_stats() TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_aggregate_by_admin_and_column(text, text, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_count_near_layer(text, text[], double precision, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_aggregate_near_layer(text, text[], double precision, text, jsonb) TO service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 8. Recargar schema cache
-- ─────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- ─────────────────────────────────────────────────────────────────────
-- 9. Verificación
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n
    FROM information_schema.routines
   WHERE routine_schema = 'public'
     AND routine_name IN (
       'chat_columns_for_table',
       'chat_table_exists',
       'chat_refresh_stats',
       'chat_aggregate_by_admin_and_column',
       'chat_count_near_layer',
       'chat_aggregate_near_layer'
     );
  RAISE NOTICE '[008] Wrappers creados: %/6', n;
END $$;