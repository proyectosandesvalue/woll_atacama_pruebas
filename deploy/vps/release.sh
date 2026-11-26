#!/usr/bin/env bash
# Release controlado del VPS (Sprint 26-I).
#
# Flujo: backup -> fetch -> build -> migraciones -> up -> smoke.
# Nunca edita código en el servidor: solo avanza a origin/main.
#
# Uso (en el VPS, como deploy):
#   deploy/vps/release.sh                 # release completo con backup
#   deploy/vps/release.sh --skip-backup   # si acabas de hacer uno
#   deploy/vps/release.sh --skip-build    # solo migraciones y reinicio
#   deploy/vps/release.sh --with-chat     # smoke extra del chat
#
# Requisitos: /srv/woll/.env y /srv/woll/.env.backup, deploy key de solo
# lectura y el usuario deploy en el grupo docker.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
COMPOSE="$ROOT/deploy/vps/compose.sh"
BRANCH="${RELEASE_BRANCH:-main}"

SKIP_BACKUP=0
SKIP_BUILD=0
WITH_CHAT=0
for arg in "$@"; do
  case "$arg" in
    --skip-backup) SKIP_BACKUP=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --with-chat) WITH_CHAT=1 ;;
    -h|--help)
      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "[release] argumento desconocido: $arg" >&2; exit 2 ;;
  esac
done

log() { printf '[release] %s\n' "$*"; }
die() { printf '[release] ERROR: %s\n' "$*" >&2; exit 1; }

# ── 0. Requisitos ────────────────────────────────────────────────────
[ -x "$COMPOSE" ] || die "falta $COMPOSE"
[ -f .env ] || die "falta /srv/woll/.env"
[ -f .env.backup ] || die "falta /srv/woll/.env.backup"

# ── 1. Árbol limpio y sin divergencia ────────────────────────────────
# rag/manifest.json es dato de runtime (lo edita el panel) y no debe
# bloquear un release.
DIRTY="$(git status --porcelain -- . ':(exclude)rag/manifest.json' || true)"
[ -z "$DIRTY" ] || die "hay cambios locales en $ROOT; el deploy solo avanza con el árbol limpio"
git fetch -q origin
CURRENT="$(git rev-parse --short HEAD)"
TARGET="$(git rev-parse --short "origin/$BRANCH")"
git merge-base --is-ancestor HEAD "origin/$BRANCH" \
  || die "HEAD no es ancestro de origin/$BRANCH (historial divergente)"
if [ "$CURRENT" = "$TARGET" ]; then
  log "sin cambios: ya estás en $CURRENT"
else
  log "deploy $CURRENT -> $TARGET"
  git diff --name-only "HEAD..origin/$BRANCH" | sed 's/^/[release]   /'
fi

# ── 2. Backup previo ─────────────────────────────────────────────────
if [ "$SKIP_BACKUP" -eq 0 ]; then
  log "backup previo a migraciones"
  ( set -a; . ./.env.backup; set +a; bash scripts/backup-postgres.sh ) \
    || die "el backup falló; no se despliega"
fi

# ── 3. Código ────────────────────────────────────────────────────────
git merge --ff-only -q "origin/$BRANCH"
log "código: $(git log -1 --format='%h %s')"
NGINX_CHANGED=0
if [ "$CURRENT" != "$TARGET" ] && git diff --name-only "$CURRENT..HEAD" | grep -q '^deploy/nginx/'; then
  NGINX_CHANGED=1
fi

# ── 4. Imágenes ──────────────────────────────────────────────────────
if [ "$SKIP_BUILD" -eq 0 ]; then
  log "build de api, rag-worker y layer-worker"
  "$COMPOSE" build api rag-worker layer-worker 2>&1 | tail -3
fi

# ── 5. Migraciones (idempotentes) ────────────────────────────────────
log "migraciones"
"$COMPOSE" run --rm -T api node scripts/migrate.mjs 2>&1 | tail -6

# ── 6. Servicios ─────────────────────────────────────────────────────
log "up -d"
"$COMPOSE" up -d --remove-orphans 2>&1 | tail -5

# Los archivos de Nginx se montan por inodo: un pull nuevo exige recrear.
if [ "$NGINX_CHANGED" -eq 1 ] || [ "$SKIP_BUILD" -eq 0 ]; then
  log "recreando nginx (configuración montada)"
  "$COMPOSE" up -d --force-recreate nginx 2>&1 | tail -2
fi

# ── 7. Smoke ─────────────────────────────────────────────────────────
wait_http() {
  local path="$1" i code
  for i in $(seq 1 30); do
    code="$(curl -sk -o /dev/null -w '%{http_code}' "https://127.0.0.1${path}" || true)"
    [ "$code" = "200" ] && return 0
    sleep 2
  done
  return 1
}

wait_http /healthz || die "smoke: /healthz no respondió 200"
log "smoke: /healthz OK"
wait_http /api/config || die "smoke: /api/config no respondió 200"
log "smoke: /api/config OK"

# Portada institucional y visor.
wait_http / || die "smoke: / (Geodatos) no respondió 200"
log "smoke: / (Geodatos) OK"
HOME_HTML="$(curl -sk https://127.0.0.1/ || true)"
case "$HOME_HTML" in
  *"Geodatos"*) ;;
  *) die "smoke: / no sirve la portada Geodatos" ;;
esac
wait_http /visor || die "smoke: /visor no respondió 200"
log "smoke: /visor OK"
VISOR_HTML="$(curl -sk https://127.0.0.1/visor || true)"
case "$VISOR_HTML" in
  *"Plataforma Woll Atacama"*) ;;
  *) die "smoke: /visor no sirve el visor" ;;
esac
wait_http "/visor?chat=1" || die "smoke: /visor?chat=1 no respondió 200"
log "smoke: /visor?chat=1 OK"
wait_http /chat || die "smoke: /chat no respondió 200"
log "smoke: /chat OK"
CHAT_HTML="$(curl -sk https://127.0.0.1/chat || true)"
case "$CHAT_HTML" in
  *"Plataforma Woll Atacama"*) ;;
  *) die "smoke: /chat no sirve la SPA del visor" ;;
esac

if [ "$WITH_CHAT" -eq 1 ]; then
  log "smoke: chat"
  curl -sk --max-time 60 -X POST https://127.0.0.1/api/chat \
    -H 'content-type: application/json' \
    -d '{"text":"¿Cuántas comunas tiene la región de Atacama?"}' \
    | head -c 300
  echo
fi

log "release OK en $(git rev-parse --short HEAD)"
