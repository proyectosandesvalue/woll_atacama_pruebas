-- db/migrations/026_unanswered_questions.sql
-- Registro de preguntas que el chat no pudo responder.
-- Sprint 40-E (ciclo de mejora continua).
--
-- Cada vez que el chat no puede responder (por falta de dato, receta,
-- tool o documento), se registra la pregunta con contexto para que
-- el dev la revise y la resuelva.
--
-- Tabla en schema `admin` (no expuesta a PostgREST).
-- RPCs SECURITY DEFINER, solo service_role.

CREATE TABLE IF NOT EXISTS admin.unanswered_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  context jsonb,                      -- historial de la conversación
  classification jsonb,               -- salida del clasificador
  route jsonb,                        -- pipeline elegido (si hubo)
  user_role text DEFAULT 'publico',   -- 'publico', 'experto', 'admin'
  user_email text,                    -- si está autenticado
  session_id text,
  reason text NOT NULL DEFAULT 'unknown'
    CHECK (reason IN (
      'no_data',       -- dato inexistente en el visor
      'no_recipe',     -- análisis no implementado
      'no_tool',       -- tool/API no implementada
      'no_document',   -- documento no ingestado al RAG
      'out_of_scope',  -- fuera de dominio (no se registra por defecto)
      'unknown'        -- no se pudo determinar
    )),
  reason_detail text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'resolved', 'wont_fix')),
  resolution_type text
    CHECK (resolution_type IS NULL OR resolution_type IN (
      'data_added', 'recipe_created', 'tool_added', 'document_added', 'wont_fix'
    )),
  resolution_note text,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para consultas del panel admin
CREATE INDEX IF NOT EXISTS idx_unanswered_pending
  ON admin.unanswered_questions(status) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_unanswered_reason
  ON admin.unanswered_questions(reason) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_unanswered_question
  ON admin.unanswered_questions(question);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_unanswered_touch ON admin.unanswered_questions;
CREATE TRIGGER trg_unanswered_touch
  BEFORE UPDATE ON admin.unanswered_questions
  FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

-- Grants
GRANT SELECT, INSERT, UPDATE ON admin.unanswered_questions TO service_role;

-- ────────────────────────────────────────────────────────────
-- RPC: registrar una pregunta
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chat_log_unanswered(
  p_question text,
  p_context jsonb DEFAULT NULL,
  p_classification jsonb DEFAULT NULL,
  p_route jsonb DEFAULT NULL,
  p_user_role text DEFAULT 'publico',
  p_user_email text DEFAULT NULL,
  p_session_id text DEFAULT NULL,
  p_reason text DEFAULT 'unknown',
  p_reason_detail text DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER
SET search_path = public, admin, extensions
AS $$
  INSERT INTO admin.unanswered_questions
    (question, context, classification, route, user_role, user_email,
     session_id, reason, reason_detail)
  VALUES
    (p_question, p_context, p_classification, p_route, p_user_role,
     p_user_email, p_session_id, p_reason, p_reason_detail)
  RETURNING id;
$$;

REVOKE ALL ON FUNCTION public.chat_log_unanswered(text, jsonb, jsonb, jsonb, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_log_unanswered(text, jsonb, jsonb, jsonb, text, text, text, text, text)
  TO service_role;

-- ────────────────────────────────────────────────────────────
-- RPC: listar pendientes (panel admin)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_list_unanswered(
  p_status text DEFAULT 'pending',
  p_reason text DEFAULT NULL,
  p_limit int DEFAULT 100
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, admin, extensions
AS $$
  SELECT COALESCE(
    jsonb_agg(row_to_json(r) ORDER BY r.created_at DESC),
    '[]'::jsonb
  )
  FROM (
    SELECT
      id, question, reason, reason_detail, user_role, user_email,
      session_id, status, created_at, classification, route,
      (
        SELECT COUNT(*)
        FROM admin.unanswered_questions u2
        WHERE u2.status = 'pending'
          AND u2.reason = u.reason
          AND u2.question = u.question
      ) AS count_similar
    FROM admin.unanswered_questions u
    WHERE u.status = p_status
      AND (p_reason IS NULL OR u.reason = p_reason)
    ORDER BY u.created_at DESC
    LIMIT p_limit
  ) r;
$$;

REVOKE ALL ON FUNCTION public.admin_list_unanswered(text, text, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_unanswered(text, text, int)
  TO service_role;

-- ────────────────────────────────────────────────────────────
-- RPC: marcar como resuelta
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_resolve_unanswered(
  p_id uuid,
  p_resolution_type text,
  p_resolution_note text DEFAULT NULL,
  p_resolved_by text DEFAULT NULL
)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public, admin, extensions
AS $$
  UPDATE admin.unanswered_questions
  SET
    status = 'resolved',
    resolution_type = p_resolution_type,
    resolution_note = p_resolution_note,
    resolved_at = now(),
    resolved_by = p_resolved_by
  WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_unanswered(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_unanswered(uuid, text, text, text)
  TO service_role;

-- ────────────────────────────────────────────────────────────
-- RPC: estadísticas (para priorizar)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_unanswered_stats()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, admin, extensions
AS $$
  SELECT jsonb_build_object(
    'total_pending', (SELECT COUNT(*) FROM admin.unanswered_questions WHERE status = 'pending'),
    'total_resolved', (SELECT COUNT(*) FROM admin.unanswered_questions WHERE status = 'resolved'),
    'by_reason', (
      SELECT COALESCE(jsonb_object_agg(reason, cnt), '{}'::jsonb)
      FROM (
        SELECT reason, COUNT(*) AS cnt
        FROM admin.unanswered_questions
        WHERE status = 'pending'
        GROUP BY reason
      ) r
    ),
    'top_questions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'question', question,
        'reason', reason,
        'count', cnt
      ) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (
        SELECT question, reason, COUNT(*) AS cnt
        FROM admin.unanswered_questions
        WHERE status = 'pending'
        GROUP BY question, reason
        ORDER BY cnt DESC
        LIMIT 10
      ) t
    )
  );
$$;

REVOKE ALL ON FUNCTION public.admin_unanswered_stats()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unanswered_stats()
  TO service_role;

NOTIFY pgrst, 'reload schema';