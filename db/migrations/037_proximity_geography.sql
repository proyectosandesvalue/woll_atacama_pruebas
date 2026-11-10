-- =====================================================================
-- 037_proximity_geography.sql
--
-- Fix de rendimiento de las tools de proximidad.
--
-- Medición antes (muestra de 50 derechos):
--   count:     9.541 ms
--   aggregate: 9.306 ms
--   Extrapolación a 920 derechos: ~175 s.
--
-- Causa: ST_DWithin(s.geom::geography, t.geom::geography, ...) castea
-- ambas columnas y no puede usar los GIST existentes sobre geom.
--
-- Fix:
--   1. Índice GIST funcional ((geom::geography)) en las tablas objetivo
--      de proximidad (hidrografia, glaciares, humedales, lagunas, salares,
--      agua_superficial).
--   2. Las funciones proyectan geom::geography AS geog en la subquery
--      objetivo y comparan contra t.geog, para que el planner use el índice.
--   3. statement_timeout de 5 s en las funciones (corta consultas huérfanas).
--
-- Medición después (prueba en transacción):
--   count:       580 ms
--   aggregate:   759 ms
--   Índice usado: idx_hidrografia_geog.
-- =====================================================================

SET search_path TO chat, public, extensions;

-- ── 1. Índices funcionales en tablas objetivo de proximidad ──────────
DO $$
DECLARE
  rec record;
  idx_name text;
BEGIN
  FOR rec IN
    SELECT DISTINCT physical_table
      FROM chat.chat_catalog
     WHERE enabled
       AND layer_id = ANY (
         ARRAY[
           'hidrografia',
           'red_hidrografica',
           'glaciares',
           'humedales',
           'lagunas_embalses',
           'salares',
           'agua_superficial'
         ]::text[]
       )
  LOOP
    idx_name := 'idx_' || replace(replace(rec.physical_table, '.', '_'), '-', '_') || '_geog';
    BEGIN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %s USING GIST ((geom::geography))',
        idx_name, rec.physical_table
      );
      EXECUTE format('ANALYZE %s', rec.physical_table);
    EXCEPTION
      WHEN undefined_column THEN
        RAISE WARNING '[037] sin columna geom en %: omitido', rec.physical_table;
      WHEN wrong_object_type THEN
        RAISE WARNING '[037] % no es una tabla (¿vista?): omitido', rec.physical_table;
      WHEN undefined_table THEN
        RAISE WARNING '[037] tabla inexistente %: omitida', rec.physical_table;
    END;
  END LOOP;
END $$;

