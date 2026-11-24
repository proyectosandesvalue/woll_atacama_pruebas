#!/usr/bin/env bash
# Compose del VPS: base + producción + overlay de Vertex AI.
#
# Existe para que nadie olvide el overlay: si se recrea la API sin él, el chat
# queda sin GOOGLE_APPLICATION_CREDENTIALS y falla con "Could not load the
# default credentials".
#
# Uso:
#   deploy/vps/compose.sh up -d --build
#   deploy/vps/compose.sh ps
#   deploy/vps/compose.sh logs -f api
#
# Requiere GCP_SA_FILE en /srv/woll/.env (ruta absoluta al JSON de la service
# account) y el archivo montado en el contenedor como /run/secrets/gcp-sa.json.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

exec docker compose \
  --project-directory "$ROOT" \
  --env-file "$ROOT/.env" \
  -f "$ROOT/docker-compose.yml" \
  -f "$ROOT/docker-compose.prod.yml" \
  -f "$ROOT/docker-compose.vertex.yml" \
  "$@"
