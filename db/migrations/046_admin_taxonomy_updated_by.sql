-- 046_admin_taxonomy_updated_by.sql
--
-- Agrega `updated_by` a layer_placements para que el seed y el panel puedan
-- registrar quién hizo el cambio (Sprint 46-A).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS.

ALTER TABLE admin.layer_placements
  ADD COLUMN IF NOT EXISTS updated_by text;
