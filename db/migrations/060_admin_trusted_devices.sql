-- 060_admin_trusted_devices.sql
--
-- Dispositivos de confianza del panel (Sprint 26-M, fase 4).
-- El token vive en una cookie HttpOnly; en la base solo su HMAC, el prefijo
-- de red y el hash del user-agent. Expira a los 30 días y es revocable.

CREATE TABLE IF NOT EXISTS admin.trusted_devices (
  id uuid PRIMARY KEY,
  username text NOT NULL REFERENCES admin.admin_users(username) ON DELETE CASCADE,
  token_hash text NOT NULL,
  ip_prefix_hash text NOT NULL,
  user_agent_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user
  ON admin.trusted_devices (username, expires_at DESC);

REVOKE ALL ON TABLE admin.trusted_devices FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin.trusted_devices TO woll_api;
