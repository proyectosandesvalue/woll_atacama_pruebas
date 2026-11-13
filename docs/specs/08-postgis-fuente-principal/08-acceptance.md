# Spec 08 — Gate de aceptación automatizado

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 08 / 30 |
| **Estado de la spec** | CERRADA (gate del Sprint 08; 13/13 checks en local) |
| **Tamaño** | Pequeño |
| **Duración estimada** | 2 h |
| **Dependencias** | 08-A/B/C/D/E, stack local o VPS con tiles publicados |
| **Última revisión** | 2026-11-13 |

## 1. Objetivo

Tener un comando repetible que valide la migración del Sprint 08 sin revisar
manualmente cada capa: manifiestos, configs, tiles estáticos y on-demand,
tabla/features, filtros, búsqueda, orden y export.

## 2. Uso

```bash
# Stack local o VPS levantado, con tiles generados.
npm run acceptance:08

# Otro host/puerto y comparación SQL opcional:
ACCEPTANCE_BASE_URL=https://visor.example.org \
DATABASE_ADMIN_URL=postgres://... \
  npm run acceptance:08
```

`DATABASE_ADMIN_URL` es opcional: si está, compara el filtro con SQL; si no,
compara API/tabla/export entre sí.

## 3. Checks

| # | Check | Qué valida |
|---|---|---|
| 1 | `tiles/index.json` | ≥40 capas y todos los manifests existen |
| 2 | Configs `source` | ≥40 `urlTemplate` apuntan a manifests existentes |
| 3 | Tile estático | 200, MIME MVT y bytes > 0 |
| 4 | Tile on-demand | 200, MIME MVT y bytes > 0 |
| 5 | On-demand fuera de cobertura | 204 |
| 6 | Features + paginación | `total` = `feature_count` del manifest, `returned=limit` |
| 7 | Filtro `ZONA_1=ZP` | total >0 y < total general; `total=returned` |
| 8 | SQL del filtro | si hay BD, `count(*)` coincide con la API |
| 9 | Búsqueda + orden | `search`, `sort`, `order` reflejados y con resultados |
| 10 | Feature puntual | Feature con geometría (`MultiPolygon`) |
| 11 | Export CSV | líneas = total + 1 |
| 12 | Export GeoJSON filtrado | features = total filtrado |
| 13 | Allowlist de export | columna `geom` → 400 |

Salida: `13/13 PASS` y exit 0; cualquier fallo deja exit 1.

## 4. Limitaciones

- Depende de que el stack y los tiles estén publicados; no corre en el CI base
  (que no tiene stack ni `tiles/`).
- Usa `borde_costero` como capa de referencia y el filtro `ZONA_1=ZP`.
- Los conteos no están hardcodeados: se comparan manifest/API/BD/export.
- No valida estilos/popups en el navegador (eso es manual o E2E futuro).

## 5. Cierre

- Horas reales: 1.
- Medición local: **13/13 PASS**.
- Pendiente: extender el gate a una muestra por dimensión y a versiones
  (2024/2026) cuando existan.
