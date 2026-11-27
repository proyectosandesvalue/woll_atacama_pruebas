-- 069_chat_spatial_overlay.sql
--
-- Agrega intersección, contención y superficie entre capas.
--
-- Motivo:
--   `count_near_layer` solo cuenta por distancia. No responde "qué hay
--   dentro de la cuenca", "qué se superpone" ni "cuánta superficie".
--
-- Operaciones:
--   - intersects: cuenta features de la fuente que tocan algún target.
--   - within: cuenta features de la fuente contenidos en el target.
--   - area: cuenta y suma la superficie de intersección (m² y ha).
--
-- Idempotente.

SET search_path TO public, chat, extensions;

BEGIN;

CREATE OR REPLACE FUNCTION public.chat_spatial_overlay(
  p_layer_source  text,
  p_layer_targets text[],
  p_operation     text DEFAULT 'intersects',
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
  op text := lower(COALESCE(p_operation, 'intersects'));
  sql text;
  result jsonb;
BEGIN
  IF op NOT IN ('intersects', 'within', 'area') THEN
    RAISE EXCEPTION 'Operación inválida: %. Válidas: intersects, within, area', p_operation;
  END IF;

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
     matched AS (
       SELECT s.geom AS s_geom, u.geom AS u_geom
         FROM source s
         JOIN LATERAL (
           SELECT ST_Union(t.geom) AS geom
             FROM (%s) t
            WHERE ST_Intersects(s.geom, t.geom)
         ) u ON u.geom IS NOT NULL
     )
     SELECT jsonb_build_object(
       ''operation'', %L,
       ''source_count'', (SELECT count(*) FROM source),
       ''matched_count'', (
         SELECT count(*) FROM matched
         WHERE %s
       ),
       ''area_m2'', COALESCE((
         SELECT SUM(ST_Area(ST_Intersection(s_geom, u_geom)::geography))
           FROM matched
          WHERE %s
       ), 0),
       ''area_ha'', COALESCE((
         SELECT SUM(ST_Area(ST_Intersection(s_geom, u_geom)::geography)) / 10000.0
           FROM matched
          WHERE %s
       ), 0),
       ''targets'', to_jsonb(%L::text[])
     )',
    phys_source,
    where_sql,
    target_union,
    op,
    CASE
      WHEN op = 'within' THEN 'ST_Within(s_geom, u_geom)'
      ELSE 'TRUE'
    END,
    CASE
      WHEN op = 'within' THEN 'ST_Within(s_geom, u_geom)'
      ELSE 'TRUE'
    END,
    CASE
      WHEN op = 'within' THEN 'ST_Within(s_geom, u_geom)'
      ELSE 'TRUE'
    END,
    p_layer_targets
  );

  EXECUTE sql INTO result;
  RETURN COALESCE(
    result,
    jsonb_build_object(
      'operation', op,
      'source_count', 0,
      'matched_count', 0,
      'area_m2', 0,
      'area_ha', 0,
      'targets', to_jsonb(p_layer_targets)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.chat_spatial_overlay(text, text[], text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_spatial_overlay(text, text[], text, jsonb)
  TO woll_api, service_role;

COMMENT ON FUNCTION public.chat_spatial_overlay(text, text[], text, jsonb) IS
  'Intersección, contención y superficie entre una capa fuente y varias '
  'capas objetivo. Devuelve conteos y área en m²/ha.';

NOTIFY pgrst, 'reload schema';

COMMIT;
