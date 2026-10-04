-- =====================================================================
-- 010_chat_layer_features.sql
-- RPC para devolver features de una capa como FeatureCollection.
-- Usado por el chat para pintar resultados en el mapa.
-- Idempotente: re-ejecutable.
-- =====================================================================

SET search_path TO chat, public, extensions;

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
  result jsonb;
  capped_limit int;
BEGIN
  SELECT physical_table INTO phys FROM chat.chat_catalog
   WHERE layer_id = p_layer AND enabled;
  IF phys IS NULL THEN
    RAISE EXCEPTION 'Capa no encontrada o deshabilitada: %', p_layer;
  END IF;

  -- Cap: 1 a 1000 features
  capped_limit := LEAST(GREATEST(p_limit, 1), 1000);

  -- Whitelist de columnas: SIEMPRE desde information_schema.
  -- El campo `attributes` del catálogo puede estar en formatos distintos
  -- y no vale la pena depender de él para construir la whitelist.
  SELECT array_agg(column_name) INTO whitelisted
    FROM information_schema.columns
   WHERE table_schema = split_part(phys, '.', 1)
     AND table_name   = split_part(phys, '.', 2)
     AND column_name NOT IN ('geom','geometry','the_geom','gid');

  -- Construir WHERE con filtros whitelisteados
  FOR i IN SELECT * FROM jsonb_each(p_filters) LOOP
    IF i.key = ANY(whitelisted) AND i.value IS NOT NULL THEN
      where_clauses := array_append(
        where_clauses,
        format('%I = %L', i.key, i.value::text)
      );
    END IF;
  END LOOP;

  -- Construir SQL. La geometría va como GeoJSON con 5 decimales.
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
  RETURN COALESCE(
    result,
    jsonb_build_object('type', 'FeatureCollection', 'features', '[]'::jsonb)
  );
END;
$$;

-- Wrapper en public para PostgREST
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

-- Grants: solo service_role
REVOKE ALL ON FUNCTION chat.chat_layer_features(text, jsonb, int)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_layer_features(text, jsonb, int)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION chat.chat_layer_features(text, jsonb, int)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_layer_features(text, jsonb, int)
  TO service_role;

-- Recargar schema cache de PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- Verificación
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n
    FROM information_schema.routines
   WHERE routine_name = 'chat_layer_features'
     AND routine_schema IN ('chat', 'public');
  RAISE NOTICE '[010] chat_layer_features creada: %/2 (chat + public)', n;
END $$;