-- 070_chat_nearest_distance.sql
--
-- Agrega distancia mínima/promedio/máxima entre una capa fuente y una o
-- varias capas objetivo.
--
-- Motivo:
--   `count_near_layer` solo cuenta. No responde "¿a qué distancia está la
--   planta más cercana?" ni "¿qué tan lejos está de un río?".
--
-- Idempotente.

SET search_path TO public, chat, extensions;

BEGIN;

CREATE OR REPLACE FUNCTION public.chat_nearest_distance(
  p_layer_source  text,
  p_layer_targets text[],
  p_filters       jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'chat', 'extensions'
AS $$
DECLARE
  phys_source text;
  phys_target text;
  target_id text;
  target_sql text[] := ARRAY[]::text[];
  target_union text;
  where_sql text;
  sql text;
  result jsonb;
BEGIN
  IF p_layer_targets IS NULL OR array_length(p_layer_targets, 1) IS NULL THEN
    RAISE EXCEPTION 'Debes indicar al menos una capa objetivo.';
  END IF;

  SELECT physical_table INTO phys_source
    FROM chat.chat_catalog
   WHERE layer_id = p_layer_source AND enabled;
  IF phys_source IS NULL THEN
    RAISE EXCEPTION 'Capa fuente no encontrada o deshabilitada: %', p_layer_source;
  END IF;

  FOREACH target_id IN ARRAY p_layer_targets LOOP
    SELECT physical_table INTO phys_target
      FROM chat.chat_catalog
     WHERE layer_id = target_id AND enabled;
    IF phys_target IS NULL THEN
      RAISE EXCEPTION 'Capa objetivo no encontrada o deshabilitada: %', target_id;
    END IF;
    target_sql := array_append(target_sql, format('SELECT geom FROM %s', phys_target));
  END LOOP;

  target_union := array_to_string(target_sql, ' UNION ALL ');
  where_sql := chat.chat_build_where(phys_source, p_filters, 's');

  SET statement_timeout = '5s';

  sql := format(
    'WITH source AS (
       SELECT * FROM %s s %s
     ),
     distances AS (
       SELECT s.geom,
              (
                SELECT ST_Distance(s.geom::geography, t.geom::geography)
                  FROM (%s) t
                 ORDER BY s.geom <-> t.geom
                 LIMIT 1
              ) AS distance_m
         FROM source s
     )
     SELECT jsonb_build_object(
       ''source_count'', count(*),
       ''matched_count'', count(distance_m),
       ''min_distance_m'', round(min(distance_m)::numeric, 1),
       ''avg_distance_m'', round(avg(distance_m)::numeric, 1),
       ''max_distance_m'', round(max(distance_m)::numeric, 1),
       ''within_1km'', count(*) FILTER (WHERE distance_m <= 1000),
       ''within_5km'', count(*) FILTER (WHERE distance_m <= 5000),
       ''targets'', to_jsonb(%L::text[])
     )
     FROM distances',
    phys_source,
    where_sql,
    target_union,
    p_layer_targets
  );

  EXECUTE sql INTO result;
  RETURN COALESCE(
    result,
    jsonb_build_object(
      'source_count', 0,
      'matched_count', 0,
      'min_distance_m', NULL,
      'avg_distance_m', NULL,
      'max_distance_m', NULL,
      'within_1km', 0,
      'within_5km', 0,
      'targets', to_jsonb(p_layer_targets)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.chat_nearest_distance(text, text[], jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_nearest_distance(text, text[], jsonb)
  TO woll_api, service_role;

COMMENT ON FUNCTION public.chat_nearest_distance(text, text[], jsonb) IS
  'Distancia mínima, promedio y máxima de cada feature de la capa fuente a '
  'la capa objetivo más cercana, en metros.';

NOTIFY pgrst, 'reload schema';

COMMIT;
