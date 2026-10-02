-- =====================================================================
-- 004_chat_catalog_exists_filter.sql
-- Migración fase 2.2: chat_catalog() filtra por existencia de tabla física.
--
-- Contexto:
--   Hoy el catálogo del LLM (chat_catalog) devuelve TODAS las filas con
--   enabled = true, incluidas capas que aún no han sido subidas a
--   Supabase. El LLM las ve, intenta consultarlas, y falla con error de
--   tabla inexistente.
--
--   Solución: chat_catalog() cruza la fila del catálogo con
--   information_schema.tables para devolver SOLO las capas que existen
--   físicamente en la base de datos.
--
--   Consecuencias:
--     - Las capas declaradas en el visor pero aún no subidas a Supabase
--       se omiten automáticamente del catálogo del LLM.
--     - Cuando se sube una capa nueva (ej: desde QGIS), aparece
--       automáticamente en el catálogo sin tocar `enabled` ni re-ejecutar
--       scripts.
--     - Las capas WMS (wms_ide_minagri, wms_ide_ciren_agroindustrias)
--       NUNCA tienen tabla física propia y por tanto quedan omitidas
--       permanentemente. Esto es intencional: los WMS no exponen datos
--       vectoriales consultables ni admiten geoprocesos con otras capas
--       (solo CUT sería aplicable, que es un caso de uso futuro).
--
-- Idempotente: re-ejecutable.
-- =====================================================================

SET search_path TO chat, public, extensions;

CREATE OR REPLACE FUNCTION chat.chat_catalog() RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = chat, public, extensions
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'layer_id',      c.layer_id,
        'display_name',  c.display_name,
        'dimension',     c.dimension,
        'geometry_type', c.geometry_type,
        'attributes',    c.attributes,
        'description',   c.description
      )
      ORDER BY c.dimension, c.display_name
    ),
    '[]'::jsonb
  )
  FROM chat.chat_catalog c
  WHERE c.enabled = true
    AND EXISTS (
      SELECT 1
        FROM information_schema.tables ist
       WHERE ist.table_schema = split_part(c.physical_table, '.', 1)
         AND ist.table_name   = split_part(c.physical_table, '.', 2)
    );
$$;

REVOKE ALL ON FUNCTION chat.chat_catalog() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION chat.chat_catalog() TO service_role;

COMMENT ON FUNCTION chat.chat_catalog() IS
  'Catálogo del LLM: solo capas con tabla física existente. '
  'Las capas declaradas en el visor pero aún no subidas a Supabase se omiten '
  'automáticamente y reaparecen cuando sus tablas se creen. '
  'Los WMS quedan omitidos permanentemente (no exponen datos vectoriales).';