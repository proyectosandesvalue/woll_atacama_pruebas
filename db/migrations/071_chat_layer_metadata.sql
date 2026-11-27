-- 071_chat_layer_metadata.sql
--
-- Agrega metadatos de procedencia por capa y una RPC para consultarlos.
--
-- Motivo:
--   El chat podía citar `layer_id` y tool, pero no fuente, fecha, escala,
--   licencia ni método. Sin esos campos el experto no puede validar la
--   respuesta.
--
-- Alcance:
--   - Columnas nuevas en `chat.chat_catalog` (nullable).
--   - RPC `chat_layers_metadata(text[])` para consultar varias capas en una
--     sola llamada.
--   - La carga de valores queda a cargo del catálogo/panel; si no hay dato,
--     la RPC devuelve null y el chat debe decir "no declarado".
--
-- Idempotente.

SET search_path TO public, chat, extensions;

BEGIN;

ALTER TABLE chat.chat_catalog
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS data_updated_at date,
  ADD COLUMN IF NOT EXISTS scale text,
  ADD COLUMN IF NOT EXISTS license text,
  ADD COLUMN IF NOT EXISTS method text,
  ADD COLUMN IF NOT EXISTS coverage text,
  ADD COLUMN IF NOT EXISTS limitations text;

CREATE OR REPLACE FUNCTION public.chat_layers_metadata(p_layers text[])
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'chat', 'extensions'
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'layer_id', c.layer_id,
        'display_name', c.display_name,
        'dimension', c.dimension,
        'source', c.source,
        'source_url', c.source_url,
        'data_updated_at', c.data_updated_at,
        'scale', c.scale,
        'license', c.license,
        'method', c.method,
        'coverage', c.coverage,
        'limitations', c.limitations
      )
      ORDER BY c.layer_id
    ),
    '[]'::jsonb
  )
  FROM chat.chat_catalog c
  WHERE c.layer_id = ANY(COALESCE(p_layers, ARRAY[]::text[]));
$$;

REVOKE ALL ON FUNCTION public.chat_layers_metadata(text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_layers_metadata(text[])
  TO woll_api, service_role;

COMMENT ON FUNCTION public.chat_layers_metadata(text[]) IS
  'Metadatos de procedencia de una o varias capas. Devuelve null cuando el '
  'dato no está declarado; el chat debe declararlo como no disponible.';

NOTIFY pgrst, 'reload schema';

COMMIT;
