#!/usr/bin/env bash
# Restaura un dump custom en el PostgreSQL local (Docker/Podman).
#
# Uso:
#   TARGET_DATABASE_URL='postgres://postgres:...@127.0.0.1:5432/woll' \
#     ./scripts/restore-local.sh backups/woll-....dump
#
# ADVERTENCIA: usa --clean --if-exists. Pensado para una base vacía o de
# staging recién creada. No lo corras contra producción sin backup.
set -euo pipefail

cd "$(dirname "$0")/.."

DUMP="${1:-}"
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "Uso: $0 <archivo.dump>" >&2
  exit 2
fi

TARGET_DATABASE_URL="${TARGET_DATABASE_URL:-${DATABASE_ADMIN_URL:-}}"
if [[ -z "$TARGET_DATABASE_URL" ]]; then
  echo "[restore] falta TARGET_DATABASE_URL (o DATABASE_ADMIN_URL)" >&2
  exit 2
fi

ABS_DUMP="$(cd "$(dirname "$DUMP")" && pwd)/$(basename "$DUMP")"
DIR="$(dirname "$ABS_DUMP")"
NAME="$(basename "$ABS_DUMP")"

echo "[restore] $ABS_DUMP -> $TARGET_DATABASE_URL"

# La base destino necesita el schema `extensions`, los roles y el search_path
# antes de restaurar tablas que usan `extensions.geometry`. 000 es idempotente.
BOOTSTRAP="db/migrations/000_compat_roles.sql"
if [[ ! -f "$BOOTSTRAP" ]]; then
  echo "[restore] falta $BOOTSTRAP" >&2
  exit 2
fi
if command -v psql >/dev/null 2>&1; then
  psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$BOOTSTRAP" >/dev/null
else
  podman run --rm --network host     -v "$PWD/db/migrations:/migrations:ro,Z"     docker.io/library/postgres:16     psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1       -f /migrations/000_compat_roles.sql >/dev/null
fi

if command -v pg_restore >/dev/null 2>&1; then
  pg_restore \
    --dbname="$TARGET_DATABASE_URL" \
    --no-owner --no-privileges --clean --if-exists --exit-on-error \
    "$ABS_DUMP"
else
  echo "[restore] pg_restore vía Podman (--network host)"
  podman run --rm --network host \
    -v "$DIR:/backup:Z" \
    docker.io/library/postgres:16 \
    pg_restore \
      --dbname="$TARGET_DATABASE_URL" \
      --no-owner --no-privileges --clean --if-exists --exit-on-error \
      "/backup/$NAME"
fi

cat <<'EOF'

[restore] Listo. Pasos siguientes:
  1. node scripts/migrate.mjs --baseline --to 035  (si el dump ya trae el schema)
  2. npm run migrate                              (036 rag, 038 legacy RPCs, etc.)
  3. npm run check:rpcs
  4. node scripts/verify-migration.mjs
EOF
