#!/usr/bin/env bash
# Backup completo de la aplicación para descargar por SSH.
#
# Uso (en el VPS):
#   sudo /srv/woll/deploy/vps/full-backup.sh
#
# Genera /var/backups/woll/full/woll-full-<UTC>.tar.gz.gpg + .sha256.
# Incluye base de datos, secretos, configs del host, certificados y uploads.
# NO incluye código ni GeoJSON base (están en GitHub), tiles/ráster (se
# regeneran), imágenes Docker ni logs.
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_DIR="${FULL_BACKUP_DIR:-/var/backups/woll/full}"
KEEP="${FULL_BACKUP_KEEP:-3}"
PASS_FILE="${BACKUP_GPG_PASSPHRASE_FILE:-/home/deploy/.woll-backup.pass}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="woll-full-${STAMP}.tar.gz"
OUT="${BACKUP_DIR}/${NAME}.gpg"
LOCK="/tmp/woll-full-backup.lock"

if [ "$(id -u)" -ne 0 ]; then
  echo "[full-backup] ejecuta con sudo." >&2
  exit 1
fi
[ -f "$ROOT/.env" ] || { echo "[full-backup] falta $ROOT/.env" >&2; exit 1; }
[ -f "$PASS_FILE" ] || { echo "[full-backup] falta $PASS_FILE" >&2; exit 1; }

exec 9>"$LOCK"
if ! flock -n 9; then
  echo "[full-backup] ya hay un backup completo en ejecución." >&2
  exit 0
fi

mkdir -p "$BACKUP_DIR"
chown deploy:deploy "$BACKUP_DIR" 2>/dev/null || true

FREE_MB="$(df -Pk "$BACKUP_DIR" | awk 'NR==2 {print $4}')"
if [ -n "$FREE_MB" ] && [ "$FREE_MB" -lt 2048 ]; then
  echo "[full-backup] quedan menos de 2 GB libres en $BACKUP_DIR." >&2
  exit 1
fi
STAGE="$(mktemp -d /var/tmp/woll-full.XXXXXX)"
ARCHIVE="${STAGE}/${NAME}"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

log() { printf '[full-backup] %s\n' "$*"; }

# ── Variables de la base, leídas del contenedor ─────────────
# No se hace `source .env`: los valores con espacios romperían el shell.
PG_CONTAINER="${FULL_BACKUP_PG_CONTAINER:-woll-postgres-1}"
PGUSER_DB="$(docker exec "$PG_CONTAINER" printenv POSTGRES_USER 2>/dev/null || echo woll)"
PGDB="$(docker exec "$PG_CONTAINER" printenv POSTGRES_DB 2>/dev/null || echo woll)"

# ── 1. Base de datos ─────────────────────────────────────────
log "dump de PostgreSQL"
mkdir -p "$STAGE/db"
docker exec "$PG_CONTAINER" pg_dump -U "$PGUSER_DB" -d "$PGDB" -Fc >"$STAGE/db/woll.dump"

# ── 2. Configuración y estado del host ──────────────────────
log "configuración del host"
mkdir -p "$STAGE/etc" "$STAGE/home" "$STAGE/meta" "$STAGE/docker"

copy_path() {
  local src="$1" dest="$2"
  if [ -e "$src" ]; then
    mkdir -p "$(dirname "$dest")"
    cp -a "$src" "$dest"
  fi
}

copy_path "$ROOT/.env" "$STAGE/etc/woll/env"
copy_path "$ROOT/.env.backup" "$STAGE/etc/woll/env.backup"
copy_path "$ROOT/.env.ops" "$STAGE/etc/woll/env.ops"
copy_path "$ROOT/rag/manifest.json" "$STAGE/srv/rag/manifest.json"
copy_path "$ROOT/rag/inbox" "$STAGE/srv/rag/inbox"
copy_path "$ROOT/geojson/uploads" "$STAGE/srv/geojson/uploads"
copy_path "$ROOT/geojson/private" "$STAGE/srv/geojson/private"
copy_path /etc/woll/gcp-sa.json "$STAGE/etc/woll/gcp-sa.json"

copy_path /etc/ssh/sshd_config.d "$STAGE/etc/ssh/sshd_config.d"
copy_path /etc/cloud/cloud.cfg.d "$STAGE/etc/cloud/cloud.cfg.d"
copy_path /etc/ufw "$STAGE/etc/ufw"
copy_path /etc/fail2ban "$STAGE/etc/fail2ban"
copy_path /etc/docker/daemon.json "$STAGE/etc/docker/daemon.json"
copy_path /etc/sysctl.d/99-woll.conf "$STAGE/etc/sysctl.d/99-woll.conf"
copy_path /etc/apt/apt.conf.d/20auto-upgrades "$STAGE/etc/apt/apt.conf.d/20auto-upgrades"
copy_path /etc/systemd/journald.conf.d "$STAGE/etc/systemd/journald.conf.d"
mkdir -p "$STAGE/etc/systemd/system"
cp -a /etc/systemd/system/woll-* "$STAGE/etc/systemd/system/" 2>/dev/null || true
copy_path /home/deploy/.ssh "$STAGE/home/deploy/.ssh"

# Certificados y webroot de certbot (volúmenes Docker).
copy_path /var/lib/docker/volumes/woll_letsencrypt/_data "$STAGE/docker/woll_letsencrypt"
copy_path /var/lib/docker/volumes/woll_certbot_www/_data "$STAGE/docker/woll_certbot_www"

# ── 3. Metadatos para reconstruir ───────────────────────────
log "metadatos"
{
  echo "hostname: $(hostname)"
  echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "kernel: $(uname -r)"
  echo "git_head: $(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo desconocido)"
  echo "git_branch: $(git -C "$ROOT" branch --show-current 2>/dev/null || echo desconocido)"
} >"$STAGE/meta/host.txt"
dpkg --get-selections >"$STAGE/meta/dpkg-selections.txt" 2>/dev/null || true
docker images --digests >"$STAGE/meta/docker-images.txt" 2>/dev/null || true
systemctl list-timers --all --no-pager >"$STAGE/meta/timers.txt" 2>/dev/null || true

# ── 4. Empaquetar y cifrar ───────────────────────────────────
log "empaquetando"
tar -czf "$ARCHIVE" -C "$STAGE" .
BYTES_RAW="$(wc -c <"$ARCHIVE" | tr -d ' ')"

log "cifrando con GPG"
gpg --batch --yes --symmetric --cipher-algo AES256 \
  --passphrase-file "$PASS_FILE" --output "$OUT" "$ARCHIVE"
rm -f "$ARCHIVE"
chmod 600 "$OUT"
(cd "$BACKUP_DIR" && sha256sum "$(basename "$OUT")" >"$(basename "$OUT").sha256")
chown deploy:deploy "$OUT" "$OUT.sha256" 2>/dev/null || true
BYTES="$(wc -c <"$OUT" | tr -d ' ')"

# ── 5. Retención ─────────────────────────────────────────────
mapfile -t FILES < <(
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'woll-full-*.tar.gz.gpg' \
    -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-
)
if (( ${#FILES[@]} > KEEP )); then
  for old in "${FILES[@]:KEEP}"; do
    rm -f "$old" "${old}.sha256"
  done
fi

log "ok file=$OUT raw_bytes=$BYTES_RAW bytes=$BYTES"
log "descarga: scp woll-vps:$OUT ."
log "verifica: sha256sum -c $(basename "$OUT").sha256"
log "descifra: gpg --decrypt $(basename "$OUT") > $(basename "$OUT" .gpg)"
