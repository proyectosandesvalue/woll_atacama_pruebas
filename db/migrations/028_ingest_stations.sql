-- db/migrations/028_ingest_stations.sql
-- Catálogo de estaciones meteorológicas de Atacama + filtro por estación.
--
-- Sprint 42-B (2026-10-24).
--
-- Objetivo: que las ingestas de MeteoChile solo guarden valores de las
-- 27 estaciones de la Región de Atacama (NumeroRegion = 3).
-- Las consultas del chat siguen usando codigos nacionales.

-- ────────────────────────────────────────────────────────────
-- 1. ingest.stations — catálogo de estaciones de interés
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ingest.stations (
  codigo_nacional text PRIMARY KEY,
  codigo_omm text,
  codigo_oaci text,
  codigo_wigos text,
  nombre_estacion text NOT NULL,
  latitud numeric,
  longitud numeric,
  altitud numeric,
  region text,
  provincia text,
  comuna text,
  zona_geografica text,
  tipo_estacion text,
  tipo_clasificacion text,
  fecha_instalacion date,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stations_activo
  ON ingest.stations(activo) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_stations_comuna
  ON ingest.stations(comuna);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_ingest_stations_touch ON ingest.stations;
CREATE TRIGGER trg_ingest_stations_touch
  BEFORE UPDATE ON ingest.stations
  FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

GRANT SELECT, INSERT, UPDATE ON ingest.stations TO service_role;

-- ────────────────────────────────────────────────────────────
-- 2. ingest.endpoints — agregar columna entity_filter
-- ────────────────────────────────────────────────────────────

ALTER TABLE ingest.endpoints
  ADD COLUMN IF NOT EXISTS entity_filter text
  DEFAULT 'none'
  CHECK (entity_filter IN ('none', 'stations_only'));

-- Configurar el filtro en los 2 endpoints de MeteoChile
UPDATE ingest.endpoints
SET entity_filter = 'stations_only'
WHERE source_id = 'meteochile';

-- ────────────────────────────────────────────────────────────
-- 3. RPC: listar estaciones (panel admin y chat)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_list_stations(p_comuna text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, ingest, extensions
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'codigo_nacional', codigo_nacional,
      'nombre_estacion', nombre_estacion,
      'comuna', comuna,
      'provincia', provincia,
      'latitud', latitud,
      'longitud', longitud,
      'altitud', altitud,
      'zona_geografica', zona_geografica,
      'tipo_estacion', tipo_estacion,
      'tipo_clasificacion', tipo_clasificacion,
      'activo', activo
    ) ORDER BY nombre_estacion),
    '[]'::jsonb
  )
  FROM ingest.stations
  WHERE activo = true
    AND (p_comuna IS NULL OR comuna = p_comuna);
$$;

