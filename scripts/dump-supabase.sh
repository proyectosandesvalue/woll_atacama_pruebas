#!/usr/bin/env bash
# Dump de Supabase (o cualquier PostgreSQL origen) a formato custom.
#
# Uso:
#   SOURCE_DATABASE_URL='postgres://...' ./scripts/dump-supabase.sh
#   SOURCE_DATABASE_URL='...' SCHEMAS=public,chat,admin,ingest,rag ./scripts/dump-supabase.sh
#   PG_DUMP_IMAGE=postgres:17 ./scripts/dump-supabase.sh   # si Supabase es PG17
#   DUMP_VIA_PODMAN=1 ./scripts/dump-supabase.sh           # ignora pg_dump local
#
# Requiere `pg_dump` en PATH o Podman para usar la imagen postgres:17.
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
PG_DUMP_IMAGE="${PG_DUMP_IMAGE:-docker.io/library/postgres:17}"

if [[ -n "${CONTAINER_RUNTIME:-}" ]]; then
  RUNTIME="$CONTAINER_RUNTIME"
elif command -v podman >/dev/null 2>&1; then
  RUNTIME=podman
elif command -v docker >/dev/null 2>&1; then
  RUNTIME=docker
else
  echo "[dump] falta Podman o Docker para ejecutar pg_dump" >&2
  exit 2
fi
mkdir -p "$OUT_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$OUT_DIR/woll-${STAMP}.dump"
NAME="$(basename "$OUT")"

ARGS=(--format=custom --no-owner --no-privileges --verbose --exclude-table=public.spatial_ref_sys)
IFS=',' read -ra SCHEMA_LIST <<< "$SCHEMAS"
for schema in "${SCHEMA_LIST[@]}"; do
  schema="$(echo "$schema" | xargs)"
  [[ -n "$schema" ]] && ARGS+=(--schema="$schema")
done

if [[ "${DUMP_VIA_PODMAN:-0}" != "1" ]] && command -v pg_dump >/dev/null 2>&1; then
  echo "[dump] pg_dump local -> $OUT"
  pg_dump --dbname="$SOURCE_DATABASE_URL" "${ARGS[@]}" --file="$OUT"
else
  echo "[dump] pg_dump vía $RUNTIME ($PG_DUMP_IMAGE) -> $OUT"
  PODMAN_ENV=()
  if [[ -n "${PGPASSWORD:-}" ]]; then
    PODMAN_ENV=(-e PGPASSWORD)
  fi
  "$RUNTIME" run --rm --network host "${PODMAN_ENV[@]}" \
    -v "$PWD/$OUT_DIR:/backup:Z" \
    "$PG_DUMP_IMAGE" \
    pg_dump --dbname="$SOURCE_DATABASE_URL" "${ARGS[@]}" --file="/backup/$NAME"
fi

echo "[dump] listo: $OUT"
ls -lh "$OUT"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$OUT" | tee "$OUT.sha256"
else
  shasum -a 256 "$OUT" | tee "$OUT.sha256"
fi
