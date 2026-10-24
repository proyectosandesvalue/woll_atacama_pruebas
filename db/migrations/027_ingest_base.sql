-- db/migrations/027_ingest_base.sql
-- Base común de ingesta para APIs externas (MeteoChile, BCN, ARClim),
-- RAG (documentos) y dashboard (indicadores).
--
-- Sprint 42-B (2026-10-24).
--
-- Decisión D1: una sola tabla `indicator_values` para todos los datos
-- numéricos, con un campo `source_id` que distingue la fuente.
--
-- Decisión D2: los endpoints son configurables desde la BD
-- (`ingest.endpoints`). El admin puede agregar fuentes nuevas sin tocar
-- código, siempre que el formato sea JSON, XML o CSV.

CREATE SCHEMA IF NOT EXISTS ingest;
GRANT USAGE ON SCHEMA ingest TO service_role;

-- ────────────────────────────────────────────────────────────
-- 1. ingest.sources — registro de fuentes
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ingest.sources (
  id text PRIMARY KEY,
  nombre text NOT NULL,
  descripcion text,
  tipo text NOT NULL
    CHECK (tipo IN ('api', 'rss', 'documento', 'capa', 'raster')),
  url_base text,
  licencia text,
  requiere_auth boolean NOT NULL DEFAULT false,
  auth_env_var text,
  estado text NOT NULL DEFAULT 'conocida_no_ingerida'
    CHECK (estado IN ('en_vivo', 'ingerida', 'conocida_no_ingerida', 'bloqueada')),
  ttl_segundos int,
  prioridad int NOT NULL DEFAULT 100,
  verificado_en date,
  notas text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE INDEX IF NOT EXISTS idx_sources_estado
  ON ingest.sources(estado) WHERE activo = true;

-- ────────────────────────────────────────────────────────────
-- 2. ingest.indicators — definición de variables
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ingest.indicators (
  id text PRIMARY KEY,
  nombre text NOT NULL,
  descripcion text,
  unidad text NOT NULL,
  tipo text NOT NULL DEFAULT 'observado'
    CHECK (tipo IN ('observado', 'proyectado', 'modelado', 'derivado')),
  categoria text,
  source_default text REFERENCES ingest.sources(id),
  requiere_entity_type text,
  rango_min numeric,
  rango_max numeric,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE INDEX IF NOT EXISTS idx_indicators_categoria
  ON ingest.indicators(categoria) WHERE activo = true;

-- ────────────────────────────────────────────────────────────
-- 3. ingest.endpoints — configuración de endpoints (CLAVE)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ingest.endpoints (
  id text PRIMARY KEY,
  source_id text NOT NULL REFERENCES ingest.sources(id),
  nombre text NOT NULL,
  descripcion text,
  path text NOT NULL,
  method text NOT NULL DEFAULT 'GET'
    CHECK (method IN ('GET', 'POST')),
  format text NOT NULL DEFAULT 'json'
    CHECK (format IN ('json', 'xml', 'csv', 'geojson')),
  auth_type text NOT NULL DEFAULT 'none'
    CHECK (auth_type IN ('none', 'query_params', 'headers', 'bearer')),
  auth_config jsonb,
  params jsonb,
  -- Para JSON: JSONPath al array de registros (ej. '$.datosEstaciones[*]')
  -- Para XML: XPath al array (ej. '//Resultados/fila')
  json_path text,
  -- Mapping de entidad: { "type": "estacion", "id_template": "...", "name_field": "..." }
  entity_mapping jsonb NOT NULL,
  -- Mapping de período: { "start_field": "...", "end_field": "...", "format": "..." }
  period_mapping jsonb NOT NULL,
  -- Mapping de valores: { "temp": { "field": "...", "indicator": "...", "unit": "..." } }
  value_mapping jsonb NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  prioridad int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE INDEX IF NOT EXISTS idx_endpoints_source
  ON ingest.endpoints(source_id, activo) WHERE activo = true;

-- ────────────────────────────────────────────────────────────
-- 4. ingest.indicator_values — los datos concretos
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ingest.indicator_values (
  id bigserial PRIMARY KEY,
  indicator_id text NOT NULL REFERENCES ingest.indicators(id),
  source_id text NOT NULL REFERENCES ingest.sources(id),
  entity_id text NOT NULL,
  entity_type text NOT NULL
    CHECK (entity_type IN ('comuna', 'provincia', 'region', 'estacion', 'grid', 'punto', 'otro')),
  entity_name text,
  period_start date NOT NULL,
  period_end date NOT NULL,
  value numeric NOT NULL,
  unit text NOT NULL,
  scenario text,
  metadata jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (indicator_id, source_id, entity_id, period_start, period_end, scenario)
);

CREATE INDEX IF NOT EXISTS idx_values_indicator_entity
  ON ingest.indicator_values(indicator_id, entity_id, period_start);

CREATE INDEX IF NOT EXISTS idx_values_source
  ON ingest.indicator_values(source_id, fetched_at);

-- ────────────────────────────────────────────────────────────
-- 5. ingest.runs — registro de ejecuciones
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ingest.runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES ingest.sources(id),
  endpoint_id text REFERENCES ingest.endpoints(id),
  job_name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'failed', 'partial')),
  records_loaded int NOT NULL DEFAULT 0,
  records_skipped int NOT NULL DEFAULT 0,
  error_message text,
  metadata jsonb
);

