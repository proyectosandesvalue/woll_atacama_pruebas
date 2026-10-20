-- 023_chat_column_coverage.sql
-- RPC para consultar la cobertura de columnas de una capa.
-- Usa la última corrida de auditoría (chat.audit_column_results).

CREATE OR REPLACE FUNCTION chat.chat_column_coverage(p_layer text)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = chat, public, extensions
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'column', c.column_name,
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
  JOIN chat.audit_column c ON c.id = r.column_id
  JOIN chat.audit_run ar ON ar.id = r.run_id
  WHERE ar.layer_id = p_layer
    AND ar.id = (
      SELECT MAX(id) FROM chat.audit_run
      WHERE layer_id = p_layer AND status = 'finished'
    );

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- Wrapper en public
CREATE OR REPLACE FUNCTION public.chat_column_coverage(p_layer text)
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, chat, extensions
AS $$
  SELECT chat.chat_column_coverage(p_layer);
$$;

REVOKE ALL ON FUNCTION chat.chat_column_coverage(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_column_coverage(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION chat.chat_column_coverage(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_column_coverage(text) TO service_role;

NOTIFY pgrst, 'reload schema';