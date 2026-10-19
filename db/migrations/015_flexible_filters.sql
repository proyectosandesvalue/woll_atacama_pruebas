-- =====================================================================
-- 015_flexible_filters.sql
-- Filtros flexibles con ILIKE y normalización de valores.
--
-- Problema: los filtros usaban `=` exacto, pero los valores reales en la
-- base tienen variaciones (mayúsculas, espacios, abreviaturas, tildes).
-- Ejemplo: el usuario pide "cuenca Copiapó" pero el valor real es
-- "R. Copiapo" (con abreviatura, espacios y sin tilde).
--
-- Solución: usar ILIKE con '%' || valor || '%' para match flexible.
-- Además, normalizar el valor del filtro (trim + sin tildes) antes
-- de comparar.
--
-- Idempotente: re-ejecutable.
-- =====================================================================

SET search_path TO chat, public, extensions;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Función auxiliar: normalizar texto (quitar tildes, minúsculas)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION chat.normalize_text(input text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT lower(
    translate(
      input,
      'áéíóúÁÉÍÓÚñÑüÜ',
      'aeiouAEIOUnNuU'
    )
  );
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. chat_query con filtros flexibles (ILIKE)
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

  SELECT array_agg(DISTINCT attr->>'name') INTO whitelisted
    FROM chat.chat_catalog c, jsonb_array_elements(c.attributes) attr
   WHERE c.layer_id = p_layer;

  IF whitelisted IS NULL THEN
    SELECT array_agg(column_name) INTO whitelisted
      FROM information_schema.columns
     WHERE table_schema = split_part(phys, '.', 1)
       AND table_name   = split_part(phys, '.', 2)
       AND column_name NOT IN ('geom','geometry','the_geom','gid');
  END IF;

  -- Filtros con ILIKE y normalización (sin tildes, case-insensitive).
  FOR i IN SELECT * FROM jsonb_each(p_filters) LOOP
    IF i.key = ANY(whitelisted) AND i.value IS NOT NULL THEN
      where_clauses := array_append(
        where_clauses,
        format(
          'chat.normalize_text(%I::text) LIKE %L',
          i.key,
          '%' || chat.normalize_text(i.value::text) || '%'
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

-- ─────────────────────────────────────────────────────────────────────
-- 3. chat_layer_features con filtros flexibles (ILIKE)
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

  -- Filtros con ILIKE y normalización.
  FOR i IN SELECT * FROM jsonb_each(p_filters) LOOP
    IF i.key = ANY(whitelisted) AND i.value IS NOT NULL THEN
      where_clauses := array_append(
        where_clauses,
        format(
          'chat.normalize_text(%I::text) LIKE %L',
          i.key,
          '%' || chat.normalize_text(i.value::text) || '%'
        )
      );
    END IF;
  END LOOP;

  -- 1. Contar total real.
  count_sql := format('SELECT count(*)::int FROM %s', phys);
  IF array_length(where_clauses, 1) > 0 THEN
    count_sql := count_sql || ' WHERE ' || array_to_string(where_clauses, ' AND ');
  END IF;
  EXECUTE count_sql INTO total_count;

  -- 2. Obtener las features.
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

  result := COALESCE(result, jsonb_build_object('type', 'FeatureCollection', 'features', '[]'::jsonb));
  result := jsonb_set(result, '{total_count}', to_jsonb(total_count));

  RETURN result;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Wrappers en public (por si no existen)
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
-- 5. Grants
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
-- 6. Verificación
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n
    FROM information_schema.routines
   WHERE routine_name = 'normalize_text'
     AND routine_schema = 'chat';
  RAISE NOTICE '[015] normalize_text creada: %/1', n;

  SELECT count(*) INTO n
    FROM information_schema.routines
   WHERE routine_name = 'chat_query'
     AND routine_schema IN ('chat', 'public');
  RAISE NOTICE '[015] chat_query disponible: %/2', n;

  SELECT count(*) INTO n
    FROM information_schema.routines
   WHERE routine_name = 'chat_layer_features'
     AND routine_schema IN ('chat', 'public');
  RAISE NOTICE '[015] chat_layer_features disponible: %/2', n;
END $$;