CREATE INDEX IF NOT EXISTS idx_runs_source_started
  ON ingest.runs(source_id, started_at DESC);

-- ────────────────────────────────────────────────────────────
-- 6. Triggers updated_at
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_ingest_sources_touch ON ingest.sources;
CREATE TRIGGER trg_ingest_sources_touch
  BEFORE UPDATE ON ingest.sources
  FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

DROP TRIGGER IF EXISTS trg_ingest_indicators_touch ON ingest.indicators;
CREATE TRIGGER trg_ingest_indicators_touch
  BEFORE UPDATE ON ingest.indicators
  FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

DROP TRIGGER IF EXISTS trg_ingest_endpoints_touch ON ingest.endpoints;
CREATE TRIGGER trg_ingest_endpoints_touch
  BEFORE UPDATE ON ingest.endpoints
  FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

-- ────────────────────────────────────────────────────────────
-- 7. Grants
-- ────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON ingest.sources TO service_role;
GRANT SELECT, INSERT, UPDATE ON ingest.indicators TO service_role;
GRANT SELECT, INSERT, UPDATE ON ingest.endpoints TO service_role;
GRANT SELECT, INSERT, UPDATE ON ingest.indicator_values TO service_role;
GRANT SELECT, INSERT, UPDATE ON ingest.runs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE ingest.indicator_values_id_seq TO service_role;

-- ────────────────────────────────────────────────────────────
-- 8. RPCs de lectura (chat, service_role)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chat_get_indicator(
  p_indicator_id text,
  p_entity_id text,
  p_period_start date DEFAULT NULL,
  p_period_end date DEFAULT NULL,
  p_scenario text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, ingest, extensions
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'indicator_id', indicator_id,
      'source_id', source_id,
      'entity_id', entity_id,
      'entity_name', entity_name,
      'period_start', period_start,
      'period_end', period_end,
      'value', value,
      'unit', unit,
      'scenario', scenario,
      'metadata', metadata,
      'fetched_at', fetched_at
    ) ORDER BY period_start),
    '[]'::jsonb
  )
  FROM ingest.indicator_values
  WHERE indicator_id = p_indicator_id
    AND entity_id = p_entity_id
    AND (p_period_start IS NULL OR period_start >= p_period_start)
    AND (p_period_end IS NULL OR period_end <= p_period_end)
    AND (p_scenario IS NULL AND scenario IS NULL OR scenario = p_scenario);
$$;

CREATE OR REPLACE FUNCTION public.chat_list_indicators()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, ingest, extensions
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'id', id, 'nombre', nombre, 'unidad', unidad, 'tipo', tipo,
      'categoria', categoria, 'requiere_entity_type', requiere_entity_type,
      'source_default', source_default
    ) ORDER BY categoria, id),
    '[]'::jsonb
  )
  FROM ingest.indicators WHERE activo = true;
