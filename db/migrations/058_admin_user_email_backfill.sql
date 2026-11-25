-- 058_admin_user_email_backfill.sql
--
-- Los usuarios existentes usan su nombre de usuario como correo (el owner
-- se creó con el email). Sin esta columna no puede recibir el código 2FA.

UPDATE admin.admin_users
   SET email = username
 WHERE email IS NULL
   AND username LIKE '%@%';

COMMENT ON COLUMN admin.admin_users.email IS
  'Correo para el segundo factor y avisos de seguridad (Sprint 26-M)';
