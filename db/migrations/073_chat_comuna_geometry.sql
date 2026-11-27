-- 073_chat_comuna_geometry.sql
--
-- Devuelve el polígono GeoJSON de una comuna para Statistical API.
--
-- Motivo:
--   Las estadísticas numéricas de Copernicus necesitan un AOI, no solo un
--   centroide. Esta RPC entrega el GeoJSON y el bbox de la comuna.
--
-- Idempotente.

SET search_path TO public, chat, extensions;

BEGIN;

CREATE OR REPLACE FUNCTION public.chat_comuna_geometry(p_comuna text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'chat', 'extensions'
AS $$
  SELECT jsonb_build_object(
    'comuna', a."COMUNA",
    'geometry', ST_AsGeoJSON(a.geom, 5)::jsonb,
    'bbox', jsonb_build_array(
      ST_XMin(a.geom),
      ST_YMin(a.geom),
      ST_XMax(a.geom),
      ST_YMax(a.geom)
    )
  )
  FROM public.comunas_poligonos a
  WHERE chat.normalize_text(a."COMUNA") LIKE
        '%' || chat.normalize_text(coalesce(p_comuna, '')) || '%'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.chat_comuna_geometry(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_comuna_geometry(text)
  TO woll_api, service_role;

COMMENT ON FUNCTION public.chat_comuna_geometry(text) IS
  'Polígono GeoJSON y bbox de una comuna de Atacama, para estadísticas Copernicus.';

NOTIFY pgrst, 'reload schema';

COMMIT;
