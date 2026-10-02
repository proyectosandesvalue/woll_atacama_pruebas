-- =====================================================================
-- 005_move_rpcs_to_public.sql (v2)
-- Migración fase 2.3: exponer RPCs del chat en public vía wrappers.
--
-- Contexto:
--   PostgREST solo expone el esquema `public` por defecto. Algunas RPCs
--   del chat viven en `chat.*` y solo son visibles parcialmente por el
--   search_path del rol `authenticator`. Las nuevas RPCs
--   (chat_aggregate_by_admin, chat_layer_schema) fallan con PGRST202.
--
--   Solución: crear wrappers `public.chat_*` que delegan en las
--   versiones canónicas `chat.chat_*`. PostgREST ve los wrappers, las
--   funciones internas siguen llamándose entre sí en `chat`, y no hay
--   que tocar ni runners.js ni orchestrator.js ni los scripts Node.
--
-- Notas:
--   - `chat_upsert_layer` y `chat_refresh_stats` NO se envuelven: ya
--     funcionan vía PostgREST (los scripts las llaman con éxito). Si
--     algún día fallan, se añaden aquí con la firma correcta.
--   - `chat_table_exists` y `chat_columns_for_table` ya están en
--     `public` desde el 003 v2.
--
-- Idempotente: re-ejecutable.
-- =====================================================================

SET search_path TO public, chat, extensions;

-- ─────────────────────────────────────────────────────────────────────
-- 1. public.chat_catalog() → wrapper
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.chat_catalog()
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, chat, extensions
AS $$
  SELECT chat.chat_catalog();
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. public.chat_layer_stats(p_layer) → wrapper
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.chat_layer_stats(p_layer text)
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, chat, extensions
AS $$
  SELECT chat.chat_layer_stats(p_layer);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. public.chat_query(...) → wrapper
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.chat_query(
  p_layer   text,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_limit   int   DEFAULT 20,
  p_offset  int   DEFAULT 0
) RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, chat, extensions
AS $$
  SELECT chat.chat_query(p_layer, p_filters, p_limit, p_offset);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. public.chat_aggregate(...) → wrapper
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.chat_aggregate(
  p_layer    text,
  p_group_by text,
  p_metric   text  DEFAULT 'count',
  p_field    text  DEFAULT NULL,
  p_filters  jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, chat, extensions
AS $$
  SELECT chat.chat_aggregate(p_layer, p_group_by, p_metric, p_field, p_filters);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. public.chat_layer_schema(p_layer) → wrapper
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.chat_layer_schema(p_layer text)
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, chat, extensions
AS $$
  SELECT chat.chat_layer_schema(p_layer);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 6. public.chat_aggregate_by_admin(...) → wrapper
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.chat_aggregate_by_admin(
  p_layer       text,
  p_admin_level text,
  p_metric      text  DEFAULT 'count',
  p_field       text  DEFAULT NULL,
  p_filters     jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, chat, extensions
AS $$
  SELECT chat.chat_aggregate_by_admin(
    p_layer, p_admin_level, p_metric, p_field, p_filters);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 7. Grants: solo service_role
-- ─────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.chat_catalog() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_layer_stats(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_query(text, jsonb, int, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_aggregate(text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_layer_schema(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_aggregate_by_admin(text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.chat_catalog() TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_layer_stats(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_query(text, jsonb, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_aggregate(text, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_layer_schema(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_aggregate_by_admin(text, text, text, text, jsonb) TO service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 8. Recargar schema cache de PostgREST
-- ─────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- ─────────────────────────────────────────────────────────────────────
-- Verificación
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n
    FROM information_schema.routines
   WHERE routine_schema = 'public'
     AND routine_name IN (
       'chat_catalog','chat_layer_stats','chat_query','chat_aggregate',
       'chat_layer_schema','chat_aggregate_by_admin'
     );
  RAISE NOTICE '[005 v2] Wrappers public.chat_* creados: %/6', n;
END $$;