# CHANGELOG.md — Historial de cambios

> Lo que ya se hizo. El plan hacia adelante vive en `docs/ROADMAP.md`; las decisiones, en `docs/DECISIONS/`.
> Este archivo **reemplaza a `IMPLEMENTATION.md`** y a la lista "Bugs conocidos" de `AGENTS.md`.
>
> **Nota de numeración.** Antes del ROADMAP existían tres esquemas de nombres ("Fase 1", "Sprint 1-7.1" en IMPLEMENTATION y "Sprint 1-5" en AGENTS). Para no chocar con los Sprint 01-21 del ROADMAP, las etapas anteriores se renombran aquí **E0-E7**.

| Etapa | Antes se llamaba | Tema |
|---|---|---|
| E0 | Fase 1 | Chat con tool-calling sobre Supabase |
| E1 | Sprint 1 | Bugs críticos, XSS, WMS |
| E2 | Sprint 2 | Bugs funcionales y validación de config |
| E3 | Sprint 3 | Huérfanos y defaults |
| E4 | Sprint 4 | Arquitectura e infraestructura |
| E5 | Sprint 5 (+5.1) | Charts, limpieza de chat, validaciones |
| E6 | Sprint 6 (+6.3, 6.4) | Geoprocesos espaciales en el chat |
| E7 | Sprint 7.1 | Prompt con las 8 tools |

---

## Índice

