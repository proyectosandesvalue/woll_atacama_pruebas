-- 075_chat_query_nulls_last.sql
--
-- Sprint 18-G: el orden top-N debe dejar NULL al final.
-- Sin NULLS LAST, un ORDER BY Volumen DESC devuelve primero los nulos
-- y el top-N no muestra los valores reales.
--
-- Idempotente: CREATE OR REPLACE.

--   - `p_order_dir` ('asc' | 'desc', default 'desc').
--   - Límite acotado a 1..50 y offset >= 0.
--
-- Compatibilidad:
--   - Se reemplazan las firmas de 4 argumentos por una de 6 con defaults.
--   - Las llamadas existentes con 4 argumentos siguen funcionando.
--
-- Idempotente: se puede re-ejecutar.

SET search_path TO chat, public, extensions;

BEGIN;

-- Eliminar las firmas anteriores (4 argumentos) para evitar sobrecargas
-- ambiguas en PostgREST.
DROP FUNCTION IF EXISTS public.chat_query(text, jsonb, int, int);
DROP FUNCTION IF EXISTS chat.chat_query(text, jsonb, int, int);

CREATE OR REPLACE FUNCTION chat.chat_query(
  p_layer     text,
  p_filters   jsonb DEFAULT '{}'::jsonb,
  p_limit     int   DEFAULT 20,
  p_offset    int   DEFAULT 0,
  p_order_by  text  DEFAULT NULL,
  p_order_dir text  DEFAULT 'desc'
) RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = chat, public
AS $$
DECLARE
  phys text;
  where_sql text;
  order_sql text := '';
  order_col text;
  whitelisted text[];
  capped_limit int;
  capped_offset int;
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

  IF p_order_by IS NOT NULL AND btrim(p_order_by) <> '' THEN
    SELECT c INTO order_col
      FROM unnest(COALESCE(whitelisted, ARRAY[]::text[])) c
     WHERE lower(c) = lower(btrim(p_order_by))
     LIMIT 1;

    IF order_col IS NULL THEN
      RAISE EXCEPTION 'Campo order_by desconocido: "%". Columnas válidas: %',
        p_order_by, array_to_string(COALESCE(whitelisted, ARRAY[]::text[]), ', ');
    END IF;

    order_sql := format(
      ' ORDER BY %I %s NULLS LAST',
      order_col,
      CASE WHEN lower(COALESCE(p_order_dir, 'desc')) = 'asc' THEN 'ASC' ELSE 'DESC' END
    );
  END IF;

  capped_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  capped_offset := GREATEST(COALESCE(p_offset, 0), 0);
  where_sql := chat.chat_build_where(phys, p_filters, NULL);

  sql := format(
    'SELECT jsonb_agg(t) FROM (
       SELECT row_to_json(x)::jsonb - ''geom'' AS row
         FROM (SELECT * FROM %s',
    phys
  );
  sql := sql || where_sql || order_sql;
  sql := sql || format(' LIMIT %L OFFSET %L) x) t', capped_limit, capped_offset);

  EXECUTE sql INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_query(
  p_layer     text,
  p_filters   jsonb DEFAULT '{}'::jsonb,
  p_limit     int   DEFAULT 20,
  p_offset    int   DEFAULT 0,
  p_order_by  text  DEFAULT NULL,
  p_order_dir text  DEFAULT 'desc'
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, chat, extensions
AS $$
  SELECT chat.chat_query(
    p_layer, p_filters, p_limit, p_offset, p_order_by, p_order_dir
  );
$$;

REVOKE ALL ON FUNCTION chat.chat_query(text, jsonb, int, int, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_query(text, jsonb, int, int, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION chat.chat_query(text, jsonb, int, int, text, text)
  TO woll_api, service_role;
GRANT EXECUTE ON FUNCTION public.chat_query(text, jsonb, int, int, text, text)
  TO woll_api, service_role;

COMMENT ON FUNCTION public.chat_query(text, jsonb, int, int, text, text) IS
  'Listado de una capa con filtros, límite, offset y orden opcional. '
  'p_order_by se valida contra las columnas reales de la tabla.';

NOTIFY pgrst, 'reload schema';

COMMIT;
