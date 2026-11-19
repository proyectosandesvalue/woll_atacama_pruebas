-- 055_unanswered_rls.sql
--
-- El brief consulta admin.unanswered_questions directamente con el rol
-- woll_api. La tabla tiene RLS habilitado y, sin policy, el rol ve 0 filas.
-- Las escrituras siguen pasando por RPCs SECURITY DEFINER.

ALTER TABLE admin.unanswered_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS unanswered_woll_api_select ON admin.unanswered_questions;
CREATE POLICY unanswered_woll_api_select
  ON admin.unanswered_questions
  FOR SELECT
  TO woll_api
  USING (true);

GRANT SELECT ON admin.unanswered_questions TO woll_api;
