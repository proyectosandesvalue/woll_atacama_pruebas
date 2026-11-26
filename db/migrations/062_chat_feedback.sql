-- 062_chat_feedback.sql
--
-- Valoración de respuestas del chat (Sprint 31-D).
-- No guarda pregunta ni respuesta: solo el id de respuesta, contexto de ruta
-- y la valoración anónima.

CREATE TABLE IF NOT EXISTS chat.feedback (
  response_id uuid PRIMARY KEY,
  session_hash text,
  route text,
  tier integer,
  tools_count integer,
  rating text CHECK (rating IN ('up', 'down')),
  reason text CHECK (reason IN ('irrelevant', 'incorrect', 'incomplete', 'other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_feedback_created
  ON chat.feedback (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_feedback_rating
  ON chat.feedback (rating, created_at DESC);

REVOKE ALL ON TABLE chat.feedback FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE chat.feedback TO woll_api;
