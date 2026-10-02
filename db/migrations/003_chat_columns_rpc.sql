-- =====================================================================
-- 003_chat_columns_rpc.sql
-- Migración fase 2.1: RPCs helper para introspección de tablas.
--
-- Contexto:
--   PostgREST (la API REST de Supabase) NO expone el esquema
--   information_schema. Los scripts Node que necesitan leer las
--   columnas reales de una tabla no pueden consultarlo directamente
--   vía REST.
--
--   Solución: estas dos RPCs corren en Postgres con permisos totales
--   y devuelven la información que necesitamos.
--
-- Añade:
--   - chat.chat_table_exists(schema, table)   → boolean
--   - chat.chat_columns_for_table(schema, table) → jsonb array
--
-- Idempotente: re-ejecutable.
-- =====================================================================

SET search_path TO chat, public;

-- ─────────────────────────────────────────────────────────────────────
-- chat_table_exists(p_schema, p_table) → boolean
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION chat.chat_table_exists(
  p_schema text,
  p_table  text
) RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = chat, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = p_schema
       AND table_name   = p_table
  );
$$;

-- ─────────────────────────────────────────────────────────────────────
-- chat_columns_for_table(p_schema, p_table) → jsonb
-- ─────────────────────────────────────────────────────────────────────
-- Devuelve [{column_name, data_type, is_nullable, ordinal_position}, ...]
-- ordenado por ordinal_position.
CREATE OR REPLACE FUNCTION chat.chat_columns_for_table(
  p_schema text,
  p_table  text
) RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = chat, public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'column_name',      column_name,
        'data_type',        data_type,
        'is_nullable',      is_nullable,
        'ordinal_position', ordinal_position
      )
      ORDER BY ordinal_position
    ),
    '[]'::jsonb
  )
  FROM information_schema.columns
  WHERE table_schema = p_schema
    AND table_name   = p_table;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- Grants: solo service_role
-- ─────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION chat.chat_table_exists(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION chat.chat_columns_for_table(text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION chat.chat_table_exists(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION chat.chat_columns_for_table(text, text) TO service_role;

COMMENT ON FUNCTION chat.chat_table_exists(text, text) IS
  'Helper: verifica si una tabla existe (para scripts Node vía PostgREST).';
COMMENT ON FUNCTION chat.chat_columns_for_table(text, text) IS
  'Helper: devuelve las columnas reales de una tabla (para scripts Node vía PostgREST).';

-- ─────────────────────────────────────────────────────────────────────
-- Verificación
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '[003] RPCs helper creadas: chat_table_exists, chat_columns_for_table';
END $$;