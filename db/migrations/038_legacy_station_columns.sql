-- 038_legacy_station_columns.sql
--
-- Columnas de `ingest.stations` que existen en Supabase pero no estaban en la
-- migración 028. Las usan `admin_upsert_station`, `chat_list_climate_stations`
-- y `chat_station_weather` (generadas en 039_legacy_rpcs.sql).
--
-- Idempotente: ALTER TABLE ... ADD COLUMN IF NOT EXISTS.

ALTER TABLE ingest.stations
  ADD COLUMN IF NOT EXISTS codigo_bna text,
  ADD COLUMN IF NOT EXISTS propietario text,
  ADD COLUMN IF NOT EXISTS ficha_estacion text,
  ADD COLUMN IF NOT EXISTS estado_operativo text,
  ADD COLUMN IF NOT EXISTS variables_registradas text,
  ADD COLUMN IF NOT EXISTS periodo_registro text;
