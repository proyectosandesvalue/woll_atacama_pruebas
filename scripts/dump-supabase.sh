#!/usr/bin/env bash
# Dump de Supabase (o cualquier PostgreSQL origen) a formato custom.
#
# Uso:
#   SOURCE_DATABASE_URL='postgres://...' ./scripts/dump-supabase.sh
#   SOURCE_DATABASE_URL='...' SCHEMAS=public,chat,admin,ingest,rag ./scripts/dump-supabase.sh
#
# Requiere `pg_dump` en PATH o Podman para usar la imagen postgres:16.
# El dump incluye schema + datos de los schemas indicados, sin owners ni ACL.
set -euo pipefail

cd "$(dirname "$0")/.."

SOURCE_DATABASE_URL="${SOURCE_DATABASE_URL:-${SUPABASE_DB_URL:-}}"
if [[ -z "$SOURCE_DATABASE_URL" ]]; then
  echo "[dump] falta SOURCE_DATABASE_URL (o SUPABASE_DB_URL)" >&2
  exit 2
fi

SCHEMAS="${SCHEMAS:-public,chat,admin,ingest}"
OUT_DIR="${OUT_DIR:-backups}"
mkdir -p "$OUT_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$OUT_DIR/woll-${STAMP}.dump"
NAME="$(basename "$OUT")"

ARGS=(--format=custom --no-owner --no-privileges --verbose)
IFS=',' read -ra SCHEMA_LIST <<< "$SCHEMAS"
for schema in "${SCHEMA_LIST[@]}"; do
  schema="$(echo "$schema" | xargs)"
  [[ -n "$schema" ]] && ARGS+=(--schema="$schema")
done

if command -v pg_dump >/dev/null 2>&1; then
  echo "[dump] pg_dump local -> $OUT"
  pg_dump --dbname="$SOURCE_DATABASE_URL" "${ARGS[@]}" --file="$OUT"
else
  echo "[dump] pg_dump vía Podman -> $OUT"
  podman run --rm --network host \
    -v "$PWD/$OUT_DIR:/backup:Z" \
    docker.io/library/postgres:16 \
    pg_dump --dbname="$SOURCE_DATABASE_URL" "${ARGS[@]}" --file="/backup/$NAME"
fi

echo "[dump] listo: $OUT"
ls -lh "$OUT"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$OUT" | tee "$OUT.sha256"
else
  shasum -a 256 "$OUT" | tee "$OUT.sha256"
fi
