-- 044_admin_api_connections.sql
--
-- Inventario editable de conexiones externas del backend.
-- Sprint 45-B (docs/specs/45-panel-admin-operaciones/00-spec-madre.md).
--
-- Los secretos y URLs sensibles viven en variables de entorno; aquí solo se
-- guardan parámetros no secretos y el resultado de la última prueba.
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS + UPSERT de seeds.

CREATE TABLE IF NOT EXISTS admin.api_connections (
  key text PRIMARY KEY,
  label text NOT NULL,
  timeout_ms integer NOT NULL DEFAULT 15000
    CHECK (timeout_ms BETWEEN 1000 AND 120000),
  rate_limit text,
  activo boolean NOT NULL DEFAULT true,
  last_check_at timestamptz,
  last_status integer,
  last_latency_ms integer,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE INDEX IF NOT EXISTS idx_api_connections_activo
  ON admin.api_connections (activo, key);

REVOKE ALL ON TABLE admin.api_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE admin.api_connections TO woll_api;

INSERT INTO admin.api_connections (key, label, timeout_ms, rate_limit)
VALUES
  ('copernicus-wms', 'Copernicus WMS', 15000, '1200/min'),
  ('copernicus-wfs', 'Copernicus WFS', 15000, '1200/min'),
  ('copernicus-wmts', 'Copernicus WMTS', 15000, '1200/min'),
  ('worldview-snapshot', 'NASA Worldview Snapshots', 15000, '1200/min'),
  ('arclim', 'ARClim (MMA)', 15000, '120/min'),
  ('agromet', 'Agromet (INIA)', 15000, '120/min'),
  ('meteochile', 'MeteoChile (DMC)', 15000, '120/min'),
  ('embeddings', 'Proveedor de embeddings', 30000, '—')
ON CONFLICT (key) DO NOTHING;
