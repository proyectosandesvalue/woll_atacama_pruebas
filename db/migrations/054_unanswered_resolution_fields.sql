-- 054_unanswered_resolution_fields.sql
--
-- Expone los campos de resolución en el listado de demanda (Sprint 50).
-- CREATE OR REPLACE mantiene la firma de 053; solo amplía el SELECT.

CREATE OR REPLACE FUNCTION public.admin_list_unanswered(
  p_status text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_decision text DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_sort text DEFAULT 'last_seen_at'
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, admin, extensions
AS $$
  WITH filtered AS (
    SELECT id, question, occurrences, first_seen_at, last_seen_at,
           reason, reason_detail, status, priority, decision, sprint_target,
           notes, reviewed_by, reviewed_at, classification, route,
           resolution_type, resolution_note, resolved_at, resolved_by,
           created_at, updated_at
      FROM admin.unanswered_questions u
     WHERE (p_status IS NULL OR u.status = p_status)
       AND (p_reason IS NULL OR u.reason = p_reason)
       AND (p_priority IS NULL OR u.priority = p_priority)
       AND (p_decision IS NULL OR u.decision = p_decision)
       AND (
         p_query IS NULL
         OR p_query = ''
         OR u.question ILIKE '%' || p_query || '%'
       )
  ),
  counted AS (SELECT COUNT(*) AS total FROM filtered)
  SELECT jsonb_build_object(
    'total', (SELECT total FROM counted),
    'items', COALESCE((
      SELECT jsonb_agg(row_to_json(f) ORDER BY
        CASE WHEN p_sort = 'occurrences' THEN f.occurrences END DESC,
        CASE WHEN p_sort = 'created_at' THEN f.created_at END DESC,
        CASE WHEN p_sort = 'priority' THEN
          CASE f.priority
            WHEN 'alta' THEN 1
            WHEN 'media' THEN 2
            WHEN 'baja' THEN 3
            ELSE 4
          END
        END ASC,
        f.last_seen_at DESC)
      FROM (
        SELECT * FROM filtered
        ORDER BY
          CASE WHEN p_sort = 'occurrences' THEN occurrences END DESC,
          CASE WHEN p_sort = 'created_at' THEN created_at END DESC,
          CASE WHEN p_sort = 'priority' THEN
            CASE priority
              WHEN 'alta' THEN 1
              WHEN 'media' THEN 2
              WHEN 'baja' THEN 3
              ELSE 4
            END
          END ASC,
          last_seen_at DESC
        LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
        OFFSET GREATEST(0, COALESCE(p_offset, 0))
      ) f
    ), '[]'::jsonb)
  );
$$;
