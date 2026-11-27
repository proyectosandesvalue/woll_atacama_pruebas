-- 064_retention.sql
--
-- Política de retención de datos operativos (Sprint 32-B).
--
-- - Preguntas sin respuesta: 365 días desde la última ocurrencia.
-- - Auditoría administrativa: 730 días desde el registro.
-- - La conversación del chat no se persiste en la base.
-- - Los logs de contenedor se rotan por tamaño (10 MB × 5).
--
-- La función es idempotente y no borra columnas ni cambia el esquema.
-- `p_dry_run` solo cuenta, sin borrar.

CREATE OR REPLACE FUNCTION public.admin_purge_retention(
  p_unanswered_days int DEFAULT 365,
  p_audit_days int DEFAULT 730,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin, extensions
AS $$
DECLARE
  v_unanswered int := 0;
  v_audit int := 0;
  v_unanswered_cutoff timestamptz;
  v_audit_cutoff timestamptz;
BEGIN
  IF p_unanswered_days IS NULL OR p_unanswered_days < 1 OR p_unanswered_days > 3650 THEN
    RAISE EXCEPTION 'p_unanswered_days debe estar entre 1 y 3650';
  END IF;

  IF p_audit_days IS NULL OR p_audit_days < 1 OR p_audit_days > 3650 THEN
    RAISE EXCEPTION 'p_audit_days debe estar entre 1 y 3650';
  END IF;

  v_unanswered_cutoff := now() - make_interval(days => p_unanswered_days);
  v_audit_cutoff := now() - make_interval(days => p_audit_days);

  IF p_dry_run THEN
    SELECT count(*)
      INTO v_unanswered
      FROM admin.unanswered_questions
     WHERE COALESCE(last_seen_at, created_at) < v_unanswered_cutoff;

    SELECT count(*)
      INTO v_audit
      FROM admin.audit_log
     WHERE at < v_audit_cutoff;
  ELSE
    WITH deleted AS (
      DELETE FROM admin.unanswered_questions
       WHERE COALESCE(last_seen_at, created_at) < v_unanswered_cutoff
      RETURNING 1
    )
    SELECT count(*) INTO v_unanswered FROM deleted;

    WITH deleted AS (
      DELETE FROM admin.audit_log
       WHERE at < v_audit_cutoff
      RETURNING 1
    )
    SELECT count(*) INTO v_audit FROM deleted;
  END IF;

  RETURN jsonb_build_object(
    'unanswered', v_unanswered,
    'audit', v_audit,
    'dry_run', COALESCE(p_dry_run, false),
    'unanswered_days', p_unanswered_days,
    'audit_days', p_audit_days,
    'unanswered_cutoff', v_unanswered_cutoff,
    'audit_cutoff', v_audit_cutoff
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_purge_retention(int, int, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_purge_retention(int, int, boolean)
  TO service_role;
