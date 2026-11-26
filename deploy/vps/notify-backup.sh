#!/usr/bin/env bash
# Avisa a los admins que el backup semanal está disponible.
# Se ejecuta como ExecStartPost del servicio de backup; nunca hace fallar el
# servicio si el correo no se puede enviar.
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/woll}"

FILE="$(ls -t "$BACKUP_DIR"/woll-*.dump.gpg 2>/dev/null | head -1 || true)"
[ -n "$FILE" ] || exit 0
BYTES="$(wc -c <"$FILE" | tr -d ' ')"

docker compose \
  --project-directory "$ROOT" \
  --env-file "$ROOT/.env" \
  -f "$ROOT/docker-compose.yml" \
  -f "$ROOT/docker-compose.prod.yml" \
  run --rm --no-deps -T --entrypoint node api \
  scripts/notify-backup.mjs --file "$FILE" --bytes "$BYTES" || true
