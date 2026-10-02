-- =====================================================================
-- 001_chat_fase1.sql
-- Migración fase 1: Chat IA conectado a Supabase con tool calling.
-- Ejecutar en el SQL Editor de Supabase como rol postgres (owner).
-- Idempotente: re-ejecutable salvo los CREATE de funciones, donde se
-- usa CREATE OR REPLACE para no romper en sucesivas corridas.
-- =====================================================================

-- 1. Esquema dedicado para aislar las tablas/RPCs del chat del resto del
--    modelo de datos público del visor.
CREATE SCHEMA IF NOT EXISTS chat;
SET search_path TO chat, public;

-- 2. Catálogo: capa lógica expuesta al LLM. Una fila por tabla espacial.
--    Lo puebla scripts/build_catalog.mjs cruzando geometry_columns
--    con js/config/allTemasConfig.js (display_name, dimension).
CREATE TABLE IF NOT EXISTS chat.chat_catalog (
  layer_id         text PRIMARY KEY,         -- ej. 'desaladoras'
  physical_table   text NOT NULL,           -- ej. 'public.desaladoras'
  display_name     text NOT NULL,           -- ej. 'Plantas Desaladoras'
  dimension        text NOT NULL,           -- ej. 'agua'
  geometry_type    text,                    -- 'POINT' | 'POLYGON' | ...
  srid             int  DEFAULT 4326,
  description      text,
  attributes       jsonb,                   -- [{name, type, descripcion}, ...]
  enabled          boolean DEFAULT true,
  updated_at       timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_catalog_dimension ON chat.chat_catalog(dimension);

-- 3. Stats precalculadas (datos estáticos → se recalculan al cambiar capas
--    desde el panel/SQL Editor). Tablas físicas en vez de vistas
--    materializadas porque las columnas/atributos son dinámicos.
CREATE TABLE IF NOT EXISTS chat.chat_layer_stats (
  layer_id   text PRIMARY KEY REFERENCES chat.chat_catalog(layer_id) ON DELETE CASCADE,
  count      bigint NOT NULL,
  refreshed_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat.chat_attr_stats (
  layer_id    text NOT NULL REFERENCES chat.chat_catalog(layer_id) ON DELETE CASCADE,
  attr_name   text NOT NULL,
  attr_type   text NOT NULL,                  -- 'numeric' | 'categorical' | 'text'
  min         double precision,
  max         double precision,
  mean        double precision,
  median      double precision,
  stddev      double precision,
  top_values  jsonb,                          -- [{value, count, pct}]
  refreshed_at timestamptz DEFAULT now(),
  PRIMARY KEY (layer_id, attr_name)
);

-- 4. Función que recalcula todas las stats recorriendo el catálogo.
--    Ejecutada manualmente desde el SQL Editor o desde el panel admin
--    (fase 3) cada vez que cambian los datos.
--    SEGURIDAD: usa format() con %I para ident → safe contra inyección
--    en nombres de columna (no hay input del usuario).
CREATE OR REPLACE FUNCTION chat.chat_refresh_stats() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = chat, public
AS $$
DECLARE
  rec record;
  attr record;
  n   bigint;
  v_min double precision; v_max double precision; v_mean double precision;
  v_median double precision; v_stddev double precision;
  is_num boolean;
  top jsonb;
  sql text;
BEGIN
  FOR rec IN SELECT layer_id, physical_table FROM chat.chat_catalog WHERE enabled LOOP
    BEGIN
      -- count total
      EXECUTE format('SELECT count(*) FROM %s', rec.physical_table) INTO n;
      INSERT INTO chat.chat_layer_stats(layer_id, count, refreshed_at)
      VALUES (rec.layer_id, n, now())
      ON CONFLICT (layer_id) DO UPDATE SET count = EXCLUDED.count, refreshed_at = now();

      -- eliminar stats de atributos de esta capa para regenerar
      DELETE FROM chat.chat_attr_stats WHERE layer_id = rec.layer_id;

      -- detectar columnas (todas menos 'geom'/'geometry'/'the_geom' y la PK por defecto)
      FOR attr IN
        EXECUTE format(
          'SELECT column_name, data_type FROM information_schema.columns
           WHERE table_schema = split_part(%L, ''.'', 1)
             AND table_name   = split_part(%L, ''.'', 2)
             AND column_name NOT IN (''geom'',''geometry'',''the_geom'',''gid'',''id'')',
          rec.physical_table, rec.physical_table)
      LOOP
        is_num := attr.data_type IN ('integer','bigint','numeric','real','double precision','smallint');

        IF is_num THEN
          EXECUTE format(
            'SELECT min(%I)::double precision, max(%I)::double precision,
                    avg(%I)::double precision,
                    percentile_cont(0.5) WITHIN GROUP (ORDER BY %I)::double precision,
                    stddev_pop(%I)::double precision
               FROM %s WHERE %I IS NOT NULL',
            attr.column_name, attr.column_name, attr.column_name,
            attr.column_name, attr.column_name,
            rec.physical_table, attr.column_name)
          INTO v_min, v_max, v_mean, v_median, v_stddev;
        END IF;

        -- top 5 valores para categóricos (y también para numéricos discretos)
        EXECUTE format(
          'SELECT jsonb_agg(t ORDER BY t.count DESC) FROM (
             SELECT %I::text AS value, count(*)::int AS count,
                    round((count(*) * 100.0 / sum(count(*)) OVER ())::numeric, 1) AS pct
               FROM %s WHERE %I IS NOT NULL
             GROUP BY %I ORDER BY count DESC LIMIT 5
           ) t',
          attr.column_name, rec.physical_table, attr.column_name, attr.column_name)
        INTO top;

        INSERT INTO chat.chat_attr_stats(layer_id, attr_name, attr_type, min, max, mean, median, stddev, top_values)
        VALUES (rec.layer_id, attr.column_name,
                CASE WHEN is_num THEN 'numeric' ELSE 'text' END,
                v_min, v_max, v_mean, v_median, v_stddev, top)
        ON CONFLICT (layer_id, attr_name) DO UPDATE SET
          attr_type = EXCLUDED.attr_type, min = EXCLUDED.min, max = EXCLUDED.max,
          mean = EXCLUDED.mean, median = EXCLUDED.median, stddev = EXCLUDED.stddev,
          top_values = EXCLUDED.top_values, refreshed_at = now();

        -- reset
        v_min := NULL; v_max := NULL; v_mean := NULL; v_median := NULL; v_stddev := NULL;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      -- Una capa que falla (tabla inexistente, tipo no soportado, etc.)
      -- NO aborta el refresco de las demás: se registra y se continúa.
      RAISE WARNING 'chat_refresh_stats: capa % omitida: %', rec.layer_id, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- 5. RPC: catálogo compacto (el LLM lo recibe en el system prompt).
--    Devuelve solo lo necesario para que el modelo decida qué invocar.
CREATE OR REPLACE FUNCTION chat.chat_catalog() RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT jsonb_agg(jsonb_build_object(
    'layer_id',      layer_id,
    'display_name',  display_name,
    'dimension',     dimension,
    'geometry_type', geometry_type,
    'attributes',    attributes,
    'description',   description
  ) ORDER BY dimension, display_name)
  FROM chat.chat_catalog WHERE enabled;
$$;

-- 6. RPC: stats completas de una capa (count + atributos).
CREATE OR REPLACE FUNCTION chat.chat_layer_stats(p_layer text)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = chat, public
AS $$
DECLARE
  out jsonb;
BEGIN
  SELECT jsonb_build_object(
    'layer_id', c.layer_id,
    'display_name', c.display_name,
    'dimension', c.dimension,
    'count', s.count,
    'attributes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'attr', a.attr_name,
        'type', a.attr_type,
        'min', a.min, 'max', a.max, 'mean', a.mean, 'median', a.median, 'stddev', a.stddev,
        'top_values', a.top_values
      ) ORDER BY a.attr_name)
      FROM chat.chat_attr_stats a WHERE a.layer_id = c.layer_id
    ), '[]'::jsonb),
    'refreshed_at', s.refreshed_at
  ) INTO out
  FROM chat.chat_catalog c
  LEFT JOIN chat.chat_layer_stats s ON s.layer_id = c.layer_id
  WHERE c.layer_id = p_layer AND c.enabled;

  IF out IS NULL THEN
    RAISE EXCEPTION 'Capa no encontrada o deshabilitada: %', p_layer;
  END IF;
  RETURN out;
