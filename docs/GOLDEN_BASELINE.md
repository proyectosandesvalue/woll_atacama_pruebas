# Línea base del golden set (2026-10-19)

**Antes de iniciar Sprint 40-A.**

- Total: 28 casos
- Pass: 24
- Fail: 4

## Fallos documentados

1. `smoke-list-humedales` — geojson_required=true, no hay geojson (no determinismo)
2. `core-filter-derechos-consuntivos-copiapo` — sin tools, sin filtro, sin geojson (bug 40-A)
3. `core-error-columna-inexistente` — graceful_error no menciona el error
4. `core-truncamiento-todos-derechos` — truncated no es true (total_count no llega)

## Objetivo tras Sprint 40-A

- `core-filter-derechos-consuntivos-copiapo` debe pasar (tools + filtro + geojson).
- Los otros 3 fallos se resuelven en 40-B, 40-C y 40-D respectivamente.