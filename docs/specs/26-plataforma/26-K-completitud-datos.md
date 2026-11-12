# Spec 26-K — Completitud local de datos, RAG/ingesta y dump v2

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 26-K |
| **Estado de la spec** | DRAFT (plan aprobado en conversación; falta ejecución) |
| **Tamaño** | Mediano-grande (8-10h) |
| **Dependencias** | 26-E (dump v1 restaurado), 26-D (Compose/Nginx), 17/18 (RAG) |
| **Bloquea** | 26-F (staging), 26-I (corte) |
| **Última revisión** | 2026-11-11 |

## 1. Objetivo

Usar el stack local completo como entorno de trabajo real: restaurar el dump v1
de Supabase, auditar la estructura, cargar las capas que no se pudieron cargar
en Supabase, probar RAG e ingestas contra PostgreSQL propio, y generar un
**dump v2 candidato** (no definitivo) para staging y corte.

El dump v1 es la base de trabajo, no el entregable final.

## 2. Alcance

**Dentro**

- Levantar `postgres` + `api` + `nginx` con Compose (dev) y restaurar el dump
  v1 en una base local dedicada.
- Aplicar baseline 000-035 y migraciones 036-040; verificar `check:rpcs` y
  `db:verify` local.
- Auditoría de estructura:
  - schemas, extensiones y schema de PostGIS (`public` vs `extensions`);
  - tablas, columnas, tipos, SRID, índices GIST, RLS, roles/grants;
  - `rag.*`, `ingest.*`, `admin.*`, `chat.*`;
  - conteos, secuencias, geometrías inválidas y tamaño por tabla;
  - cobertura de capas: `allTemasConfig` vs tablas físicas vs `geojson/` vs
    `chat_catalog`.
- Cargar las capas faltantes con `scripts/load-layer.mjs` (GeoJSON o Shapefile)
  y verificar catálogo, stats, tabla, zoom, filtros, cluster/heatmap y descarga.
- Probar RAG: esquema 036, ingesta de un documento de prueba, recuperación y
  evaluación básica con `RAG_DATABASE_URL`.
- Probar al menos una ingesta real (`ingest-run.mjs`) contra la BD local.
- Generar `backups/woll-v2-<timestamp>.dump` + checksum, restaurarlo en una base
  limpia y verificar que `db:verify` local pasa.
- Decidir y documentar el schema de PostGIS para el v2.

**Fuera**

- Cargar las ~71 capas definitivas si el inventario muestra más trabajo: se
  cargan las faltantes identificadas y se documenta el resto.
- Corte a producción (26-I).
- Backups continuos y hardening (26-G/H).
- Re-ingesta completa del corpus RAG si no hay PDFs/licencias; se prueba el
  pipeline con un documento controlado.

## 3. Entorno local

- PostgreSQL 17.11 + PostGIS 3.7 + pgvector 0.8.7 (`woll/postgres:17`).
- API Node y Nginx del Compose (26-D).
- Base de trabajo: `woll_local` o `woll_migracion` (decidir en la ejecución).
- Puertos locales sugeridos si 5432/3000/8080 están ocupados:
  `POSTGRES_PORT=55437`, `API_PORT=3040`, `NGINX_PORT=8090`.
- `DATABASE_URL_DOCKER=postgres://postgres:<local>@postgres:5432/woll_local`.
- El dump v1 se restaura con `scripts/restore-local.sh`; el script ya filtra
  `SCHEMA` y `public.spatial_ref_sys`.
- `DATABASE_ADMIN_URL`/`TARGET_DATABASE_URL` apuntan a la base local.

## 4. Auditoría de estructura

Crear `scripts/audit-db.mjs` (o extender `verify-migration`) que genere un
reporte Markdown/JSON con:

- Versión de PostgreSQL, PostGIS, pgvector, unaccent.
- Schema de PostGIS (`extensions` o `public`) y por qué.
- Schemas, dueños, roles y grants.
- Tablas por schema, filas, tamaño, columnas, tipos.
- Tablas con `geom`: tipo, SRID, GIST, inválidas, `wrong_srid`.
- Secuencias y último valor.
- RPCs del registro y overloads.
- RAG: documentos, chunks, dimensión de embeddings, estado.
- Ingest: fuentes, endpoints, runs, valores por indicador.
- Cobertura de capas:
  - capas no WMS de `allTemasConfig`;
  - archivos de `geojson/`;
  - tablas de `public`;
  - filas de `chat_catalog`;
  - lista de faltantes con archivo fuente y tipo.

