-- =====================================================================
-- 021_fix_filters_robust.sql
-- Fix: filtros robustos con operadores para las 7 RPCs del chat.
--
-- Problema:
--   - chat_query y chat_layer_features usan jsonb_each_text (funcionan).
--   - Las 5 RPCs de agregación y proximidad usan jsonb_each con
--     value::text, que conserva las comillas ("Consuntivo"). Un filtro
--     de texto compara contra '"Consuntivo"' y NUNCA coincide.
--   - Las 7 ignoran en silencio una clave que no esté en la whitelist.
--
-- Solución:
--   - Función auxiliar chat.chat_build_where que acepta dos formatos:
--     objeto {col: valor} y arreglo [{field, op, value|values}].
--   - Operadores en whitelist: match, eq, in, ilike, gt, gte, lt, lte, between.
--   - Texto: compara con chat.normalize_text(btrim(col::text)).
--   - match: igualdad normalizada, con fallback a "contiene".
--   - Campo desconocido: error explícito con las columnas válidas.
--
-- Idempotente: re-ejecutable.
-- =====================================================================

SET search_path TO chat, public, extensions;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Función auxiliar: construye el WHERE desde p_filters
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION chat.chat_build_where(
  p_phys text,
  p_filters jsonb,
  p_alias text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = chat, public, extensions
AS $$
DECLARE
  whitelisted text[];
  where_clauses text[] := ARRAY[]::text[];
  col_types jsonb;
  prefix text;
  i record;
  cond_field text;
  cond_op text;
  cond_value text;
  cond_values text[];
  cond_sql text;
  norm_col text;
  norm_val text;
BEGIN
  IF p_filters IS NULL OR p_filters = '{}'::jsonb OR p_filters = '[]'::jsonb THEN
    RETURN '';
  END IF;

  -- Whitelist de columnas y tipos
  SELECT array_agg(column_name), jsonb_object_agg(column_name, data_type)
    INTO whitelisted, col_types
    FROM information_schema.columns
   WHERE table_schema = split_part(p_phys, '.', 1)
     AND table_name   = split_part(p_phys, '.', 2)
     AND column_name NOT IN ('geom','geometry','the_geom','gid');

  IF whitelisted IS NULL THEN
    RAISE EXCEPTION 'No se encontraron columnas para la tabla %', p_phys;
  END IF;

  prefix := CASE WHEN p_alias IS NOT NULL AND p_alias <> '' THEN p_alias || '.' ELSE '' END;

  -- Si p_filters es un objeto, convertir a arreglo de condiciones {field, op, value}.
  IF jsonb_typeof(p_filters) = 'object' THEN
    FOR i IN SELECT * FROM jsonb_each_text(p_filters) LOOP
      IF i.key = ANY(whitelisted) AND i.value IS NOT NULL AND i.value <> '' THEN
        -- Normalizar nombre de columna (case-insensitive)
        SELECT c INTO cond_field FROM unnest(whitelisted) c WHERE lower(c) = lower(i.key) LIMIT 1;
        IF cond_field IS NULL THEN
          RAISE EXCEPTION 'Campo desconocido: "%". Columnas válidas: %', i.key, array_to_string(whitelisted, ', ');
        END IF;

        norm_col := format('chat.normalize_text(btrim(%s%I::text))', prefix, cond_field);
        norm_val := format('chat.normalize_text(btrim(%L))', i.value);

        -- match: igualdad normalizada; si no matchea exacto, cae a contiene.
        cond_sql := format(
          '(%s = %s OR %s LIKE ''%%'' || %s || ''%%'')',
          norm_col, norm_val, norm_col, norm_val
        );
        where_clauses := array_append(where_clauses, cond_sql);
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(p_filters) = 'array' THEN
    FOR i IN SELECT * FROM jsonb_array_elements(p_filters) LOOP
      cond_field := i.value->>'field';
      cond_op := lower(coalesce(i.value->>'op', 'match'));

      IF cond_field IS NULL THEN
        CONTINUE;
      END IF;

      -- Resolver nombre de columna (case-insensitive)
      SELECT c INTO cond_field FROM unnest(whitelisted) c WHERE lower(c) = lower(cond_field) LIMIT 1;
      IF cond_field IS NULL THEN
        RAISE EXCEPTION 'Campo desconocido: "%". Columnas válidas: %', i.value->>'field', array_to_string(whitelisted, ', ');
      END IF;

      norm_col := format('chat.normalize_text(btrim(%s%I::text))', prefix, cond_field);

      -- Extraer valor(es)
      IF i.value ? 'values' THEN
        SELECT array_agg(chat.normalize_text(btrim(v)))
          INTO cond_values
          FROM jsonb_array_elements_text(i.value->'values') v;
      ELSIF i.value ? 'value' THEN
        cond_value := chat.normalize_text(btrim(i.value->>'value'));
      END IF;

      -- Construir condición según operador
      CASE cond_op
        WHEN 'match' THEN
          cond_sql := format(
            '(%s = %L OR %s LIKE ''%%'' || %L || ''%%'')',
            norm_col, cond_value, norm_col, cond_value
          );

        WHEN 'eq' THEN
          cond_sql := format('%s = %L', norm_col, cond_value);

        WHEN 'in' THEN
          IF cond_values IS NULL OR array_length(cond_values, 1) IS NULL THEN
            CONTINUE;
          END IF;
          cond_sql := format('%s = ANY(%L::text[])', norm_col, cond_values);

        WHEN 'ilike' THEN
          cond_sql := format('%s LIKE ''%%'' || %L || ''%%''', norm_col, cond_value);

        WHEN 'gt' THEN
          cond_sql := format('(%s%I)::numeric > %L::numeric', prefix, cond_field, i.value->>'value');

        WHEN 'gte' THEN
          cond_sql := format('(%s%I)::numeric >= %L::numeric', prefix, cond_field, i.value->>'value');

        WHEN 'lt' THEN
          cond_sql := format('(%s%I)::numeric < %L::numeric', prefix, cond_field, i.value->>'value');

        WHEN 'lte' THEN
          cond_sql := format('(%s%I)::numeric <= %L::numeric', prefix, cond_field, i.value->>'value');

        WHEN 'between' THEN
          IF cond_values IS NULL OR array_length(cond_values, 1) <> 2 THEN
            RAISE EXCEPTION 'El operador between requiere exactamente 2 valores';
          END IF;
          cond_sql := format(
            '(%s%I)::numeric BETWEEN %L::numeric AND %L::numeric',
            prefix, cond_field, i.value->'values'->>0, i.value->'values'->>1
          );

        ELSE
          RAISE EXCEPTION 'Operador no soportado: %', cond_op;
      END CASE;

      where_clauses := array_append(where_clauses, cond_sql);
    END LOOP;
  END IF;

  IF array_length(where_clauses, 1) IS NULL OR array_length(where_clauses, 1) = 0 THEN
    RETURN '';
  END IF;

  RETURN ' WHERE ' || array_to_string(where_clauses, ' AND ');
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Reescribir las 7 RPCs para usar chat_build_where
-- ─────────────────────────────────────────────────────────────────────

-- chat_query
CREATE OR REPLACE FUNCTION chat.chat_query(
  p_layer text,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_limit  int  DEFAULT 20,
  p_offset int  DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = chat, public
AS $$
DECLARE
  phys text;
  where_sql text;
  sql text;
  result jsonb;
BEGIN
  SELECT physical_table INTO phys FROM chat.chat_catalog
   WHERE layer_id = p_layer AND enabled;
  IF phys IS NULL THEN
    RAISE EXCEPTION 'Capa no encontrada o deshabilitada: %', p_layer;
  END IF;

  where_sql := chat.chat_build_where(phys, p_filters, NULL);

  sql := format('SELECT jsonb_agg(t) FROM (
                  SELECT row_to_json(x)::jsonb - ''geom'' AS row FROM (SELECT * FROM %s',
                 phys);
  sql := sql || where_sql;
  sql := sql || format(' LIMIT %L OFFSET %L) x) t', p_limit, p_offset);

  EXECUTE sql INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- chat_layer_features
CREATE OR REPLACE FUNCTION chat.chat_layer_features(
  p_layer   text,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_limit   int   DEFAULT 500
) RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = chat, public, extensions
AS $$
DECLARE
  phys text;
  where_sql text;
  count_sql text;
  result jsonb;
  total_count int;
  capped_limit int;
BEGIN
  SELECT physical_table INTO phys FROM chat.chat_catalog
   WHERE layer_id = p_layer AND enabled;
  IF phys IS NULL THEN
    RAISE EXCEPTION 'Capa no encontrada o deshabilitada: %', p_layer;
  END IF;

  capped_limit := LEAST(GREATEST(p_limit, 1), 1000);

  where_sql := chat.chat_build_where(phys, p_filters, NULL);

  count_sql := format('SELECT count(*)::int FROM %s', phys) || where_sql;
  EXECUTE count_sql INTO total_count;

  sql := format(
    'SELECT jsonb_build_object(
       ''type'', ''FeatureCollection'',
       ''features'', COALESCE(jsonb_agg(
         jsonb_build_object(
           ''type'', ''Feature'',
           ''geometry'', ST_AsGeoJSON(geom, 5)::jsonb,
           ''properties'', to_jsonb(t) - ''geom''
         )
       ), ''[]''::jsonb),
       ''total_count'', %L
     )
     FROM (
       SELECT * FROM %s',
    total_count, phys
  );
  sql := sql || where_sql;
  sql := sql || format(' LIMIT %L) t', capped_limit);

  EXECUTE sql INTO result;
  RETURN COALESCE(result, jsonb_build_object('type', 'FeatureCollection', 'features', '[]'::jsonb, 'total_count', 0));
END;
$$;

-- chat_aggregate
CREATE OR REPLACE FUNCTION chat.chat_aggregate(
  p_layer    text,
  p_group_by text,
  p_metric   text DEFAULT 'count',
  p_field    text DEFAULT NULL,
  p_filters  jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = chat, public
AS $$
DECLARE
  whitelisted text[];
  phys text;
  where_sql text;
  agg_expr text;
  sql text;
  result jsonb;
BEGIN
  SELECT physical_table INTO phys FROM chat.chat_catalog
   WHERE layer_id = p_layer AND enabled;
  IF phys IS NULL THEN
    RAISE EXCEPTION 'Capa no encontrada o deshabilitada: %', p_layer;
  END IF;

  SELECT array_agg(DISTINCT column_name) INTO whitelisted
    FROM information_schema.columns
   WHERE table_schema = split_part(phys, '.', 1)
     AND table_name   = split_part(phys, '.', 2)
     AND column_name NOT IN ('geom','geometry','the_geom','gid');

  IF NOT (p_group_by = ANY(whitelisted)) THEN
    RAISE EXCEPTION 'Campo group_by no whitelisteado: %', p_group_by;
  END IF;

  IF p_metric <> 'count' AND (p_field IS NULL OR NOT (p_field = ANY(whitelisted))) THEN
    RAISE EXCEPTION 'Campo field no whitelisteado: %', p_field;
  END IF;

  agg_expr := CASE p_metric
    WHEN 'count' THEN 'count(*)::int'
    WHEN 'avg'   THEN format('avg(%I)::double precision', p_field)
    WHEN 'sum'   THEN format('sum(%I)::double precision', p_field)
    WHEN 'min'   THEN format('min(%I)::double precision', p_field)
    WHEN 'max'   THEN format('max(%I)::double precision', p_field)
  END;

  where_sql := chat.chat_build_where(phys, p_filters, NULL);

  sql := format(
    'SELECT jsonb_agg(jsonb_build_object(''group'', g, ''value'', v) ORDER BY v DESC)
       FROM (
         SELECT %I AS g, %s AS v
         FROM %s',
    p_group_by, agg_expr, phys);
  sql := sql || where_sql;
  sql := sql || format(' GROUP BY %I LIMIT 50) sub', p_group_by);

  EXECUTE sql INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- chat_aggregate_by_admin
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
  where_sql text;
  whitelisted text[];
  sql text;
  result jsonb;
BEGIN
  SELECT physical_table INTO phys FROM chat.chat_catalog
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
    RAISE EXCEPTION 'La tabla public.comunas_poligonos no existe.';
  END IF;

  IF p_metric NOT IN ('count','avg','sum','min','max') THEN
    RAISE EXCEPTION 'metric inválido: %', p_metric;
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

  where_sql := chat.chat_build_where(phys, p_filters, 'd');

  sql := format(
    'SELECT jsonb_agg(jsonb_build_object(''group'', grp, ''value'', val) ORDER BY val DESC)
       FROM (
         SELECT a.%I AS grp, %s AS val
           FROM %s d
           JOIN public.comunas_poligonos a ON ST_Intersects(d.geom, a.geom)',
    admin_name_col, agg_expr, phys);
  sql := sql || where_sql;
  sql := sql || format(' GROUP BY a.%I) sub LIMIT 50', admin_name_col);

  EXECUTE sql INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- chat_aggregate_by_admin_and_column
CREATE OR REPLACE FUNCTION chat.chat_aggregate_by_admin_and_column(
  p_layer       text,
  p_admin_level text,
  p_group_by    text,
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
  where_sql text;
  whitelisted text[];
  sql text;
  result jsonb;
BEGIN
  SELECT physical_table INTO phys FROM chat.chat_catalog
   WHERE layer_id = p_layer AND enabled;
  IF phys IS NULL THEN
    RAISE EXCEPTION 'Capa no encontrada o deshabilitada: %', p_layer;
  END IF;

  CASE lower(p_admin_level)
    WHEN 'comuna'    THEN admin_name_col := 'COMUNA';
    WHEN 'provincia' THEN admin_name_col := 'PROVINCIA';
    WHEN 'region'    THEN admin_name_col := 'REGION';
    ELSE RAISE EXCEPTION 'admin_level inválido: %', p_admin_level;
  END CASE;

  SELECT array_agg(DISTINCT column_name) INTO whitelisted
    FROM information_schema.columns
   WHERE table_schema = split_part(phys, '.', 1)
     AND table_name   = split_part(phys, '.', 2)
     AND column_name NOT IN ('geom','geometry','the_geom','gid');

  IF NOT (p_group_by = ANY(whitelisted)) THEN
    RAISE EXCEPTION 'Campo group_by "%" no existe en la capa. Columnas disponibles: %',
      p_group_by, array_to_string(whitelisted, ', ');
  END IF;

  IF p_metric NOT IN ('count','avg','sum','min','max') THEN
    RAISE EXCEPTION 'metric inválido: %', p_metric;
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

  where_sql := chat.chat_build_where(phys, p_filters, 'd');

  sql := format(
    'SELECT jsonb_agg(jsonb_build_object(
        ''admin'', admin_name,
        ''group'', grp,
        ''value'', val
      ) ORDER BY admin_name, val DESC)
       FROM (
         SELECT a.%I AS admin_name, d.%I AS grp, %s AS val
           FROM %s d
           JOIN public.comunas_poligonos a ON ST_Intersects(d.geom, a.geom)',
    admin_name_col, p_group_by, agg_expr, phys
  );
  sql := sql || where_sql;
  sql := sql || format(' GROUP BY a.%I, d.%I) sub LIMIT 200', admin_name_col, p_group_by);

  EXECUTE sql INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- chat_count_near_layer
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
         WHERE ST_DWithin(s.geom::geography, t.geom::geography, %s)
      )',
    phys_source,
    array_to_string(
      ARRAY(
        SELECT format('SELECT geom FROM %s', tp) FROM unnest(target_phys) AS tp
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

-- chat_aggregate_near_layer
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
             WHERE ST_DWithin(s.geom::geography, t.geom::geography, %s)
          )',
    admin_name_col,
    phys_source,
    array_to_string(
      ARRAY(SELECT format('SELECT geom FROM %s', tp) FROM unnest(target_phys) AS tp),
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

-- ─────────────────────────────────────────────────────────────────────
-- 3. Grants (los wrappers no cambian de firma)
-- ─────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION chat.chat_build_where(text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION chat.chat_build_where(text, jsonb, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Verificación
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n
    FROM information_schema.routines
   WHERE routine_name = 'chat_build_where'
     AND routine_schema = 'chat';
  RAISE NOTICE '[021] chat_build_where creada: %/1', n;

  SELECT count(*) INTO n
    FROM information_schema.routines
   WHERE routine_name IN ('chat_query', 'chat_layer_features', 'chat_aggregate',
                          'chat_aggregate_by_admin', 'chat_aggregate_by_admin_and_column',
                          'chat_count_near_layer', 'chat_aggregate_near_layer')
     AND routine_schema = 'chat';
  RAISE NOTICE '[021] RPCs disponibles: %/7', n;
END $$;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';