-- 040_drop_legacy_overloads.sql
--
-- Supabase conservó versiones viejas de tres RPCs. Al convivir con las firmas
-- nuevas, una llamada con pocos argumentos puede ser ambigua:
--   ERROR: function public.chat_station_series(unknown, unknown) is not unique
--
-- La API y las tools usan las firmas nuevas (con p_estado, p_month y p_day).
-- Se eliminan las sobrecargas viejas para que la resolución sea determinista.
--
-- Idempotente: DROP FUNCTION IF EXISTS.

DROP FUNCTION IF EXISTS public.chat_historical_stations();
DROP FUNCTION IF EXISTS public.chat_station_series(text, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.chat_stations_map_data_at_date(text, date);
