-- 057_admin_login_challenges.sql
--
-- Desafíos de segundo factor por email (Sprint 26-M, fase 3).
-- El código nunca se guarda en claro: solo su HMAC y la expiración.

CREATE TABLE IF NOT EXISTS admin.login_challenges (
  id uuid PRIMARY KEY,
  username text NOT NULL REFERENCES admin.admin_users(username) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  consumed_at timestamptz,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_challenges_user
  ON admin.login_challenges (username, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_challenges_expiry
  ON admin.login_challenges (expires_at);

REVOKE ALL ON TABLE admin.login_challenges FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin.login_challenges TO woll_api;
