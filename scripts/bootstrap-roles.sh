#!/usr/bin/env bash
# Wrapper de scripts/bootstrap-roles.mjs.
# Lee DATABASE_ADMIN_URL, WOLL_API_PASSWORD y WOLL_INGEST_PASSWORD desde
# .env.local (o el archivo indicado en ENV_FILE).
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.local}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[bootstrap-roles] no existe $ENV_FILE" >&2
  exit 2
fi

node --env-file="$ENV_FILE" scripts/bootstrap-roles.mjs
