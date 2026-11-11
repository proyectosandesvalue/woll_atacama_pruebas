-- 039_legacy_rpcs.sql
--
-- RPCs heredadas que existían en Supabase pero no estaban versionadas en
-- db/migrations/. Generado por scripts/extract-legacy-rpcs.mjs.
--
-- No editar a mano: si una definición cambia en el origen, regenerar y
-- revisar el diff. Los grants se reaplican a woll_api y service_role.
--
-- Idempotente: CREATE OR REPLACE FUNCTION + REVOKE/GRANT.

SET search_path TO public, chat, ingest, extensions;

CREATE OR REPLACE FUNCTION public.admin_upsert_station(p_codigo_nacional text, p_nombre_estacion text, p_latitud numeric, p_longitud numeric, p_altitud numeric DEFAULT NULL::numeric, p_region text DEFAULT NULL::text, p_provincia text DEFAULT NULL::text, p_comuna text DEFAULT NULL::text, p_tipo_estacion text DEFAULT NULL::text, p_propietario text DEFAULT NULL::text, p_estado_operativo text DEFAULT 'historica'::text, p_activo boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'ingest', 'extensions'
AS $function$
BEGIN
  INSERT INTO ingest.stations (
    codigo_nacional, nombre_estacion, latitud, longitud, altitud,
    region, provincia, comuna, tipo_estacion, propietario,
    estado_operativo, activo
  ) VALUES (
    p_codigo_nacional, p_nombre_estacion, p_latitud, p_longitud, p_altitud,
    p_region, p_provincia, p_comuna, p_tipo_estacion, p_propietario,
    p_estado_operativo, p_activo
  )
  ON CONFLICT (codigo_nacional) DO UPDATE SET
    nombre_estacion = EXCLUDED.nombre_estacion,
    latitud = EXCLUDED.latitud,
    longitud = EXCLUDED.longitud,
    altitud = EXCLUDED.altitud,
    region = EXCLUDED.region,
    provincia = EXCLUDED.provincia,
    comuna = EXCLUDED.comuna,
    tipo_estacion = EXCLUDED.tipo_estacion,
    propietario = EXCLUDED.propietario,
    estado_operativo = EXCLUDED.estado_operativo,
    activo = EXCLUDED.activo;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_upsert_station(p_codigo_nacional text, p_nombre_estacion text, p_latitud numeric, p_longitud numeric, p_altitud numeric, p_region text, p_provincia text, p_comuna text, p_tipo_estacion text, p_propietario text, p_estado_operativo text, p_activo boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_station(p_codigo_nacional text, p_nombre_estacion text, p_latitud numeric, p_longitud numeric, p_altitud numeric, p_region text, p_provincia text, p_comuna text, p_tipo_estacion text, p_propietario text, p_estado_operativo text, p_activo boolean) TO woll_api, service_role;

CREATE OR REPLACE FUNCTION public.chat_historical_climate(p_codigo text, p_indicator text, p_year_start integer DEFAULT NULL::integer, p_year_end integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'ingest', 'extensions'
AS $function$
  WITH filtered AS (
    SELECT value, unit, period_start
    FROM ingest.indicator_values
    WHERE entity_id = 'estacion:' || p_codigo
      AND indicator_id = p_indicator
      AND (p_year_start IS NULL OR EXTRACT(YEAR FROM period_start) >= p_year_start)
      AND (p_year_end IS NULL OR EXTRACT(YEAR FROM period_start) <= p_year_end)
  ),
  stats AS (
    SELECT 
      COUNT(*)::int as total_registros,
      MIN(value) as minimo,
      MAX(value) as maximo,
      ROUND(AVG(value)::numeric, 2) as promedio,
      MIN(period_start) as fecha_inicio,
      MAX(period_start) as fecha_fin,
      (SELECT unit FROM filtered LIMIT 1) as unidad
    FROM filtered
  )
  SELECT jsonb_build_object(
    'codigo', p_codigo,
    'indicator', p_indicator,
    'stats', (SELECT to_jsonb(stats) FROM stats),
    'muestra_ultimos_12', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'fecha', period_start, 'valor', value
      )), '[]'::jsonb)
      FROM (
        SELECT period_start, value FROM filtered ORDER BY period_start DESC LIMIT 12
      ) sub
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.chat_historical_climate(p_codigo text, p_indicator text, p_year_start integer, p_year_end integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_historical_climate(p_codigo text, p_indicator text, p_year_start integer, p_year_end integer) TO woll_api, service_role;

CREATE OR REPLACE FUNCTION public.chat_historical_stations(p_tipo text DEFAULT 'METEOROLOGICA'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'ingest', 'extensions'
AS $function$
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
      'propietario', s.propietario,
      'periodo_registro', s.periodo_registro,
      'ficha_estacion', s.ficha_estacion
    ) ORDER BY s.nombre_estacion),
    '[]'::jsonb
  )
  FROM ingest.stations s
  WHERE s.activo = true
    AND s.estado_operativo = 'historica'
    AND (p_tipo IS NULL OR s.tipo_estacion ILIKE '%' || p_tipo || '%');
