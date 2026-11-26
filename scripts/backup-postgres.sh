#!/usr/bin/env bash
#
# Backup diario de PostgreSQL: dump custom, cifrado, checksum, retención y
# copia externa. Pensado para el VPS (systemd timer) y para el stack local.
#
# Uso:
#   DATABASE_ADMIN_URL=postgres://... scripts/backup-postgres.sh
#
#   # Local con el contenedor de PostgreSQL:
#   BACKUP_PG_CONTAINER=woll_local_postgres_1 PGUSER=postgres PGDATABASE=woll \
#     BACKUP_ALLOW_PLAIN=1 BACKUP_DIR=/tmp/woll-backups \
#     scripts/backup-postgres.sh
#
# Variables principales:
#   DATABASE_ADMIN_URL          URL de pg_dump si está instalado en el host.
#   BACKUP_PG_CONTAINER         Contenedor con pg_dump (podman/docker exec).
#   BACKUP_PG_CMD               Comando completo alternativo (se divide por espacios).
#   BACKUP_DIR                  Directorio local (default: backups/postgres).
#   BACKUP_RETENTION_DAYS       Días a conservar (default: 14).
#   BACKUP_MIN_KEEP             Mínimo de backups a conservar (default: 2).
#   BACKUP_GPG_RECIPIENT        Cifrado asimétrico con esta clave GPG.
#   BACKUP_GPG_PASSPHRASE_FILE  Cifrado simétrico AES256 con este archivo.
#   BACKUP_ALLOW_PLAIN=1        Permite dump sin cifrar (solo desarrollo).
#   BACKUP_OFFSITE_DIR          Copia local externa (otro disco/ruta).
#   BACKUP_OFFSITE_CMD          Comando externo (rclone/rsync) con BACKUP_FILE.
#   BACKUP_ALERT_CMD            Comando de alerta (recibe BACKUP_MESSAGE).
#   BACKUP_MIN_FREE_MB          Espacio mínimo libre (default: 1024).
#
# Sprint 26-G.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-backups/postgres}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
MIN_KEEP="${BACKUP_MIN_KEEP:-2}"
KEEP_LAST="${BACKUP_KEEP_LAST:-0}"
MIN_FREE_MB="${BACKUP_MIN_FREE_MB:-1024}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BASE="woll-${STAMP}.dump"
TMP="${BACKUP_DIR}/.${BASE}.tmp"
LOCK_FILE="${BACKUP_LOCK_FILE:-/tmp/woll-backup.lock}"
DUMP_ARGS=(--format=custom --compress=9 --no-owner --no-acl)

notify() {
  local message="$1"
  echo "[backup] ${message}" >&2
  if [[ -n "${BACKUP_ALERT_CMD:-}" ]]; then
    BACKUP_MESSAGE="$message" bash -c "$BACKUP_ALERT_CMD" || true
  fi
  if [[ -n "${BACKUP_ALERT_WEBHOOK:-}" ]]; then
    curl -fsS -X POST -H "Content-Type: application/json" \
      --data "{\"text\":\"${message//\"/\\\"}\"}" \
      "$BACKUP_ALERT_WEBHOOK" >/dev/null || true
  fi
}

on_error() {
  local code=$?
  rm -f "$TMP" 2>/dev/null || true
  notify "Backup falló (código ${code}) en $(hostname)"
  exit "$code"
}

trap on_error ERR
mkdir -p "$BACKUP_DIR"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[backup] ya hay un backup en ejecución; se omite."
  exit 0
fi

FREE_MB="$(df -Pk "$BACKUP_DIR" | awk 'NR==2 {print $4}')"
if [[ -n "$FREE_MB" ]] && (( FREE_MB < MIN_FREE_MB )); then
  notify "Backup abortado: quedan ${FREE_MB} MB libres en ${BACKUP_DIR}"
  exit 1
fi

# Comando de dump: host, contenedor o comando explícito.
if [[ -n "${BACKUP_PG_CMD:-}" ]]; then
  # shellcheck disable=SC2206
  DUMP_CMD=(${BACKUP_PG_CMD} "${DUMP_ARGS[@]}")
elif command -v pg_dump >/dev/null 2>&1; then
  if [[ -z "${DATABASE_ADMIN_URL:-}" ]]; then
    echo "[backup] falta DATABASE_ADMIN_URL para pg_dump del host." >&2
    exit 1
  fi
  DUMP_CMD=(pg_dump "$DATABASE_ADMIN_URL" "${DUMP_ARGS[@]}")
elif command -v podman >/dev/null 2>&1 && [[ -n "${BACKUP_PG_CONTAINER:-}" ]]; then
  DUMP_CMD=(podman exec -i "$BACKUP_PG_CONTAINER" pg_dump \
    -U "${PGUSER:-postgres}" -d "${PGDATABASE:-woll}" "${DUMP_ARGS[@]}")
