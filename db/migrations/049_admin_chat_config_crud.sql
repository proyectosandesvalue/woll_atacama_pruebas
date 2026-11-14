-- 049_admin_chat_config_crud.sql
--
-- CRUD de configuración del chat desde el panel admin.
-- Golden set editable en BD y grants para las tablas admin del chat.
--
-- Sprint 48 (configuración del chat en el panel).
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS + GRANT.

CREATE TABLE IF NOT EXISTS admin.golden_cases (
  id text PRIMARY KEY,
  level integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 3),
  tier integer NOT NULL DEFAULT 1 CHECK (tier BETWEEN 1 AND 3),
  intent_esperado text,
  fuente_esperada text,
  category text,
  question text NOT NULL,
  expected jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  history jsonb,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE INDEX IF NOT EXISTS idx_golden_cases_orden
  ON admin.golden_cases (activo, level, id);

REVOKE ALL ON TABLE admin.golden_cases FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin.golden_cases TO woll_api;

-- El panel edita la configuración del chat con el rol del servidor.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  admin.prompt_templates, admin.settings, admin.messages, admin.unavailable_data
  TO woll_api;
