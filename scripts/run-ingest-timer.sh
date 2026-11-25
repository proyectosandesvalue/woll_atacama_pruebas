#!/usr/bin/env bash
#
# Ejecuta una ingesta programada dentro del contenedor `ingest`.
#
# Uso:
#   scripts/run-ingest-timer.sh agromet|realtime|redmeteo|daily
#
# - Usa flock por fuente para evitar solapamientos.
# - Espera a que PostgreSQL esté healthy (depends_on del compose).
# - Corre `docker compose run --rm ingest ...` y registra inicio/fin.
#
# Sprint 26-J.

set -euo pipefail

SOURCE="${1:-}"
case "$SOURCE" in
  agromet|realtime|redmeteo|daily) ;;
  *)
    echo "Uso: $0 agromet|realtime|redmeteo|daily" >&2
    exit 2
    ;;
esac

COMPOSE_DIR="${WOLL_COMPOSE_DIR:-/srv/woll}"
COMPOSE_ENV="${WOLL_ENV_FILE:-.env}"
read -r -a COMPOSE_CMD <<< "${WOLL_COMPOSE_CMD:-docker compose}"
LOCK_FILE="/tmp/woll-ingest-${SOURCE}.lock"
LOG_TAG="woll-ingest-${SOURCE}"

cd "$COMPOSE_DIR"

notify_failure() {
  local code=$?
  local cmd="${WOLL_NOTIFY_CMD:-/srv/woll/deploy/vps/notify-alert.sh}"
  if [ -x "$cmd" ]; then
    "$cmd" "Ingesta ${SOURCE} falló" \
      "Código ${code}. Revisa: journalctl -u woll-ingest@${SOURCE}.service" || true
  fi
  exit "$code"
}
trap notify_failure ERR

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[${LOG_TAG}] ya hay una ingesta en ejecución; se omite."
  exit 0
fi

echo "[${LOG_TAG}] inicio $(date -u +%Y-%m-%dT%H:%M:%SZ)"
START="$(date +%s)"

run() {
  echo "[${LOG_TAG}] $*"
  if [[ "${WOLL_INGEST_DRY_RUN:-0}" == "1" ]]; then
    echo "[${LOG_TAG}] dry-run: ${COMPOSE_CMD[*]} --env-file $COMPOSE_ENV --profile tools run --rm ingest $*"
    return 0
  fi
  "${COMPOSE_CMD[@]}" --env-file "$COMPOSE_ENV" --profile tools run --rm ingest "$@"
}

case "$SOURCE" in
  agromet)
    run --agromet
    ;;
  realtime)
    run --endpoint meteochile:getEmaResumenDiario
    run --endpoint meteochile:getDatosRecientesRedEma
    ;;
  redmeteo)
    run --endpoint redmeteo:last-data
    ;;
  daily)
    run --endpoint meteochile:getEmaResumenDiario
    ;;
esac

END="$(date +%s)"
echo "[${LOG_TAG}] fin ok $((END - START))s"
