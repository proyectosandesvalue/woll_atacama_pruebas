-- 031_fix_arclim_endpoint.sql
--
-- Corrige el endpoint de ARClim en ingest.endpoints. La versión de la
-- migración 027 tenía cuatro problemas:
--   1. path = '/api/datos/comunas/json' duplicaba /api (url_base ya
--      termina en /api) → la URL real era /api/api/datos/...
--   2. path sin trailing slash → Django devolvía 301.
--   3. params.attributes usaba 'SCLIMAShot_days$annual$present'
--      (sin $ inicial y con S) → ARClim devolvía HTTP 500.
--   4. value_mapping no tenía 'column' ni 'field' → el adapter
--      saltaba todos los mappings.
--
-- Los nombres reales de columna (verificados con curl) son:
--   NOM_COMUNA
--   $CLIMA$hot_days$annual$present
--   $CLIMA$hot_days$annual$future
--
-- El adapter (json-columnar.js) se corrige en el mismo commit para
-- aplicar json_path y exponer data.index como {index}.

UPDATE ingest.endpoints
SET
  path = '/datos/comunas/json/',
  params = '{"attributes": "NOM_COMUNA,$CLIMA$hot_days$annual$present,$CLIMA$hot_days$annual$future"}'::jsonb,
  value_mapping = '{
    "olas_calor_present": {
      "column": "$CLIMA$hot_days$annual$present",
      "indicator": "olas_calor",
      "unit": "días",
      "scenario": null,
      "period_start": "1980-01-01",
      "period_end": "2010-12-31"
    },
    "olas_calor_future": {
      "column": "$CLIMA$hot_days$annual$future",
      "indicator": "olas_calor_2050",
      "unit": "días",
      "scenario": "ssp245",
      "period_start": "2035-01-01",
      "period_end": "2065-12-31"
    }
  }'::jsonb,
  updated_at = now()
WHERE id = 'arclim:datos_comunas';

NOTIFY pgrst, 'reload schema';