END;
$$;

-- 7. RPC: query a una capa con filtros whitelisteados.
--    Recibe {columna: valor} como jsonb; solo se aplican a columnas
--    declaradas en chat_catalog.attributes.
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

  -- construir WHERE sólo con claves whitelisteadas
  FOR i IN SELECT * FROM jsonb_each(p_filters) LOOP
    IF i.key = ANY(whitelisted) AND i.value IS NOT NULL THEN
      where_clauses := array_append(where_clauses, format('%I = %L', i.key, i.value::text));
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

-- 8. RPC: agregación (group_by + count/avg/sum/min/max) con filtros.
CREATE OR REPLACE FUNCTION chat.chat_aggregate(
  p_layer    text,
  p_group_by text,
  p_metric   text DEFAULT 'count',        -- 'count' | 'avg' | 'sum' | 'min' | 'max'
  p_field    text DEFAULT NULL,           -- campo sobre el que aplica avg/sum/...
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

  sql := format(
    'SELECT jsonb_agg(jsonb_build_object(''group'', %I, ''value'', %s) ORDER BY value DESC)
       FROM %s',
    p_group_by, agg_expr, phys);
  IF array_length(where_clauses, 1) > 0 THEN
    sql := sql || ' WHERE ' || array_to_string(where_clauses, ' AND ');
  END IF;
  sql := sql || format(' GROUP BY %I LIMIT 50', p_group_by);

  EXECUTE sql INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- 9. Grants: SOLO service_role puede ejecutar las RPCs (nadie desde la
--    anon key pública puede llamarlas → llamadas solo desde el servidor
--    Vercel que tiene SUPABASE_SERVICE_KEY).
REVOKE ALL ON SCHEMA chat FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA chat TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA chat TO service_role;
ALTER TABLE chat.chat_catalog         ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat.chat_layer_stats     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat.chat_attr_stats      ENABLE ROW LEVEL SECURITY;
-- service_role bypasea RLS; anon/authenticated NO tienen policies → no leen.

-- 10. Comentario útil para el editor SQL de Supabase:
COMMENT ON SCHEMA chat IS 'Esquema del Chat IA: catálogo + stats + RPCs (fase 1). Acceso solo server-side.';
