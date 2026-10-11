-- =====================================================================
-- 011_chat_audit.sql
-- Auditoría de calidad de datos: tablas, RPCs y wrappers.
-- Nota: no existe la migración 009 (salto documentado).
-- Portable: Supabase hoy, Postgres propio mañana. Idempotente.
-- =====================================================================

SET search_path TO chat, public, extensions;

-- ── 1. Tablas ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat.audit_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz,
  trigger            text NOT NULL DEFAULT 'manual',
  status             text NOT NULL DEFAULT 'running'
                     CHECK (status IN ('running','ok','partial','failed')),
  thresholds_version text NOT NULL,
  error              text
);

CREATE TABLE IF NOT EXISTS chat.audit_layer_results (
  run_id        uuid NOT NULL REFERENCES chat.audit_runs(id) ON DELETE CASCADE,
  layer_id      text NOT NULL REFERENCES chat.chat_catalog(layer_id) ON DELETE CASCADE,
  row_count     bigint,
  geometry      jsonb,
  config_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  status        text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','warning','blocked')),
  warnings      jsonb NOT NULL DEFAULT '[]'::jsonb,
  flags         jsonb NOT NULL DEFAULT '[]'::jsonb,
  error         text,
  PRIMARY KEY (run_id, layer_id)
);
CREATE INDEX IF NOT EXISTS idx_audit_layer_results_layer
  ON chat.audit_layer_results (layer_id, run_id);

CREATE TABLE IF NOT EXISTS chat.audit_column_results (
  run_id                  uuid NOT NULL,
  layer_id                text NOT NULL,
  column_name             text NOT NULL,
  declared_type           text,
  row_count               bigint,
  null_count              bigint,
  empty_count             bigint,
  suspicious_count        bigint,
  numeric_parseable_count bigint,
  mojibake_count          bigint,
  unique_count            bigint,
  variant_groups          int,
  max_date                date,
  top_values              jsonb,
  sample_suspicious       jsonb,
  quality                 text,
  flags                   jsonb NOT NULL DEFAULT '[]'::jsonb,
  error                   text,
  PRIMARY KEY (run_id, layer_id, column_name),
  FOREIGN KEY (run_id, layer_id)
    REFERENCES chat.audit_layer_results (run_id, layer_id) ON DELETE CASCADE
);

ALTER TABLE chat.audit_runs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat.audit_layer_results  ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat.audit_column_results ENABLE ROW LEVEL SECURITY;

-- ── 2. Helper: fecha tolerante ──────────────────────────────────────
CREATE OR REPLACE FUNCTION chat.chat_try_date(p text) RETURNS date
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p ~ '^\d{4}-\d{2}-\d{2}' THEN
    RETURN substr(p, 1, 10)::date;
  ELSIF p ~ '^\d{2}/\d{2}/\d{4}' THEN
    RETURN to_date(substr(p, 1, 10), 'DD/MM/YYYY');
  END IF;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

-- ── 3. Catálogo sin gate (lo usa la auditoría; el gate llega en 012) ─
CREATE OR REPLACE FUNCTION chat.chat_catalog_all() RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = chat, public, extensions
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'layer_id', c.layer_id, 'display_name', c.display_name,
           'dimension', c.dimension, 'geometry_type', c.geometry_type
         ) ORDER BY c.dimension, c.display_name), '[]'::jsonb)
  FROM chat.chat_catalog c
  WHERE c.enabled = true
    AND EXISTS (
      SELECT 1 FROM information_schema.tables t
       WHERE t.table_schema = split_part(c.physical_table, '.', 1)
         AND t.table_name   = split_part(c.physical_table, '.', 2));
$$;

-- ── 4. Hechos por columna ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION chat.chat_audit_column(p_layer text, p_column text)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = chat, public, extensions
AS $$
DECLARE
  phys     text;
  dtype    text;
  sus      text[] := ARRAY['?','¿','-','--','null','none','n/a','na','s/d',
                           'sin dato','sin datos','sin informacion',
                           'sin información','no informado'];
  facts    jsonb;
  top_vals jsonb;
  samples  jsonb;
  variants int := NULL;
  maxd     date := NULL;
  uniq     bigint;
