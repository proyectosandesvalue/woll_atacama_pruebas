-- Fix: agregar total_count a chat_layer_features para detectar truncamiento.
--
-- Bug: get_layer_features devolvía solo 500 features (el límite),
-- pero el orquestador no sabía si había más. Sin esa info, no podía
-- generar el notice de truncamiento.
--
-- Fix: agregar 'total_count' al JSON de respuesta con el total real
-- (sin límite) de features que matchean los filtros.

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
        format('%I = %L', i.key, i.value::text)
      );
    END IF;
  END LOOP;

  -- 1. Contar total real (sin límite).
  count_sql := format('SELECT count(*)::int FROM %s', phys);
  IF array_length(where_clauses, 1) > 0 THEN
    count_sql := count_sql || ' WHERE ' || array_to_string(where_clauses, ' AND ');
  END IF;
  EXECUTE count_sql INTO total_count;

  -- 2. Obtener las features (con límite).
  sql := format(
    'SELECT jsonb_build_object(
       ''type'', ''FeatureCollection'',
       ''features'', COALESCE(jsonb_agg(
         jsonb_build_object(
           ''type'', ''Feature'',
           ''geometry'', ST_AsGeoJSON(geom, 5)::jsonb,
           ''properties'', to_jsonb(t) - ''geom''
         )
       ), ''[]''::jsonb)
     )
     FROM (
       SELECT * FROM %s',
    phys
  );

  IF array_length(where_clauses, 1) > 0 THEN
    sql := sql || ' WHERE ' || array_to_string(where_clauses, ' AND ');
  END IF;

  sql := sql || format(' LIMIT %L) t', capped_limit);

  EXECUTE sql INTO result;

  -- 3. Agregar total_count al resultado.
  result := COALESCE(result, jsonb_build_object('type', 'FeatureCollection', 'features', '[]'::jsonb));
  result := jsonb_set(result, '{total_count}', to_jsonb(total_count));

  RETURN result;
END;
$$;

NOTIFY pgrst, 'reload schema';