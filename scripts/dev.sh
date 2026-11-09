#!/usr/bin/env bash
# Levanta Vercel dev + el proxy persistente de Copernicus.
# Uso: npm run dev
set -euo pipefail

cd "$(dirname "$0")/.."

node --env-file=.env.staging scripts/dev-proxy.mjs &
PROXY_PID=$!

cleanup() {
  kill "$PROXY_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

sleep 1
if ! kill -0 "$PROXY_PID" 2>/dev/null; then
  echo "[dev] el proxy de Copernicus no arrancó. Revisa el puerto 3001 y .env.staging." >&2
  exit 1
fi

echo "[dev] proxy Copernicus en http://localhost:3001/api/proxy"
npx vercel dev
