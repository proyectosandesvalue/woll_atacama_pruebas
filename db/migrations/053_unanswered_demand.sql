-- 053_unanswered_demand.sql
--
-- Cola de triage de preguntas que el chat no pudo responder (Sprint 50).
-- Migración aditiva e idempotente sobre admin.unanswered_questions (026).
--
-- - Deduplica por fingerprint y cuenta ocurrencias.
-- - Agrega prioridad, decisión, sprint, notas y revisión.
-- - Elimina datos personales del registro (email, sesión, historial).
-- - Reemplaza las RPCs de listado/registro y agrega la de triage.

-- ────────────────────────────────────────────────────────────
-- 1. Columnas nuevas
-- ────────────────────────────────────────────────────────────

ALTER TABLE admin.unanswered_questions
  ADD COLUMN IF NOT EXISTS fingerprint text,
  ADD COLUMN IF NOT EXISTS occurrences integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS priority text,
  ADD COLUMN IF NOT EXISTS decision text,
  ADD COLUMN IF NOT EXISTS sprint_target text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS reviewed_by text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

UPDATE admin.unanswered_questions
   SET first_seen_at = COALESCE(first_seen_at, created_at),
       last_seen_at = COALESCE(last_seen_at, created_at),
       fingerprint = COALESCE(fingerprint, md5(lower(btrim(question))))
 WHERE first_seen_at IS NULL
    OR last_seen_at IS NULL
    OR fingerprint IS NULL;

-- Consolidar duplicados históricos antes del índice único.
-- Se conserva la fila más antigua de cada fingerprint y se suman las
-- ocurrencias; las filas repetidas se eliminan (estaban en pending).
WITH ranked AS (
  SELECT id, fingerprint,
         row_number() OVER (
           PARTITION BY fingerprint ORDER BY created_at ASC, id ASC
         ) AS rn,
         count(*) OVER (PARTITION BY fingerprint) AS cnt,
         min(created_at) OVER (PARTITION BY fingerprint) AS first_at,
         max(created_at) OVER (PARTITION BY fingerprint) AS last_at
    FROM admin.unanswered_questions
   WHERE fingerprint IS NOT NULL
),
keepers AS (
  SELECT id, cnt, first_at, last_at
    FROM ranked
   WHERE rn = 1 AND cnt > 1
)
UPDATE admin.unanswered_questions u
   SET occurrences = k.cnt,
       first_seen_at = k.first_at,
       last_seen_at = k.last_at,
       updated_at = now()
  FROM keepers k
 WHERE u.id = k.id;

DELETE FROM admin.unanswered_questions u
 USING (
   SELECT id
     FROM (
       SELECT id,
              row_number() OVER (
                PARTITION BY fingerprint ORDER BY created_at ASC, id ASC
              ) AS rn
         FROM admin.unanswered_questions
        WHERE fingerprint IS NOT NULL
     ) x
    WHERE x.rn > 1
 ) d
 WHERE u.id = d.id;

-- Privacidad: no conservar email, sesión ni historial de conversación.
UPDATE admin.unanswered_questions
   SET user_email = NULL,
       session_id = NULL,
       context = NULL
 WHERE user_email IS NOT NULL
    OR session_id IS NOT NULL
    OR context IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. Checks de estado, prioridad y decisión
-- ────────────────────────────────────────────────────────────

ALTER TABLE admin.unanswered_questions
  DROP CONSTRAINT IF EXISTS unanswered_questions_status_check;
ALTER TABLE admin.unanswered_questions
  ADD CONSTRAINT unanswered_questions_status_check
  CHECK (status IN (
    'pending', 'reviewing', 'accepted', 'planned', 'resolved',
    'rejected', 'duplicate', 'archived',
    -- Valores heredados de la migración 026.
    'in_progress', 'wont_fix'
  ));

ALTER TABLE admin.unanswered_questions
  DROP CONSTRAINT IF EXISTS unanswered_questions_priority_check;
