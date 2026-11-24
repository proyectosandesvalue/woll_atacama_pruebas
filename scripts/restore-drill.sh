#!/usr/bin/env bash
#
# Simulacro de restauración de un backup en una base descartable.
#
# Crea `RESTORE_DB` (debe contener "restore" o "test"), restaura el dump custom,
# compara conteos y mide el RTO. No toca la base de producción.
#
# Uso:
#   BACKUP_FILE=backups/postgres/woll-....dump.gpg \
#   BACKUP_GPG_PASSPHRASE_FILE=/ruta/pass.txt \
#   RESTORE_CONTAINER=woll_postgres_1 \
#     scripts/restore-drill.sh
#
# Variables:
#   RESTORE_ENGINE      podman|docker (auto).
#   RESTORE_CONTAINER   Contenedor con psql/pg_restore/createdb.
#   RESTORE_USER        Usuario admin (default: postgres).
#   RESTORE_DB          Base descartable (default: woll_restore_test).
#   RESTORE_KEEP=1      No borra la base al terminar.
#   RESTORE_EXPECT_*    Conteos esperados opcionales.
#
# Sprint 26-G.

set -euo pipefail

BACKUP_FILE="${BACKUP_FILE:?Define BACKUP_FILE}"
RESTORE_DB="${RESTORE_DB:-woll_restore_test}"
RESTORE_USER="${RESTORE_USER:-postgres}"
RESTORE_KEEP="${RESTORE_KEEP:-0}"
RESTORE_CONTAINER="${RESTORE_CONTAINER:-}"

if [[ ! "$RESTORE_DB" =~ (restore|test) ]]; then
  echo "[restore-drill] RESTORE_DB debe contener 'restore' o 'test': $RESTORE_DB" >&2
  exit 1
fi
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "[restore-drill] no existe $BACKUP_FILE" >&2
  exit 1
fi

if [[ -z "${RESTORE_ENGINE:-}" ]]; then
  if command -v podman >/dev/null 2>&1; then
    RESTORE_ENGINE=podman
  elif command -v docker >/dev/null 2>&1; then
    RESTORE_ENGINE=docker
  else
    echo "[restore-drill] no hay podman ni docker." >&2
    exit 1
  fi
fi

if [[ -z "$RESTORE_CONTAINER" ]]; then
  RESTORE_CONTAINER="$("$RESTORE_ENGINE" ps --format '{{.Names}}' | grep -E 'postgres' | head -1 || true)"
fi
if [[ -z "$RESTORE_CONTAINER" ]]; then
  echo "[restore-drill] no se encontró el contenedor de PostgreSQL; define RESTORE_CONTAINER." >&2
  exit 1
fi

WORK_DIR="$(mktemp -d /tmp/woll-restore.XXXXXX)"
DUMP="$WORK_DIR/backup.dump"
TMP_DB="$RESTORE_DB"

cleanup() {
  if [[ "$RESTORE_KEEP" != "1" ]]; then
    "$RESTORE_ENGINE" exec "$RESTORE_CONTAINER" dropdb --if-exists -U "$RESTORE_USER" "$TMP_DB" >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

if [[ "$BACKUP_FILE" == *.gpg ]]; then
  if [[ -z "${BACKUP_GPG_PASSPHRASE_FILE:-}" ]]; then
    echo "[restore-drill] backup cifrado: falta BACKUP_GPG_PASSPHRASE_FILE." >&2
    exit 1
  fi
  gpg --batch --yes --quiet --passphrase-file "$BACKUP_GPG_PASSPHRASE_FILE" \
    --decrypt "$BACKUP_FILE" >"$DUMP"
else
  cp "$BACKUP_FILE" "$DUMP"
fi

# Verificar checksum si está junto al backup.
if [[ -f "${BACKUP_FILE}.sha256" ]]; then
  (cd "$(dirname "$BACKUP_FILE")" && sha256sum -c "$(basename "$BACKUP_FILE").sha256" >/dev/null)
  echo "[restore-drill] checksum ok"
fi

START="$(date +%s)"
echo "[restore-drill] creando $RESTORE_DB en $RESTORE_CONTAINER..."
"$RESTORE_ENGINE" exec "$RESTORE_CONTAINER" dropdb --if-exists -U "$RESTORE_USER" "$RESTORE_DB" >/dev/null 2>&1 || true
"$RESTORE_ENGINE" exec "$RESTORE_CONTAINER" createdb -U "$RESTORE_USER" "$RESTORE_DB"

echo "[restore-drill] restaurando..."
"$RESTORE_ENGINE" exec -i "$RESTORE_CONTAINER" pg_restore \
  -U "$RESTORE_USER" -d "$RESTORE_DB" --no-owner --no-acl <"$DUMP"

END="$(date +%s)"
RTO=$((END - START))

query_count() {
  "$RESTORE_ENGINE" exec "$RESTORE_CONTAINER" psql -U "$RESTORE_USER" -d "$RESTORE_DB" \
    -tAc "SELECT count(*) FROM $1;"
}

CATALOG="$(query_count chat.chat_catalog)"
LAYER="$(query_count public.borde_costero)"
VALUES="$(query_count ingest.indicator_values)"

echo "[restore-drill] ok db=${RESTORE_DB} rto_s=${RTO} catalog=${CATALOG} borde=${LAYER} indicadores=${VALUES}"

FAILED=0
check_expect() {
  local name="$1" actual="$2" expected="${3:-}"
  if [[ -n "$expected" && "$actual" != "$expected" ]]; then
    echo "[restore-drill] ERROR ${name}: esperado ${expected}, obtenido ${actual}" >&2
    FAILED=1
  fi
}
check_expect "chat_catalog" "$CATALOG" "${RESTORE_EXPECT_CATALOG:-}"
check_expect "borde_costero" "$LAYER" "${RESTORE_EXPECT_LAYER:-}"
check_expect "indicator_values" "$VALUES" "${RESTORE_EXPECT_VALUES:-}"

if (( FAILED != 0 )); then
  exit 1
fi

if [[ "$RESTORE_KEEP" == "1" ]]; then
  echo "[restore-drill] RESTORE_KEEP=1: se conserva ${RESTORE_DB}"
fi
