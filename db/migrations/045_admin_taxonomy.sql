-- 045_admin_taxonomy.sql
--
-- Taxonomía normalizada: dimensiones, grupos, subgrupos, capas y asignaciones.
-- Sprint 46-A (docs/specs/45-panel-admin-operaciones/00-spec-madre.md).
--
-- La forma que consume el visor se sigue publicando como snapshot en
-- admin.config_snapshots. Estas tablas son la fuente de autoría.
--
-- `layer_placements.config` conserva la variante de estilo por dimensión:
-- una misma capa (p. ej. limite_comunal_linea) puede tener colores distintos
-- en Agua, Clima o Minería.
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS + triggers.

CREATE TABLE IF NOT EXISTS admin.dimensions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key text NOT NULL UNIQUE,
  nombre text NOT NULL,
  icono text,
  orden integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE IF NOT EXISTS admin.groups (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dimension_id bigint NOT NULL REFERENCES admin.dimensions(id) ON DELETE CASCADE,
  key text NOT NULL,
  nombre text NOT NULL,
  orden integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  UNIQUE (dimension_id, key)
);

CREATE TABLE IF NOT EXISTS admin.subgroups (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id bigint NOT NULL REFERENCES admin.groups(id) ON DELETE CASCADE,
  key text NOT NULL,
  nombre text NOT NULL,
  orden integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  UNIQUE (group_id, key)
);

CREATE TABLE IF NOT EXISTS admin.layers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  layer_key text NOT NULL UNIQUE,
  nombre text NOT NULL,
  tipo text,
  source_type text,
  has_tiles boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE IF NOT EXISTS admin.layer_placements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  layer_id bigint NOT NULL REFERENCES admin.layers(id) ON DELETE CASCADE,
  dimension_id bigint NOT NULL REFERENCES admin.dimensions(id) ON DELETE CASCADE,
  group_id bigint REFERENCES admin.groups(id) ON DELETE CASCADE,
  subgroup_id bigint REFERENCES admin.subgroups(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('master', 'group', 'subgroup')),
  config jsonb,
  orden integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (scope = 'master' AND group_id IS NULL AND subgroup_id IS NULL)
    OR (scope = 'group' AND group_id IS NOT NULL AND subgroup_id IS NULL)
    OR (scope = 'subgroup' AND group_id IS NOT NULL AND subgroup_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_layer_placements_slot
  ON admin.layer_placements (
    dimension_id, scope,
    COALESCE(group_id, 0), COALESCE(subgroup_id, 0),
    layer_id
  );

CREATE INDEX IF NOT EXISTS idx_layer_placements_dimension
  ON admin.layer_placements (dimension_id, scope, group_id, subgroup_id, orden);

CREATE TABLE IF NOT EXISTS admin.dimension_initial_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dimension_id bigint NOT NULL REFERENCES admin.dimensions(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('group', 'layer')),
  group_id bigint REFERENCES admin.groups(id) ON DELETE CASCADE,
  layer_id bigint REFERENCES admin.layers(id) ON DELETE CASCADE,
  orden integer NOT NULL DEFAULT 0,
  CHECK (
    (kind = 'group' AND group_id IS NOT NULL AND layer_id IS NULL)
    OR (kind = 'layer' AND layer_id IS NOT NULL AND group_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_dimension_initial_item
  ON admin.dimension_initial_items (
    dimension_id, kind,
    COALESCE(group_id, 0), COALESCE(layer_id, 0)
  );

-- updated_at triggers reutilizan admin.touch_updated_at (migración 024).
DROP TRIGGER IF EXISTS trg_dimensions_touch ON admin.dimensions;
CREATE TRIGGER trg_dimensions_touch
  BEFORE UPDATE ON admin.dimensions
  FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

DROP TRIGGER IF EXISTS trg_groups_touch ON admin.groups;
CREATE TRIGGER trg_groups_touch
  BEFORE UPDATE ON admin.groups
  FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

DROP TRIGGER IF EXISTS trg_subgroups_touch ON admin.subgroups;
CREATE TRIGGER trg_subgroups_touch
  BEFORE UPDATE ON admin.subgroups
  FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

DROP TRIGGER IF EXISTS trg_layers_touch ON admin.layers;
CREATE TRIGGER trg_layers_touch
  BEFORE UPDATE ON admin.layers
  FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

DROP TRIGGER IF EXISTS trg_placements_touch ON admin.layer_placements;
CREATE TRIGGER trg_placements_touch
  BEFORE UPDATE ON admin.layer_placements
  FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

REVOKE ALL ON TABLE
  admin.dimensions, admin.groups, admin.subgroups, admin.layers,
  admin.layer_placements, admin.dimension_initial_items
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  admin.dimensions, admin.groups, admin.subgroups, admin.layers,
  admin.layer_placements, admin.dimension_initial_items
  TO woll_api;

GRANT USAGE, SELECT ON SEQUENCE
  admin.dimensions_id_seq, admin.groups_id_seq, admin.subgroups_id_seq,
  admin.layers_id_seq, admin.layer_placements_id_seq,
  admin.dimension_initial_items_id_seq
  TO woll_api;
