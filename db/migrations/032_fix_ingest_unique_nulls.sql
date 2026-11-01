-- 032_fix_ingest_unique_nulls.sql
--
-- Corrige el UNIQUE de ingest.indicator_values para que el ON CONFLICT
-- del RPC ingest_upsert_value matchee cuando scenario = NULL.
--
-- En PostgreSQL, NULL != NULL por defecto, así que el UNIQUE
-- (indicator_id, source_id, entity_id, period_start, period_end, scenario)
-- no matchea cuando scenario es NULL. Resultado: cada re-corrida del
-- ingest de ARClim insertaba 345 filas duplicadas para olas_calor
-- (scenario NULL) en lugar de actualizarlas.
--
-- Fix: UNIQUE NULLS NOT DISTINCT (PostgreSQL 15+). Disponible en
-- PostgreSQL 17.11 (el de staging).
--
-- Antes de cambiar el constraint, limpiar los duplicados existentes
-- (conservar la fila con id más alto de cada grupo = último fetch).

-- 1. Limpiar duplicados.
DELETE FROM ingest.indicator_values a
USING ingest.indicator_values b
WHERE a.id < b.id
  AND a.indicator_id = b.indicator_id
  AND a.source_id = b.source_id
  AND a.entity_id = b.entity_id
  AND a.period_start = b.period_start
  AND a.period_end = b.period_end
  AND a.scenario IS NOT DISTINCT FROM b.scenario;

-- 2. Cambiar el constraint.
ALTER TABLE ingest.indicator_values
  DROP CONSTRAINT indicator_values_indicator_id_source_id_entity_id_period_st_key,
  ADD CONSTRAINT indicator_values_unique_row
    UNIQUE NULLS NOT DISTINCT
    (indicator_id, source_id, entity_id, period_start, period_end, scenario);

NOTIFY pgrst, 'reload schema';