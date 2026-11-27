-- 072_chat_comuna_centroid.sql
--
-- Centroide comunal para consultas WMS por comuna.
--
-- Motivo:
--   `get_wms_pixel` necesita lat/lon. Muchos usuarios preguntan por comuna
--   ("¿qué NDVI hay en Copiapó?") sin dar coordenadas. Esta RPC devuelve el
--   centroide del polígono comunal para samplear un píxel representativo.
--
-- Idempotente.

SET search_path TO public, chat, extensions;

BEGIN;

CREATE OR REPLACE FUNCTION public.chat_comuna_centroid(p_comuna text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'chat', 'extensions'
AS $$
  SELECT jsonb_build_object(
    'comuna', a."COMUNA",
    'lat', ST_Y(ST_Centroid(a.geom)),
    'lon', ST_X(ST_Centroid(a.geom))
  )
  FROM public.comunas_poligonos a
  WHERE chat.normalize_text(a."COMUNA") LIKE
        '%' || chat.normalize_text(coalesce(p_comuna, '')) || '%'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.chat_comuna_centroid(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_comuna_centroid(text)
  TO woll_api, service_role;

COMMENT ON FUNCTION public.chat_comuna_centroid(text) IS
  'Centroide (lat/lon) de una comuna de Atacama, para samplear un píxel WMS.';

NOTIFY pgrst, 'reload schema';

COMMIT;
