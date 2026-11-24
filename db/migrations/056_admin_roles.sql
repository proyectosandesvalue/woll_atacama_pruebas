-- 056_admin_roles.sql
--
-- Roles y datos de contacto del panel (Sprint 26-M).
--
--   owner  → control total (usuarios, seguridad, integraciones, publicación)
--   editor → contenido y operación diaria, sin publicación ni administración
--
-- El bootstrap deja a los usuarios existentes como owner; los nuevos nacen
-- como editor y solo un owner puede cambiarlos.

ALTER TABLE admin.admin_users
  ADD COLUMN IF NOT EXISTS role text;

UPDATE admin.admin_users
   SET role = 'owner'
 WHERE role IS NULL;

ALTER TABLE admin.admin_users
  ALTER COLUMN role SET DEFAULT 'editor',
  ALTER COLUMN role SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_users_role_check'
  ) THEN
    ALTER TABLE admin.admin_users
      ADD CONSTRAINT admin_users_role_check
      CHECK (role IN ('owner', 'editor'));
  END IF;
END $$;

ALTER TABLE admin.admin_users
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS two_factor text;

UPDATE admin.admin_users
   SET two_factor = 'email'
 WHERE two_factor IS NULL;

ALTER TABLE admin.admin_users
  ALTER COLUMN two_factor SET DEFAULT 'email',
  ALTER COLUMN two_factor SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_users_two_factor_check'
  ) THEN
    ALTER TABLE admin.admin_users
      ADD CONSTRAINT admin_users_two_factor_check
      CHECK (two_factor IN ('email', 'totp', 'none'));
  END IF;
END $$;

COMMENT ON COLUMN admin.admin_users.role IS
  'owner: control total; editor: contenido sin administración (Sprint 26-M)';
COMMENT ON COLUMN admin.admin_users.two_factor IS
  'email: código por correo; totp: app autenticadora; none: sin segundo factor';
