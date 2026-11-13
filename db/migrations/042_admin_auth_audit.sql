-- 042_admin_auth_audit.sql
--
-- Autenticación local del panel admin (TOTP + password) y auditoría.
-- Sprint 15 (docs/specs/14-15-panel-admin.md, ADR 007).
--
-- El secreto TOTP NO vive en la base: se lee de ADMIN_TOTP_SECRET. Acá solo
-- se guarda el hash scrypt del password y el estado del usuario.
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS admin.admin_users (
  username text PRIMARY KEY,
  password_hash text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  last_login_at timestamptz
);

DROP TRIGGER IF EXISTS trg_admin_users_touch ON admin.admin_users;
CREATE TRIGGER trg_admin_users_touch
  BEFORE UPDATE ON admin.admin_users
  FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

CREATE TABLE IF NOT EXISTS admin.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor text,
  action text NOT NULL,
  target text,
  result text NOT NULL CHECK (result IN ('ok', 'fail')),
  ip_hash text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_log_at
  ON admin.audit_log (at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor
  ON admin.audit_log (actor, at DESC);

REVOKE ALL ON TABLE admin.admin_users FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE admin.audit_log FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin.admin_users TO woll_api;
GRANT SELECT, INSERT ON TABLE admin.audit_log TO woll_api;
GRANT USAGE, SELECT ON SEQUENCE admin.audit_log_id_seq TO woll_api;
