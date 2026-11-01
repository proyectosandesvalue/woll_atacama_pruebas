-- 030_fix_column_coverage.sql
--
-- Corrige chat.chat_column_coverage. La versión original (migración 023)
-- fallaba al ejecutarse por tres motivos:
--   1. JOIN chat.audit_column → tabla inexistente. column_name ya está
--      en audit_column_results, no hay tabla de catálogo separada.
--   2. JOIN chat.audit_run → la tabla real es chat.audit_runs (plural).
--   3. WHERE status = 'finished' → valor inexistente. Los valores reales
--      de audit_layer_results.status son: ok, warning, blocked.
--
-- Además, la versión original usaba MAX(id) sobre audit_runs, pero
-- audit_runs no tiene layer_id (vive en audit_layer_results) y MAX(uuid)
-- no devuelve el run más reciente (los UUID v4 son aleatorios).
--
-- La lógica se reescribe contra el esquema real, ordenando por started_at.
-- El wrapper public.chat_column_coverage no cambia.

CREATE OR REPLACE FUNCTION chat.chat_column_coverage(p_layer text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'chat', 'public', 'extensions'
AS $function$
DECLARE
  result jsonb;
  v_run_id uuid;
BEGIN
  -- Último run que procesó esta capa con éxito (ok o warning).
  SELECT lr.run_id INTO v_run_id
  FROM chat.audit_layer_results lr
  JOIN chat.audit_runs ar ON ar.id = lr.run_id
  WHERE lr.layer_id = p_layer
    AND lr.status IN ('ok', 'warning')
  ORDER BY ar.started_at DESC
  LIMIT 1;

  IF v_run_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'column', r.column_name,
      'row_count', r.row_count,
      'null_count', r.null_count,
      'empty_count', r.empty_count,
      'suspicious_count', r.suspicious_count,
      'coverage', CASE
        WHEN r.row_count > 0 THEN
          ROUND(1.0 - (
            COALESCE(r.null_count, 0) +
            COALESCE(r.empty_count, 0) +
            COALESCE(r.suspicious_count, 0)
          )::numeric / r.row_count, 4)
        ELSE 0
      END
    )
  )
  INTO result
  FROM chat.audit_column_results r
  WHERE r.layer_id = p_layer
    AND r.run_id = v_run_id;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$function$;