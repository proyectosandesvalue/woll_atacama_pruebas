-- 047_admin_taxonomy_extra.sql
--
-- Conserva campos de la config que no tienen columna propia (por ejemplo
-- `leyenda` por dimensión) para que la compilación sea fiel al snapshot.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS.

ALTER TABLE admin.dimensions
  ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE admin.groups
  ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE admin.subgroups
  ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;
