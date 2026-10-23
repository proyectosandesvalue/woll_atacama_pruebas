-- db/migrations/022_admin_rollback.sql
-- RPC para rollback de prompts a una versión anterior.
-- Sprint 40-D.2 (gobierno de prompts) + preparación Sprint 15.

CREATE OR REPLACE FUNCTION public.admin_rollback_prompt(
  p_id text, p_version int, p_by text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin, extensions
AS $$
DECLARE
  new_version int;
  old_content text;
  old_description text;
BEGIN
  SELECT content, description INTO old_content, old_description
  FROM admin.prompt_templates
  WHERE id = p_id AND version = p_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Versión % de % no existe', p_version, p_id;
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO new_version
  FROM admin.prompt_templates WHERE id = p_id;

  UPDATE admin.prompt_templates SET activo = false WHERE id = p_id AND activo = true;

  INSERT INTO admin.prompt_templates
    (id, version, content, description, activo, updated_by)
  VALUES
    (p_id, new_version, old_content,
     COALESCE(old_description, '') || ' (rollback de v' || p_version || ')',
     true, p_by);

  RETURN new_version;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_rollback_prompt(text, int, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_rollback_prompt(text, int, text)
  TO service_role;

-- RPC para listar versiones de un prompt (para el panel admin).
CREATE OR REPLACE FUNCTION public.admin_list_prompt_versions(p_id text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, admin, extensions
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'version', version,
      'activo', activo,
      'description', description,
      'updated_at', updated_at,
      'updated_by', updated_by,
      'content_chars', length(content)
    ) ORDER BY version DESC),
    '[]'::jsonb
  )
  FROM admin.prompt_templates
  WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION public.admin_list_prompt_versions(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_prompt_versions(text)
  TO service_role;

NOTIFY pgrst, 'reload schema';