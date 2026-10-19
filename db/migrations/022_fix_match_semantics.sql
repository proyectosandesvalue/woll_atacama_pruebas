-- 022_fix_match_semantics.sql
-- Fix: match = igualdad normalizada (sin fallback a contiene).
-- ilike = contiene, normalizado.
-- filters (formato objeto) se convierte a ilike (contiene), como chat_query.

CREATE OR REPLACE FUNCTION chat.chat_build_where(
  p_phys text,
  p_filters jsonb,
  p_alias text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = chat, public, extensions
AS $$
DECLARE
  whitelisted text[];
  where_clauses text[] := ARRAY[]::text[];
  prefix text;
  i record;
  cond_field text;
  cond_op text;
  cond_value text;
  cond_values text[];
  cond_sql text;
  norm_col text;
  norm_val text;
BEGIN
  IF p_filters IS NULL OR p_filters = '{}'::jsonb OR p_filters = '[]'::jsonb THEN
    RETURN '';
  END IF;

  SELECT array_agg(column_name) INTO whitelisted
    FROM information_schema.columns
   WHERE table_schema = split_part(p_phys, '.', 1)
     AND table_name   = split_part(p_phys, '.', 2)
     AND column_name NOT IN ('geom','geometry','the_geom','gid');

  IF whitelisted IS NULL THEN
    RAISE EXCEPTION 'No se encontraron columnas para la tabla %', p_phys;
  END IF;

  prefix := CASE WHEN p_alias IS NOT NULL AND p_alias <> '' THEN p_alias || '.' ELSE '' END;

  -- Objeto: convertir a ilike (contiene), como chat_query.
  IF jsonb_typeof(p_filters) = 'object' THEN
    FOR i IN SELECT * FROM jsonb_each_text(p_filters) LOOP
      IF i.key = ANY(whitelisted) AND i.value IS NOT NULL AND i.value <> '' THEN
        SELECT c INTO cond_field FROM unnest(whitelisted) c WHERE lower(c) = lower(i.key) LIMIT 1;
        IF cond_field IS NULL THEN
          RAISE EXCEPTION 'Campo desconocido: "%". Columnas válidas: %', i.key, array_to_string(whitelisted, ', ');
        END IF;

        norm_col := format('chat.normalize_text(btrim(%s%I::text))', prefix, cond_field);
        norm_val := format('chat.normalize_text(btrim(%L))', i.value);

        cond_sql := format('%s LIKE ''%%'' || %s || ''%%''', norm_col, norm_val);
        where_clauses := array_append(where_clauses, cond_sql);
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(p_filters) = 'array' THEN
    FOR i IN SELECT * FROM jsonb_array_elements(p_filters) LOOP
      cond_field := i.value->>'field';
      cond_op := lower(coalesce(i.value->>'op', 'match'));

      IF cond_field IS NULL THEN CONTINUE; END IF;

      SELECT c INTO cond_field FROM unnest(whitelisted) c WHERE lower(c) = lower(cond_field) LIMIT 1;
      IF cond_field IS NULL THEN
        RAISE EXCEPTION 'Campo desconocido: "%". Columnas válidas: %', i.value->>'field', array_to_string(whitelisted, ', ');
      END IF;

      norm_col := format('chat.normalize_text(btrim(%s%I::text))', prefix, cond_field);

      IF i.value ? 'values' THEN
        SELECT array_agg(chat.normalize_text(btrim(v)))
          INTO cond_values
          FROM jsonb_array_elements_text(i.value->'values') v;
      ELSIF i.value ? 'value' THEN
        cond_value := chat.normalize_text(btrim(i.value->>'value'));
      END IF;

      CASE cond_op
        WHEN 'match' THEN
          cond_sql := format('%s = %L', norm_col, cond_value);

        WHEN 'eq' THEN
          cond_sql := format('%s = %L', norm_col, cond_value);

        WHEN 'in' THEN
          IF cond_values IS NULL OR array_length(cond_values, 1) IS NULL THEN CONTINUE; END IF;
          cond_sql := format('%s = ANY(%L::text[])', norm_col, cond_values);

        WHEN 'ilike' THEN
          cond_sql := format('%s LIKE ''%%'' || %L || ''%%''', norm_col, cond_value);

        WHEN 'gt' THEN
          cond_sql := format('(%s%I)::numeric > %L::numeric', prefix, cond_field, i.value->>'value');

        WHEN 'gte' THEN
          cond_sql := format('(%s%I)::numeric >= %L::numeric', prefix, cond_field, i.value->>'value');

        WHEN 'lt' THEN
          cond_sql := format('(%s%I)::numeric < %L::numeric', prefix, cond_field, i.value->>'value');

        WHEN 'lte' THEN
          cond_sql := format('(%s%I)::numeric <= %L::numeric', prefix, cond_field, i.value->>'value');

        WHEN 'between' THEN
          IF cond_values IS NULL OR array_length(cond_values, 1) <> 2 THEN
            RAISE EXCEPTION 'El operador between requiere exactamente 2 valores';
          END IF;
          cond_sql := format(
            '(%s%I)::numeric BETWEEN %L::numeric AND %L::numeric',
            prefix, cond_field, i.value->'values'->>0, i.value->'values'->>1
          );

        ELSE
          RAISE EXCEPTION 'Operador no soportado: %', cond_op;
      END CASE;

      where_clauses := array_append(where_clauses, cond_sql);
    END LOOP;
  END IF;

  IF array_length(where_clauses, 1) IS NULL OR array_length(where_clauses, 1) = 0 THEN
    RETURN '';
  END IF;

  RETURN ' WHERE ' || array_to_string(where_clauses, ' AND ');
END;
$$;

NOTIFY pgrst, 'reload schema';