-- =====================================================================
-- 007_chat_upsert_layer.sql
-- Migración fase 1.1: RPC para poblar/actualizar el catálogo del chat.
--
-- Contexto:
--   `scripts/build_catalog.mjs` hace UPSERT de cada capa del visor en
--   `chat.chat_catalog`, pero esa RPC nunca se definió. Este archivo la
--   crea (canónica en chat.*) + wrapper en public.* para que PostgREST
--   la exponga.
--
-- Idempotente: re-ejecutable.
-- =====================================================================

SET search_path TO chat, public, extensions;

-- ─────────────────────────────────────────────────────────────────────
-- 1. chat.chat_upsert_layer(...) — UPSERT tipado
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION chat.chat_upsert_layer(
  p_layer_id        text,
  p_physical_table  text,
  p_display_name    text,
  p_dimension       text,
  p_geometry_type   text DEFAULT 'GEOMETRY',
  p_srid            int  DEFAULT 4326,
  p_description     text DEFAULT NULL,
  p_attributes      jsonb DEFAULT '[]'::jsonb,
  p_enabled         boolean DEFAULT true
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = chat, public, extensions
AS $$
BEGIN
  INSERT INTO chat.chat_catalog (
    layer_id, physical_table, display_name, dimension,
    geometry_type, srid, description, attributes, enabled, updated_at
  ) VALUES (
    p_layer_id, p_physical_table, p_display_name, p_dimension,
    p_geometry_type, p_srid, p_description,
    CASE
      WHEN p_attributes IS NULL THEN '[]'::jsonb
      WHEN jsonb_typeof(p_attributes) = 'string' THEN (p_attributes)::jsonb
      ELSE p_attributes
    END,
    p_enabled, now()
  )
  ON CONFLICT (layer_id) DO UPDATE SET
    physical_table = EXCLUDED.physical_table,
    display_name   = EXCLUDED.display_name,
    dimension      = EXCLUDED.dimension,
    geometry_type  = EXCLUDED.geometry_type,
    srid           = EXCLUDED.srid,
    description    = EXCLUDED.description,
    attributes     = EXCLUDED.attributes,
    enabled        = EXCLUDED.enabled,
    updated_at     = now();
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. public.chat_upsert_layer(...) — wrapper para PostgREST
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.chat_upsert_layer(
  p_layer_id        text,
  p_physical_table  text,
  p_display_name    text,
  p_dimension       text,
  p_geometry_type   text DEFAULT 'GEOMETRY',
  p_srid            int  DEFAULT 4326,
  p_description     text DEFAULT NULL,
  p_attributes      jsonb DEFAULT '[]'::jsonb,
  p_enabled         boolean DEFAULT true
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, chat, extensions
AS $$
  SELECT chat.chat_upsert_layer(
    p_layer_id, p_physical_table, p_display_name, p_dimension,
    p_geometry_type, p_srid, p_description, p_attributes, p_enabled
  );
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Grants: solo service_role
-- ─────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION chat.chat_upsert_layer(text, text, text, text, text, int, text, jsonb, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_upsert_layer(text, text, text, text, text, int, text, jsonb, boolean)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION chat.chat_upsert_layer(text, text, text, text, text, int, text, jsonb, boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_upsert_layer(text, text, text, text, text, int, text, jsonb, boolean)
  TO service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Recargar schema cache de PostgREST
-- ─────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- ─────────────────────────────────────────────────────────────────────
-- 5. Verificación
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n
    FROM information_schema.routines
   WHERE routine_name = 'chat_upsert_layer'
     AND routine_schema IN ('chat', 'public');
  RAISE NOTICE '[007] chat_upsert_layer creada: %/2 (chat + public)', n;
END $$;