$$;

CREATE OR REPLACE FUNCTION public.chat_list_sources()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, ingest, extensions
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'id', id, 'nombre', nombre, 'tipo', tipo, 'estado', estado,
      'licencia', licencia, 'requiere_auth', requiere_auth,
      'ttl_segundos', ttl_segundos
    ) ORDER BY prioridad),
    '[]'::jsonb
  )
  FROM ingest.sources WHERE activo = true;
$$;

CREATE OR REPLACE FUNCTION public.chat_list_endpoints(p_source_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, ingest, extensions
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'id', id, 'source_id', source_id, 'nombre', nombre,
      'path', path, 'format', format, 'activo', activo
    ) ORDER BY prioridad),
    '[]'::jsonb
  )
  FROM ingest.endpoints
  WHERE activo = true
    AND (p_source_id IS NULL OR source_id = p_source_id);
$$;

REVOKE ALL ON FUNCTION public.chat_get_indicator(text, text, date, date, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_list_indicators()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_list_sources()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_list_endpoints(text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.chat_get_indicator(text, text, date, date, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_list_indicators() TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_list_sources() TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_list_endpoints(text) TO service_role;

-- ────────────────────────────────────────────────────────────
-- 9. RPCs de escritura (adapters y panel admin)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ingest_log_run(
  p_source_id text,
  p_endpoint_id text DEFAULT NULL,
  p_job_name text DEFAULT NULL,
  p_status text DEFAULT 'running',
  p_records_loaded int DEFAULT 0,
  p_records_skipped int DEFAULT 0,
  p_error_message text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER
SET search_path = public, ingest, extensions
AS $$
  INSERT INTO ingest.runs
    (source_id, endpoint_id, job_name, status, records_loaded,
     records_skipped, error_message, metadata, finished_at)
  VALUES
    (p_source_id, p_endpoint_id, COALESCE(p_job_name, p_endpoint_id, 'unknown'),
     p_status, p_records_loaded, p_records_skipped, p_error_message, p_metadata,
     CASE WHEN p_status IN ('success', 'failed', 'partial') THEN now() ELSE NULL END)
  RETURNING id;
$$;

CREATE OR REPLACE FUNCTION public.ingest_upsert_value(
  p_indicator_id text,
  p_source_id text,
  p_entity_id text,
  p_entity_type text,
  p_entity_name text,
  p_period_start date,
  p_period_end date,
  p_value numeric,
  p_unit text,
  p_scenario text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public, ingest, extensions
AS $$
  INSERT INTO ingest.indicator_values
    (indicator_id, source_id, entity_id, entity_type, entity_name,
     period_start, period_end, value, unit, scenario, metadata, fetched_at)
  VALUES
    (p_indicator_id, p_source_id, p_entity_id, p_entity_type, p_entity_name,
     p_period_start, p_period_end, p_value, p_unit, p_scenario, p_metadata, now())
  ON CONFLICT (indicator_id, source_id, entity_id, period_start, period_end, scenario)
  DO UPDATE SET
    value = EXCLUDED.value, unit = EXCLUDED.unit,
    entity_type = EXCLUDED.entity_type, entity_name = EXCLUDED.entity_name,
    metadata = EXCLUDED.metadata, fetched_at = now();
$$;

CREATE OR REPLACE FUNCTION public.admin_list_sources()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, ingest, extensions
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'id', id, 'nombre', nombre, 'tipo', tipo, 'estado', estado,
      'licencia', licencia, 'requiere_auth', requiere_auth,
      'ttl_segundos', ttl_segundos, 'prioridad', prioridad,
      'total_values', (
        SELECT COUNT(*) FROM ingest.indicator_values v WHERE v.source_id = s.id
      ),
      'total_endpoints', (
        SELECT COUNT(*) FROM ingest.endpoints e WHERE e.source_id = s.id AND e.activo = true
      ),
      'ultima_corrida', (
        SELECT row_to_json(r) FROM (
          SELECT started_at, finished_at, status, records_loaded
          FROM ingest.runs WHERE source_id = s.id
          ORDER BY started_at DESC LIMIT 1
        ) r
      )
    ) ORDER BY prioridad),
    '[]'::jsonb
  )
  FROM ingest.sources s;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_indicators()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, ingest, extensions
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'id', id, 'nombre', nombre, 'unidad', unidad, 'tipo', tipo,
      'categoria', categoria, 'source_default', source_default,
      'total_values', (
        SELECT COUNT(*) FROM ingest.indicator_values v WHERE v.indicator_id = i.id
      )
    ) ORDER BY categoria, id),
    '[]'::jsonb
  )
  FROM ingest.indicators i;