BEGIN
  SELECT physical_table INTO phys
    FROM chat.chat_catalog WHERE layer_id = p_layer AND enabled;
  IF phys IS NULL THEN
    RAISE EXCEPTION 'Capa no encontrada o deshabilitada: %', p_layer;
  END IF;

  SELECT data_type INTO dtype
    FROM information_schema.columns
   WHERE table_schema = split_part(phys, '.', 1)
     AND table_name   = split_part(phys, '.', 2)
     AND column_name  = p_column
     AND column_name NOT IN ('geom','geometry','the_geom','gid');
  IF dtype IS NULL THEN
    RAISE EXCEPTION 'Columna no válida para la capa %: %', p_layer, p_column;
  END IF;

  EXECUTE format($q$
    WITH s AS (SELECT %I::text AS v FROM %s)
    SELECT jsonb_build_object(
      'row_count',   count(*),
      'null_count',  count(*) FILTER (WHERE v IS NULL),
      'empty_count', count(*) FILTER (WHERE v IS NOT NULL AND btrim(v) = ''),
      'suspicious_count', count(*) FILTER (
          WHERE v IS NOT NULL AND lower(btrim(v)) = ANY(%L::text[])),
      'numeric_parseable_count', count(*) FILTER (
          WHERE v ~ '^\s*-?[0-9]+([.,][0-9]+)?\s*$'
             OR v ~ '^\s*-?[0-9]{1,3}(\.[0-9]{3})+(,[0-9]+)?\s*$'),
      'mojibake_count', count(*) FILTER (
          WHERE v ~ '[ÃÂ][\u0080-\u00BF]' OR position(chr(65533) in v) > 0),
      'unique_count', count(DISTINCT v)
    ) FROM s $q$, p_column, phys, sus)
  INTO facts;

  uniq := (facts->>'unique_count')::bigint;

  EXECUTE format($q$
    SELECT COALESCE(jsonb_agg(jsonb_build_object('value', left(t.v, 80), 'count', t.c)
                              ORDER BY t.c DESC), '[]'::jsonb)
    FROM (SELECT %I::text AS v, count(*) AS c FROM %s
           WHERE %I IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 5) t $q$,
    p_column, phys, p_column)
  INTO top_vals;

  EXECUTE format($q$
    SELECT COALESCE(jsonb_agg(left(t.v, 80)), '[]'::jsonb)
    FROM (SELECT DISTINCT s.v FROM (SELECT %I::text AS v FROM %s) s
           WHERE s.v IS NOT NULL AND btrim(s.v) <> ''
             AND (lower(btrim(s.v)) = ANY(%L::text[])
                  OR s.v ~ '[ÃÂ][\u0080-\u00BF]'
                  OR position(chr(65533) in s.v) > 0)
           LIMIT 5) t $q$, p_column, phys, sus)
  INTO samples;

  IF uniq <= 5000 THEN
    EXECUTE format($q$
      SELECT count(*)::int FROM (
        SELECT lower(translate(btrim(d.v), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')) AS n
          FROM (SELECT DISTINCT %I::text AS v FROM %s WHERE %I IS NOT NULL) d
         GROUP BY 1 HAVING count(*) > 1) g $q$,
      p_column, phys, p_column)
    INTO variants;
  END IF;

  IF p_column ~* '(actualiz|fech_act|fecha corte)' THEN
    EXECUTE format('SELECT max(chat.chat_try_date(%I::text)) FROM %s', p_column, phys)
    INTO maxd;
  END IF;

  RETURN facts || jsonb_build_object(
    'column_name',       p_column,
    'declared_type',     dtype,
    'variant_groups',    variants,
    'max_date',          maxd,
    'top_values',        top_vals,
    'sample_suspicious', samples);
END;
$$;

-- ── 5. Hechos de geometría ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION chat.chat_audit_geometry(
  p_layer text,
  p_bbox  double precision[] DEFAULT ARRAY[-72.0, -30.0, -66.5, -24.5]
) RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = chat, public, extensions
AS $$
DECLARE
  phys text;
  has_geom boolean;
  result jsonb;
BEGIN
  SELECT physical_table INTO phys
    FROM chat.chat_catalog WHERE layer_id = p_layer AND enabled;
  IF phys IS NULL THEN
    RAISE EXCEPTION 'Capa no encontrada o deshabilitada: %', p_layer;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = split_part(phys, '.', 1)
       AND table_name   = split_part(phys, '.', 2)
       AND column_name  = 'geom') INTO has_geom;
  IF NOT has_geom THEN
    RETURN jsonb_build_object('has_geometry', false);
  END IF;

  EXECUTE format($q$
    SELECT jsonb_build_object(
      'has_geometry', true,
      'total',        count(*),
      'null_geom',    count(*) FILTER (WHERE geom IS NULL),
      'empty_geom',   count(*) FILTER (WHERE geom IS NOT NULL AND ST_IsEmpty(geom)),
      'invalid_geom', count(*) FILTER (
          WHERE geom IS NOT NULL AND NOT ST_IsEmpty(geom) AND NOT ST_IsValid(geom)),
      'zero_zero', count(*) FILTER (WHERE
          CASE WHEN geom IS NOT NULL AND GeometryType(geom) = 'POINT' THEN
                 CASE WHEN ST_IsEmpty(geom) THEN false
                      ELSE (ST_X(geom) = 0 AND ST_Y(geom) = 0) END
               ELSE false END),
      'srid_mismatch', count(*) FILTER (WHERE geom IS NOT NULL AND ST_SRID(geom) <> 4326),
      'outside_bbox', count(*) FILTER (WHERE
          CASE WHEN geom IS NULL OR ST_IsEmpty(geom) OR ST_SRID(geom) <> 4326 THEN false
               ELSE NOT (geom && ST_MakeEnvelope(%s, %s, %s, %s, 4326)) END),
      'duplicate_geom', count(geom) - count(DISTINCT md5(ST_AsEWKB(geom)))
    ) FROM %s $q$, p_bbox[1], p_bbox[2], p_bbox[3], p_bbox[4], phys)
  INTO result;

  RETURN result;
END;
$$;

-- ── 6. Persistencia ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION chat.chat_audit_start_run(
  p_trigger text DEFAULT 'manual',
  p_thresholds_version text DEFAULT 'v1'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = chat, public, extensions
AS $$
DECLARE rid uuid;
BEGIN
  INSERT INTO chat.audit_runs (trigger, thresholds_version)
  VALUES (p_trigger, p_thresholds_version) RETURNING id INTO rid;
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION chat.chat_audit_save_layer(
  p_run uuid, p_layer text, p_result jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = chat, public, extensions
AS $$
BEGIN
  INSERT INTO chat.audit_layer_results
    (run_id, layer_id, row_count, geometry, config_issues, status, warnings, flags, error)
  VALUES (
    p_run, p_layer,
    (p_result->>'row_count')::bigint,
    p_result->'geometry',
    COALESCE(p_result->'config_issues', '[]'::jsonb),
    COALESCE(p_result->>'status', 'ok'),
    COALESCE(p_result->'warnings', '[]'::jsonb),
    COALESCE(p_result->'flags', '[]'::jsonb),
    p_result->>'error')
  ON CONFLICT (run_id, layer_id) DO UPDATE SET
    row_count = EXCLUDED.row_count, geometry = EXCLUDED.geometry,
    config_issues = EXCLUDED.config_issues, status = EXCLUDED.status,
    warnings = EXCLUDED.warnings, flags = EXCLUDED.flags, error = EXCLUDED.error;

  DELETE FROM chat.audit_column_results WHERE run_id = p_run AND layer_id = p_layer;

  INSERT INTO chat.audit_column_results (
    run_id, layer_id, column_name, declared_type, row_count, null_count,
    empty_count, suspicious_count, numeric_parseable_count, mojibake_count,
    unique_count, variant_groups, max_date, top_values, sample_suspicious,
    quality, flags, error)
  SELECT p_run, p_layer, c->>'column_name', c->>'declared_type',
         (c->>'row_count')::bigint, (c->>'null_count')::bigint,
         (c->>'empty_count')::bigint, (c->>'suspicious_count')::bigint,
         (c->>'numeric_parseable_count')::bigint, (c->>'mojibake_count')::bigint,
         (c->>'unique_count')::bigint, (c->>'variant_groups')::int,
         (c->>'max_date')::date, c->'top_values', c->'sample_suspicious',
         c->>'quality', COALESCE(c->'flags', '[]'::jsonb), c->>'error'
    FROM jsonb_array_elements(COALESCE(p_result->'columns', '[]'::jsonb)) c;
END $$;

CREATE OR REPLACE FUNCTION chat.chat_audit_finish_run(
  p_run uuid, p_status text DEFAULT 'ok', p_error text DEFAULT NULL, p_keep int DEFAULT 12
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = chat, public, extensions
AS $$
BEGIN
  UPDATE chat.audit_runs
     SET finished_at = now(), status = p_status, error = p_error
   WHERE id = p_run;
  DELETE FROM chat.audit_runs
   WHERE id NOT IN (SELECT id FROM chat.audit_runs
                     ORDER BY started_at DESC LIMIT GREATEST(p_keep, 1));
END $$;

-- Último estado por capa (para el gate del tramo B y para reportes).
CREATE OR REPLACE FUNCTION chat.chat_audit_latest() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = chat, public, extensions
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'layer_id', l.layer_id, 'run_id', l.run_id, 'status', l.status,
           'row_count', l.row_count, 'flags', l.flags,
           'bad_columns', COALESCE((
              SELECT jsonb_agg(jsonb_build_object('column', c.column_name, 'quality', c.quality))
                FROM chat.audit_column_results c
               WHERE c.run_id = l.run_id AND c.layer_id = l.layer_id
                 AND c.quality IN ('dirty','broken')), '[]'::jsonb))), '[]'::jsonb)
  FROM (SELECT DISTINCT ON (r.layer_id) r.*
          FROM chat.audit_layer_results r
          JOIN chat.audit_runs a ON a.id = r.run_id AND a.status IN ('ok','partial')
         ORDER BY r.layer_id, a.started_at DESC) l;
$$;

-- ── 7. Wrappers públicos (PostgREST) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.chat_catalog_all() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, chat, extensions
AS $$ SELECT chat.chat_catalog_all(); $$;

CREATE OR REPLACE FUNCTION public.chat_audit_column(p_layer text, p_column text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, chat, extensions
AS $$ SELECT chat.chat_audit_column(p_layer, p_column); $$;

CREATE OR REPLACE FUNCTION public.chat_audit_geometry(
  p_layer text, p_bbox double precision[] DEFAULT ARRAY[-72.0, -30.0, -66.5, -24.5]
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, chat, extensions
AS $$ SELECT chat.chat_audit_geometry(p_layer, p_bbox); $$;

CREATE OR REPLACE FUNCTION public.chat_audit_start_run(
  p_trigger text DEFAULT 'manual', p_thresholds_version text DEFAULT 'v1'
) RETURNS uuid
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, chat, extensions
AS $$ SELECT chat.chat_audit_start_run(p_trigger, p_thresholds_version); $$;

CREATE OR REPLACE FUNCTION public.chat_audit_save_layer(p_run uuid, p_layer text, p_result jsonb)
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, chat, extensions
AS $$ SELECT chat.chat_audit_save_layer(p_run, p_layer, p_result); $$;

CREATE OR REPLACE FUNCTION public.chat_audit_finish_run(
  p_run uuid, p_status text DEFAULT 'ok', p_error text DEFAULT NULL, p_keep int DEFAULT 12
) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, chat, extensions
AS $$ SELECT chat.chat_audit_finish_run(p_run, p_status, p_error, p_keep); $$;

CREATE OR REPLACE FUNCTION public.chat_audit_latest() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, chat, extensions
AS $$ SELECT chat.chat_audit_latest(); $$;

-- ── 8. Grants (condicionados a la existencia de los roles) ──────────
DO $$
DECLARE
  f text;
  fns text[] := ARRAY[
    'chat.chat_try_date(text)',
    'chat.chat_catalog_all()',
    'chat.chat_audit_column(text,text)',
    'chat.chat_audit_geometry(text,double precision[])',
    'chat.chat_audit_start_run(text,text)',
    'chat.chat_audit_save_layer(uuid,text,jsonb)',
    'chat.chat_audit_finish_run(uuid,text,text,integer)',
    'chat.chat_audit_latest()',
    'public.chat_catalog_all()',
    'public.chat_audit_column(text,text)',
    'public.chat_audit_geometry(text,double precision[])',
    'public.chat_audit_start_run(text,text)',
    'public.chat_audit_save_layer(uuid,text,jsonb)',
    'public.chat_audit_finish_run(uuid,text,text,integer)',
    'public.chat_audit_latest()'];
  has_service boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role');
  has_anon    boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon');
  has_auth    boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
BEGIN
  FOREACH f IN ARRAY fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF has_anon THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f); END IF;
    IF has_auth THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f); END IF;
    IF has_service THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f); END IF;
  END LOOP;

  REVOKE ALL ON chat.audit_runs, chat.audit_layer_results, chat.audit_column_results FROM PUBLIC;
  IF has_anon THEN
    REVOKE ALL ON chat.audit_runs, chat.audit_layer_results, chat.audit_column_results FROM anon;
  END IF;
  IF has_auth THEN
    REVOKE ALL ON chat.audit_runs, chat.audit_layer_results, chat.audit_column_results FROM authenticated;
  END IF;
  IF has_service THEN
    GRANT ALL ON chat.audit_runs, chat.audit_layer_results, chat.audit_column_results TO service_role;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

DO $$ BEGIN RAISE NOTICE '[011] Auditoría de calidad de datos instalada'; END $$;