**Decisión PostGIS:** `public` y `extensions` son válidos. Se mantiene `public`
mientras se audita porque el dump v1 usa `public.geometry`. Si se decide mover a
`extensions`, se hace con una migración/re-dump planificado, no a mano.

## 5. Capas faltantes

- Cargar cada faltante con `load-layer` (GeoJSON preferido; Shapefile vía
  `ogr2ogr`).
- Verificar: filas, GIST, catálogo, stats y paridad visual.
- Para capas WMS/Copernicus no se carga tabla; se documenta que siguen por WMS.
- Si una capa no tiene fuente local ni tabla, se marca como deuda y no se
  inventa.

## 6. RAG e ingestas

- RAG:
  - `036` aplicada; `rag.documents`/`rag.chunks` existen.
  - Configurar `RAG_DATABASE_URL` y un proveedor de embeddings (local/OpenAI).
  - `npm run ingest:dry` primero; luego una ingesta controlada con un PDF de
    `rag/inbox/` o un fixture.
  - Verificar `rag.documents`/`rag.chunks`, dimensiones y recuperación.
- Ingesta:
  - Elegir un endpoint de `ingest.endpoints` que no requiera credenciales
    nuevas o usar uno de prueba.
  - `node --env-file=.env.local scripts/ingest-run.mjs --endpoint ...`.
  - Verificar `ingest.runs`, `ingest.indicator_values` y que no duplique.
- No se cargan datos personales ni contenido sin licencia.

## 7. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | el Compose local | se levanta | PostgreSQL/API/Nginx healthy | `stack:up` + `/healthz` |
| CA-2 | el dump v1 | se restaura | 90 tablas/71 capas/1.4M valores | conteos |
| CA-3 | la base local | se corre baseline + 036-040 | `check:rpcs` 48/48 | script |
| CA-4 | la base local | se audita | reporte con estructura, capas faltantes y decisión PostGIS | `audit-db` |
| CA-5 | las capas faltantes identificadas | se cargan | tabla, GIST, catálogo y stats correctos | SQL + visor |
| CA-6 | el RAG | se ingesta un documento de prueba | documento/chunks y recuperación funcionan | SQL + test |
| CA-7 | una ingesta | se ejecuta contra la BD local | run exitoso y valores sin duplicados | logs + SQL |
| CA-8 | la base local completa | se genera el dump v2 | dump + checksum; restore limpio y `db:verify` OK | scripts |
| CA-9 | la decisión PostGIS | se documenta | `public` o `extensions` con justificación y migración si aplica | ADR/spec |

## 8. Tests

- Auditoría y conteos contra la base restaurada.
- `load-layer` con un GeoJSON de prueba y con las capas faltantes.
- RAG: dry-run, ingesta controlada y consulta de recuperación.
- Ingesta: un endpoint de prueba y verificación de runs.
- Dump v2 + restore en base limpia + `check:rpcs` + `db:verify`.
- `npm test` y `npm run lint`.

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Mover PostGIS de `public` a `extensions` rompe tipos/funciones | Auditar primero; si se mueve, migración planificada y re-dump |
| Capas sin fuente local | Marcarlas como deuda; no inventar datos |
| RAG sin embeddings/PDFs | Probar con fixture; documentar credenciales faltantes |
| Ingesta duplica valores | Unique constraints + `ON CONFLICT` + conteos |
| El dump v2 incluye basura de pruebas | Base limpia, auditoría y `db:verify` antes del dump |
| El stack local choca con puertos ocupados | Variables `POSTGRES_PORT`/`API_PORT`/`NGINX_PORT` |

## 10. Reversión

El dump v1 y Supabase siguen intactos. Si el v2 falla, se descarta y se vuelve
al v1. No se toca producción.

## 11. Cierre

- **Estado:** DRAFT / pendiente de ejecución.
- **Horas reales:** pendiente.
- **Dump v2:** pendiente.
- **Decisión PostGIS:** pendiente de auditoría.
