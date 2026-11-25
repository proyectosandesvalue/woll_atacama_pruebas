#!/usr/bin/env bash
# Envía un aviso operativo usando la imagen de la API (nodemailer + SMTP).
#
# Uso:
#   deploy/vps/notify-alert.sh "Título" "Mensaje"
#
# Lo usan backup-postgres.sh y run-ingest-timer.sh ante fallos.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TITLE="${1:-Aviso WOLL Atacama}"
MESSAGE="${2:-}"

exec docker compose \
  --project-directory "$ROOT" \
  --env-file "$ROOT/.env" \
  -f "$ROOT/docker-compose.yml" \
  -f "$ROOT/docker-compose.prod.yml" \
  run --rm --no-deps -T --entrypoint node api \
  scripts/notify-alert.mjs --title "$TITLE" --message "$MESSAGE"
