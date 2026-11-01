-- 034_fix_refresh_availability.sql
--
-- El REFRESH MATERIALIZED VIEW CONCURRENTLY de la migración 033
-- excedía el statement_timeout de Supabase (8s) porque necesita
-- construir una tabla temporal y comparar con la vista existente.
--
-- Fix: usar REFRESH MATERIALIZED VIEW normal (TRUNCATE + INSERT),
-- que es mucho más rápido, y subir el timeout a 120s como safety net.
--
-- El refresh ocurre al final de la ingesta, cuando no hay queries
-- concurrentes críticas, así que el bloqueo breve de la vista es
-- aceptable.

CREATE OR REPLACE FUNCTION public.refresh_variable_availability()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, ingest, extensions
SET statement_timeout = '120s'
AS $$
  REFRESH MATERIALIZED VIEW ingest.variable_availability;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_variable_availability() TO service_role;

NOTIFY pgrst, 'reload schema';