$$;

CREATE OR REPLACE FUNCTION public.admin_ingest_stats()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, ingest, extensions
AS $$
  SELECT jsonb_build_object(
    'total_sources', (SELECT COUNT(*) FROM ingest.sources WHERE activo = true),
    'total_endpoints', (SELECT COUNT(*) FROM ingest.endpoints WHERE activo = true),
    'total_indicators', (SELECT COUNT(*) FROM ingest.indicators WHERE activo = true),
    'total_values', (SELECT COUNT(*) FROM ingest.indicator_values),
    'values_by_source', (
      SELECT COALESCE(jsonb_object_agg(source_id, cnt), '{}'::jsonb)
      FROM (SELECT source_id, COUNT(*) AS cnt FROM ingest.indicator_values GROUP BY source_id) t
    ),
    'ultima_corrida', (
      SELECT row_to_json(r) FROM (
        SELECT source_id, endpoint_id, job_name, started_at, finished_at, status, records_loaded
        FROM ingest.runs ORDER BY started_at DESC LIMIT 1
      ) r
    )
  );
$$;

REVOKE ALL ON FUNCTION public.ingest_log_run(text, text, text, text, int, int, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ingest_upsert_value(text, text, text, text, text, date, date, numeric, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_sources() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_indicators() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_ingest_stats() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ingest_log_run(text, text, text, text, int, int, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ingest_upsert_value(text, text, text, text, text, date, date, numeric, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_sources() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_indicators() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_ingest_stats() TO service_role;

-- ────────────────────────────────────────────────────────────
-- 10. Seeds: fuentes
-- ────────────────────────────────────────────────────────────

INSERT INTO ingest.sources
  (id, nombre, descripcion, tipo, url_base, licencia, requiere_auth,
   auth_env_var, estado, ttl_segundos, prioridad, verificado_en, notas)
VALUES
  ('meteochile', 'MeteoChile (DGAC)',
   'Datos actuales, históricos y pronóstico.',
   'api', 'https://climatologia.meteochile.gob.cl/application/servicios',
   'Uso público, citar a la DMC', true,
   'METEOCHILE_TOKEN', 'en_vivo', 300, 10, CURRENT_DATE,
   'Requiere usuario y token. Solicitar en climatologia.meteochile.gob.cl'),
  ('bcn', 'BCN Ley Chile',
   'Normativa (LGUC, OGUC, leyes, decretos).',
   'api', 'https://www.bcn.cl/leychile/api/v1',
   'Uso público', true, 'BCN_SECRET', 'conocida_no_ingerida',
   NULL, 20, CURRENT_DATE, 'Requiere secret. Solicitar en bcn.cl/leychile'),
  ('arclim', 'ARClim (MMA)',
   'Proyecciones climáticas 2035-2065 y series diarias.',
   'api', 'https://arclim.mma.gob.cl/api',
   'Uso público', false, NULL, 'en_vivo', 3600, 15, CURRENT_DATE,
   'Sin autenticación. Datos de simulaciones.'),
  ('visor_capas', 'Visor de Atacama (capas internas)',
   'Capas geoespaciales del visor.',
   'capa', NULL, 'Uso interno', false, NULL, 'ingerida',
   NULL, 5, CURRENT_DATE, 'Ya disponible en chat.chat_catalog.')
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 11. Seeds: indicadores
-- ────────────────────────────────────────────────────────────

INSERT INTO ingest.indicators
  (id, nombre, descripcion, unidad, tipo, categoria, source_default, requiere_entity_type)
VALUES
  ('temp_min', 'Temperatura mínima diaria', 'Temp. mínima del aire a 1.5m', '°C', 'observado', 'clima', 'meteochile', 'estacion'),
  ('temp_max', 'Temperatura máxima diaria', 'Temp. máxima del aire a 1.5m', '°C', 'observado', 'clima', 'meteochile', 'estacion'),
  ('temp_avg', 'Temperatura media diaria', 'Temp. media del aire a 1.5m', '°C', 'observado', 'clima', 'meteochile', 'estacion'),
  ('temp_min_2050', 'Temperatura mínima proyectada (2050)', 'Temp. mínima proyectada 2035-2065', '°C', 'proyectado', 'clima', 'arclim', 'comuna'),
  ('temp_max_2050', 'Temperatura máxima proyectada (2050)', 'Temp. máxima proyectada 2035-2065', '°C', 'proyectado', 'clima', 'arclim', 'comuna'),
  ('precip', 'Precipitación diaria', 'Agua caída en 24 horas', 'mm', 'observado', 'clima', 'meteochile', 'estacion'),
  ('precip_mensual', 'Precipitación mensual', 'Agua caída acumulada en el mes', 'mm', 'observado', 'clima', 'meteochile', 'estacion'),
  ('precip_anual', 'Precipitación anual', 'Agua caída acumulada en el año', 'mm', 'observado', 'clima', 'meteochile', 'estacion'),
  ('precip_2050', 'Precipitación proyectada (2050)', 'Precip. proyectada 2035-2065', 'mm', 'proyectado', 'clima', 'arclim', 'comuna'),
  ('heladas', 'Días con heladas', 'Días con temp. mínima < 0°C', 'días', 'observado', 'clima', 'meteochile', 'estacion'),
  ('heladas_2050', 'Días con heladas proyectados (2050)', 'Heladas proyectadas 2035-2065', 'días', 'proyectado', 'clima', 'arclim', 'comuna'),
  ('olas_calor', 'Días con olas de calor', 'Días con temp. máx > percentil 90', 'días', 'observado', 'clima', 'meteochile', 'estacion'),
  ('olas_calor_2050', 'Días con olas de calor proyectados (2050)', 'Olas de calor proyectadas 2035-2065', 'días', 'proyectado', 'clima', 'arclim', 'comuna'),
  ('viento_dir', 'Dirección del viento', 'Dirección predominante', '°', 'observado', 'clima', 'meteochile', 'estacion'),
  ('viento_vel', 'Velocidad del viento', 'Velocidad promedio a 10m', 'kt', 'observado', 'clima', 'meteochile', 'estacion'),
  ('viento_max', 'Velocidad máxima del viento', 'Velocidad máxima del día', 'kt', 'observado', 'clima', 'meteochile', 'estacion'),
  ('radiacion', 'Radiación solar global', 'Radiación global acumulada diaria', 'W/m2', 'observado', 'clima', 'meteochile', 'estacion'),
  ('uvb', 'Índice UVB', 'Índice UVB máximo diario', 'índice', 'observado', 'clima', 'meteochile', 'estacion'),
  ('humedad', 'Humedad relativa', 'Humedad relativa del aire', '%', 'observado', 'clima', 'meteochile', 'estacion'),
  ('punto_rocio', 'Punto de rocío', 'Temperatura del punto de rocío', '°C', 'observado', 'clima', 'meteochile', 'estacion'),
  ('evapotranspiracion', 'Evapotranspiración diaria', 'Evapotranspiración total diaria', 'mm', 'observado', 'clima', 'meteochile', 'estacion'),
  ('presion', 'Presión a nivel del mar', 'Presión a nivel del mar', 'hPa', 'observado', 'clima', 'meteochile', 'estacion')
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 12. Seeds: endpoints de ejemplo
-- ────────────────────────────────────────────────────────────

-- 12.1. MeteoChile: datos recientes de la red EMA
INSERT INTO ingest.endpoints
  (id, source_id, nombre, path, method, format, auth_type, auth_config,
   json_path, entity_mapping, period_mapping, value_mapping, prioridad)
VALUES (
  'meteochile:getDatosRecientesRedEma',
  'meteochile',
  'Datos recientes de la red EMA (12h)',
  '/getDatosRecientesRedEma',
  'GET', 'json', 'query_params',
  '{"usuario": "$METEOCHILE_USER", "token": "$METEOCHILE_TOKEN"}'::jsonb,
  '$.datosEstaciones[*]',
  '{"type": "estacion", "id_template": "estacion:{estacion.codigoNacional}", "name_field": "estacion.nombreEstacion"}'::jsonb,
  '{"start_field": "datos[0].momento", "end_field": "datos[0].momento", "format": "YYYY-MM-DD HH:mm:ss"}'::jsonb,
  '{
    "temp_avg": { "field": "datos[0].temperatura", "indicator": "temp_avg", "unit": "°C" },
    "temp_max": { "field": "datos[0].temperaturaMaxima12Horas", "indicator": "temp_max", "unit": "°C" },
    "temp_min": { "field": "datos[0].temperaturaMinima12Horas", "indicator": "temp_min", "unit": "°C" },
    "humedad": { "field": "datos[0].humedadRelativa", "indicator": "humedad", "unit": "%" },
    "precip": { "field": "datos[0].aguaCaida24Horas", "indicator": "precip", "unit": "mm" },
    "viento_dir": { "field": "datos[0].direccionDelViento", "indicator": "viento_dir", "unit": "°" },
    "viento_vel": { "field": "datos[0].fuerzaDelViento", "indicator": "viento_vel", "unit": "kt" },
    "radiacion": { "field": "datos[0].radiacionGlobalInst", "indicator": "radiacion", "unit": "W/m2" }
  }'::jsonb,
  10
) ON CONFLICT (id) DO NOTHING;

-- 12.2. ARClim: datos climáticos por comuna
INSERT INTO ingest.endpoints
  (id, source_id, nombre, path, method, format, auth_type,
   params, json_path, entity_mapping, period_mapping, value_mapping, prioridad)
VALUES (
  'arclim:datos_comunas',
  'arclim',
  'Datos climáticos por comuna',
  '/api/datos/comunas/json',
  'GET', 'json', 'none',
  '{"attributes": "SCLIMAShot_days$annual$present,SCLIMAShot_days$annual$future"}'::jsonb,
  '$.data',
  '{"type": "comuna", "id_template": "comuna:{index}", "name_field": "NOM_COMUNA"}'::jsonb,
  '{"start_field": null, "end_field": null, "format": "static"}'::jsonb,
  '{
    "olas_calor_present": { "indicator": "olas_calor", "scenario": null, "period_start": "1980-01-01", "period_end": "2010-12-31" },
    "olas_calor_future": { "indicator": "olas_calor_2050", "scenario": "ssp245", "period_start": "2035-01-01", "period_end": "2065-12-31" }
  }'::jsonb,
  10
) ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- RPC: leer el detalle completo de un endpoint (para el runner)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chat_get_endpoint(p_endpoint_id text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, ingest, extensions
AS $$
  SELECT row_to_json(e)::jsonb
  FROM (
    SELECT
      e.id, e.source_id, e.nombre, e.descripcion, e.path, e.method,
      e.format, e.auth_type, e.auth_config, e.params, e.json_path,
      e.entity_mapping, e.period_mapping, e.value_mapping, e.activo,
      s.url_base, s.nombre AS source_name, s.licencia
    FROM ingest.endpoints e
    JOIN ingest.sources s ON s.id = e.source_id
    WHERE e.id = p_endpoint_id
      AND e.activo = true
      AND s.activo = true
  ) e;
$$;

REVOKE ALL ON FUNCTION public.chat_get_endpoint(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_get_endpoint(text)
  TO service_role;

NOTIFY pgrst, 'reload schema';