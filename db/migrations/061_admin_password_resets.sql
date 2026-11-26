-- 061_admin_password_resets.sql
--
-- Tokens de recuperación de contraseña (Sprint 26-M).
-- Un solo uso, 30 minutos, guardados como HMAC.

CREATE TABLE IF NOT EXISTS admin.password_resets (
  id uuid PRIMARY KEY,
  username text NOT NULL REFERENCES admin.admin_users(username) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  ip_hash text
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user
  ON admin.password_resets (username, created_at DESC);

REVOKE ALL ON TABLE admin.password_resets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin.password_resets TO woll_api;
