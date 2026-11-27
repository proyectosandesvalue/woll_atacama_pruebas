-- 068_chat_historical_series.sql
--
-- Agrega la RPC `chat_historical_series` para series completas.
--
-- Motivo:
--   `chat_historical_climate` devuelve un resumen y solo los últimos 12
--   valores. Eso no permite tendencias, gráficos ni análisis de variación.
--   Esta RPC devuelve la serie ordenada, con un tope de 5.000 puntos.
--
-- Idempotente.

SET search_path TO public, chat, ingest, extensions;

BEGIN;

CREATE OR REPLACE FUNCTION public.chat_historical_series(
  p_codigo    text,
  p_indicator text,
  p_year_start integer DEFAULT NULL,
  p_year_end   integer DEFAULT NULL,
  p_limit      integer DEFAULT 5000
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'ingest', 'extensions'
AS $$
  WITH filtered AS (
    SELECT value, unit, period_start
      FROM ingest.indicator_values
     WHERE entity_id = 'estacion:' || p_codigo
       AND indicator_id = p_indicator
       AND (p_year_start IS NULL OR EXTRACT(YEAR FROM period_start) >= p_year_start)
       AND (p_year_end   IS NULL OR EXTRACT(YEAR FROM period_start) <= p_year_end)
  ),
  capped AS (
    SELECT value, unit, period_start
      FROM filtered
     ORDER BY period_start
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 5000), 1), 5000)
  ),
  stats AS (
    SELECT COUNT(*)::int AS total_registros,
           MIN(value) AS minimo,
           MAX(value) AS maximo,
           ROUND(AVG(value)::numeric, 2) AS promedio,
           MIN(period_start) AS fecha_inicio,
           MAX(period_start) AS fecha_fin,
           (SELECT unit FROM filtered LIMIT 1) AS unidad
      FROM filtered
  )
  SELECT jsonb_build_object(
    'codigo', p_codigo,
    'indicator', p_indicator,
    'stats', (SELECT to_jsonb(stats) FROM stats),
    'values', COALESCE(
      (SELECT jsonb_agg(
                jsonb_build_object('fecha', period_start, 'valor', value)
                ORDER BY period_start
              )
         FROM capped),
      '[]'::jsonb
    )
  );
$$;

REVOKE ALL ON FUNCTION public.chat_historical_series(text, text, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_historical_series(text, text, integer, integer, integer)
  TO woll_api, service_role;

COMMENT ON FUNCTION public.chat_historical_series(text, text, integer, integer, integer) IS
  'Serie temporal completa (hasta 5.000 puntos) de una estación/indicador, '
  'con resumen estadístico y unidad.';

NOTIFY pgrst, 'reload schema';

COMMIT;