elif command -v docker >/dev/null 2>&1 && [[ -n "${BACKUP_PG_CONTAINER:-}" ]]; then
  DUMP_CMD=(docker exec -i "$BACKUP_PG_CONTAINER" pg_dump \
    -U "${PGUSER:-postgres}" -d "${PGDATABASE:-woll}" "${DUMP_ARGS[@]}")
else
  echo "[backup] no hay pg_dump ni contenedor configurado (BACKUP_PG_CONTAINER)." >&2
  exit 1
fi

echo "[backup] generando dump ${BASE}..."
"${DUMP_CMD[@]}" >"$TMP"

SIZE="$(wc -c <"$TMP" | tr -d ' ')"
if [[ "$SIZE" -lt 1024 ]]; then
  echo "[backup] dump demasiado pequeño (${SIZE} bytes)." >&2
  exit 1
fi

# Verificación básica del formato custom.
if command -v pg_restore >/dev/null 2>&1; then
  pg_restore --list "$TMP" >/dev/null
elif command -v podman >/dev/null 2>&1 && [[ -n "${BACKUP_PG_CONTAINER:-}" ]]; then
  podman exec -i "$BACKUP_PG_CONTAINER" pg_restore --list <"$TMP" >/dev/null
elif command -v docker >/dev/null 2>&1 && [[ -n "${BACKUP_PG_CONTAINER:-}" ]]; then
  docker exec -i "$BACKUP_PG_CONTAINER" pg_restore --list <"$TMP" >/dev/null
fi

FILE=""
if [[ -n "${BACKUP_GPG_RECIPIENT:-}" ]]; then
  FILE="${BACKUP_DIR}/${BASE}.gpg"
  gpg --batch --yes --trust-model always --encrypt \
    --recipient "$BACKUP_GPG_RECIPIENT" --output "$FILE" "$TMP"
elif [[ -n "${BACKUP_GPG_PASSPHRASE_FILE:-}" ]]; then
  FILE="${BACKUP_DIR}/${BASE}.gpg"
  gpg --batch --yes --symmetric --cipher-algo AES256 \
    --passphrase-file "$BACKUP_GPG_PASSPHRASE_FILE" --output "$FILE" "$TMP"
elif [[ "${BACKUP_ALLOW_PLAIN:-0}" == "1" ]]; then
  FILE="${BACKUP_DIR}/${BASE}"
  mv "$TMP" "$FILE"
else
  echo "[backup] define BACKUP_GPG_RECIPIENT o BACKUP_GPG_PASSPHRASE_FILE." >&2
  echo "[backup] (para desarrollo: BACKUP_ALLOW_PLAIN=1)" >&2
  exit 1
fi
rm -f "$TMP"

(cd "$(dirname "$FILE")" && sha256sum "$(basename "$FILE")" >"$(basename "$FILE").sha256")
BYTES="$(wc -c <"$FILE" | tr -d ' ')"

# Copia externa: directorio o comando (rclone/rsync).
if [[ -n "${BACKUP_OFFSITE_DIR:-}" ]]; then
  mkdir -p "$BACKUP_OFFSITE_DIR"
  cp -p "$FILE" "${FILE}.sha256" "$BACKUP_OFFSITE_DIR/"
  (cd "$BACKUP_OFFSITE_DIR" && sha256sum -c "$(basename "$FILE").sha256" >/dev/null)
  echo "[backup] copia externa en ${BACKUP_OFFSITE_DIR}"
elif [[ -n "${BACKUP_OFFSITE_CMD:-}" ]]; then
  BACKUP_FILE="$FILE" BACKUP_SHA256="${FILE}.sha256" \
    bash -c "$BACKUP_OFFSITE_CMD"
  echo "[backup] copia externa por comando"
fi

# Retención: conserva los MIN_KEEP más nuevos y borra los que superan los días.
mapfile -t FILES < <(
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'woll-*.dump*' ! -name '*.sha256' \
    -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-
)
DELETED=0
if [[ "$KEEP_LAST" =~ ^[0-9]+$ ]] && (( KEEP_LAST > 0 )); then
  # Retención exacta: conserva solo los N más nuevos (backup semanal).
  for old in "${FILES[@]:KEEP_LAST}"; do
    rm -f "$old" "${old}.sha256"
    DELETED=$((DELETED + 1))
  done
elif (( ${#FILES[@]} > MIN_KEEP )); then
  for old in "${FILES[@]:MIN_KEEP}"; do
    if [[ -n "$(find "$old" -maxdepth 0 -mtime +"$RETENTION_DAYS" -print)" ]]; then
      rm -f "$old" "${old}.sha256"
      DELETED=$((DELETED + 1))
    fi
  done
fi

echo "[backup] ok file=${FILE} bytes=${BYTES} raw_bytes=${SIZE} retention_deleted=${DELETED}"

# Mantener el lock hasta terminar (fd 9 se cierra al salir).
exit 0