- [Unreleased](#unreleased)
- [Bloque 2 — ROADMAP (Sprint 01 en adelante)](#bloque-2--roadmap-sprint-01-en-adelante)
  - [Proxy de servicios externos](#proxy-de-servicios-externos-2026-11-06)
  - [Sprint 17 — Ingesta RAG](#sprint-17--ingesta-rag-2026-11-05)
  - [Sprint 06-A — Backend geoespacial](#sprint-06-a--backend-geoespacial-2026-10-05)
  - [Sprint 05 — Multi-chart agnóstico](#sprint-05--multi-chart-agnóstico-2026-10-03)
  - [Sprint 04 — Rate limiting + filtros de dominio](#sprint-04--rate-limiting--filtros-de-dominio-2026-10-03)
  - [Sprint 03 — Refactor de tools + tests](#sprint-03--refactor-de-tools--tests-2026-10-03)
  - [Sprint 02 — Contratos y ADRs](#sprint-02--contratos-y-adrs-2026-10-02)
  - [Sprint 01 — Setup de staging](#sprint-01--setup-de-staging-2026-10-02)
- [Bloque 1 — Pre-ROADMAP (E0-E7)](#bloque-1--pre-roadmap-e0-e7)
  - [E7 — Prompt con las 8 tools](#e7--prompt-con-las-8-tools)
  - [E6 — Geoprocesos espaciales en el chat](#e6--geoprocesos-espaciales-en-el-chat)
  - [E5 — Mejoras puntuales (+ hotfix 5.1)](#e5--mejoras-puntuales--hotfix-51)
  - [E4 — Arquitectura e infraestructura](#e4--arquitectura-e-infraestructura)
  - [E3 — Huérfanos y defaults](#e3--huérfanos-y-defaults)
  - [E2 — Bugs funcionales y coherencia](#e2--bugs-funcionales-y-coherencia)
  - [E1 — Bugs críticos](#e1--bugs-críticos)
  - [E0 — Fase 1: chat con tool-calling sobre Supabase](#e0--fase-1-chat-con-tool-calling-sobre-supabase)
- [Cambios incompatibles](#cambios-incompatibles)
- [Superado por documentos actuales](#superado-por-documentos-actuales)
- [Versiones](#versiones)

---

## [Unreleased]

### Added
- **Sprint 08-B: piloto de tiles en el visor.** `borde_costero` se sirve con `leaflet.vectorgrid@1.3.0` vendorizado (`js/lib/Leaflet.VectorGrid-1.3.0.min.js`) desde `/tiles/borde_costero/2026/...`, con popup, zoom por manifest, categorías ocultas, filtros y opacidad. No descarga el GeoJSON al activarse.
- **Endpoint `GET /api/layer-features`:** devuelve una FeatureCollection desde la tabla física del catálogo (`layer_id`, `limit`, `offset`, `include_geometry`). Sin geometría por defecto: la tabla de `borde_costero` pasa de 32 MB a ~560 KB. La tabla, los filtros y el CSV lo usan con fallback al GeoJSON.
- **Sprint 08-C parcial:** 28 capas no-punto adicionales con `source` (hidrografia, humedales, cuencas_dga, 3 decretos de escasez, zonas_climaticas, 2 planes reguladores costeros, unidades_geomorfologicas, capacidad_uso_suelo, 2 capas de energia, acuiferos, glaciares, lagunas, salares, territorios operacionales, desaladoras, bienes nacionales, areas protegidas, catastro fruticola, red de canales, limite comunal, potencial eolico/solar, PRC Caldera y red ferroviaria). Total: 29/40 capas no-punto con tiles. El límite de propiedades de la tabla sube a 5.000.
- Tests del handler de features (validación, 404, límites, geometría opcional).
- Nginx dev sirve JS/CSS con `no-cache` para ver cambios sin hard reload (producción mantiene 7 días).

- **Sprint 08-0/08-A: tiles MVT pregenerados.** `scripts/build-tiles.mjs` genera `tiles/<layer>/<version>/<z>/<x>/<y>.mvt` desde PostGIS con simplificación por zoom, feature ids, manifest/checksum y maxzoom adaptativo (20.000 tiles). Materializa la geometría 3857 una vez por zoom y calcula la cobertura real por feature: ~8-11 ms/tile (antes ~40 ms) y sin consultar tiles vacíos.
- **Sprint 08-G: ciclo de vida de tiles.** `scripts/tiles-sync.mjs` publica por lote, detecta capas nuevas/editadas con `chat_catalog.updated_at`, mantiene `tiles/index.json`, verifica manifests contra archivos y BD (`--check`) y aplica retención (`--prune --keep`). `load-layer --tiles` encadena alta + generación.
- **Nginx `/tiles/`:** MIME `application/vnd.mapbox-vector-tile`, `Cache-Control: immutable`, gzip y `try_files` (404 real, sin fallback a la SPA). `tiles/` queda fuera de git y de la imagen de la API.
- **Mediciones 08-0:** `borde_costero` 382 features → 2.887 tiles / 7,8 MB (GeoJSON 47 MB / gzip 15,3 MB); `humedales` → 2.518 tiles / 3,6 MB (GeoJSON 24,1 MB); `hidrografia` → 7.232 tiles / 12,0 MB. Puntos: 920 derechos → 8,2 MB de tiles vs 0,19 MB gzip, por lo que se quedan en GeoJSON/API. **Corrida completa:** 41 capas, 88.152 tiles, 146,6 MB lógicos y 393 MB en disco; 7 capas regionales degradadas a z13; 27 puntos, 2 WMS y 1 tabla vacía omitidos. `tiles:check` valida las 41 versiones en 10 s. Specs `08-0-spike.md`, `08-A-pipeline-tiles.md` y `08-G-ciclo-vida-capas.md`.
- **Tests:** `scripts/__tests__/build-tiles.test.js` (cálculo de tiles, tolerancias, maxzoom, manifest/checksum, args, versiones) y test de integración opt-in con `TILES_TEST_DATABASE_URL`. `npm test` incluye `scripts/**/*.test.js`.
- **Scripts npm:** `tiles:build`, `tiles:sync`, `tiles:check`.

- 16 capas satelitales de Copernicus: EVI, EVI2, GNDVI, SAVI, MSAVI2, VARI, MCARI, PSRI, NDYI y ARI_1 en Agricultura; MSI y MDMI en Clima; NDWI, NDCI y WIW en Agua; SWIR en Minería. Cada una con ficha, leyenda y selector de fecha.
- `js/config/copernicusLayer.js`: ficha común de las capas Copernicus (fecha, nubosidad, bandas RGB y nota).
- Selector de fecha de Copernicus: navegación histórica desde 2017-01-01, disponibilidad WFS por mes con caché, marcas azules y leyenda con el número de fechas del mes visible.
- Proxy persistente de desarrollo: `scripts/dev-proxy.mjs` (`npm run dev:proxy`), `js/config/proxy.js`, `npm run dev` y `PROXY_PORT`/`PROXY_DEV_CONCURRENCY` en `.env.example`.
- Test `server/config/copernicus-layers.test.js`: valida ficha, leyenda, servicio y grupo de cada capa Copernicus.
- Instrumentación de latencia del chat (25-B): `server/chat/timing.js`, flag `CHAT_TIMING_ENABLED` y logs JSON `chat.timing` con etapas (`catalog`, `classifier`, `router`, orquestador L1/L2, tools, finish).
- Runner `scripts/run-golden-set.mjs`: `--limit`, medición por caso y resumen p50/p95/mean; `skipUnansweredLog` para no escribir en la BD durante la evaluación.
- Baseline de 20 preguntas en `docs/chat-latency-baseline.md` (p50 3.553 ms, p95 15.234 ms en producción; 19/20 PASS, un fallo no determinista).
- ADR 023 (25-F): streaming SSE; fase 1 de eventos de estado aceptada y fase 2 de tokens diferida hasta tener concurrencia global, tools <2 s y proxy persistente.
- Fix de proximidad: `db/migrations/037_proximity_geography.sql` con índice GIST funcional `((geom::geography))`, funciones reescritas para proyectar `geog` y `statement_timeout = 5s`.
- `server/db/context.js` + `supabase.js`/`withTimeout`: el `AbortSignal` del timeout ahora aborta la request a PostgREST; tests de contexto y timeout.
- Prueba en transacción: `count_near_layer` 9.541 ms → 580 ms; `aggregate_near_layer` 9.306 ms → 759 ms.
- Verificado en producción tras aplicar 037: RPC count 1.799 ms, aggregate 785 ms; caso remoto `core-proximidad-derechos-rio` 19.743 ms → 11.211 ms. El cuello restante es LLM/orquestación.
- Router de proximidad: `layer_id_targets` se normaliza a array y el prompt incluye un ejemplo consistente. El caso remoto baja a 3.763 ms (ruta `router`).
- Caché de `chat_catalog` (5 min), rate limit IP+sessión y semáforo LLM con cola/`503 Retry-After`.
- Concurrencia en producción: 10/10 y 20/20 requests 200; p95 5,45 s y 10,03 s; sin 429/503.
- Fast path de proximidad (`server/chat/classifier-fast.js`): evita catálogo y clasificador LLM en preguntas explícitas sin historial.
- Pruebas de concurrencia: caso único 2.259 ms; 20 proximidad p95 5.581 ms; 20 orquestador p95 8.895 ms; 30 proximidad p95 11.328 ms; sin 429/503.
- Tests: 317 (316 pasan con BD de integración, 1 omitido; sin BD, 10 tests de integración y 1 de RAG se omiten).
- Sprint 25 cerrado (25-A/B/C/D/E/F); baseline de latencia y decisión de streaming documentadas.

### Fixed
- **“Ver tabla de Atributos” no abría la tabla:** el botón existía en el menú de capa pero `layerItem.js` no le había asociado el listener. Se agregó.
- **`leaflet.vectorgrid` con Leaflet 1.9:** la librería llamaba a `L.DomEvent.fakeStop` (eliminado en 1.9), lo que lanzaba `TypeError` y cerraba el sidebar al hacer clic en un feature. Se parcheó el bundle y se agregó un shim.
- **Popup de `borde_costero`:** el campo `"Origen Data"` no coincidía con la propiedad real `"Origen Dato"`; se corrigió en la config.
- **Portabilidad de migraciones (26-C):** `021_fix_filters_robust.sql` usaba `sql :=` sin declarar `sql text;` en `chat_layer_features`; no compilaba en una base nueva. Se agregó la declaración para permitir reproducir `000-037`. En Supabase ya estaba aplicada y no se re-ejecuta.
- `server/chat/tools/list-climate-stations.js`: faltaba el `import { getDB }`; la tool fallaba en runtime con `ReferenceError`.
- `scripts/build_catalog.mjs`: excluye las capas WMS (`tipo/type === "wms"`) para que no se registren como tablas PostGIS inexistentes en `chat_catalog`.
- Lint: resueltos los 9 errores preexistentes (`flatpickr` global, `while (true)` en el orquestador, escapes innecesarios en adapters). `npm run lint` queda en 0 errores.

### Changed
- **Sprint 26-K reclasificado (2026-11-13):** stack local, dump v1 y auditoría quedan cerrados; las capas faltantes, la ingesta RAG y el dump v2 se difieren al panel admin (Sprints 15/16) para probarlos como flujo real. 26-K queda parcial y deja de bloquear el Sprint 08.
- **Sprint 08 en ejecución:** 08-0 (mediciones de generación), 08-A (pipeline/Nginx) y 08-G (ciclo de vida) parcialmente cerrados; falta el cliente de tiles, los endpoints de tabla/agregados y la prueba de carga. Duración revisada a 56-64h.
- **Spec 08 revisada (2026-11-12):** con el inventario real, el camino principal pasa a **MVT pregenerado y versionado servido por Nginx** para capas estáticas/edición; **on-demand** solo para valores dinámicos y filtros arbitrarios. Estaciones con geometría estática y valores por API; cluster/heatmap cliente ≤5.000 puntos y server-side >5.000. Duración 52-60h. Hace viable el VPS 4 vCPU/8 GB; el disco es el recurso a medir.
- **Decisión de infraestructura (ADR 005):** el destino final es un VPS propio; Vercel + Supabase quedan como demo/staging. Supabase en límite (~913 MB) y Vercel Hobby insuficiente. No se invierte en infraestructura específica de Vercel no portable.
- **Disparador de migración:** la imagen Docker de PostgreSQL (PostGIS + pgvector) inicia la migración. Desde ese commit, Docker/VPS es el entorno de desarrollo, Vercel + Supabase quedan congelados y la imagen local se replica en el servidor.
- **Spec 08 revisada:** corrige el supuesto de que "la BD es más liviana" (el ahorro real viene de MVT, paginación, filtros server-side y caché; el VPS se dimensiona para tiles/DB) y exige paridad de opciones de capa: tabla de atributos, zoom a capa/feature, filtros, cluster, heatmap y descarga. Se agrega el tramo 08-F, la dependencia del Sprint 26 y la duración 48-58h.
- **Spec 08 aprobada (2026-11-10):** M1 (puntos por GeoJSON bbox + agregados server-side), M2 (ruta Node `ST_AsMVT` + caché Nginx) y M7 (umbral 5.000 puntos) como decisiones iniciales a validar en el spike. Ejecución bloqueada hasta cerrar el Sprint 26.
- **ADR 006 (Postgres propio):** instancia única, schemas `public`/`chat`/`admin`/`ingest`/`rag`, PostGIS en `public` y pgvector/unaccent en `extensions`, roles `woll_api`/`woll_ingest` sin `BYPASSRLS` y migraciones con checksum.
- **Imagen PostgreSQL 26-C:** PostgreSQL 17.11 + PostGIS 3.7.0 + pgvector 0.8.7, versiones fijadas con `ARG`; Compose base y runner de migraciones con checksum.
- **Spec madre 26 aprobada (2026-11-10):** plataforma propia con PostgreSQL/PostGIS/pgvector, servidor Node persistente, Nginx, paridad de los 10 endpoints, migración de datos, ingestas por systemd timers, staging, backups, hardening y corte. Duración 42-46h; 26-J agregado al roadmap. Arranca 26-C.
- Documentación sincronizada con el código: 13 tools (9 de capas + 4 de clima), 71 GeoJSON, Node 20.6+, sprints 06/23/06-B.7 cerrados en el roadmap.
- `package.json` v2.1.0: scripts `catalog`, `smoke:db`, `smoke:chat`, `eval:chat` y `lint:fix` (antes solo documentados en `AGENTS.md`).
- `README.md` y `docs/ROADMAP.md`: bloques de código, encabezados y tablas reparados.
- Textos de NDVI, MSAVI2, VARI, MCARI, PSRI, NDYI, NDWI, NDCI, MSI y SWIR alineados a lenguaje no especialista, con rangos e interpretación por tramos.
- Documentación: `ARCHITECTURE.md` §3 (capas satelitales), `DEV_GUIDE.md` §3.8 (agregar indicador), `README.md`, `AGENTS.md`, `ROADMAP.md` (Sprint 44) y `docs/specs/44-indicadores-copernicus.md`.
- ROADMAP: 25-A/C/D/E cerrados; 22-A/E cerrados; 09-A semi-resuelto (Copernicus cubre indicadores; NASA WMS 30 m y lectura raster pendientes); 09-C redefinido como implementación de capas meteorológicas dinámicas; 09-D pasa a optimización; 37 diferido; eliminado el duplicado de Sprint 37.

## [Sprint 26-K] — 2026-11-12

### Added
- `scripts/audit-db.mjs` y `npm run audit:db`: estructura, extensiones/PostGIS, tablas, geometrías, RLS, roles, RAG/ingest y cobertura de capas.
- Stack local PostgreSQL 17.11 + API + Nginx con el dump v1 restaurado.

### Audit (v1)
- PostgreSQL 17.11; PostGIS 3.7 en `public`; pgvector 0.8.7 y unaccent en `extensions`.
- 90 tablas, 71 capas, 69 tablas con geometría, 37 inválidas, 0 SRID distinto.
- 1.425.842 valores de ingest, 7 fuentes, 4 endpoints, 523 estaciones.
- RAG vacío (0 documentos/chunks).
- 68 capas de config con tabla/catálogo; 49 capas dinámicas; 2 GeoJSON huérfanos.
- Decisión PostGIS: se mantiene `public` por ahora; mover a `extensions` requiere migración/re-dump.

### Pending
- Cargar capas faltantes, probar RAG/ingesta y generar dump v2.

## [Sprint 26-E] — 2026-11-11

### Added
- `scripts/dump-supabase.sh`: dump custom de schemas de aplicación, con checksum.
- `scripts/restore-local.sh`: bootstrap de `000_compat_roles.sql` + `pg_restore` seguro.
- `scripts/migrate.mjs --baseline`: marca migraciones ya presentes en un dump sin re-ejecutarlas.
- `scripts/extract-legacy-rpcs.mjs`: genera `039_legacy_rpcs.sql` desde Supabase.
- `scripts/verify-migration.mjs`: compara tablas, geometrías, secuencias, extensiones, roles y RPCs.
- `scripts/load-layer.mjs`: carga GeoJSON/Shapefile a PostGIS con SRID, GIST, catálogo y stats.
- `scripts/build_catalog.mjs`: soporte `DB_DRIVER=postgres` y `--only`.
- Scripts `db:dump`, `db:restore`, `db:verify`, `db:extract-rpcs`, `layer:load`.

### Changed
- `server/db/rpc-signatures.js`: agrega `chat_table_exists`, `chat_upsert_layer` y `chat_refresh_stats`.
- `buildRpcCall` serializa arrays `jsonb` como JSON (necesario para `p_attributes`, `p_values`).
- `.gitignore`: `backups/`, `*.dump`, `*.dump.sha256`.
- **Imagen destino PostgreSQL 17.11:** se actualizó de PostgreSQL 16 a 17.11 porque Supabase corre 17.11; PostGIS 3.7.0 en `public` y pgvector 0.8.7 en `extensions`. Migraciones 000-040 y tests verificados en PG17.

### Validated locally
- Dump real de Supabase (70 MB, checksum OK) restaurado en PostgreSQL 17.11: 90 tablas, 71 capas, 920 derechos de agua y 1.425.842 valores.
- `000` antes del restore, baseline 000-035 y migraciones 036-040.
- `check:rpcs` 48/48 y `verify-migration` local: 86 tablas, 69 geometrías, 72 secuencias, extensiones/roles/RPCs OK.
- `load-layer` con GeoJSON: tabla, GIST, catálogo y stats.
- `build_catalog --only` con PostgreSQL.
- `extract-legacy-rpcs` generó las 12 funciones reales desde el dump.

### Pending
- Comparar el Supabase vivo contra el destino con `db:verify` al promover staging (26-F).

## [Sprint 26-D] — 2026-11-11

### Added
- `docker/api/Dockerfile`: imagen Node 22 con `server/`, `scripts/` y `db/`, sin devDependencies y usuario `node`.
- `docker-compose.yml`: servicios `postgres`, `api`, `nginx` e `ingest` (perfil `tools`), red interna, volúmenes y healthchecks.
- `docker-compose.dev.yml`: puertos en loopback (PostgreSQL 5432, API 3000, Nginx 8080) y config Nginx sin TLS.
- `docker-compose.prod.yml`: Nginx 80/443, TLS, certificados y certbot (perfil `tls`).
- `deploy/nginx/`: config TLS, config dev, locations compartidas, proxy headers, caché de `/api/proxy` y `limit_req`.
- Scripts `stack:up`, `stack:down`, `stack:logs`.
- ADR 010 (borde Nginx).

### Changed
- `.env.example`: `DATABASE_URL_DOCKER`, `DOMAIN`, `CERTBOT_EMAIL`, `API_PORT`, `NGINX_PORT` y orígenes del VPS.
- Nginx sirve estáticos y deniega `docs`, `db`, `server`, `scripts`, `rag`, `docker`, `deploy`, `data`, dotfiles y archivos de repo.
- `/api/proxy` usa `proxy_cache` en disco; `/api/chat` y `/api/proxy` usan `limit_req`.

### Validation
- Compose dev/prod válido; stack dev con PostgreSQL, API y Nginx healthy.
- `/healthz` 200, `/api/stations-map` 200, `/api/chat` 400 con `{}`, `/docs` 404, `/.env.local` 403.
- Caché de Nginx servida con la API detenida (imagen idéntica).
- 40 requests a `/api/chat`: 32×400 y 8×429, sin 5xx.
- TLS autofirmado: `nginx -t` OK, `/nginx-health` por 443 y HSTS.
- API como usuario `node`, rootfs read-only y `/tmp` tmpfs.

## [Sprint 26-A] — 2026-11-11

### Added
- `server/index.js`: servidor Node persistente con timeouts, manejo de `clientError`, SIGTERM/SIGINT y cierre ordenado del pool.
- `server/app.js`: router, CORS por allowlist, lectura JSON con límite de 1 MB, errores uniformes y escritura de respuestas.
- `server/http/`: router, body, response, `HttpError` y adapter Vercel.
- `server/routes/`: chat, proxy, ARClim, estaciones, `/healthz` y `/readyz`.
- `server/handlers/arclim.js` y `server/handlers/stations.js`: lógica compartida entre Vercel y el VPS.
- `npm start` y `npm run dev:api`.

### Changed
- `api/arclim-geojson.js`, `api/stations-map.js`, `api/station-details.js`, `api/station-series.js`, `api/station-available-dates.js`, `api/variable-availability.js`, `api/variable-available-dates.js` y `api/historical-stations.js` delegan en handlers puros; ya no duplican lógica.
- CORS de esos endpoints pasa de `*` a la allowlist (`ALLOWED_ORIGINS`).

### Known gap
- `station-details` devuelve el fallback 200 porque `chat_station_details` aún no existe en la base creada desde migraciones; llega con el dump de 26-E.

## [Sprint 26-B] — 2026-11-10

### Added
- `server/db/drivers/postgres.js`: driver nativo con `pg.Pool`, `statement_timeout`, `query_timeout`, `rpc`, `query`, `ping` y `close`.
- `server/db/rpc-signatures.js`: registro cerrado de 48 RPCs con parámetros nombrados, casts explícitos y rechazo de SQL/parámetros no declarados.
- `scripts/check-rpc-signatures.mjs` y `npm run check:rpcs` para verificar que las RPCs existan en la base restaurada.
- Tests unitarios del registro y tests de integración del driver (10/10 contra PostgreSQL del Compose).

### Changed
- `server/db/pool.js` registra el driver `postgres` y expone `closeDB()`.
- `server/db/config.js` agrega `PG_APPLICATION_NAME`.
- `.env.example` documenta `PGPOOL_MAX`, timeouts y `TEST_DATABASE_URL`.

### Known gap
- `check:rpcs` detecta 12 RPCs heredadas que existen en Supabase pero no en `db/migrations/` (`chat_station_*`, `chat_historical_*`, `ingest_update_run`, `ingest_bulk_upsert_values`, etc.). Llegan con el dump de schemas en 26-E; el corte no se cierra hasta que `check:rpcs` pase.

## [Sprint 26-C] — 2026-11-10

### Added
- Imagen `docker/postgres/Dockerfile`: PostgreSQL 17.11 + PostGIS 3.7.0 + pgvector 0.8.7, versiones fijadas con `ARG` (actualizada desde PostgreSQL 16 en 26-E para igualar Supabase).
- `docker-compose.yml` base y `docker-compose.dev.yml` con PostgreSQL en `127.0.0.1:5432`.
- `db/migrations/000_compat_roles.sql`: PostGIS en `public`, pgvector/unaccent en `extensions`, roles `woll_api`/`woll_ingest` y roles de compatibilidad `anon`/`authenticated`/`service_role`.
- `scripts/migrate.mjs` con checksum, `--status`, `--dry-run` y `--to`; scripts `npm run migrate` y `npm run migrate:status`.
- `scripts/bootstrap-roles.sh` + `scripts/bootstrap-roles.mjs` para habilitar LOGIN con passwords desde `.env`.
- `db:up`/`db:down` para el PostgreSQL local.
- `RAG_DATABASE_URL` para separar el rol de ingesta RAG del rol del API.

### Changed
- `.env.example`: `DB_DRIVER=postgres` por defecto y variables `POSTGRES_*`, `DATABASE_URL`, `DATABASE_ADMIN_URL`, `WOLL_*_PASSWORD`.
- `scripts/ingest_docs.mjs` prefiere `RAG_DATABASE_URL` y cae a `DATABASE_URL`.
- Documentación de setup local (README, DEV_GUIDE, ARCHITECTURE, AGENTS) apunta a Docker/PostgreSQL.

### Fixed
- `021_fix_filters_robust.sql`: `chat_layer_features` usaba `sql :=` sin declarar `sql text;`; no compilaba en una base nueva. Corregido con aprobación; Supabase no se re-ejecuta.

### Tests
- 258 tests (257 pasan, 1 omitido); runner de migraciones con 5 tests unitarios.
- Validación con Podman: 34 migraciones aplicadas dos veces, extensiones y roles verificados, login de `woll_api`/`woll_ingest` probado.

## [Sprint 42] — 2026-11-04

### Added
- **Integración de Proyecciones Climáticas ARClim**: Ingesta de 5 variables (Días Calurosos, Temp. Máxima, Temp. Mínima, Heladas, Precipitación) con 3 escenarios (Histórico, SSP2-4.5, SSP5-8.5) y deltas de cambio.
- Endpoint dinámico `api/arclim-geojson.js` que consulta la API de ARClim en tiempo real, filtra solo las comunas de Atacama (Región 03) y devuelve GeoJSON.
- 21 capas coropléticas en `clima.js` con escalas de colores adaptadas (absolutas y de cambio/delta).
- UI: Nueva jerarquía en el sidebar (Dimensión → Grupo → Subgrupo). Los grupos "Estaciones Meteorológicas" y "Proyecciones Climáticas" agrupan sus respectivas capas.
- UI: Doble selector en el sidebar para las capas ARClim (Escenario climático y Temporada/Season).
- UI: Panel de información (`sidebarInfo`) para polígonos ARClim con descripciones detalladas del IPCC, gráfico comparativo de barras (Chart.js) con opciones de expandir y descargar.
- `scripts/ingest-dga-control-nivel.mjs`: Script de ingesta para niveles estáticos de pozos DGA.

### Changed
- `layerUtils.js`: Refactor del `onEachFeature` para manejar genéricamente cualquier capa con `indicatorId`. El bypass del Web Worker ahora aplica a cualquier URL que empiece con `/api/`.
- `dimensionBuilder.js`: Lógica de renderizado recursivo para soportar subgrupos (árbol de capas). Los eventos de colapso ahora usan delegación desde el contenedor padre para evitar errores de `null`.
- `stationsMapUtils.js`: El panel lateral ahora filtra y agrupa por la variable activa, mostrando solo el último registro de cada parámetro.

### Fixed
- `json-columnar.js`: Filtro para comunas de Atacama corregido. La API de ARClim no usa ceros a la izquierda para regiones de un dígito (ej. "31" en vez de "031"), por lo que el filtro `startsWith("3")` ahora captura correctamente la Región de Atacama.
- `chartModal.js`: Calendario traducido al español, fechas resaltadas con color de la marca, y soporte para mostrar tablas de calidad de agua con 1 solo registro.
- `dateSelector.js`: Corrección de zona horaria en las fechas del calendario (usando hora local en vez de UTC).
- `arclim-geojson.js`: Solucionado el error 404 eliminando el uso del Web Worker para rutas `/api/` y forzando el fetch en el hilo principal.

---

## [Sprint 23] — 2026-10-23

### Added
- `server/utils/logger.js`: logger con contexto para el backend, sin dependencia de `js/` (CONTRACT §4.4).
- `server/chat/cost-guard.js`: contador diario en memoria + killswitch `CHAT_ENABLED`. Se resetea a las 00:00 UTC.
- REGLA 21 en el `SYSTEM_PROMPT_BASE`: el historial del usuario es contenido no confiable, el LLM no ejecuta instrucciones que aparezcan en él.
- Variables de entorno: `GEO_PROVIDER`, `TRUST_PROXY_HOPS`, `ALLOWED_ORIGINS`, `CHAT_ENABLED`, `LLM_DAILY_REQUEST_CAP`, `MAX_HISTORY_TURNS`.

### Changed
- `server/chat/geo-filter.js`: `isLatam(null)` ahora devuelve `true` (fail-open). `getIpFromRequest` cuenta desde la derecha de `x-forwarded-for` según `TRUST_PROXY_HOPS` (default 2).
- `server/chat/input-validator.js`: `MAX_HISTORY_ITEMS` 20 → 6 (3 pares user-assistant).
- `server/chat/rate-limiter.js`: killswitch `CHAT_ENABLED=0` (skip rate limit).
- `api/chat.js`: CORS restringido a `ALLOWED_ORIGINS` (antes `*`).
- `server/handlers/chat.js`: los errores inesperados devuelven mensaje genérico + `errorId` (8 hex chars). El detalle (message, name, stack) va solo a los logs.
- `server/chat/prompts.js`: `buildSystemPrompt` recibe `history` y lo envuelve en un bloque delimitado `[INICIO HISTORIAL]... [FIN HISTORIAL]`.
- `server/chat/orchestrator.js`: usa el `history` completo (el validator lo limita a 6) y lo pasa a `buildSystemPrompt`.

### Fixed
- Tests desactualizados por los cambios del 23-C y 23-D:
  - `geo-filter.test.js`: `isLatam(null/undefined/"")` ahora `true` (fail-open).
  - `input-validator.test.js`: `content` demasiado largo se trunca (no se rechaza). `MAX_HISTORY_ITEMS = 6`.
  - `unavailable.test.js`: usa `_setInventoryForTests()` para inyectar un inventario sin tocar la BD.
- `db/migrations/021_admin_config.sql` eliminado (renombrado a 024 en el Sprint 40-D.2).

### Notas
- 134/134 tests pasan (`npm test`).
- `chat_aggregate` verificado: funciona correctamente.
- Golden set: 37/38 (1 flaky conocido: `smoke-list-humedales`, no determinismo del LLM).
- El 23-A (geojson fuera del LLM) ya estaba resuelto en el 40-C.3.

---


## [Sprint 40-D.2] — 2026-10-22

### Added
- **Configuración del chat en BD (`admin.*`)**. El admin puede editar
  prompts, settings, mensajes y datos no disponibles desde el panel admin
  (Sprint 15).
- Migración 021: 4 tablas (`admin.unavailable_data`, `admin.prompt_templates`,
  `admin.settings`, `admin.messages`) y 6 RPCs (`chat_unavailable_data`,
  `chat_get_prompt`, `chat_get_setting`, `chat_get_message`,
  `admin_set_setting`, `admin_set_prompt`).
- `scripts/migrate_prompts.mjs`: carga `chat.system` y `chat.classifier`
  en `admin.prompt_templates` (versionado, idempotente).
- `server/chat/unavailable.js`: detector de datos no disponibles. Lee de
  la RPC `chat_unavailable_data()`. Caché de 5 min.
- `server/chat/__tests__/unavailable.test.js`: 4 tests unitarios.
- `docs/DECISIONS/020-inventario-dinamico.md`: diseño del inventario
  dinámico para el Sprint 41.

### Changed
- `prompts.js`: `buildSystemPrompt` lee `chat.system` de la BD. Fallback
  al hardcodeado. Eliminado `SYSTEM_PROMPT` (código muerto) y el `CATÁLOGO:`
  duplicado. Log con `dbg()` en vez de `console.log()`.
- `domain-classifier.js`: `classifyDomain` lee `chat.classifier` de la BD.
  Fallback al hardcodeado.
- `unavailable.js`: lee de la RPC `chat_unavailable_data()` (antes era un
  JSON estático).
- `router.js`: `isRouterEnabled` y `getMinConfidence` leen de la BD
  (`chat.router.enabled` y `chat.router.min_confidence`). Env vars tienen
  prioridad.
- `handlers/chat.js`: detecta datos no disponibles antes del router, une
  `notice` con truncamiento, agrega `no_disponible` al payload.
- `evidence.js`: importa `detectUnavailable` y lo expone en `buildEvidence`.

### Removed
- `server/chat/data/no-disponible.json`: migrado a `admin.unavailable_data`.

### Notas
- La migración 021 está aplicada en **staging**. En **producción** se
  aplicará cuando se migre todo al entorno real (SiteGround + Neon, o el
  que se decida). El código tiene fallback en todas partes, así que
  producción no se rompe.
- Golden set con prompts de BD: 25-26/28 (los fallos son flaky conocidos
  de no determinismo del LLM, no regresiones del refactor).
- Deuda pendiente: UI del panel admin (Sprint 15) para editar las 4 tablas.

---


## [Sprint 40-C] — 2026-10-21

### Added
- **Router determinístico activo en producción** (`CHAT_ROUTER_ENABLED=1`). El código decide qué pipelines ejecutar; el LLM solo interpreta la intención y redacta desde la evidencia.
- Registro de capacidades y pipelines (`server/chat/capabilities/`): 9 tools atómicas + 4 pipelines (`listado_con_mapa`, `ubicacion_con_distribucion`, `distribucion_con_elementos`, `proximidad_conteo`).
- Clasificador unificado (`domain-classifier.js`): emite `{domain, intent, pipeline, slots, confidence}` en una sola llamada. Prompt extendido con distinción admin vs columna, contraejemplos y 6 ejemplos nuevos.
- Router (`server/chat/router.js`): valida `pipeline` (typeof string), valida slots contra `requires`, ejecuta pipelines con `Promise.allSettled`.
- Ejecutor de pipelines (`server/chat/capabilities/pipelines.js`): `distribucion_con_elementos` resuelve `aggregate_by_admin` cuando `group_by` es COMUNA/PROVINCIA/REGION (defensa en profundidad).
- `buildPayloadFromPipeline()` en `server/handlers/chat.js`: el `reply` SIEMPRE menciona capas y filtros, con o sin tabla. Propaga `style_hint` desde el pipeline.
- Historial del usuario concatenado al clasificador (último turno) para resolver correcciones del tipo "No, esos no. Solo los consuntivos."
- Runner `--remote` corregido: los checks de `trace` (`tools_any`, `tools_count_min`, `geojson_filter_required`, `geojson_cuenca_contains`) se reportan como warning, no failure (CA-4 de la spec 40-D).

### Fixed
- `geojson_meta.style_hint` hardcodeado a `null` en `buildPayloadFromPipeline`.
- `reply` de fallback no mencionaba las capas ni los filtros.
- `query_layer` no toleraba `{rows: [...]}` (formato alternativo de la RPC).
- `proximidad_conteo` no estaba en el commit `e935440` (sí en el working tree). Agregado en `ab85419`.
- `vertex-openai.js` no propagaba `extra_content` (`thought_signature`) en los tool calls de Gemini 3.1 Flash-Lite. Sin este fix, Gemini rechaza los tool calls subsecuentes y todos los tests con tools fallan en remoto pero pasan en local.

### Changed
- `router.js` usa `pipelineId` (string) en vez de `pipeline.id` (podía ser `undefined`).
- `pipelines.js` resuelve pasos dinámicamente para `distribucion_con_elementos`.
- `domain-classifier.js`: `maxTokens` 500 → 700 (JSON más grande).

### Notas
- Golden set con `--repeat 3`: router OFF 27-28/28, router ON 27-28/28 (paridad).
- Los 2-3 fallos residuales son no determinismo del LLM, no del router.
- **40-C.4 diferido al 41**: las reglas 13, 19, 20 del prompt y los parches `shouldFetchFeatures`, `maybeFetchFeaturesForStyle`, `detectStyleHint` se retiran en el 41 con calma.
- **Pendiente**: optimizar `count_near_layer` (timeout con `derechos_agua_2025` × `red_hidrografica`).

### Commits
- `f446242` feat(40-C.0): handleChat() extraído
- `0f8f598` feat(40-C.1): registro de capacidades y pipelines
- `2a9fcbb` feat(40-C.2): clasificador unificado y router determinístico
- `4fbd751` feat(40-C.3): paquete de evidencia y cobertura
- `e935440` fix(40-C): router determinístico con paridad en el golden set
- `ab85419` fix(40-C): completar archivos del router en el deploy

---


## [Sprint 06-B.6 + 06-B.7] — 2026-10-12

### Added
- Pintado en listados: "¿Cuáles son los X?" pinta los elementos
  en el mapa además de la tabla.
- Regla 20 del prompt: listados fuerzan get_layer_features.
- Fallback determinístico `shouldFetchFeatures()`.
- Multi-capa acumulativa con `resultsLayers` (array).
- 8 familias de paletas rotativas con **color distinto por capa**.
- Leyenda multi-sección con botón X por capa.

### Fixed
- `api/chat.js` propaga `geojson_layers`.
- `legendUtils.js` preserva secciones del chat al regenerar la
  leyenda del visor.
- `clearResults()` en `handleSend` eliminado (borraba capas
  anteriores).
- `pointToLayer` con `baseColor` (antes rojo fijo).
- `try/catch` por capa en el loop de pintado.
- Clasificador de dominio reconoce preguntas de listado
  ("¿Cuáles son los X?" ya no se bloquea).
- Capas huérfanas eliminadas al recibir bloqueo de dominio.
- `maybeFetchFeaturesForStyle` verifica `layer_id` específico.

### Tests
- 130/130.

## [Sprint 06-B.7] — 2026-10-11

### Added
- Multi-capa acumulativa: las capas del chat se acumulan entre
  consultas. El usuario puede ver glaciares + humedales + derechos
  simultáneamente.
- `appState.chat.resultsLayers` (array) reemplaza a `resultsLayer`.
- 8 familias de paletas (blue, green, orange, magenta, purple,
  teal, red, yellow) con rotación automática entre capas.
- Leyenda multi-sección: una por capa con su nombre y botón X para
  quitarla individualmente.
- Backend: `finish()` devuelve `geojson_layers` (array) además del
  `geojson` único por compatibilidad.
- `layer_label` con `display_name` del catálogo + fallback
  `capitalize(layerId)`.

### Fixed
- `clearResults()` en `handleSend` eliminado (borraba las capas
  anteriores en cada consulta).
- `api/chat.js` ahora propaga `geojson_layers`.
- `legendUtils.js` preserva las secciones del chat al regenerar
  la leyenda del visor.
- `finish()` ahora es async (consulta el catálogo).
- `chatUI.js` bloque single-geojson lee `layer_label` de
  `geojson_layers[0]` como fallback.

### Tests
- 130/130.

## [Sprint 06-B.3] — 2026-10-10

### Added
- Colorear features por cualquier campo, no solo COMUNA.
- `get_layer_features` acepta un nuevo parámetro opcional `color_by`.
- `detectStyleHint(userText, ctx)` generalizado con prioridad:
  1. `ctx.lastColorBy` (si el LLM lo pasó a la tool).
  2. Regex `por comuna/provincia/region`.
  3. Regex genérico `por <campo>` → CAMPO en mayúsculas.
- Regla 19 del prompt generalizada para soportar cualquier campo.

### Notas
- El fallback genérico puede intentar colorear por columnas que no
  existen en una capa. El orquestador maneja el error silenciosamente
  (el geojson se pinta sin colorear).
- Auditoría de columnas por capa pendiente (ver ROADMAP).

### Tests
- 104/104.

## [Sprint 06-B.4] — 2026-10-08

### Added
- Coropleta de puntos por comuna: cuando el usuario pregunta
  "¿cuántos X por comuna?", los elementos de la capa se pintan
  en el mapa con color según su comuna.
- `geojson_meta.style_hint` en el payload del chat:
  `{ attribute: "COMUNA", kind: "choropleth-points", palette: null }`.
- Post-procesamiento determinístico en el orquestador:
  `maybeFetchFeaturesForStyle()` fuerza `get_layer_features` si el
  LLM no lo hizo.
- Leyenda dinámica integrada en `#sidebar-legend`: la sección
  "Resultados del chat · por comuna" aparece arriba de las
  leyendas del visor.
- `ATTRIBUTE_PALETTE` (12 colores) con asignación estable por valor.
- Regla 19 del prompt: forzar `aggregate_by_admin` + `get_layer_features`
  cuando el usuario pide "por comuna + elementos".

### Fixed
- `chatAssistant.js` filtraba `geojson_meta`, `notice` y `charts`.
  Ahora propaga todos los campos del backend.
- `makeFeatureStyler` con `fillOpacity: 0.55` (antes 0.15) para que
  el relleno del color sea visible.
- Vértice y relleno del mismo color (antes el punto usaba blanco fijo).
- La sección del chat en la leyenda se limpia al limpiar resultados
  del mapa.

### Tests
- 104/104.

## [Sprint 06-B.2] — 2026-10-08

### Added
- Campo `geojson_meta` en la respuesta de `/api/chat`:
  `{ layer_id, layer_ids, feature_count, total, truncated }`.
- La tool `get_layer_features` devuelve `_layer_id` en el payload
  (metadata, no se expone al LLM).
- `buildGeojsonFromCtx()` extrae `layerId` y `layerIds` de `ctx.raw`.
- `finish()` expone `geojson_meta` en el payload final.

### Fixed
- `api/chat.js` descartaba `geojson_meta` al normalizar el payload.
  Ahora se propaga correctamente.

### Docs
- `docs/CONTRACT.md` §6.1: documentado el campo `geojson_meta`.

### Notas
- El LLM sigue sin ver geometrías ni metadata interna. `compact()`
  devuelve solo `{ ref, total, sample, _hint }`.
- Prerequisito de 06-B.3 (colorear por campo) y 06-B.4 (coropleta
  por comuna).
- Tests: 104/104.

### Sprint 06-B, 06-C — Frontend geojson + Prompt + Fixes (2026-10-07)

#### Added
- `js/utils/chatMapUtils.js`: pinta FeatureCollections del chat en el mapa
  con estilos destacados por tipo de geometría (punto/línea/polígono).
- `appState.chat.resultsLayer` y `appState.chat.resultsPane`.
- Botón "Quitar resultados del mapa" (dentro del chat).
- Botón flotante para mobile cuando el chat está cerrado.
- Chips de ejemplos en el chat (5 consultas clickeables).
- Modal de información del asistente (accesible desde el header del chat).
- Regla 17 del prompt: precisión en el conteo ("polígonos" no "glaciares").
- Regla 18 del prompt: contexto del historial (ignorar bloqueos previos).

#### Fixed
- Bug crítico: `initChatUI` hacía `textContent` sobre todos los hijos de
  `ai-chat-messages`, destruyendo la estructura de los chips de ejemplos.
  Ahora normaliza solo el mensaje de bienvenida.
- Popup del chat: ahora filtra campos técnicos (`id`, `fid`, `geom`) y usa
  el estilo `.custom-popup` del visor.
- Bug de la fecha alucinada: bloqueos de dominio no se guardan en el
  historial. Evita que el LLM responda una pregunta bloqueada en el
  turno siguiente.
- Estructura HTML: cerrado el `<main>` faltante.
- Bloque CSS duplicado del botón "Quitar resultados".
- Cache-busting (`?v=20261007`) en los links de CSS.

#### Changed
- Prompt del asistente: 22 → 18 reglas (con decision tree por tipo
  de pregunta).
- Modelo LLM: DeepSeek V4.1 Flash → Gemini 3.1 Flash-Lite.
- Retry automático en errores 503 con backoff exponencial (1s, 2s).

#### Resultado
- Latencia: ~82s (GLM) → ~6-10s (Gemini).
- Chat funcional con respuestas correctas y ancho de bandas gestionado.
- Chips y modal de info funcionando.

### Sprint 06-C — Reglas del prompt para geojson (2026-10-07)

#### Added
- Regla 17: PRECISIÓN EN EL CONTEO. El LLM dice "polígonos de
  glaciares", no "380 glaciares".
- Regla 18: CONTEXTO DEL HISTORIAL. Si el historial tiene un bloqueo
  de dominio previo, el LLM lo ignora y responde solo la pregunta actual.

#### Fixed
- Bug: el LLM alucinaba la fecha después de que el clasificador
  bloqueara "¿Qué día es hoy?". El turno bloqueado se guardaba en el
  historial y confundía al LLM.
  - Fix en chatUI.js: no guardar bloqueos de dominio en el historial.
- Bug: el LLM decía "he pintado en el mapa" aunque el frontend no lo
  hacía.
  - Fix en regla 13: "el SISTEMA las pintará" en lugar de "he pintado".
- Encabezado del prompt decía "REGLAS (16)" pero había 18 reglas.
  Corregido a "REGLAS (18)".

#### Modelo LLM
- Migración de GLM-5.3-Flash a Gemini 3.1 Flash-Lite.
- Latencia: ~82s → ~6s (14x mejora).
- Costo: $0.25 input / $1.50 output por 1M tokens.
- Sin bugs de DSML (DeepSeek) ni de tool_choice:none (GPT-OSS).

## [Sprint 23-A] — 2026-10-06

### Fixed
- Bucle ReAct: los `return` estaban dentro del `while`, ignorando
  `ORCHESTRATOR_MAX_ITERATIONS`. Ahora sale solo por `finish()`.
- El LLM ya no recibe el geojson completo: va a `ctx.raw` por invocación.
- Charts basura: `get_layer_schema` generaba 19 charts. Ahora limitado
  a 3 totales y 2 por tool, con filtro de relevancia.
- `get_layer_schema` devolvía ~10 KB. Ahora solo nombres de columnas.
- `MAX_GEOJSON_FEATURES` estaba usada sin declarar.
- Doble agrupación generaba chart con labels duplicados y `"null"`.
  Ahora no genera chart; el LLM presenta tabla markdown.
- LLM pasaba `tipo` (minúsculas) en lugar de `TIPO`. Regla 13 del
  prompt lo previene.
- El LLM no presentaba tabla cuando la tool era
  `aggregate_by_admin_and_column`. Regla 8 ampliada.

### Changed
- Prompt: 22 → 13 reglas. Decision tree por tipo de pregunta.
- Prompt base: 1401 → 568 tokens (-60%).
- Prompt total: 2534 → 1702 tokens (-33%).
- `get_layer_schema`: descripción de "Úsala SIEMPRE" a
  "Úsala SOLO si ya fallaste".
- Modelo LLM: GLM-5.3-Flash → DeepSeek V4.1 Flash.

### Resultado medible
- Latencia: 82-180s → 8-20s (**10-20x mejora**).
- Reply: de `"Sin respuesta."` a análisis territorial real.
- Charts: de 19 basura a 0-3 relevantes.
- Steps: de 3 (con cuelgue 51s) a 3 limpios.
- Prompt: 33% menos tokens por llamada.

### Added
- (vacío)

### Changed
- (vacío)

### Fixed
- (vacío)

### Known issues
- **Timeout por tool (CA-12 spec 06).** Hoy `RPC_TIMEOUT_MS=6000` es global en
  `_helpers.js`. La spec 06 pedía 10s para RPCs con geometría (`get_layer_features`).
  Fix: parámetro `timeoutMs` a `withTimeout` en `runners.js`. Diferido a sprint corto.
- **`chat_upsert_layer` guarda `attributes` como string JSON** (migración 007). El
  `CASE` para parsear no funciona cuando `p_attributes` es un jsonb que contiene un
  string JSON. No afecta el chat (la RPC `chat_layer_features` no depende del campo).
  Fix propuesto: migración 012 que corrija el `CASE` y normalice filas existentes.
- **Clasificador de dominio bloquea preguntas de seguimiento.** El clasificador
  `classifyDomain(text, sessionId)` no recibe historial. Preguntas como "¿cuál es la
  más grande en km²?" (seguimiento de "¿cuántas lagunas hay?") son bloqueadas
  incorrectamente. Fix propuesto (Opción D): skip si hay historial reciente O si la
  pregunta contiene palabras del dominio. Urgencia media-alta.

---

## Bloque 2 — ROADMAP (Sprint 01 en adelante)

Sprints numerados según `docs/ROADMAP.md`. Orden cronológico descendente (lo más reciente primero).

### Proxy de servicios externos (2026-11-06)

**Objetivo:** consumir Copernicus WMS/WFS/WMTS y NASA Worldview Snapshots sin exponer credenciales al navegador y con control de cuota.

#### Added
- `api/proxy.js` + `server/proxy/`: proxy cerrado con allowlist de servicios (`copernicus-wms`, `copernicus-wfs`, `copernicus-wmts`, `worldview-snapshot`), inyección de `INSTANCE_ID` en el servidor, validación de parámetros, timeout, límite de tamaño, allowlist de content-types, caché LRU para JSON/XML y rate limit por IP.
- `server/utils/cors.js` y `server/utils/request.js`: CORS e IP compartidos por `/api/chat` y `/api/proxy`.
- `js/utils/externalServices.js`: helpers de frontend para WMS, WFS, GetFeatureInfo y Worldview.
- Capas Copernicus en el sidebar: `Agricultura` (NDVI, AGRICULTURE, TRUE-COLOR-S2L2A) y `Clima` (MOISTURE-INDEX), bajo el grupo “Satélite (Copernicus)”.
- Selector de fecha por capa Copernicus: consulta WFS de disponibilidad, resalta días con imágenes y aplica `TIME` al WMS; botón para volver a la imagen más reciente.
- Leyenda WMS en el panel: `wmsLegend` (gradiente/nota/items) y render en `legendUtils.js`.
- GetFeatureInfo al clic: `js/utils/wmsFeatureInfo.js` consulta el píxel y muestra valores `out1..outN`, escena, fecha y nubosidad en `#sidebarInfo`.
- Panel de píxel rediseñado: nombre del indicador, descripción para usuarios no especialistas, color/valor del píxel y metadatos de la escena; se quitaron coordenadas e índice I/J.
- Fix: `TIME` del selector de fecha enviaba un objeto `Date` a WFS (400); ahora usa `YYYY-MM-DD`.
- Fix: iconos con espacios (`Torre Agua`, `Derechos Agua/Riego/Mineria`) renombrados a snake_case y normalización de espacios en `styleUtils.js` (404 en Vercel dev).
- Proxy: timeout por defecto a 25 s y se dejó de enviar `info_format` en las requests `GetMap`.
- GetFeatureInfo: consulta de 1×1 píxel alrededor del clic (`WIDTH=1`, `HEIGHT=1`) para evitar timeouts.
- Sentinel WMS: `maxNativeZoom: 16`, `keepBuffer: 1`, `tileSize: 512`, `updateWhenIdle: true` y `updateWhenZooming: false` para reducir tiles y concurrencia; se eliminó el parámetro `tiled` de las requests.
- Selector de fecha: la disponibilidad WFS se consulta al abrir el calendario, no al activar la capa, para no competir con la carga de tiles.
- Selector de fecha: los pickers de flatpickr se destruyen al re-renderizar el sidebar y se abortan las consultas WFS pendientes (evita acumulación de instancias/listeners).
- `/api/variable-availability`: fallback 200 `{ degraded: true, fecha_min: null }` si la RPC falla; el visor oculta el selector de fechas en vez de mostrar un 500.
- Tests `node:test` para servicios, validación, handler, caché, rate limit, CORS e IP.
- `docs/integrations/proxy-servicios-externos.md` con endpoints, ejemplos y límites.

#### Changed
- `vercel.json`: `api/proxy.js` con `maxDuration: 60` y `excludeFiles`.
- `.env.example`: `COPERNICUS_INSTANCE_ID`, `COPERNICUS_CLIENT_ID/SECRET`, `PROXY_*`.
- `CONTRACT.md` §5.5, `ARCHITECTURE.md` §4.14, `AGENTS.md`.

#### Verified
- Copernicus WMS `GetMap` (PNG), `GetFeatureInfo` (JSON con `out1..out4`), WFS `GetFeature` (GeoJSON) y Worldview Snapshot (JPEG 512×512).
- CORS upstream abierto; el proxy restringe el origen del visor.

### Sprint 17 — Ingesta RAG (2026-11-05)

**Objetivo:** índice vectorial versionado y trazable de PDFs públicos, listo para la recuperación del Sprint 18. Se adaptó el diseño a PostgreSQL propio (VPS): sin RPCs `begin/append/finalize` ni wrappers `public.rag_*`.

#### Added
- `db/migrations/036_rag_schema.sql`: schema `rag` con `documents`, `chunks` (`vector(1024)`, `tsv` español, HNSW coseno) e `ingestion_runs`; RLS y roles `rag_writer`/`chat_ro`. Idempotente.
- `db/roles/rag_roles.example.sql`: usuarios de login para el VPS (las contraseñas no se versionan).
- `server/rag/`: `config`, `errors`, `extract` (pdfjs-dist), `normalize` (controles, Unicode invisible, guiones, encabezados repetidos), `chunker` (párrafo/oración/sección, 450/60, tope 1.5×) y `pipeline` (idempotencia por sha256, embeddings fuera de la transacción, escritura atómica y versionado).
- `server/embeddings/`: driver OpenAI-compatible con batching, timeout, reintentos con backoff/`Retry-After` y validación de dimensión.
- `scripts/ingest_docs.mjs`: manifiesto, `--dry-run`, `--force`, `--only`; scripts npm `ingest:dry` e `ingest`.
- `rag/manifest.json`, `rag/manifest.example.json` y `rag/README.md`. `rag/inbox/` queda fuera de git.
- Tests `node:test`: normalización, chunker, extracción de PDF, pipeline, proveedor de embeddings e integración CA-1..CA-4 (se salta sin `RAG_TEST_DATABASE_URL`).

#### Changed
- `vercel.json`: `rag/**` excluido del bundle de la Function.
- `.env.example`: variables `DATABASE_URL`, `EMBEDDINGS_*` y `RAG_*`.
- `docs/CONTRACT.md` §6.6 (reglas del RAG), `docs/ARCHITECTURE.md` §4.12-4.13 y §5.6, `docs/ROADMAP.md` Sprint 17, `docs/DECISIONS/022-embeddings-y-chunking.md`, `docs/specs/17-ingesta-rag.md`.
- `package.json`: `pg` en dependencies; `pdfjs-dist` en devDependencies.

#### Pending
- Aplicar la migración 036 en el VPS y correr el test de integración.
- Ingestar 3 PDFs públicos con licencia verificada y completar el reporte CA-12.

### Sprint 06-A — Backend geoespacial (2026-10-05)

**Objetivo:** el chat puede devolver geometrías para pintar en el mapa.

#### Added
- Migración `010_chat_layer_features.sql` con RPC `chat_layer_features`: devuelve
  features de una capa como FeatureCollection, con geometría en GeoJSON (precisión 5
  decimales, tope 1000 features).
- Wrapper `public.chat_layer_features` para PostgREST, con `REVOKE` a `anon`/`authenticated`
  y `GRANT EXECUTE` a `service_role`.
- Tool `get_layer_features` (`server/chat/tools/get-layer-features.js`) registrada en
  `tools/index.js`.
- `buildGeojsonFromHistory` y `buildNoticeFromGeojson` en `orchestrator.js`: extracción
  agnóstica del FeatureCollection desde el historial de tools, con tope de 500 features
  y metadatos `total/shown/truncated`.
- Campo `notice` en el contrato de `/api/chat` (aviso determinístico de truncado).
- Variable de entorno `CHAT_GEOJSON_ENABLED` (killswitch de geojson en el chat).
- Instrumentación temporal en `orchestrator.js`: logs de tamaño del system prompt,
  tiempo de L1 y tiempo de L2.

#### Changed
- `_helpers.js`: normalización de `limit` separada por tool. `query_layer` entre 1-50
  (default 20); `get_layer_features` entre 1-1000 (default 500).
- El orquestador ya no envía el `geojson` al LLM (CA-10 de la spec 06). El FeatureCollection
  viaja solo en la respuesta final al frontend.

#### Fixed
- Normalización de `limit` en `query_layer`: corregido el default de 500 a 20.
- Log duplicado del tamaño del system prompt en `buildSystemPrompt`.
- Corrección en el catálogo de Supabase: 5 tablas con em-dash en el nombre
  (`catastro_especies_frutales — catastro_variedades_frutales`, etc.) renombradas a
  su nombre canónico. Detectadas correctamente por `build_catalog.mjs` (pasó de 57 a
  71 capas en el catálogo).

#### Cómo verificar
- `npm test` → 104/104.
- `node --check` sobre los archivos modificados.
- Consultar `wollatacamapruebas.vercel.app` con una pregunta de ubicación
  (ej. "¿Dónde están las plantas desaladoras?") y verificar que la respuesta
  puede incluir `geojson` con features (depende de 06-C para el prompt).

#### Pendiente para 06-B
- Frontend: pintar el `geojson` en el mapa (`chatMapUtils.js`, `chatUI.js`, `appState`).
- Frontend: botón "Quitar resultados del mapa", limpieza automática, comportamiento móvil.
- Prompt (06-C): regla de cuándo usar `get_layer_features`.

### Sprint 05 — Multi-chart agnóstico (2026-10-03)

- `buildChartsFromHistory` reemplaza a `buildChartFromHistory` (agnóstico de la tool).
- Detección por forma: `{group, value}` → `pie`/`bar`/`horizontalBar` según cardinalidad.
- Contrato `charts: [...]` (array) canónico; `chart` (singular) por compatibilidad.
- Soporte para múltiples charts apilados en el frontend.
- Header `x-opencode-session` para OpenCode Go.
- 104 tests pasando.

### Sprint 04 — Rate limiting + filtros de dominio (2026-10-03)

- `input-validator.js` — validación de `text` + `history` + `sessionId`.
- `rate-limiter.js` — rate limiting in-memory por IP.
- `geo-filter.js` — restricción LATAM + límite estricto fuera.
- `scope-filter.js` — regex de bloqueo (código, precios, jailbreak).
- `domain-classifier.js` — clasificador LLM (IN/OUT).
- 63 tests nuevos.

### Sprint 03 — Refactor de tools + tests (2026-10-03)

- Una tool por archivo en `server/chat/tools/`.
- `_helpers.js` con `normalizeArgs` + `withTimeout`.
- 35 tests de `normalizeArgs` con `node:test`.
- `npm test` configurado.

### Sprint 02 — Contratos y ADRs (2026-10-02)

- `docs/CONTRACT.md` — reglas de diseño y desarrollo.
- `docs/ARCHITECTURE.md` — arquitectura actual.
- `docs/DECISIONS/` — 4 ADRs (repos separados, 3 planos, ambientes, promoción manual).
- `docs/DEV_GUIDE.md` — guía para desarrolladores.

### Sprint 01 — Setup de staging (2026-10-02)

- Repo `woll_atacama_pruebas` con rama `main`.
- Supabase staging con schema `chat` + migraciones 001-010.
- Vercel deployado apuntando a `main`.
- Chat funcional end-to-end.

---

## Bloque 1 — Pre-ROADMAP (E0-E7)

Estas etapas son anteriores al ROADMAP actual. Fueron re-numeradas de "Fase" o "Sprint 1-7.1" a "E0-E7" para no chocar con la numeración del ROADMAP.

### E7 — Prompt con las 8 tools

- Tras añadir `count_near_layer`, `aggregate_near_layer`, `aggregate_by_admin_and_column` y la capa unificada `agua_superficial`, el `SYSTEM_PROMPT` seguía listando 5 tools.
- `SYSTEM_PROMPT_BASE` pasa a 8 tools en 3 categorías (tabulares, geoprocesos administrativos, geoprocesos de proximidad). 16 reglas renumeradas.
- Regla 6: doble agrupación con `aggregate_by_admin_and_column`. Regla 7: proximidad con `count_near_layer` / `aggregate_near_layer`.
- Regla 13: `aggregate_by_admin_and_column` **no** dispara gráfico (el frontend solo grafica `{group, value}`); el LLM presenta tabla o texto.

### E6 — Geoprocesos espaciales en el chat

**Objetivo:** responder "¿cuántas plantas desaladoras por comuna?" aunque la capa no tenga columna `comuna`, e introspeccionar el esquema para que el LLM no invente columnas.

- Migración `002_chat_spatial.sql`: índices GIST iterando el catálogo; RPC `chat_layer_schema`; RPC `chat_aggregate_by_admin` (agrupa con `ST_Intersects` contra `public.comunas_poligonos`). Idempotente, grants solo a `service_role`.
- Tools nuevas `get_layer_schema` y `aggregate_by_admin`; `normalizeArgs` maneja `admin_level` (lowercase, whitelist, fallback a `comuna`). Timeout de RPC sube a **6 s**.
- `build_catalog.mjs` lee `attributes` desde `information_schema.columns` (fallback a `popupCampos`).
- `scripts/register_admin_layer.mjs` registra `comunas_poligonos` en el catálogo (`dimension: "contexto"`).
- Requisito: tabla `public.comunas_poligonos` con `COMUNA`, `PROVINCIA`, `REGION`, `geom` (MultiPolygon, 4326).

**6.3 — Formato de respuesta.** El LLM respondía con tabla markdown y gráfico con la misma información. Reglas 11-14 del prompt: no duplicar; si la tool fue una agregación, el frontend grafica y el LLM redacta 2-4 frases. `renderRichText` ahora renderiza tablas, listas y párrafos; pie con leyenda inferior.

**6.4 — Modo verbose/producción.** Variable `CHAT_VERBOSE` (1 = el LLM puede mencionar tools y `layer_id`; 0 = solo lenguaje natural). Es independiente de `ORCHESTRATOR_DEBUG` (logs de servidor).

| Entorno | `CHAT_VERBOSE` | `ORCHESTRATOR_DEBUG` |
|---|---|---|
| `.env` local | 1 | 0 |
| Vercel Preview | 1 | 1 |
| Vercel Production | 0 | 0 |

### E5 — Mejoras puntuales (+ hotfix 5.1)

- Chart por cardinalidad: `pie` (≤ 6), `bar` (≤ 20), `horizontalBar` (> 20); `totalGroups` en el payload; `inferAggregateMeta` para títulos descriptivos.
- Botón "limpiar conversación"; placeholder si Chart.js no carga; nota "Mostrando 10 de N".
- `sanitizeIconFile` bloquea `/`, `\`, `..` en iconos de leyenda; `obtenerCapasVisibles` usa `appState` en vez del DOM.
- Índice de búsqueda cancelable con `AbortController`; `normalizeText` maneja comillas tipográficas.
- `configValidator` valida que `cargaInicial.capas` exista en `estilo`.
- `energia_potencial_*`: eliminado `atributo: "COMUNA"` duplicado (el segundo, `REGION`, ganaba en silencio).
- **5.1:** `_indexAbortController` sin declarar → `let _indexAbortController = null;`. Además el validador dejó de avisar duplicados entre `capas` y `grupos` (legítimos: `capas` es el índice maestro del tema).

### E4 — Arquitectura e infraestructura

- `vercel.json`: `api/**/*.js`; `excludeFiles` amplía a `db/`, `scripts/`, `docs/`, `help.html`, `session_export.md`, `skills-lock.json`.
- `window.appState` solo se expone con `LOG_CONFIG.ENABLE_DEBUG`; `.catch()` en `mapReady`.
- Eliminados 3 `alert()` y botones inútiles de capas base; eliminado `L.control.zoom` nativo; `.navbar.fixed-top` → `.header`.
- `themeUI` con import estático; `history` del chat acotado a 20; `isConfigError` → 503, resto → 500.
- `workerPool`: `supportsWorkers()` con fallback a `fetch`; `destroyWorkerPool()` en `beforeunload`.

### E3 — Huérfanos y defaults

- `.env.example` alineado con el código: `LLM_MAX_TOKENS` 1024, `ORCHESTRATOR_MAX_ITERATIONS` 1.
- `.gitignore` depurado (`.env.*.local`); `session_export.md` y `skills-lock.json` fuera del tracking; eliminado `js/config/temas_config.js` (código muerto).

### E2 — Bugs funcionales y coherencia

- Tabla de atributos: restaura el sidebar derecho tras una segunda apertura; `renderChunk` sin `indexOf` (O(n²) → O(n)); `IntersectionObserver` por chunk; conserva `scrollTop`/`scrollLeft` al refrescar.
- `dimensionBuilder`: handler `change` duplicado eliminado; `loaded.add` redundante eliminado.
- `layerItem`: `import()` dinámicos → estáticos; `closeOtherMenu` corregido.
- `configValidator` devuelve `{errores, advertencias}`; valida WMS, `type`, duplicados y coherencia `atributo` ↔ `colores/iconos`.
- `normalizeArgs` defensivo (coacción de tipos, `limit` 1-50, whitelist de `metric`, degradación a `count` sin `field`); `withTimeout` por RPC; tool desconocida devuelve `{ok:false}`.

### E1 — Bugs críticos

- `help.js`: `const wrapper` duplicado rompía `help.html` (SyntaxError).
- Nuevo `wmsUtils.js` y loader WMS en `cargarCapaIndividual`; `updateLayerFilter` respeta WMS y reutiliza el heatmap (evita fuga de contextos WebGL); `estimateLayerSize` por tipo de geometría.
- **XSS** corregido en `styleUtils` (etiquetas, popups, enlaces) y `markers.js` (popups de búsqueda).
- Orquestador: `buildSynthesisMessages` agrupa resultados de tools en un solo mensaje user (dos mensajes user consecutivos hacían que el LLM ignorara las tools); guard para `ORCHESTRATOR_MAX_ITERATIONS < 1`; timeout real con `AbortSignal.timeout`; el fallback devuelve `chart`; caché del system prompt (5 min).

### E0 — Fase 1: chat con tool-calling sobre Supabase

- Migración `001_chat_fase1.sql`: esquema `chat`, catálogo, stats precalculadas, RPCs tipadas, grants a `service_role`.
- Capas `server/db/`, `server/llm/` y `server/chat/` con drivers abstraídos; `api/chat.js` como endpoint delgado.
- `chatAssistant.js` queda como wrapper de `POST /api/chat` (muere la precarga de 270 MB); `chatUI.js` renderiza `reply` + `chart`; Chart.js por CDN.
- `build_catalog.mjs` (Plan K): lee `allTemasConfig.js`, asume `layer_id == nombre de tabla`, hace UPSERT con `chat_upsert_layer` y ejecuta `chat_refresh_stats()`. El descubrimiento automático (`chat_list_geom_tables`) no funcionó en este proyecto.
- Seguridad: `service_role` nunca llega al frontend; `REVOKE` a `anon`/`authenticated`; el LLM no escribe SQL y las RPCs filtran columnas con una whitelist derivada de `chat_catalog` e `information_schema.columns`.
- Decisiones: proveedor LLM vía `openai-compatible`; driver de BD abstraído; sin streaming en esta fase; latencia objetivo < 5 s.

---

## Cambios incompatibles

- `POST /api/chat` pasó de `{messages}` a `{text, history}`.
- El system prompt dejó de inyectar estadísticas y usa `chat.chat_catalog`.
- `chatAssistant.js` perdió `getAllAnalytics`, `getLayerAnalytics`, `getChatPreloadState`, `subscribeChatPreload`, `extractRichStatistics`, `startChatPreload`.
- `estimateLayerSize(capaNombre)` → `estimateLayerSize(capaNombre, configCapa)` (sin `configCapa` cae a `10`).
- `validarConfiguracionGlobal` devuelve `{errores, advertencias}` en vez de `void`.

---

## Superado por documentos actuales

Cosas que decía `IMPLEMENTATION.md` y hoy se resuelven en otro lugar:

| Decía | Hoy |
|---|---|
| `tools.js` con 3 tools | 9 tools, una por archivo, en `server/chat/tools/` |
| `normalizeArgs` en `runners.js` | `server/chat/tools/_helpers.js` |
| Timeout de RPC de 4 s | 6 s (desde E6) |
| `chart` singular | `charts` (array) canónico + `chart` por compatibilidad (CONTRACT §6.2) |
| Fases 2-5 (`admin.html`, `api/integrations/`) | Sprints 06-21 del ROADMAP (el panel admin es `apps/admin`, no `admin.html`) |
| Tabla de variables de entorno | `.env.example` |

---

## Versiones

- **v2.0 (septiembre 2026):** refactor completo desde la base IFI Atacama; Leaflet.glify; Web Worker; asistente IA con Supabase; tabla de atributos; tema claro/oscuro; buscador global; soporte WMS.
- **v1.x:** versión inicial para la Región de Atacama (basada en `diegoxkaf/visor_woll_atacama`).