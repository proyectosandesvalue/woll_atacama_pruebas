-- Fix: chat_aggregate fallaba con "column value does not exist"
-- porque el ORDER BY usaba el alias del jsonb_build_object.
--
-- Fix: envolver en subquery y ordenar por el alias real.

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
  where_clauses text[] := ARRAY[]::text[];
  i record;
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

  FOR i IN SELECT * FROM jsonb_each(p_filters) LOOP
    IF i.key = ANY(whitelisted) AND i.value IS NOT NULL THEN
      where_clauses := array_append(where_clauses, format('%I = %L', i.key, i.value::text));
    END IF;
  END LOOP;

  -- Fix: subquery para poder ordenar por el alias 'v'.
  sql := format(
    'SELECT jsonb_agg(jsonb_build_object(''group'', g, ''value'', v) ORDER BY v DESC)
       FROM (
         SELECT %I AS g, %s AS v
         FROM %s',
    p_group_by, agg_expr, phys);

  IF array_length(where_clauses, 1) > 0 THEN
    sql := sql || ' WHERE ' || array_to_string(where_clauses, ' AND ');
  END IF;

  sql := sql || format(' GROUP BY %I LIMIT 50) sub', p_group_by);

  EXECUTE sql INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;