-- db/migrations/029_stations_map.sql
-- RPC para obtener las estaciones de Atacama con el último valor de una variable.
-- Sprint 42-B (2026-10-24).

CREATE OR REPLACE FUNCTION public.chat_stations_map_data(
  p_variable text,
  p_period text DEFAULT 'latest'
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, ingest, extensions
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (entity_id)
      entity_id, value, unit, period_start, period_end
    FROM ingest.indicator_values
    WHERE indicator_id = p_variable
    ORDER BY entity_id, period_start DESC
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

REVOKE ALL ON FUNCTION public.chat_stations_map_data(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_stations_map_data(text, text) TO service_role;

NOTIFY pgrst, 'reload schema';