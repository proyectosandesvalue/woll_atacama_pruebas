-- Fix: normalizar chat_catalog.attributes a jsonb array
--
-- Bug: la columna attributes se estaba guardando como jsonb string
-- (el array serializado como texto), lo que rompia jsonb_array_elements
-- dentro de chat.chat_query con error 22023 "cannot extract elements from a scalar".
--
-- Fix: parsear el string a array nativo y agregar constraint.

UPDATE chat.chat_catalog
   SET attributes = (attributes #>> '{}')::jsonb
 WHERE jsonb_typeof(attributes) = 'string';

-- Evitar que vuelva a pasar:
ALTER TABLE chat.chat_catalog
  DROP CONSTRAINT IF EXISTS attributes_must_be_array;

ALTER TABLE chat.chat_catalog
  ADD CONSTRAINT attributes_must_be_array
  CHECK (jsonb_typeof(attributes) = 'array');
