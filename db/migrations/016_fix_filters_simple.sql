-- Fix: filtros flexibles sin normalize_text en EXECUTE dinámico.
--
-- Bug: el EXECUTE dinámico usaba normalize_text(...) pero el search_path
-- del contexto no siempre incluía chat, causando que la función no se
-- encontrara y el LIKE fallara silenciosamente.
--
-- Fix: usar ILIKE directo (case-insensitive). La normalización de tildes
-- se hace en el JS antes de pasar el filtro a la RPC.

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
  whitelisted text[];
  phys text;
  where_clauses text[] := ARRAY[]::text[];
  i record;
  sql text;
  result jsonb;
BEGIN
  SELECT physical_table INTO phys FROM chat.chat_catalog
   WHERE layer_id = p_layer AND enabled;
  IF phys IS NULL THEN
    RAISE EXCEPTION 'Capa no encontrada o deshabilitada: %', p_layer;
  END IF;

  SELECT array_agg(column_name) INTO whitelisted
    FROM information_schema.columns
   WHERE table_schema = split_part(phys, '.', 1)
     AND table_name   = split_part(phys, '.', 2)
     AND column_name NOT IN ('geom','geometry','the_geom','gid');

  -- Filtros con ILIKE directo (case-insensitive, sin normalize_text).
  FOR i IN SELECT * FROM jsonb_each(p_filters) LOOP
    IF i.key = ANY(whitelisted) AND i.value IS NOT NULL THEN
      where_clauses := array_append(
        where_clauses,
        format(
          '%I::text ILIKE %L',
          i.key,
          '%' || i.value::text || '%'
        )
      );
    END IF;
  END LOOP;

  sql := format('SELECT jsonb_agg(t) FROM (
                  SELECT row_to_json(x)::jsonb - ''geom'' AS row FROM (SELECT * FROM %s',
                 phys);
  IF array_length(where_clauses, 1) > 0 THEN
    sql := sql || ' WHERE ' || array_to_string(where_clauses, ' AND ');
  END IF;
  sql := sql || format(' LIMIT %L OFFSET %L) x) t', p_limit, p_offset);

  EXECUTE sql INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

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
  whitelisted text[];
  where_clauses text[] := ARRAY[]::text[];
  i record;
  sql text;
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

  SELECT array_agg(column_name) INTO whitelisted
    FROM information_schema.columns
   WHERE table_schema = split_part(phys, '.', 1)
     AND table_name   = split_part(phys, '.', 2)
     AND column_name NOT IN ('geom','geometry','the_geom','gid');

  FOR i IN SELECT * FROM jsonb_each(p_filters) LOOP
    IF i.key = ANY(whitelisted) AND i.value IS NOT NULL THEN
      where_clauses := array_append(
        where_clauses,
        format(
          '%I::text ILIKE %L',
          i.key,
          '%' || i.value::text || '%'
        )
      );
    END IF;
  END LOOP;

  count_sql := format('SELECT count(*)::int FROM %s', phys);
  IF array_length(where_clauses, 1) > 0 THEN
    count_sql := count_sql || ' WHERE ' || array_to_string(where_clauses, ' AND ');
  END IF;
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

  IF array_length(where_clauses, 1) > 0 THEN
    sql := sql || ' WHERE ' || array_to_string(where_clauses, ' AND ');
  END IF;

  sql := sql || format(' LIMIT %L) t', capped_limit);

  EXECUTE sql INTO result;
  RETURN COALESCE(result, jsonb_build_object('type', 'FeatureCollection', 'features', '[]'::jsonb, 'total_count', 0));
END;
$$;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';