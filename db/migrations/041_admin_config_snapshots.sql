-- 041_admin_config_snapshots.sql
--
-- Configuración del visor como snapshot versionado en `admin.*`.
-- Sprint 14 (spec docs/specs/14-15-panel-admin.md).
--
-- El visor lee el snapshot activo por GET /api/config (RPC
-- chat_get_config_snapshot). `admin.config_layers` es un índice plano del
-- snapshot para listar/buscar capas en el panel admin (Sprint 15); no
-- reemplaza al JSON, que sigue siendo la fuente completa.
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS + CREATE OR REPLACE FUNCTION.

-- ────────────────────────────────────────────────────────────
-- 1. Snapshots de configuración
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin.config_snapshots (
  version bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  content jsonb NOT NULL,
  checksum text NOT NULL,
  source text NOT NULL DEFAULT 'js'
    CHECK (source IN ('js', 'panel', 'import')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  active boolean NOT NULL DEFAULT false
);

-- Una sola versión activa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_config_snapshots_active
  ON admin.config_snapshots ((active))
  WHERE active;

CREATE INDEX IF NOT EXISTS idx_config_snapshots_created
  ON admin.config_snapshots (created_at DESC);

-- ────────────────────────────────────────────────────────────
-- 2. Índice plano de capas del snapshot
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin.config_layers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  snapshot_version bigint NOT NULL
    REFERENCES admin.config_snapshots(version) ON DELETE CASCADE,
  dimension_key text NOT NULL,
  group_key text,
  subgroup_key text,
  scope text NOT NULL DEFAULT 'master'
    CHECK (scope IN ('master', 'group', 'subgroup')),
  layer_key text NOT NULL,
  nombre text,
  tipo text,
  source_type text,
  has_tiles boolean NOT NULL DEFAULT false,
  ordinal int NOT NULL DEFAULT 0,
  config jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_config_layers_row
  ON admin.config_layers (
    snapshot_version, dimension_key, scope,
    COALESCE(group_key, ''), COALESCE(subgroup_key, ''), layer_key, ordinal
  );

CREATE INDEX IF NOT EXISTS idx_config_layers_snapshot
  ON admin.config_layers (snapshot_version, dimension_key, group_key, subgroup_key, ordinal);

CREATE INDEX IF NOT EXISTS idx_config_layers_layer
  ON admin.config_layers (snapshot_version, layer_key);

CREATE INDEX IF NOT EXISTS idx_config_layers_nombre
  ON admin.config_layers (snapshot_version, lower(nombre));

-- ────────────────────────────────────────────────────────────
-- 3. RPC de lectura para el visor
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chat_get_config_snapshot()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, admin, extensions
AS $$
  SELECT jsonb_build_object(
    'version', s.version,
    'checksum', s.checksum,
    'generatedAt', s.created_at,
    'config', s.content
  )
  FROM admin.config_snapshots s
  WHERE s.active
  ORDER BY s.version DESC
  LIMIT 1;
$$;

-- ────────────────────────────────────────────────────────────
-- 4. RPC de lectura para el panel (Sprint 15)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chat_list_config_layers()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, admin, extensions
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'dimension_key', l.dimension_key,
        'group_key', l.group_key,
        'subgroup_key', l.subgroup_key,
        'scope', l.scope,
        'layer_key', l.layer_key,
        'nombre', l.nombre,
        'tipo', l.tipo,
        'source_type', l.source_type,
        'has_tiles', l.has_tiles,
        'ordinal', l.ordinal,
        'config', l.config
      )
      ORDER BY l.dimension_key, l.scope, l.group_key, l.subgroup_key, l.ordinal
    ),
    '[]'::jsonb
  )
  FROM admin.config_layers l
  JOIN admin.config_snapshots s ON s.version = l.snapshot_version
  WHERE s.active;
$$;

-- ────────────────────────────────────────────────────────────
-- 5. Grants
-- ────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.chat_get_config_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_list_config_layers() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.chat_get_config_snapshot() TO service_role, woll_api;
GRANT EXECUTE ON FUNCTION public.chat_list_config_layers() TO service_role, woll_api;

-- El panel admin escribe con el rol del servidor; no se expone a PostgREST.
REVOKE ALL ON TABLE admin.config_snapshots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE admin.config_layers FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin.config_snapshots TO woll_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin.config_layers TO woll_api;
GRANT USAGE, SELECT ON SEQUENCE admin.config_snapshots_version_seq TO woll_api;
GRANT USAGE, SELECT ON SEQUENCE admin.config_layers_id_seq TO woll_api;