ALTER TABLE admin.unanswered_questions
  ADD CONSTRAINT unanswered_questions_priority_check
  CHECK (priority IS NULL OR priority IN ('alta', 'media', 'baja'));

ALTER TABLE admin.unanswered_questions
  DROP CONSTRAINT IF EXISTS unanswered_questions_decision_check;
ALTER TABLE admin.unanswered_questions
  ADD CONSTRAINT unanswered_questions_decision_check
  CHECK (decision IS NULL OR decision IN (
    'new_tool', 'new_layer', 'new_document', 'improve_prompt',
    'unavailable', 'out_of_scope', 'wont_fix', 'duplicate'
  ));

-- ────────────────────────────────────────────────────────────
-- 3. Índices
-- ────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_unanswered_fingerprint
  ON admin.unanswered_questions (fingerprint);

CREATE INDEX IF NOT EXISTS idx_unanswered_last_seen
  ON admin.unanswered_questions (status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_unanswered_priority
  ON admin.unanswered_questions (priority, last_seen_at DESC);

-- ────────────────────────────────────────────────────────────
-- 4. Registro: upsert por fingerprint (sin PII)
-- ────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.chat_log_unanswered(
  text, jsonb, jsonb, jsonb, text, text, text, text, text
);

CREATE OR REPLACE FUNCTION public.chat_log_unanswered(
  p_question text,
  p_context jsonb DEFAULT NULL,
  p_classification jsonb DEFAULT NULL,
  p_route jsonb DEFAULT NULL,
  p_user_role text DEFAULT 'publico',
  p_user_email text DEFAULT NULL,
  p_session_id text DEFAULT NULL,
  p_reason text DEFAULT 'unknown',
  p_reason_detail text DEFAULT NULL,
  p_fingerprint text DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER
SET search_path = public, admin, extensions
AS $$
  INSERT INTO admin.unanswered_questions
    (question, classification, route, user_role, reason, reason_detail,
     fingerprint, occurrences, first_seen_at, last_seen_at)
  VALUES
    (left(p_question, 1000), p_classification, p_route, p_user_role,
     p_reason, p_reason_detail, p_fingerprint, 1, now(), now())
  ON CONFLICT (fingerprint) DO UPDATE
    SET occurrences = admin.unanswered_questions.occurrences + 1,
        last_seen_at = now(),
        classification = COALESCE(
          EXCLUDED.classification,
          admin.unanswered_questions.classification
        ),
        route = COALESCE(
          EXCLUDED.route,
          admin.unanswered_questions.route
        ),
        reason_detail = COALESCE(
          EXCLUDED.reason_detail,
          admin.unanswered_questions.reason_detail
        ),
        updated_at = now()
  RETURNING id;
$$;

REVOKE ALL ON FUNCTION public.chat_log_unanswered(
  text, jsonb, jsonb, jsonb, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_log_unanswered(
  text, jsonb, jsonb, jsonb, text, text, text, text, text, text
) TO service_role, woll_api;

-- ────────────────────────────────────────────────────────────
-- 5. Listado con filtros y paginación
-- ────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.admin_list_unanswered(text, text, int);

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

REVOKE ALL ON FUNCTION public.admin_list_unanswered(
  text, text, text, text, text, int, int, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_unanswered(
  text, text, text, text, text, int, int, text
) TO service_role, woll_api;

-- ────────────────────────────────────────────────────────────
-- 6. Triage
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_update_unanswered(
  p_id uuid,
  p_status text DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_decision text DEFAULT NULL,
  p_sprint_target text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_resolution_type text DEFAULT NULL,
  p_resolution_note text DEFAULT NULL,
  p_actor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin, extensions
AS $$
DECLARE
  result jsonb;
BEGIN
  UPDATE admin.unanswered_questions
     SET status = COALESCE(p_status, status),
         priority = p_priority,
         decision = p_decision,
         sprint_target = p_sprint_target,
         notes = p_notes,
         resolution_type = p_resolution_type,
         resolution_note = p_resolution_note,
         resolved_at = CASE
           WHEN p_status = 'resolved' THEN now()
           WHEN p_status IS NOT NULL THEN NULL
           ELSE resolved_at
         END,
         resolved_by = CASE
           WHEN p_status = 'resolved' THEN p_actor
           WHEN p_status IS NOT NULL THEN NULL
           ELSE resolved_by
         END,
         reviewed_by = COALESCE(p_actor, reviewed_by),
         reviewed_at = now(),
         updated_at = now()
   WHERE id = p_id
  RETURNING to_jsonb(unanswered_questions.*) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_unanswered(
  uuid, text, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_unanswered(
  uuid, text, text, text, text, text, text, text, text
) TO service_role, woll_api;

-- ────────────────────────────────────────────────────────────
-- 7. Estadísticas
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_unanswered_stats()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, admin, extensions
AS $$
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*) FROM admin.unanswered_questions),
    'pending', (
      SELECT COUNT(*) FROM admin.unanswered_questions WHERE status = 'pending'
    ),
    'reviewing', (
      SELECT COUNT(*) FROM admin.unanswered_questions
       WHERE status IN ('reviewing', 'in_progress')
    ),
    'accepted', (
      SELECT COUNT(*) FROM admin.unanswered_questions WHERE status = 'accepted'
    ),
    'planned', (
      SELECT COUNT(*) FROM admin.unanswered_questions WHERE status = 'planned'
    ),
    'resolved', (
      SELECT COUNT(*) FROM admin.unanswered_questions WHERE status = 'resolved'
    ),
    'rejected', (
      SELECT COUNT(*) FROM admin.unanswered_questions
       WHERE status IN ('rejected', 'wont_fix')
    ),
    'duplicate', (
      SELECT COUNT(*) FROM admin.unanswered_questions WHERE status = 'duplicate'
    ),
    'archived', (
      SELECT COUNT(*) FROM admin.unanswered_questions WHERE status = 'archived'
    ),
    'by_reason', (
      SELECT COALESCE(jsonb_object_agg(reason, cnt), '{}'::jsonb)
        FROM (
          SELECT reason, COUNT(*) AS cnt
            FROM admin.unanswered_questions
           GROUP BY reason
        ) r
    ),
    'by_priority', (
      SELECT COALESCE(jsonb_object_agg(priority, cnt), '{}'::jsonb)
        FROM (
          SELECT priority, COUNT(*) AS cnt
            FROM admin.unanswered_questions
           WHERE priority IS NOT NULL
           GROUP BY priority
        ) p
    ),
    'by_decision', (
      SELECT COALESCE(jsonb_object_agg(decision, cnt), '{}'::jsonb)
        FROM (
          SELECT decision, COUNT(*) AS cnt
            FROM admin.unanswered_questions
           WHERE decision IS NOT NULL
           GROUP BY decision
        ) d
    ),
    'top_questions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'question', question,
        'reason', reason,
        'occurrences', occurrences,
        'priority', priority,
        'decision', decision,
        'last_seen_at', last_seen_at
      ) ORDER BY occurrences DESC, last_seen_at DESC), '[]'::jsonb)
        FROM (
          SELECT id, question, reason, occurrences, priority, decision, last_seen_at
            FROM admin.unanswered_questions
           WHERE status IN ('pending', 'reviewing', 'in_progress')
           ORDER BY occurrences DESC, last_seen_at DESC
           LIMIT 10
        ) t
    ),
    -- Compatibilidad con la versión anterior.
    'total_pending', (
      SELECT COUNT(*) FROM admin.unanswered_questions WHERE status = 'pending'
    ),
    'total_resolved', (
      SELECT COUNT(*) FROM admin.unanswered_questions WHERE status = 'resolved'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.admin_unanswered_stats()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unanswered_stats()
  TO service_role, woll_api;

-- ────────────────────────────────────────────────────────────
-- 8. Grants de tabla para el panel en el VPS
-- ────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON admin.unanswered_questions TO woll_api;
