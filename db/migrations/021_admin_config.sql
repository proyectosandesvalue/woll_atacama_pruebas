-- db/migrations/021_admin_config.sql
-- Configuración editable por el admin: datos no disponibles, prompts,
-- settings y mensajes. Preparado para el panel admin (Sprint 15).
--
-- Sprint 40-D.2 + preparación para el Sprint 14-16.
--
-- Seguridad:
--   - Las tablas viven en `admin.*` (no expuestas a PostgREST público).
--   - Las RPCs `chat_*` son SECURITY DEFINER y solo service_role.
--   - Las RPCs `admin_*` requieren el rol de admin (a definir en Sprint 15).
--
-- Portabilidad: SQL estándar de Postgres. Funciona en Supabase, Neon,
-- Render o Postgres propio. No usa extensiones específicas de Supabase.

-- ────────────────────────────────────────────────────────────
-- 1. admin.unavailable_data — datos que el visor no tiene
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin.unavailable_data (
  id text PRIMARY KEY,
  descripcion text NOT NULL,
  palabras text[] NOT NULL DEFAULT '{}',
  capas_relacionadas text[] NOT NULL DEFAULT '{}',
  existe text,
  motivo text NOT NULL DEFAULT 'dato_inexistente'
    CHECK (motivo IN ('dato_inexistente', 'sin_receta', 'fuente_no_ingerida')),
  activo boolean NOT NULL DEFAULT true,
  verificado_en date NOT NULL DEFAULT CURRENT_DATE,
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'catalog', 'ingest', 'recipe')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE INDEX IF NOT EXISTS idx_unavailable_data_activo
  ON admin.unavailable_data(activo) WHERE activo = true;

-- ────────────────────────────────────────────────────────────
-- 2. admin.prompt_templates — prompts versionados
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin.prompt_templates (
  id text NOT NULL,
  version int NOT NULL DEFAULT 1,
  content text NOT NULL,
  description text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  PRIMARY KEY (id, version)
);

CREATE INDEX IF NOT EXISTS idx_prompt_templates_activo
  ON admin.prompt_templates(id, activo) WHERE activo = true;

-- Vista con la versión activa (la más alta) de cada prompt.
CREATE OR REPLACE VIEW admin.prompt_templates_active AS
SELECT DISTINCT ON (id) *
FROM admin.prompt_templates
WHERE activo = true
ORDER BY id, version DESC;

-- ────────────────────────────────────────────────────────────
-- 3. admin.settings — key-value con tipos
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin.settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  type text NOT NULL DEFAULT 'string'
    CHECK (type IN ('string', 'number', 'boolean', 'json')),
  description text,
  editable boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

-- ────────────────────────────────────────────────────────────
-- 4. admin.messages — mensajes estándar
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin.messages (
  key text PRIMARY KEY,
  content text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

-- ────────────────────────────────────────────────────────────
-- Trigger updated_at
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_unavailable_data_touch ON admin.unavailable_data;
CREATE TRIGGER trg_unavailable_data_touch
  BEFORE UPDATE ON admin.unavailable_data
  FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

DROP TRIGGER IF EXISTS trg_prompt_templates_touch ON admin.prompt_templates;
CREATE TRIGGER trg_prompt_templates_touch
  BEFORE UPDATE ON admin.prompt_templates
  FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

DROP TRIGGER IF EXISTS trg_settings_touch ON admin.settings;
CREATE TRIGGER trg_settings_touch
  BEFORE UPDATE ON admin.settings
  FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

DROP TRIGGER IF EXISTS trg_messages_touch ON admin.messages;
CREATE TRIGGER trg_messages_touch
  BEFORE UPDATE ON admin.messages
  FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

-- ────────────────────────────────────────────────────────────
-- RPCs de lectura (chat, service_role only)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chat_unavailable_data()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, admin, extensions
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'id', id, 'descripcion', descripcion, 'palabras', palabras,
      'capas_relacionadas', capas_relacionadas, 'existe', existe, 'motivo', motivo
    ) ORDER BY id),
    '[]'::jsonb
  )
  FROM admin.unavailable_data
  WHERE activo = true;
$$;

