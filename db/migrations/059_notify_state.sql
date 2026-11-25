-- 059_notify_state.sql
--
-- Estado de notificaciones para no repetir la misma alerta en cada corrida
-- de ops-check (Sprint 31-B / 26-M). `last_sent_at` permite un recordatorio
-- cada N horas; el cambio a `ok` genera aviso de recuperación.

CREATE TABLE IF NOT EXISTS admin.notify_state (
  key text PRIMARY KEY,
  state text NOT NULL CHECK (state IN ('ok', 'failing')),
  last_sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE admin.notify_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin.notify_state TO woll_api;
