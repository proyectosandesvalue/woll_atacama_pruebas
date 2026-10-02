-- =====================================================================
-- 006_spatial_tools_2.sql
-- Migración fase 2.4: tools espaciales avanzadas.
--
-- Añade 3 RPCs:
--   1. chat_count_near_layer: cuenta features de una capa fuente que
--      estén a menos de X metros de CUALQUIERA de las features de una o
--      varias capas objetivo.
--      Ej: "¿cuántas instalaciones mineras están a menos de 500 m de
--           un río, glaciar, humedal o laguna?"
--
--   2. chat_aggregate_near_layer: igual que la anterior pero agrupa por
--      comuna/provincia/región.
--      Ej: "¿cuántas plantas desaladoras a menos de 2 km del mar hay
--           por comuna?"
--
--   3. chat_aggregate_by_admin_and_column: doble agrupación — por nivel
--      administrativo (vía ST_Intersects con comunas_poligonos) y por
--      una columna adicional.
--      Ej: "¿cuántos derechos de agua por comuna según tipo de uso?"
--
-- Idempotente: re-ejecutable.
-- =====================================================================

SET search_path TO chat, public, extensions;

-- ─────────────────────────────────────────────────────────────────────
-- 1. chat_count_near_layer
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION chat.chat_count_near_layer(
  p_layer_source  text,
  p_layer_targets text[],           -- array de layer_ids objetivo
  p_distance_m    double precision, -- distancia en metros
  p_filters       jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = chat, public, extensions
AS $$
DECLARE
  phys_source  text;
  target_phys  text[] := ARRAY[]::text[];
  t_id         text;
  where_clauses text[] := ARRAY[]::text[];
  whitelisted  text[];
  i            record;
  sql          text;
  result       bigint;
BEGIN
  -- 1. Resolver tabla física de la fuente
  SELECT physical_table INTO phys_source
    FROM chat.chat_catalog
   WHERE layer_id = p_layer_source AND enabled;

  IF phys_source IS NULL THEN
    RAISE EXCEPTION 'Capa fuente no encontrada o deshabilitada: %', p_layer_source;
  END IF;

  -- 2. Resolver todas las tablas físicas de las capas objetivo
  IF p_layer_targets IS NULL OR array_length(p_layer_targets, 1) IS NULL THEN
    RAISE EXCEPTION 'Debes indicar al menos una capa objetivo en p_layer_targets';
  END IF;

  FOREACH t_id IN ARRAY p_layer_targets LOOP
    DECLARE
      tp text;
    BEGIN
      SELECT physical_table INTO tp
        FROM chat.chat_catalog
       WHERE layer_id = t_id AND enabled;
      IF tp IS NULL THEN
        RAISE EXCEPTION 'Capa objetivo no encontrada o deshabilitada: %', t_id;
      END IF;
      target_phys := target_phys || tp;
    END;
  END LOOP;

  -- 3. Validar distancia
  IF p_distance_m IS NULL OR p_distance_m <= 0 THEN
    RAISE EXCEPTION 'p_distance_m debe ser un número positivo';
  END IF;

  -- 4. Whitelist de columnas de la fuente para filtros
  SELECT array_agg(DISTINCT column_name) INTO whitelisted
    FROM information_schema.columns
   WHERE table_schema = split_part(phys_source, '.', 1)
     AND table_name   = split_part(phys_source, '.', 2)
     AND column_name NOT IN ('geom','geometry','the_geom','gid');

  FOR i IN SELECT * FROM jsonb_each(p_filters) LOOP
    IF i.key = ANY(whitelisted) AND i.value IS NOT NULL THEN
      where_clauses := array_append(
        where_clauses,
        format('s.%I = %L', i.key, i.value::text)
      );
    END IF;
  END LOOP;

  -- 5. Construir SQL con UNION ALL de todas las capas objetivo
  --    Usamos EXISTS + ST_DWithin con geography (metros).
  --    Nota: ST_DWithin sobre geography es más lento que sobre geometry
  --    con índice, pero para 20K features es aceptable (~50-200ms).
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

  IF array_length(where_clauses, 1) > 0 THEN
    sql := sql || ' AND ' || array_to_string(where_clauses, ' AND ');
  END IF;

  EXECUTE sql INTO result;

  RETURN jsonb_build_object(
    'count', result,
    'source_layer', p_layer_source,
    'target_layers', to_jsonb(p_layer_targets),
    'distance_m', p_distance_m
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. chat_aggregate_near_layer
-- ─────────────────────────────────────────────────────────────────────
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
  phys_source  text;
  target_phys  text[] := ARRAY[]::text[];
  t_id         text;
  admin_name_col text;
  where_clauses text[] := ARRAY[]::text[];
  whitelisted  text[];
  i            record;
  sql          text;
  result       jsonb;
BEGIN
  SELECT physical_table INTO phys_source
    FROM chat.chat_catalog
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
      SELECT physical_table INTO tp
        FROM chat.chat_catalog
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

  SELECT array_agg(DISTINCT column_name) INTO whitelisted
    FROM information_schema.columns
   WHERE table_schema = split_part(phys_source, '.', 1)
     AND table_name   = split_part(phys_source, '.', 2)
     AND column_name NOT IN ('geom','geometry','the_geom','gid');

  FOR i IN SELECT * FROM jsonb_each(p_filters) LOOP
    IF i.key = ANY(whitelisted) AND i.value IS NOT NULL THEN
      where_clauses := array_append(
        where_clauses,
        format('s.%I = %L', i.key, i.value::text)
      );
    END IF;
  END LOOP;

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

  IF array_length(where_clauses, 1) > 0 THEN
    sql := sql || ' AND ' || array_to_string(where_clauses, ' AND ');
  END IF;

  sql := sql || format(' GROUP BY a.%I) sub LIMIT 50', admin_name_col);

  EXECUTE sql INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. chat_aggregate_by_admin_and_column
-- ─────────────────────────────────────────────────────────────────────
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
    ELSE RAISE EXCEPTION 'admin_level inválido: %', p_admin_level;
  END CASE;

  -- Validar p_group_by contra columnas reales
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

  FOR i IN SELECT * FROM jsonb_each(p_filters) LOOP
    IF i.key = ANY(whitelisted) AND i.value IS NOT NULL THEN
      where_clauses := array_append(
        where_clauses,
        format('d.%I = %L', i.key, i.value::text)
      );
    END IF;
  END LOOP;

  -- Devolvemos array plano de {comuna, grupo, valor}
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

  IF array_length(where_clauses, 1) > 0 THEN
    sql := sql || ' WHERE ' || array_to_string(where_clauses, ' AND ');
  END IF;

  sql := sql || format(' GROUP BY a.%I, d.%I) sub LIMIT 200', admin_name_col, p_group_by);

  EXECUTE sql INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Wrappers en public para que PostgREST las exponga
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
  SELECT chat.chat_count_near_layer(p_layer_source, p_layer_targets, p_distance_m, p_filters);
$$;

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
-- 5. Grants
-- ─────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.chat_count_near_layer(text, text[], double precision, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_aggregate_near_layer(text, text[], double precision, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_aggregate_by_admin_and_column(text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.chat_count_near_layer(text, text[], double precision, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_aggregate_near_layer(text, text[], double precision, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_aggregate_by_admin_and_column(text, text, text, text, text, jsonb) TO service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 6. Recargar schema cache
-- ─────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

DO $$
BEGIN
  RAISE NOTICE '[006] 3 RPCs espaciales avanzadas creadas (chat + public)';
END $$;