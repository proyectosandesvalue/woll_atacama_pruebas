-- 052_raster_stats.sql
--
-- Estadísticas por comuna/provincia/región de los rásteres precalculados
-- (Sprint 49). El cálculo se hace en QGIS y se publica como CSV; el servidor
-- solo lee esta tabla. No se calculan estadísticas zonales en runtime.
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS public.raster_stats (
  layer_id     text NOT NULL,
  version      text NOT NULL,
  admin_level  text NOT NULL CHECK (admin_level IN ('comuna', 'provincia', 'region')),
  admin_code   text NOT NULL,
  admin_name   text NOT NULL,
  class_id     integer NOT NULL DEFAULT -1,
  class_label  text,
  class_min    double precision,
  class_max    double precision,
  hectares     double precision,
  mean         double precision,
  min          double precision,
  max          double precision,
  p10          double precision,
  p90          double precision,
  computed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (layer_id, version, admin_level, admin_code, class_id)
);

CREATE INDEX IF NOT EXISTS idx_raster_stats_lookup
  ON public.raster_stats (layer_id, version, admin_level);

REVOKE ALL ON TABLE public.raster_stats FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.raster_stats TO woll_api;

COMMENT ON TABLE public.raster_stats IS
  'Estadísticas zonales de rásteres precalculados (Sprint 49). Solo lectura para woll_api.';
COMMENT ON COLUMN public.raster_stats.class_id IS
  '-1 = total de la capa; 0..n = clases del manifest.';
