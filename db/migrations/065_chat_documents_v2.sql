-- 065_chat_documents_v2.sql
--
-- Sprint 18-D: agrega al prompt documental la regla de no filtrar por año
-- cuando la pregunta compara ediciones o pide una evolución.
--
-- Crea una versión nueva de `chat.documents` a partir de la versión 1 para
-- conservar cualquier edición hecha desde el panel. Idempotente.

INSERT INTO admin.prompt_templates
  (id, version, content, description, activo, updated_by)
SELECT
  'chat.documents',
  2,
  content || E'\n- Si la pregunta compara dos ediciones o pide una evolución, no filtres por año: busca en todo el corpus y cita ambos documentos.',
  description,
  true,
  'migration-065'
FROM admin.prompt_templates
WHERE id = 'chat.documents' AND version = 1
ON CONFLICT (id, version) DO NOTHING;

UPDATE admin.prompt_templates
   SET activo = false
 WHERE id = 'chat.documents' AND version = 1;
