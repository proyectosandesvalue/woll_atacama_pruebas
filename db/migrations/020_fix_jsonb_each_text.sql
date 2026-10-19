-- =====================================================================
-- 020_fix_jsonb_each_text.sql
-- Fix: filtros con jsonb_each_text para evitar comillas en el patron LIKE.
--
-- Bug: jsonb_each devuelve el value como jsonb, y su ::text incluye
-- las comillas. Ej: '{"Cuenca": "Copiapo"}' -> '"Copiapo"'.
-- Entonces el LIKE busca '%"Copiapo"%' en lugar de '%Copiapo%'.
--
-- Fix: usar jsonb_each_text, que devuelve el value como text sin comillas.
--
-- Idempotente: re-ejecutable.
-- =====================================================================

SET search_path TO chat, public, extensions;

-- ─────────────────────────────────────────────────────────────────────
-- 1. chat_query con jsonb_each_text
-- ─────────────────────────────────────────────────────────────────────
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

  -- jsonb_each_text devuelve text sin comillas.
  FOR i IN SELECT * FROM jsonb_each_text(p_filters) LOOP
    IF i.key = ANY(whitelisted) AND i.value IS NOT NULL THEN
      where_clauses := array_append(
        where_clauses,
        format('%I::text ILIKE %L', i.key, '%' || i.value || '%')
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

-- ─────────────────────────────────────────────────────────────────────
-- 2. chat_layer_features con jsonb_each_text
-- ─────────────────────────────────────────────────────────────────────
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

  FOR i IN SELECT * FROM jsonb_each_text(p_filters) LOOP
    IF i.key = ANY(whitelisted) AND i.value IS NOT NULL THEN
      where_clauses := array_append(
        where_clauses,
        format('%I::text ILIKE %L', i.key, '%' || i.value || '%')
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

-- ─────────────────────────────────────────────────────────────────────
-- 3. Wrappers en public
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.chat_query(
  p_layer   text,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_limit   int   DEFAULT 20,
  p_offset  int   DEFAULT 0
) RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, chat, extensions
AS $$
  SELECT chat.chat_query(p_layer, p_filters, p_limit, p_offset);
$$;

CREATE OR REPLACE FUNCTION public.chat_layer_features(
  p_layer   text,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_limit   int   DEFAULT 500
) RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, chat, extensions
AS $$
  SELECT chat.chat_layer_features(p_layer, p_filters, p_limit);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Grants
-- ─────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION chat.chat_query(text, jsonb, int, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_query(text, jsonb, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION chat.chat_query(text, jsonb, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_query(text, jsonb, int, int) TO service_role;

REVOKE ALL ON FUNCTION chat.chat_layer_features(text, jsonb, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_layer_features(text, jsonb, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION chat.chat_layer_features(text, jsonb, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_layer_features(text, jsonb, int) TO service_role;

-- Recargar schema cache de PostgREST
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
   WHERE routine_name = 'chat_query'
     AND routine_schema IN ('chat', 'public');
  RAISE NOTICE '[020] chat_query disponible: %/2', n;

  SELECT count(*) INTO n
    FROM information_schema.routines
   WHERE routine_name = 'chat_layer_features'
     AND routine_schema IN ('chat', 'public');
  RAISE NOTICE '[020] chat_layer_features disponible: %/2', n;
END $$;