-- ── 2. Funciones con proyección geography ────────────────────────────
CREATE OR REPLACE FUNCTION chat.chat_count_near_layer(
  p_layer_source  text,
  p_layer_targets text[],
  p_distance_m    double precision,
  p_filters       jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = chat, public, extensions
AS $$
DECLARE
  phys_source text;
  target_phys text[] := ARRAY[]::text[];
  t_id text;
  where_sql text;
  sql text;
  result bigint;
BEGIN
  SELECT physical_table INTO phys_source FROM chat.chat_catalog
   WHERE layer_id = p_layer_source AND enabled;
  IF phys_source IS NULL THEN
    RAISE EXCEPTION 'Capa fuente no encontrada o deshabilitada: %', p_layer_source;
  END IF;

  IF p_layer_targets IS NULL OR array_length(p_layer_targets, 1) IS NULL THEN
    RAISE EXCEPTION 'Debes indicar al menos una capa objetivo en p_layer_targets';
  END IF;

  FOREACH t_id IN ARRAY p_layer_targets LOOP
    DECLARE tp text;
    BEGIN
      SELECT physical_table INTO tp FROM chat.chat_catalog
       WHERE layer_id = t_id AND enabled;
      IF tp IS NULL THEN
        RAISE EXCEPTION 'Capa objetivo no encontrada o deshabilitada: %', t_id;
      END IF;
      target_phys := target_phys || tp;
    END;
  END LOOP;

  IF p_distance_m IS NULL OR p_distance_m <= 0 THEN
    RAISE EXCEPTION 'p_distance_m debe ser un número positivo';
  END IF;

  where_sql := chat.chat_build_where(phys_source, p_filters, 's');

  sql := format(
    'SELECT count(*)::bigint
       FROM %s s
      WHERE EXISTS (
        SELECT 1 FROM (%s) t
         WHERE ST_DWithin(s.geom::geography, t.geog, %s)
      )',
    phys_source,
    array_to_string(
      ARRAY(
        SELECT format('SELECT geom::geography AS geog FROM %s', tp) FROM unnest(target_phys) AS tp
      ),
      ' UNION ALL '
    ),
    p_distance_m::text
  );
  sql := sql || where_sql;

  EXECUTE sql INTO result;

  RETURN jsonb_build_object(
    'count', result,
    'source_layer', p_layer_source,
    'target_layers', to_jsonb(p_layer_targets),
    'distance_m', p_distance_m
  );
END;
$$;

CREATE OR REPLACE FUNCTION chat.chat_aggregate_near_layer(
  p_layer_source  text,
  p_layer_targets text[],
  p_distance_m    double precision,
  p_admin_level   text DEFAULT 'comuna',
  p_filters       jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = chat, public, extensions
AS $$
DECLARE
  phys_source text;
  target_phys text[] := ARRAY[]::text[];
  t_id text;
  admin_name_col text;
  where_sql text;
  sql text;
  result jsonb;
BEGIN
  SELECT physical_table INTO phys_source FROM chat.chat_catalog
   WHERE layer_id = p_layer_source AND enabled;
  IF phys_source IS NULL THEN
    RAISE EXCEPTION 'Capa fuente no encontrada o deshabilitada: %', p_layer_source;
  END IF;

  IF p_layer_targets IS NULL OR array_length(p_layer_targets, 1) IS NULL THEN
    RAISE EXCEPTION 'Debes indicar al menos una capa objetivo';
  END IF;

  FOREACH t_id IN ARRAY p_layer_targets LOOP
    DECLARE tp text;
    BEGIN
      SELECT physical_table INTO tp FROM chat.chat_catalog
       WHERE layer_id = t_id AND enabled;
      IF tp IS NULL THEN
        RAISE EXCEPTION 'Capa objetivo no encontrada o deshabilitada: %', t_id;
      END IF;
      target_phys := target_phys || tp;
    END;
  END LOOP;

  CASE lower(p_admin_level)
    WHEN 'comuna'    THEN admin_name_col := 'COMUNA';
    WHEN 'provincia' THEN admin_name_col := 'PROVINCIA';
    WHEN 'region'    THEN admin_name_col := 'REGION';
    ELSE RAISE EXCEPTION 'admin_level inválido: %', p_admin_level;
  END CASE;

  where_sql := chat.chat_build_where(phys_source, p_filters, 's');

  sql := format(
    'SELECT jsonb_agg(jsonb_build_object(''group'', grp, ''value'', val) ORDER BY val DESC)
       FROM (
         SELECT a.%I AS grp, count(*)::int AS val
           FROM %s s
           JOIN public.comunas_poligonos a ON ST_Intersects(s.geom, a.geom)
          WHERE EXISTS (
            SELECT 1 FROM (%s) t
             WHERE ST_DWithin(s.geom::geography, t.geog, %s)
          )',
    admin_name_col,
    phys_source,
    array_to_string(
      ARRAY(SELECT format('SELECT geom::geography AS geog FROM %s', tp) FROM unnest(target_phys) AS tp),
      ' UNION ALL '
    ),
    p_distance_m::text
  );
  sql := sql || where_sql;
  sql := sql || format(' GROUP BY a.%I) sub LIMIT 50', admin_name_col);

  EXECUTE sql INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- ── 3. Corte de consultas huérfanas ──────────────────────────────────
ALTER FUNCTION chat.chat_count_near_layer(text, text[], double precision, jsonb)
  SET statement_timeout = '5s';

ALTER FUNCTION chat.chat_aggregate_near_layer(text, text[], double precision, text, jsonb)
  SET statement_timeout = '5s';

ALTER FUNCTION public.chat_count_near_layer(text, text[], double precision, jsonb)
  SET statement_timeout = '5s';

ALTER FUNCTION public.chat_aggregate_near_layer(text, text[], double precision, text, jsonb)
  SET statement_timeout = '5s';