CREATE OR REPLACE FUNCTION public.chat_get_prompt(p_id text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, admin, extensions
AS $$
  SELECT content FROM admin.prompt_templates_active WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.chat_get_setting(p_key text, p_default jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, admin, extensions
AS $$
  SELECT COALESCE((SELECT value FROM admin.settings WHERE key = p_key), p_default);
$$;

CREATE OR REPLACE FUNCTION public.chat_get_message(p_key text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, admin, extensions
AS $$
  SELECT content FROM admin.messages WHERE key = p_key;
$$;

-- ────────────────────────────────────────────────────────────
-- RPCs de escritura (panel admin, requieren rol admin)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_set_setting(
  p_key text, p_value jsonb, p_by text DEFAULT NULL
)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public, admin, extensions
AS $$
  INSERT INTO admin.settings (key, value, updated_by)
  VALUES (p_key, p_value, p_by)
  ON CONFLICT (key) DO UPDATE
    SET value = p_value, updated_at = now(), updated_by = p_by;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_prompt(
  p_id text, p_content text, p_description text DEFAULT NULL, p_by text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin, extensions
AS $$
DECLARE
  next_version int;
BEGIN
  SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
  FROM admin.prompt_templates WHERE id = p_id;

  UPDATE admin.prompt_templates SET activo = false WHERE id = p_id AND activo = true;

  INSERT INTO admin.prompt_templates (id, version, content, description, activo, updated_by)
  VALUES (p_id, next_version, p_content, p_description, true, p_by);

  RETURN next_version;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- Grants
-- ────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.chat_unavailable_data() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_get_prompt(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_get_setting(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_get_message(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_setting(text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_prompt(text, text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.chat_unavailable_data() TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_get_prompt(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_get_setting(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_get_message(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_setting(text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_prompt(text, text, text, text) TO service_role;

-- ────────────────────────────────────────────────────────────
-- Seeds iniciales
-- ────────────────────────────────────────────────────────────

-- Datos no disponibles (migrados del JSON eliminado).
INSERT INTO admin.unavailable_data
  (id, descripcion, palabras, capas_relacionadas, existe, motivo, source)
VALUES
  (
    'produccion_frutales_kg',
    'producción anual en kilos por especie',
    ARRAY['kilos','kilogramos','toneladas','producción anual','produccion anual'],
    ARRAY['catastro_especies_frutales','catastro_variedades_frutales'],
    'superficie plantada (ha) y año de plantación por especie y variedad en el Catastro Frutícola',
    'dato_inexistente',
    'manual'
  ),
  (
    'aptitud_cultivos',
    'análisis de aptitud para cultivos (mejor zona para X)',
    ARRAY['mejor zona','aptitud','conviene plantar','dónde plantar','donde plantar'],
    ARRAY['catastro_especies_frutales'],
    'el análisis multicriterio está previsto para el Sprint 41 y aún no está implementado',
    'sin_receta',
    'manual'
  )
ON CONFLICT (id) DO NOTHING;

-- Settings iniciales (los defaults que hoy están en env var).
INSERT INTO admin.settings (key, value, type, description) VALUES
  ('chat.router.min_confidence', '0.7'::jsonb, 'number', 'Umbral mínimo de confianza para que el router ejecute un pipeline'),
  ('chat.router.enabled', 'false'::jsonb, 'boolean', 'Killswitch del router determinístico'),
  ('chat.unavailable.enabled', 'false'::jsonb, 'boolean', 'Killswitch del detector de datos no disponibles'),
  ('chat.geojson.enabled', 'true'::jsonb, 'boolean', 'Killswitch del geojson en el chat'),
  ('chat.verbose', 'false'::jsonb, 'boolean', 'Si true, el LLM puede mencionar tools y layer_ids')
ON CONFLICT (key) DO NOTHING;

-- Mensajes estándar.
INSERT INTO admin.messages (key, content, description) VALUES
  ('chat.out_of_scope', 'No puedo responder esa pregunta. Soy un asistente especializado en el Visor Territorial de Atacama y solo puedo ayudarte con consultas sobre los datos geoespaciales del portal.', 'Mensaje cuando la pregunta está fuera de dominio'),
  ('chat.no_response', 'Sin respuesta.', 'Reply cuando el LLM no produce texto'),
  ('chat.llm_error', 'El servicio de IA no está disponible. Intenta de nuevo en unos minutos.', 'Error del LLM')
ON CONFLICT (key) DO NOTHING;

-- Los prompts (chat.system y chat.classifier) se cargan con
-- scripts/migrate_prompts.mjs, no en esta migración.
-- Razón: son textos largos que cambian seguido. El script puede correr
-- en cada deploy sin tocar la migración.

NOTIFY pgrst, 'reload schema';