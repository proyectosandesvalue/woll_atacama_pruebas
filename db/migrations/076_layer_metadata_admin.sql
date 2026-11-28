-- 076_layer_metadata_admin.sql
--
-- Sprint 47-E: el editor de metadatos de capas actualiza chat.chat_catalog.
--
-- El API del VPS usa el rol de servicio, que ya escribe. Este grant deja
-- preparado el camino de mínimo privilegio para woll_api y habilita las
-- policies de RLS correspondientes.
--
-- Idempotente.

GRANT SELECT, UPDATE ON TABLE chat.chat_catalog TO woll_api;

DROP POLICY IF EXISTS p_chat_catalog_api_read ON chat.chat_catalog;
CREATE POLICY p_chat_catalog_api_read
  ON chat.chat_catalog
  FOR SELECT
  TO woll_api
  USING (true);

DROP POLICY IF EXISTS p_chat_catalog_api_update ON chat.chat_catalog;
CREATE POLICY p_chat_catalog_api_update
  ON chat.chat_catalog
  FOR UPDATE
  TO woll_api
  USING (true)
  WITH CHECK (true);
