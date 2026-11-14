-- 051_golden_route.sql
--
-- Agrega la ruta esperada al golden set del chat (Sprint 18-A).
-- Rutas: tool, rag, mixta, abstencion, fuera_de_alcance.
-- Idempotente: ADD COLUMN IF NOT EXISTS + UPDATE de nulos + CHECK recreado.

ALTER TABLE admin.golden_cases
  ADD COLUMN IF NOT EXISTS route text;

UPDATE admin.golden_cases
   SET route = CASE
     WHEN category = 'bloqueo' THEN 'fuera_de_alcance'
     WHEN fuente_esperada = 'no_disponible' THEN 'abstencion'
     WHEN intent_esperado = 'contexto_documental' THEN 'rag'
     ELSE 'tool'
   END
 WHERE route IS NULL;

ALTER TABLE admin.golden_cases
  DROP CONSTRAINT IF EXISTS golden_cases_route_check;

ALTER TABLE admin.golden_cases
  ADD CONSTRAINT golden_cases_route_check
  CHECK (
    route IS NULL OR route IN (
      'tool', 'rag', 'mixta', 'abstencion', 'fuera_de_alcance'
    )
  );

CREATE INDEX IF NOT EXISTS idx_golden_cases_route
  ON admin.golden_cases (route, activo, level, id);
