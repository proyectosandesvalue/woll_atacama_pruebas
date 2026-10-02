-- =====================================================================
-- 002_chat_spatial.sql
-- Migración fase 2: geoprocesos espaciales para el chat IA.
--
-- Fix v2: 
--   - search_path incluye 'extensions' (PostGIS en Supabase).
--   - ORDER BY dentro de jsonb_agg usa subquery (el alias 'value' no
--     estaba disponible en el scope del agregado).
-- =====================================================================

SET search_path TO chat, public, extensions;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Índices GIST (iterando catálogo)
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  rec record;
  idx_name text;
BEGIN
  FOR rec IN
    SELECT physical_table FROM chat.chat_catalog WHERE enabled
  LOOP
    idx_name := 'idx_' || replace(replace(rec.physical_table, '.', '_'), '-', '_') || '_geom';
    BEGIN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %s USING GIST (geom)',
        idx_name, rec.physical_table);
    EXCEPTION
      WHEN undefined_column THEN
        RAISE WARNING '[002] Sin columna geom en %: omitido', rec.physical_table;
      WHEN undefined_table THEN
        RAISE WARNING '[002] Tabla inexistente %: omitido', rec.physical_table;
    END;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'comunas_poligonos'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_comunas_poligonos_geom
             ON public.comunas_poligonos USING GIST (geom)';
    RAISE NOTICE '[002] Índice GIST creado en public.comunas_poligonos';
  ELSE
    RAISE WARNING '[002] public.comunas_poligonos no existe: re-ejecuta este bloque tras subirla';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. chat_layer_schema(layer_id)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION chat.chat_layer_schema(p_layer text)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = chat, public, extensions
AS $$
DECLARE
  phys text;
  cols jsonb := '[]'::jsonb;
  rec record;
  col_info jsonb;
  is_num boolean;
  v_min double precision;
  v_max double precision;
  v_mean double precision;
  v_top jsonb;
