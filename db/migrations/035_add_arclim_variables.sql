-- 032_add_arclim_variables.sql
-- Agrega los indicadores de proyecciones climáticas de ARClim
-- y actualiza el endpoint para descargar las 5 variables para Atacama.

-- 1. Insertar los nuevos indicadores si no existen
INSERT INTO ingest.indicators (id, nombre, descripcion, unidad, tipo, categoria, source_default, requiere_entity_type)
VALUES
  ('tasmax_mean', 'Temperatura máxima media', 'Promedio de la temperatura máxima diaria proyectada', '°C', 'proyectado', 'clima', 'arclim', 'comuna'),
  ('tasmin_mean', 'Temperatura mínima media', 'Promedio de la temperatura mínima diaria proyectada', '°C', 'proyectado', 'clima', 'arclim', 'comuna'),
  ('heladas_2050', 'Días de helada proyectados', 'Días con temperatura mínima bajo 0°C proyectados a 2050', 'días', 'proyectado', 'clima', 'arclim', 'comuna'),
  ('precip_anual', 'Precipitación acumulada anual', 'Suma de precipitación anual histórica', 'mm', 'proyectado', 'clima', 'arclim', 'comuna'),
  ('precip_anual_2050', 'Precipitación anual proyectada', 'Suma de precipitación anual proyectada a 2050', 'mm', 'proyectado', 'clima', 'arclim', 'comuna')
ON CONFLICT (id) DO NOTHING;

-- 2. Actualizar el endpoint de ARClim con los nuevos atributos y el value_mapping
UPDATE ingest.endpoints
SET
  params = '{"attributes": "NOM_COMUNA,$CLIMA$hot_days$annual$present,$CLIMA$hot_days$annual$future,$CLIMA$tasmax_mean$annual$present,$CLIMA$tasmax_mean$annual$future,$CLIMA$tasmin_mean$annual$present,$CLIMA$tasmin_mean$annual$future,$CLIMA$frost_days$annual$present,$CLIMA$frost_days$annual$future,$CLIMA$pr_sum$annual$present,$CLIMA$pr_sum$annual$future"}'::jsonb,
  value_mapping = '{
    "olas_calor_present": { "column": "$CLIMA$hot_days$annual$present", "indicator": "olas_calor", "unit": "días", "period_start": "1980-01-01", "period_end": "2010-12-31" },
    "olas_calor_future": { "column": "$CLIMA$hot_days$annual$future", "indicator": "olas_calor_2050", "unit": "días", "scenario": "ssp245", "period_start": "2035-01-01", "period_end": "2065-12-31" },
    "tasmax_present": { "column": "$CLIMA$tasmax_mean$annual$present", "indicator": "tasmax_mean", "unit": "°C", "period_start": "1980-01-01", "period_end": "2010-12-31" },
    "tasmax_future": { "column": "$CLIMA$tasmax_mean$annual$future", "indicator": "tasmax_mean", "unit": "°C", "scenario": "ssp245", "period_start": "2035-01-01", "period_end": "2065-12-31" },
    "tasmin_present": { "column": "$CLIMA$tasmin_mean$annual$present", "indicator": "tasmin_mean", "unit": "°C", "period_start": "1980-01-01", "period_end": "2010-12-31" },
    "tasmin_future": { "column": "$CLIMA$tasmin_mean$annual$future", "indicator": "tasmin_mean", "unit": "°C", "scenario": "ssp245", "period_start": "2035-01-01", "period_end": "2065-12-31" },
    "frost_present": { "column": "$CLIMA$frost_days$annual$present", "indicator": "heladas_2050", "unit": "días", "period_start": "1980-01-01", "period_end": "2010-12-31" },
    "frost_future": { "column": "$CLIMA$frost_days$annual$future", "indicator": "heladas_2050", "unit": "días", "scenario": "ssp245", "period_start": "2035-01-01", "period_end": "2065-12-31" },
    "pr_present": { "column": "$CLIMA$pr_sum$annual$present", "indicator": "precip_anual", "unit": "mm", "period_start": "1980-01-01", "period_end": "2010-12-31" },
    "pr_future": { "column": "$CLIMA$pr_sum$annual$future", "indicator": "precip_anual_2050", "unit": "mm", "scenario": "ssp245", "period_start": "2035-01-01", "period_end": "2065-12-31" }
  }'::jsonb,
  updated_at = now()
WHERE id = 'arclim:datos_comunas';