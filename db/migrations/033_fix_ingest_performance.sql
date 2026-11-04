-- 033_fix_ingest_performance.sql
--
-- Las RPCs chat_variable_availability y chat_stations_map_data hacían
-- escaneos completos sobre ingest.indicator_values (445k+ filas por
-- indicador) y excedían el statement_timeout de Supabase (8s).
--
-- Fix:
--   1. Índice covering para el DISTINCT ON (entity_id) ORDER BY fetched_at.
--   2. Vista materializada para las agregaciones de variable_availability.
--   3. SET statement_timeout = '30s' dentro de las funciones (safety net).
--
-- Refrescar la vista materializada después de cada ingesta:
--   SELECT public.refresh_variable_availability();

-- ────────────────────────────────────────────────────────────
-- 1. Índice covering para chat_stations_map_data
-- ────────────────────────────────────────────────────────────
-- El DISTINCT ON (entity_id) ORDER BY entity_id, fetched_at DESC
-- necesita este orden exacto. Sin fetched_at en el índice, Postgres
-- ordena 445k filas por entidad en memoria.

CREATE INDEX IF NOT EXISTS idx_values_indicator_entity_fetched
ON ingest.indicator_values (indicator_id, entity_id, fetched_at DESC)
INCLUDE (value, unit, period_start, period_end);

-- ────────────────────────────────────────────────────────────
-- 2. Vista materializada para chat_variable_availability
-- ────────────────────────────────────────────────────────────
-- Agrega una fila por indicador. La RPC se vuelve un lookup instantáneo.

DROP MATERIALIZED VIEW IF EXISTS ingest.variable_availability;

CREATE MATERIALIZED VIEW ingest.variable_availability AS
SELECT
    indicator_id,
    MIN(period_start) AS fecha_min,
    MAX(period_start) AS fecha_max,
    COUNT(*) AS total_registros,
    COUNT(DISTINCT entity_id) AS estaciones_con_dato
FROM ingest.indicator_values
GROUP BY indicator_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_variable_availability_indicator
ON ingest.variable_availability (indicator_id);

GRANT SELECT ON ingest.variable_availability TO service_role;

-- ────────────────────────────────────────────────────────────
-- 3. Reescribir chat_variable_availability (lookup instantáneo)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chat_variable_availability(p_variable text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, ingest, extensions
SET statement_timeout = '30s'
AS $$
  SELECT jsonb_build_object(
    'variable', indicator_id,
    'fecha_max', fecha_max,
    'fecha_min', fecha_min,
    'total_registros', total_registros,
    'estaciones_con_dato', estaciones_con_dato
  )
  FROM ingest.variable_availability
  WHERE indicator_id = p_variable;
$$;

GRANT EXECUTE ON FUNCTION public.chat_variable_availability(text) TO service_role;

-- ────────────────────────────────────────────────────────────
-- 4. Función para refrescar la vista materializada
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.refresh_variable_availability()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, ingest, extensions
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY ingest.variable_availability;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_variable_availability() TO service_role;

-- ────────────────────────────────────────────────────────────
-- 5. Safety net: subir el timeout de chat_stations_map_data
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chat_stations_map_data(
  p_variable text,
  p_period text DEFAULT 'latest'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, ingest, extensions
SET statement_timeout = '30s'
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (entity_id)
      entity_id, value, unit, period_start, period_end
    FROM ingest.indicator_values
    WHERE indicator_id = p_variable
    ORDER BY entity_id, fetched_at DESC
  )
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'codigo_nacional', s.codigo_nacional,
      'nombre_estacion', s.nombre_estacion,
      'comuna', s.comuna,
      'provincia', s.provincia,
      'latitud', s.latitud,
      'longitud', s.longitud,
      'altitud', s.altitud,
      'zona_geografica', s.zona_geografica,
      'tipo_estacion', s.tipo_estacion,
      'has_data', (l.value IS NOT NULL),
      'value', l.value,
      'unit', l.unit,
      'period_start', l.period_start
    ) ORDER BY s.nombre_estacion),
    '[]'::jsonb
  )
  FROM ingest.stations s
  LEFT JOIN latest l ON l.entity_id = 'estacion:' || s.codigo_nacional
  WHERE s.activo = true;
$$;

-- ────────────────────────────────────────────────────────────
-- 6. Notificar a PostgREST
-- ────────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';