BEGIN
  SELECT physical_table INTO phys
    FROM chat.chat_catalog
   WHERE layer_id = p_layer AND enabled;

  IF phys IS NULL THEN
    RAISE EXCEPTION 'Capa no encontrada o deshabilitada: %', p_layer;
  END IF;

  FOR rec IN
    EXECUTE format(
      'SELECT column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = split_part(%L, ''.'', 1)
          AND table_name   = split_part(%L, ''.'', 2)
          AND column_name NOT IN (''geom'',''geometry'',''the_geom'',''gid'',''id'')
        ORDER BY ordinal_position',
      phys, phys)
  LOOP
    is_num := rec.data_type IN
      ('integer','bigint','numeric','real','double precision','smallint');

    IF is_num THEN
      EXECUTE format(
        'SELECT min(%I)::double precision,
                max(%I)::double precision,
                avg(%I)::double precision
           FROM %s WHERE %I IS NOT NULL',
        rec.column_name, rec.column_name, rec.column_name, phys, rec.column_name)
      INTO v_min, v_max, v_mean;
    ELSE
      v_min := NULL; v_max := NULL; v_mean := NULL;
    END IF;

    EXECUTE format(
      'SELECT jsonb_agg(t) FROM (
         SELECT %I::text AS value, count(*)::int AS count
           FROM %s
          WHERE %I IS NOT NULL
          GROUP BY %I
          ORDER BY count DESC
          LIMIT 5
       ) t',
      rec.column_name, phys, rec.column_name, rec.column_name)
    INTO v_top;

    col_info := jsonb_build_object(
      'name',        rec.column_name,
      'type',        rec.data_type,
      'is_numeric',  is_num,
      'min',         v_min,
      'max',         v_max,
      'mean',        v_mean,
      'top_values',  COALESCE(v_top, '[]'::jsonb)
    );

    cols := cols || jsonb_build_array(col_info);
    v_min := NULL; v_max := NULL; v_mean := NULL; v_top := NULL;
  END LOOP;

  RETURN jsonb_build_object(
    'layer_id',       p_layer,
    'physical_table', phys,
    'columns',        cols
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. chat_aggregate_by_admin(...)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION chat.chat_aggregate_by_admin(
  p_layer       text,
  p_admin_level text,
  p_metric      text  DEFAULT 'count',
  p_field       text  DEFAULT NULL,
  p_filters     jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = chat, public, extensions
AS $$
DECLARE
  phys text;
  admin_name_col text;
  agg_expr text;
  where_clauses text[] := ARRAY[]::text[];
  whitelisted text[];
  i record;
  sql text;
  result jsonb;
BEGIN
  SELECT physical_table INTO phys
    FROM chat.chat_catalog
   WHERE layer_id = p_layer AND enabled;

  IF phys IS NULL THEN
    RAISE EXCEPTION 'Capa no encontrada o deshabilitada: %', p_layer;
  END IF;

  CASE lower(p_admin_level)
    WHEN 'comuna'    THEN admin_name_col := 'COMUNA';
    WHEN 'provincia' THEN admin_name_col := 'PROVINCIA';
    WHEN 'region'    THEN admin_name_col := 'REGION';
    ELSE RAISE EXCEPTION 'admin_level inválido: %. Válidos: comuna, provincia, region', p_admin_level;
  END CASE;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'comunas_poligonos'
  ) THEN
    RAISE EXCEPTION 'La tabla public.comunas_poligonos no existe. Súbela desde QGIS antes de usar esta tool.';
  END IF;

  IF p_metric NOT IN ('count','avg','sum','min','max') THEN
    RAISE EXCEPTION 'metric inválido: %. Válidos: count, avg, sum, min, max', p_metric;
  END IF;

  IF p_metric <> 'count' AND (p_field IS NULL OR p_field = '') THEN
    RAISE EXCEPTION 'Se requiere "field" para metric = %', p_metric;
  END IF;

  agg_expr := CASE p_metric
    WHEN 'count' THEN 'count(*)::int'
    WHEN 'avg'   THEN format('avg(d.%I)::double precision', p_field)
    WHEN 'sum'   THEN format('sum(d.%I)::double precision', p_field)
    WHEN 'min'   THEN format('min(d.%I)::double precision', p_field)
    WHEN 'max'   THEN format('max(d.%I)::double precision', p_field)
  END;

  SELECT array_agg(DISTINCT column_name) INTO whitelisted
    FROM information_schema.columns
   WHERE table_schema = split_part(phys, '.', 1)
     AND table_name   = split_part(phys, '.', 2)
     AND column_name NOT IN ('geom','geometry','the_geom','gid');

  FOR i IN SELECT * FROM jsonb_each(p_filters) LOOP
    IF i.key = ANY(whitelisted) AND i.value IS NOT NULL THEN
      where_clauses := array_append(
        where_clauses,
        format('d.%I = %L', i.key, i.value::text)
      );
    END IF;
  END LOOP;

  -- Subquery para que ORDER BY val funcione
  sql := format(
    'SELECT jsonb_agg(jsonb_build_object(''group'', grp, ''value'', val) ORDER BY val DESC)
       FROM (
         SELECT a.%I AS grp, %s AS val
           FROM %s d
           JOIN public.comunas_poligonos a ON ST_Intersects(d.geom, a.geom)',
    admin_name_col, agg_expr, phys);

  IF array_length(where_clauses, 1) > 0 THEN
    sql := sql || ' WHERE ' || array_to_string(where_clauses, ' AND ');
  END IF;

  sql := sql || format(' GROUP BY a.%I) sub LIMIT 50', admin_name_col);

  EXECUTE sql INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Grants
-- ─────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION chat.chat_layer_schema(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION chat.chat_aggregate_by_admin(text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION chat.chat_layer_schema(text) TO service_role;
GRANT EXECUTE ON FUNCTION chat.chat_aggregate_by_admin(text, text, text, text, jsonb) TO service_role;

COMMENT ON FUNCTION chat.chat_layer_schema(text) IS
  'Fase 2: introspección de columnas reales de una capa.';
COMMENT ON FUNCTION chat.chat_aggregate_by_admin(text, text, text, text, jsonb) IS
  'Fase 2: agrupa registros por COMUNA/PROVINCIA/REGION vía ST_Intersects.';