$function$;

REVOKE ALL ON FUNCTION public.chat_historical_stations(p_tipo text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_historical_stations(p_tipo text) TO woll_api, service_role;

CREATE OR REPLACE FUNCTION public.chat_list_climate_stations(p_estado text DEFAULT NULL::text, p_comuna text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'ingest', 'extensions'
AS $function$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'codigo', codigo_nacional,
      'nombre', nombre_estacion,
      'comuna', comuna,
      'estado', estado_operativo,
      'tipo_estacion', tipo_estacion,
      'propietario', propietario
    ) ORDER BY estado_operativo, nombre_estacion),
    '[]'::jsonb
  )
  FROM ingest.stations
  WHERE activo = true
    AND estado_operativo IN ('online', 'historica')
    AND (p_estado IS NULL OR estado_operativo = p_estado)
    AND (p_comuna IS NULL OR LOWER(comuna) LIKE LOWER('%' || p_comuna || '%'));
$function$;

REVOKE ALL ON FUNCTION public.chat_list_climate_stations(p_estado text, p_comuna text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_list_climate_stations(p_estado text, p_comuna text) TO woll_api, service_role;

CREATE OR REPLACE FUNCTION public.chat_station_available_dates(p_codigo text, p_indicator text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'ingest', 'extensions'
AS $function$
  SELECT COALESCE(jsonb_agg(DISTINCT period_start::date), '[]'::jsonb)
  FROM ingest.indicator_values
  WHERE entity_id = 'estacion:' || p_codigo
    AND indicator_id = p_indicator;
$function$;

REVOKE ALL ON FUNCTION public.chat_station_available_dates(p_codigo text, p_indicator text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_station_available_dates(p_codigo text, p_indicator text) TO woll_api, service_role;

CREATE OR REPLACE FUNCTION public.chat_station_details(p_codigo_nacional text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'ingest', 'extensions'
AS $function$
  WITH resolved_entity AS (
    SELECT COALESCE(
      (SELECT entity_id FROM ingest.indicator_values 
       WHERE SPLIT_PART(REPLACE(entity_id, 'estacion:', ''), '-', 1) = p_codigo_nacional 
       LIMIT 1),
      'estacion:' || p_codigo_nacional
    ) AS eid
  )
  SELECT jsonb_build_object(
    'values', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'indicator_id', indicator_id,
          'value', value,
          'unit', unit,
          'period_start', period_start,
          'period_end', period_end
        ) ORDER BY indicator_id
      )
      FROM ingest.indicator_values
      WHERE entity_id = (SELECT eid FROM resolved_entity)),
      '[]'::jsonb
    ),
    'ranges', COALESCE(
      (SELECT jsonb_object_agg(
        indicator_id,
        jsonb_build_object('min', min_date, 'max', max_date)
      )
      FROM (
        SELECT indicator_id, MIN(period_start)::text AS min_date, MAX(period_start)::text AS max_date
        FROM ingest.indicator_values
        WHERE entity_id = (SELECT eid FROM resolved_entity)
        GROUP BY indicator_id
      ) r),
      '{}'::jsonb
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.chat_station_details(p_codigo_nacional text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_station_details(p_codigo_nacional text) TO woll_api, service_role;

CREATE OR REPLACE FUNCTION public.chat_station_series(p_codigo text, p_indicator text, p_granularity text DEFAULT 'year'::text, p_year_start integer DEFAULT NULL::integer, p_year_end integer DEFAULT NULL::integer, p_month integer DEFAULT NULL::integer, p_day integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'ingest', 'extensions'
AS $function$
  WITH filtered AS (
    SELECT period_start, value, unit
    FROM ingest.indicator_values
    WHERE entity_id = 'estacion:' || p_codigo
      AND indicator_id = p_indicator
      AND (p_year_start IS NULL OR period_start >= make_date(p_year_start, 1, 1))
      AND (p_year_end IS NULL OR period_start < make_date(p_year_end + 1, 1, 1))
      AND (p_month IS NULL OR EXTRACT(MONTH FROM period_start) = p_month)
      AND (p_day IS NULL OR EXTRACT(DAY FROM period_start) = p_day)
  ),
  aggregated AS (
    SELECT
      CASE p_granularity
        WHEN 'hour'  THEN date_trunc('hour',  period_start)
        WHEN 'day'   THEN date_trunc('day',   period_start)
        WHEN 'month' THEN date_trunc('month', period_start)
        WHEN 'year'  THEN date_trunc('year',  period_start)
        ELSE period_start
      END AS bucket,
      AVG(value) AS value_agg,
      MIN(unit) AS unit
    FROM filtered
    GROUP BY bucket
    ORDER BY bucket
  )
  SELECT jsonb_build_object(
    'codigo', p_codigo,
    'indicator', p_indicator,
    'granularity', p_granularity,
    'total_points', COUNT(*),
    'unit', (SELECT unit FROM aggregated LIMIT 1),
    'points', COALESCE(jsonb_agg(jsonb_build_object('date', bucket, 'value', ROUND(value_agg::numeric, 2)) ORDER BY bucket), '[]'::jsonb)
  )
  FROM aggregated;
$function$;

REVOKE ALL ON FUNCTION public.chat_station_series(p_codigo text, p_indicator text, p_granularity text, p_year_start integer, p_year_end integer, p_month integer, p_day integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_station_series(p_codigo text, p_indicator text, p_granularity text, p_year_start integer, p_year_end integer, p_month integer, p_day integer) TO woll_api, service_role;

CREATE OR REPLACE FUNCTION public.chat_station_weather(p_comuna text DEFAULT NULL::text, p_codigo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'ingest', 'extensions'
AS $function$
  WITH stations AS (
    SELECT s.codigo_nacional, s.nombre_estacion, s.comuna, s.provincia,
           s.latitud, s.longitud, s.altitud, s.tipo_estacion, s.propietario
    FROM ingest.stations s
    WHERE s.activo = true
      AND s.estado_operativo = 'online'
      AND (p_codigo IS NULL OR s.codigo_nacional = p_codigo)
      AND (p_comuna IS NULL OR LOWER(s.comuna) LIKE LOWER('%' || p_comuna || '%'))
    ORDER BY s.nombre_estacion
    LIMIT 20
  ),
  latest AS (
    SELECT DISTINCT ON (entity_id, indicator_id)
      entity_id, indicator_id, value, unit, period_start
    FROM ingest.indicator_values
    WHERE indicator_id IN (
      'temp_avg','temp_max','temp_min','humedad','precip',
      'viento_dir','viento_vel','radiacion','presion','uvb_max'
    )
    ORDER BY entity_id, indicator_id, period_start DESC
  )
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'codigo', s.codigo_nacional,
      'nombre', s.nombre_estacion,
      'comuna', s.comuna,
      'provincia', s.provincia,
      'latitud', s.latitud,
      'longitud', s.longitud,
      'altitud', s.altitud,
      'tipo_estacion', s.tipo_estacion,
      'propietario', s.propietario,
      'valores', (
        SELECT COALESCE(jsonb_object_agg(
          l.indicator_id,
          jsonb_build_object('valor', l.value, 'unidad', l.unit, 'fecha', l.period_start)
        ), '{}'::jsonb)
        FROM latest l
        WHERE l.entity_id = 'estacion:' || s.codigo_nacional
      )
    ) ORDER BY s.nombre_estacion),
    '[]'::jsonb
  )
  FROM stations s;
$function$;

REVOKE ALL ON FUNCTION public.chat_station_weather(p_comuna text, p_codigo text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_station_weather(p_comuna text, p_codigo text) TO woll_api, service_role;

CREATE OR REPLACE FUNCTION public.chat_stations_map_data_at_date(p_variable text, p_date date, p_estado text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'ingest', 'extensions'
 SET statement_timeout TO '30s'
AS $function$
  WITH target_date AS (
    SELECT p_date::timestamptz AS ts
  ),
  closest AS (
    SELECT DISTINCT ON (entity_id)
      entity_id, value, unit, period_start
    FROM ingest.indicator_values
    WHERE indicator_id = p_variable
      AND period_start <= (SELECT ts FROM target_date)
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
      'propietario', s.propietario,
      'has_data', (c.value IS NOT NULL),
      'value', c.value,
      'unit', c.unit,
      'period_start', c.period_start,
      'dias_diferencia', EXTRACT(DAY FROM (SELECT ts FROM target_date) - c.period_start)::int
    ) ORDER BY s.nombre_estacion),
    '[]'::jsonb
  )
  FROM ingest.stations s
  LEFT JOIN closest c ON SPLIT_PART(REPLACE(c.entity_id, 'estacion:', ''), '-', 1) = s.codigo_nacional
  WHERE s.activo = true
    AND (p_estado IS NULL OR s.estado_operativo = p_estado);
$function$;

REVOKE ALL ON FUNCTION public.chat_stations_map_data_at_date(p_variable text, p_date date, p_estado text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_stations_map_data_at_date(p_variable text, p_date date, p_estado text) TO woll_api, service_role;

CREATE OR REPLACE FUNCTION public.chat_variable_available_dates(p_variable text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'ingest', 'extensions'
AS $function$
  SELECT COALESCE(
    jsonb_agg(date_str ORDER BY date_str),
    '[]'::jsonb
  )
  FROM (
    SELECT DISTINCT TO_CHAR(period_start, 'YYYY-MM-DD') AS date_str
    FROM ingest.indicator_values
    WHERE indicator_id = p_variable
  ) sub;
$function$;

REVOKE ALL ON FUNCTION public.chat_variable_available_dates(p_variable text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_variable_available_dates(p_variable text) TO woll_api, service_role;

CREATE OR REPLACE FUNCTION public.ingest_bulk_upsert_values(p_values jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'ingest', 'extensions'
AS $function$
BEGIN
  INSERT INTO ingest.indicator_values (
    indicator_id, source_id, entity_id, entity_type, entity_name,
    period_start, period_end, value, unit, scenario, metadata, fetched_at
  )
  SELECT 
    (x->>'p_indicator_id')::text,
    (x->>'p_source_id')::text,
    (x->>'p_entity_id')::text,
    (x->>'p_entity_type')::text,
    (x->>'p_entity_name')::text,
    (x->>'p_period_start')::timestamptz,
    (x->>'p_period_end')::timestamptz,
    (x->>'p_value')::numeric,
    (x->>'p_unit')::text,
    (x->>'p_scenario')::text,
    (x->>'p_metadata')::jsonb,
    now()
  FROM jsonb_array_elements(p_values) AS x
  ON CONFLICT (indicator_id, source_id, entity_id, period_start, period_end, scenario)
  DO UPDATE SET
    value = EXCLUDED.value,
    unit = EXCLUDED.unit,
    metadata = EXCLUDED.metadata,
    fetched_at = now();
END;
$function$;

REVOKE ALL ON FUNCTION public.ingest_bulk_upsert_values(p_values jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_bulk_upsert_values(p_values jsonb) TO woll_api, service_role;

CREATE OR REPLACE FUNCTION public.ingest_update_run(p_run_id uuid, p_status text, p_records_loaded integer DEFAULT 0, p_records_skipped integer DEFAULT 0, p_error_message text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'ingest', 'extensions'
AS $function$
  UPDATE ingest.runs
  SET
    status = p_status,
    records_loaded = p_records_loaded,
    records_skipped = p_records_skipped,
    error_message = p_error_message,
    metadata = p_metadata,
    finished_at = CASE
      WHEN p_status IN ('success', 'failed', 'partial') THEN now()
      ELSE finished_at
    END
  WHERE id = p_run_id;
$function$;

REVOKE ALL ON FUNCTION public.ingest_update_run(p_run_id uuid, p_status text, p_records_loaded integer, p_records_skipped integer, p_error_message text, p_metadata jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_update_run(p_run_id uuid, p_status text, p_records_loaded integer, p_records_skipped integer, p_error_message text, p_metadata jsonb) TO woll_api, service_role;

-- Verificación rápida
DO $$ BEGIN RAISE NOTICE '[039] RPCs heredadas aplicadas: 12'; END $$;