REVOKE ALL ON FUNCTION public.admin_list_stations(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_stations(text)
  TO service_role;

NOTIFY pgrst, 'reload schema';

-- ────────────────────────────────────────────────────────────
-- 4. Seed: las 27 estaciones de Atacama (del GeoJSON)
-- ────────────────────────────────────────────────────────────

INSERT INTO ingest.stations
  (codigo_nacional, codigo_omm, codigo_oaci, codigo_wigos, nombre_estacion,
   latitud, longitud, altitud, region, provincia, comuna, zona_geografica,
   tipo_estacion, tipo_clasificacion, fecha_instalacion, activo)
VALUES
  ('270008', '85467', 'SCAT', '0-20000-0-85467', 'Desierto de Atacama, Caldera Ad.',
   -27.25444, -70.78111, 204, 'Atacama', 'Copiapó', 'Caldera', 'Secano Costero',
   'Mixta', 'Sinóptica Aeronáutica', '2005-01-20', true),
  ('270002', '85470', 'SCHA', '', 'Copiapó, Chamonate Ad.',
   -27.29944, -70.41417, 305, 'Atacama', 'Copiapó', 'Copiapó', 'Valle',
   'Convencional', 'Sinóptica Aeronáutica', '1946-01-01', true),
  ('280003', '85486', 'SCLL', '', 'Vallenar, Ad.',
   -28.59333, -70.75694, 535, 'Atacama', 'Chañaral', 'Chañaral', 'Valle',
   'Convencional', 'Pluviométrica', '1915-01-01', true),
  ('280007', '', '', '', 'El Parral',
   -28.97944, -70.19722, 1265, 'Atacama', 'Huasco', 'Alto del Carmen', 'PreCordillera',
   'Convencional', 'Pluviométrica', '1917-06-01', true),
  ('260001', '', '', '', 'El Salvador comisaría',
   -26.24639, -69.62611, 2240, 'Atacama', 'Chañaral', 'Diego de Almagro', 'Valle',
   'Convencional', 'Pluviométrica', '1961-11-01', true),
  ('260003', '', '', '', 'Llanta control (retén)',
   -26.33305, -69.82333, 1187, 'Atacama', 'Chañaral', 'Chañaral', 'Cordillera',
   'Convencional', 'Pluviométrica', '1961-11-01', true),
  ('260005', '', '', '', 'Inca de Oro retén',
   -26.75528, -69.90528, 1592, 'Atacama', 'Chañaral', 'Diego de Almagro', 'PreCordillera',
   'Convencional', 'Pluviométrica', '1961-11-01', true),
  ('270003', '', '', '', 'Copiapó particular',
   -27.36805, -70.31, 434, 'Atacama', 'Copiapó', 'Copiapó', 'Valle',
   'Convencional', 'Pluviométrica', '1935-01-01', true),
  ('270004', '', '', '', 'Los Loros retén',
   -27.83222, -70.10722, 956, 'Atacama', 'Copiapó', 'Tierra Amarilla', 'Valle',
   'Convencional', 'TermoPluviométrica', '1932-08-01', true),
  ('280001', '', '', '', 'Puerto Huasco Subcomisaría',
   -28.4625, -71.225, 25, 'Atacama', 'Huasco', 'Huasco', 'Litoral',
   'Convencional', 'TermoPluviométrica', '1945-01-01', true),
  ('280004', '', '', '', 'El Tránsito escuela',
   -28.87667, -70.28055, 1108, 'Atacama', 'Huasco', 'Alto del Carmen', 'PreCordillera',
   'Convencional', 'Pluviométrica', '1935-09-01', true),
  ('280005', '', '', '', 'San Félix fundo',
   -28.93833, -70.45861, 1183, 'Atacama', 'Huasco', 'Alto del Carmen', 'Valle',
   'Convencional', 'Pluviométrica', '1940-11-01', true),
  ('280009', '', '', '', 'El Pino',
   -28.46833, -71.16194, 37, 'Atacama', 'Huasco', 'Huasco', 'Litoral',
   'Convencional', 'Pluviométrica', '1991-01-01', true),
  ('260002', '85460', 'SCRA', '', 'Chañaral Ad.',
   -26.33222, -70.61083, 23, 'Atacama', 'Chañaral', 'Chañaral', 'Litoral',
   'Convencional', 'Sinóptica Aeronáutica', '1954-03-01', true),
  ('260004', '85461', 'SCRO', '', 'Potrerillos',
   -26.43472, -69.48083, 2877, 'Atacama', 'Chañaral', 'Diego de Almagro', 'Valle',
   'Convencional', 'Climatológica', '1919-01-01', true),
  ('280002', '', '', '', 'Freirina tenencia',
   -28.50861, -71.07833, 102, 'Atacama', 'Huasco', 'Freirina', 'Secano Costero',
   'Convencional', 'Pluviométrica', '1935-09-01', true),
  ('280006', '', '', '', 'Conay retén',
   -28.97417, -70.13694, 1448, 'Atacama', 'Huasco', 'Alto del Carmen', 'PreCordillera',
   'Convencional', 'TermoPluviométrica', '1961-11-01', true),
  ('280008', '', '', '', 'San Félix retén',
   -28.93361, -70.46167, 1145, 'Atacama', 'Huasco', 'Alto del Carmen', 'Valle',
   'Convencional', 'Pluviométrica', '1975-01-01', true),
  ('260901', '', '', '', 'Pueblo Hundido retén',
   -26.39111, -70.04611, 788, 'Atacama', 'Chañaral', 'Diego de Almagro', 'Valle',
   'Convencional', 'TermoPluviométrica', '1962-12-01', true),
  ('270006', '85466', 'SCCL', '', 'Caldera',
   -27.05333, -70.84583, 27, 'Atacama', 'Copiapó', 'Caldera', 'Litoral',
   'Convencional', 'Sinóptica', '1870-01-01', true),
  ('280902', '', '', '', 'Vallenar Campex',
   -28.57583, -70.75722, 393, 'Atacama', 'Chañaral', 'Chañaral', 'Valle',
   'Convencional', 'Climatológica', '1970-01-01', true),
  ('270009', '85471', '', '0-152-0-270009', 'Copiapó Universidad de Atacama',
   -27.35889, -70.35333, 362, 'Atacama', 'Copiapó', 'Copiapó', 'Valle',
   'Automática', 'Climatológica', '2016-11-02', true),
  ('280010', '85484', '', '0-152-0-280010', 'Freirina Nicolasa',
   -28.51694, -71.01, 156, 'Atacama', 'Huasco', 'Freirina', 'Valle',
   'Automática', 'Climatológica', '2016-11-02', true),
  ('270015', '85465', '', '', 'Caldera R.B.',
   -27.07583, -70.82111, 50, 'Atacama', 'Copiapó', 'Caldera', 'Litoral',
   'Automática', 'Climatológica', '2018-10-12', true),
  ('260010', '', '', '0-152-0-260010', 'Ad. Ricardo García Posada, El Salvador',
   -26.31306, -69.75139, 1597, 'Atacama', 'Chañaral', 'Diego de Almagro', 'Valle',
   'Automática', 'Climatológica', '2023-08-04', true),
  ('270022', '', '', '0-152-0-270022', 'Copiapó, Cerro Antenas',
   -27.36278, -70.28305, 946, 'Atacama', 'Copiapó', 'Copiapó', 'Secano Interior',
   'Automática', 'Climatológica', '2025-10-09', true),
  ('280028', '', '', '0-152-0-280028', 'Alto del Carmen, Los Sauces',
   -28.77778, -70.47055, 854, 'Atacama', 'Huasco', 'Alto del Carmen', 'Valle',
   'Automática', 'Climatológica', '2025-11-29', true)
ON CONFLICT (codigo_nacional) DO NOTHING;