# Plataforma Territorial Water Oriented Living Lab Atacama

> Plataforma WebGIS territorial para la Región de Atacama, Chile, potenciada con Inteligencia Artificial.

> **Infraestructura (2026-11-10):** **Vercel + Supabase son solo demo/staging.** El despliegue final será un **VPS propio** (Node persistente + PostgreSQL/PostGIS/pgvector + Nginx + proxy persistente). Supabase está en el límite de almacenamiento y Vercel Hobby no alcanza para producción. Ver ADR 005 y Sprint 26.

![Version](https://img.shields.io/badge/version-2.1-blue.svg)
![License](https://img.shields.io/badge/license-Proprietary-red.svg)

## Qué es

Aplicación web interactiva para visualizar y analizar datos geoespaciales estratégicos de la Región de Atacama. Integra mapas WebGL de alto rendimiento con un asistente de IA que permite hacer consultas territoriales en lenguaje natural.

### Características

- **Visualización geoespacial** con Leaflet y render WebGL de polígonos (`Leaflet.glify`).
- **Asistente IA** conectado a Supabase (PostGIS): consultas reales vía tool calling, con gráficos automáticos en las respuestas.
- **Router determinístico** (Sprint 40-C): clasificador unificado + pipelines declarativos + paquete de evidencia. El código decide qué tools ejecutar; el LLM interpreta la intención y redacta desde la evidencia.
- **Golden set** (Sprints 40-D.3/48/18-A): 46 casos de prueba con `tier`, `intent_esperado`, `fuente_esperada` y `route` (`tool`, `rag`, `mixta`, `abstencion`, `fuera_de_alcance`). Viven en `admin.golden_cases` (editables desde el panel) y el archivo `server/chat/__evals__/golden.json` queda como seed y fallback. Se corre con `npm run eval:chat`; `--from-json` fuerza el archivo y `--include-inactive` prueba los casos pendientes.
- **Configuración en BD** (Sprint 40-D.2): prompts, settings, mensajes y datos no disponibles viven en `admin.*`. Editables desde el panel admin (Sprint 15).
- **Capas WMS** (IDE Chile, CIREN) además de ~70 capas GeoJSON locales.
- **9 dimensiones de análisis + capas base:** Agua, Clima, Agricultura, Minería, Otros, Planificación Territorial, Riesgos, Suelo, Energía, y Capas base.
- **Búsqueda global semántica** con índice en memoria.
- **Tabla de atributos** con filtros, búsqueda y exportación (GeoJSON / CSV).
- **Tema claro/oscuro** y diseño responsive.
- **Web Workers** para procesar GeoJSON pesado, con fallback al hilo principal.

## Documentación

Antes de tocar código, lee:

- [Contrato de diseño y desarrollo](docs/CONTRACT.md) — reglas que no se rompen.
- [Arquitectura](docs/ARCHITECTURE.md) — cómo está armado el sistema hoy.
- [Guía de desarrollo](docs/DEV_GUIDE.md) — setup, comandos, flujo de trabajo, troubleshooting.
- [Roadmap](docs/ROADMAP.md) — plan de sprints y bitácora.
- [Decisiones (ADRs)](docs/DECISIONS/) — por qué se tomaron las decisiones clave.
- [Changelog](docs/CHANGELOG.md) — historial de cambios.
- [AGENTS.md](AGENTS.md) — guía técnica para agentes de IA.

## Ambientes

Hay dos ambientes con infraestructura aislada (producción y pruebas). El desarrollo se hace en **pruebas** (`woll_atacama_pruebas`, [wollatacamapruebas.vercel.app](https://wollatacamapruebas.vercel.app)) y se promueve a producción manualmente. Detalle en [ADR 003](docs/DECISIONS/003-ambientes.md) y [ADR 004](docs/DECISIONS/004-promocion-manual.md).

## Requisitos

- Navegador moderno con soporte de ES Modules.
- Node.js 20.6 o superior (los scripts de `scripts/` usan `--env-file`).
- Servidor HTTP (no abrir `index.html` con `file://` por CORS).
- Cuenta de Supabase y API key de un proveedor LLM para el chat IA.
- **Vertex AI**: `gcloud auth application-default login` en local, o Service Account en producción.

## Inicio rápido

```bash
git clone git@github.com:proyectosandesvalue/woll_atacama_pruebas.git
cd woll_atacama_pruebas
cp .env.example .env.staging   # completa los valores
npm install                    # dependencias del backend + ESLint
```

Las variables de entorno están documentadas en `.env.example` (única lista vigente).

Para correr en local:

```bash
npx http-server -p 8099   # visor sin chat → http://localhost:8099
npm run dev               # visor + chat + proxy Copernicus → http://localhost:3000
npm run dev:api           # API Node persistente → http://localhost:3000 (sin frontend)
npm run stack:up          # stack completo: PostgreSQL + API + Nginx → http://localhost:8080
npm run stack:down        # baja el stack completo
npm start                 # API Node sin watch (producción)
npm run db:dump           # dump de Supabase (SOURCE_DATABASE_URL)
npm run db:restore -- backups/woll-....dump  # restore local (TARGET_DATABASE_URL)
npm run db:verify         # compara origen/destino (SOURCE_* y TARGET_*)
npm run audit:db          # auditoría de estructura, RAG/ingest y cobertura de capas
npm run db:extract-rpcs   # genera 039 con las RPCs heredadas
npm run layer:load -- geojson/foo.geojson --table foo --dimension agua
```

`npm run dev` levanta `vercel dev` y el proxy persistente de Copernicus en `http://localhost:3001/api/proxy`. `npm run dev:api` levanta el servidor Node del VPS contra el PostgreSQL local; no lo corras junto con `vercel dev` porque ambos usan el puerto 3000. Si prefieres levantar Vercel y el proxy por separado:

```bash
npx vercel dev            # terminal 1
npm run dev:proxy         # terminal 2
```

El frontend local detecta que está en `localhost` y usa el proxy de 3001 en vez de una Function de Vercel por cada tile. En producción sigue usando `/api/proxy` relativo.

El visor funciona sin API keys: mapa, sidebar y leyenda operan con los GeoJSON locales. El chat necesita el backend (`vercel dev` o Vercel desplegado) y Vertex AI autenticado.

### PostgreSQL local (Sprint 26)

El entorno de referencia desde 26-C es PostgreSQL propio en Docker/Podman:

```bash
cp .env.example .env.local   # completar POSTGRES_PASSWORD, DATABASE_* y WOLL_*_PASSWORD
npm run db:up                # docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
npm run migrate              # aplica db/migrations/000-048
npm run migrate:status       # pendientes / aplicadas / cambiadas
npm run db:down
```

La base queda en `127.0.0.1:5432` (solo loopback). En el VPS no se publica:
queda en la red interna de Compose. `npm run stack:up` levanta PostgreSQL, API y
Nginx; el visor queda en `http://localhost:8080` y la API directa en
`http://localhost:3000`. No corras `dev:api` y `stack:up` a la vez: ambos usan
el puerto 3000. La demo Vercel + Supabase sigue disponible con `vercel dev`.

## Estructura del proyecto

```text
woll_atacama_pruebas/
├── index.html, help.html       # SPA y manual de ayuda
├── api/*.js                    # Vercel Functions (adapters delgados para la demo)
├── docker/                     # Dockerfiles de PostgreSQL y API
├── deploy/nginx/               # Config TLS, dev, locations y proxy headers
├── docker-compose*.yml         # Stack base, dev y prod
├── server/
│   ├── index.js, app.js        # servidor Node persistente y app HTTP
│   ├── http/                   # router, body, response y adapter Vercel
│   ├── routes/                 # chat, config, admin, proxy, ARClim, estaciones y health
│   ├── handlers/chat.js        # pipeline completo (handleChat)
│   ├── handlers/arclim.js      # ARClim compartido Vercel/VPS
│   ├── handlers/stations.js    # estaciones compartido Vercel/VPS
│   ├── chat/                   # orchestrator, router, capabilities, tools/
│   ├── llm/                    # driver Vertex AI (OpenAI-compatible)
│   └── db/                     # pool y drivers postgres/supabase
├── db/migrations/              # migraciones SQL numeradas (NNN_nombre.sql)
├── scripts/                    # catálogo, dump/restore, load-layer, smoke tests, golden set
├── js/
│   ├── app.js, script.js       # bootstrap y UI shell
│   ├── config/                 # una dimensión por archivo + WMS, capas base, aliases
│   ├── store/appState.js       # única fuente de verdad
│   ├── ui/, sidebar/, search/  # features
│   ├── utils/                  # motores (layerUtils, glifyAdapter, wmsUtils, ...)
│   └── workers/                # Web Workers
├── css/                        # base, components, desktop, mobile
├── geojson/                    # capas estáticas (~71)
├── raster/                     # tiles ráster pregenerados (Sprint 49, fuera de git)
├── data/raster/                # COG fuente privado (fuera de git)
├── assets/                     # iconos e imágenes
├── docs/                       # CONTRACT, ARCHITECTURE, DEV_GUIDE, ROADMAP, CHANGELOG, DECISIONS/
└── vercel.json, package.json
```

El mapa completo de carpetas y responsabilidades está en `docs/ARCHITECTURE.md`.

## Mapa de archivos y responsabilidades

| Archivo / carpeta | Para qué sirve | Cuándo tocarlo |
|---|---|---|
| `index.html`, `help.html` | Entry point de la SPA y manual de ayuda | Cambios de shell, carga de scripts o UI global |
| `raster/`, `data/raster/`, `scripts/raster-*.mjs` | Ráster precalculado: tiles públicos, COG privado, publicación y retención | Publicar o actualizar un ráster (Sprint 49) |
| `admin.html`, `css/admin.css`, `js/admin/` | Panel admin: configuración, capas, RAG, APIs, taxonomía, Chat IA, Demanda y auditoría | Configuración, chat, demanda o login |
| `api/chat.js` | Vercel Function del chat (adapter delgado) | Cambios de CORS/método del endpoint, no de lógica |
| `api/proxy.js` | Proxy cerrado de servicios externos | Agregar un servicio o ajustar CORS/timeout |
| `api/arclim-geojson.js`, `api/stations-*.js`, `api/variable-*.js` | Adapters Vercel de datos climáticos/estaciones | Cambios de CORS/método, no de lógica |
| `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.prod.yml` | Stack PostgreSQL + API + Nginx + ingest | Cambios de servicios, puertos o volúmenes |
| `docker/api/Dockerfile`, `docker/postgres/Dockerfile` | Imágenes de API y PostgreSQL/PostGIS/pgvector | Cambios de runtime o versiones |
| `deploy/nginx/` | TLS, estáticos, caché de proxy y `limit_req` | Cambios de borde, rutas o headers |
| `server/index.js`, `server/app.js` | Servidor Node persistente y app HTTP (VPS) | Cambios de arranque, timeouts o router |
| `server/http/` | Router, body, respuestas, errores y adapter Vercel | Cambios transversales de HTTP |
| `server/routes/` | Rutas Node de chat, config, admin, proxy, taxonomía, ráster, ARClim, estaciones y health | Agregar o cambiar una ruta |
| `server/handlers/chat.js` | Pipeline completo de `handleChat()` | Cambios de flujo del chat |
| `server/handlers/arclim.js`, `server/handlers/stations.js` | Lógica compartida Vercel/VPS | Cambios de contrato o consultas |
| `server/handlers/config.js`, `server/handlers/admin.js` | Snapshot `/api/config` y endpoints del panel admin | Cambios de contrato o de auth |
| `server/admin/auth.js` | Password scrypt, sesión, CSRF, auditoría y TOTP reutilizable | Cambios de autenticación (ADR 007) |
| `server/handlers/admin-rag.js`, `server/routes/admin-rag.js` | Ingesta RAG desde el panel: manifiesto, upload y cola | Cambios del flujo RAG (45-A) |
| `server/handlers/admin-apis.js`, `server/admin/api-registry.js` | Inventario, prueba y edición de conexiones externas | Cambios del gestor de APIs (45-B) |
| `server/handlers/admin-layers.js`, `server/admin/layer-files.js` | CRUD de capas, upload GeoJSON/ZIP Shapefile y cola de importación | Cambios del gestor de capas (47) |
| `scripts/layer-worker.mjs`, `docker/layer-worker/` | Carga a PostGIS con GDAL y generación de tiles en worker | Importación de capas (47-D) |
| `server/handlers/taxonomy.js`, `server/routes/taxonomy.js` | Compilación de la taxonomía nativa para el sidebar (46-C) | Cambios de `/api/taxonomy` |
| `server/handlers/raster-stats.js`, `server/routes/raster.js`, `js/utils/rasterUtils.js` | Estadísticas, API y capa Leaflet del ráster precalculado | Cambios del publicador de ráster (49) |
| `server/handlers/admin-taxonomy.js`, `scripts/taxonomy-*.mjs` | CRUD de dimensiones/grupos/subgrupos y compilación del snapshot | Cambios de taxonomía (46) |
| `server/handlers/admin-chat-config.js`, `server/routes/admin-chat-config.js` | CRUD de prompts/settings/mensajes/unavailable/golden y tools read-only | Configuración del chat (48) |
| `server/handlers/admin-unanswered.js`, `server/routes/admin-unanswered.js` | Cola de demanda: preguntas sin respuesta, triage y brief | Demanda del chat (50) |
| `docs/help/demanda-no-satisfecha.md` | Contenido de ayuda de Demanda para la futura página del panel | Textos de ayuda o privacidad |
| `scripts/golden-seed.mjs`, `scripts/lib/golden-source.mjs` | Seed del golden y lectura BD → JSON con fallback | Cambios del golden set (48) |
| `server/admin/rag-manifest.js` | Lectura/escritura atómica del manifiesto y PDFs | Validación o almacenamiento de documentos |
| `scripts/rag-worker.mjs`, `docker/rag-worker/` | Worker de extracción/embeddings y cola | Ingesta real de PDFs |
| `server/db/drivers/postgres.js`, `server/db/rpc-signatures.js` | Driver `pg.Pool` y registro de RPCs | Cambiar transporte o agregar una RPC |
| `server/db/drivers/supabase.js` | Driver REST de Supabase (solo demo) | No agregar features; congelado |
| `server/chat/` | Orquestador, router, clasificador, tools, filtros | Cambios de comportamiento del chat |
| `server/llm/` | Driver LLM OpenAI-compatible / Vertex AI | Cambiar proveedor, modelo o fallback |
| `server/db/` | Driver de BD (`supabase`/`postgres`) | Cambiar transporte o conexión |
| `server/proxy/` | Allowlist, validación, caché y rate limit del proxy | Agregar servicios externos o límites |
| `server/rag/`, `server/embeddings/` | Ingesta RAG, chunking y embeddings | Cambios del pipeline documental |
| `js/app.js` | Bootstrap del mapa y tema inicial | Cambios de arranque del visor |
| `js/script.js` | UI shell: sidebars, tabs, chat, GetFeatureInfo | Cambios de interacción global |
| `js/config/` | Una dimensión por archivo + WMS, capas base y aliases | Agregar/quitar capas o servicios |
| `js/config/copernicusLayer.js` | Ficha común de capas satelitales Copernicus | Nuevos índices o cambios de ficha |
| `scripts/dump-supabase.sh`, `scripts/restore-local.sh` | Dump de Supabase y restore al PostgreSQL local | Migración de datos o restore de staging |
| `scripts/verify-migration.mjs` | Compara conteos, geometrías, secuencias, roles y RPCs | Antes de promover staging/producción |
| `scripts/extract-legacy-rpcs.mjs` | Genera `039_legacy_rpcs.sql` desde Supabase | Cerrar el gap de RPCs heredadas |
| `scripts/load-layer.mjs` | Carga GeoJSON/Shapefile a PostGIS + catálogo (`--tiles` genera tiles) | Agregar o reemplazar una capa |
| `scripts/build-tiles.mjs` | Genera tiles MVT pregenerados por capa/versión y su manifest | Publicar o regenerar una capa estática |
| `scripts/tiles-sync.mjs` | Publica capas nuevas/editadas, índice, verificación y retención | Ciclo de vida de tiles (Sprint 08-G) |
| `js/utils/vectorTileUtils.js` | Crea la capa `leaflet.vectorgrid`, estilos/filtros y popup desde tiles | Capas con `source.tiles` (Sprint 08-B) |
| `server/handlers/layer-features.js` | Features desde PostGIS para tabla/filtros/CSV | Capa con tiles sin descargar el GeoJSON |
| `scripts/dev-proxy.mjs`, `js/config/proxy.js` | Proxy persistente para desarrollo local (3001) | Cambios del entorno local |
| `scripts/backup-postgres.sh` | Dump cifrado, checksum, retención y copia externa | Backup diario del VPS (26-G) |
| `scripts/restore-drill.sh` | Restaura un backup en una base descartable y mide RTO | Simulacro de restauración |
| `scripts/run-ingest-timer.sh`, `deploy/systemd/woll-ingest*` | Ingestas programadas con lock y journald | Timers del VPS (26-J) |
| `scripts/config-snapshot.mjs` | Publica/valida el snapshot de config en `admin.*` | Cambios de config o versiones (Sprint 14) |
| `scripts/admin-user.mjs` | Alta/rotación del usuario admin; TOTP opcional | Bootstrap o recuperación (Sprint 15) |
| `scripts/acceptance-sprint08.mjs` | Gate de aceptación del Sprint 08 | Validar tiles, tabla, filtros y export |
| `scripts/load-test-sprint30.mjs` | Carga 25/50: static, table, mixed y on-demand | Aceptación de performance (30) |
| `scripts/build_catalog.mjs` | Reconstruye `chat.chat_catalog` (Supabase o PostgreSQL) | Nuevas capas o cambios de config |
| `js/store/appState.js` | Única fuente de verdad del visor | Nuevo estado global o ciclo de capas |
| `js/sidebar/` | Render de dimensiones, grupos, capas y leyenda | Cambios de sidebar o controles por capa |
| `js/utils/layerUtils.js`, `glifyAdapter.js`, `wmsUtils.js` | Carga y render de capas | Cambios de render, WMS o filtros |
| `js/utils/legendUtils.js`, `externalServices.js`, `wmsFeatureInfo.js`, `copernicusDateSelector.js` | Leyenda, proxy cliente, GetFeatureInfo y fechas | Cambios de leyenda o consumo de servicios |
| `js/utils/attributeTableUtils.js`, `popupUtils.js`, `styleUtils.js` | Tabla, popups y estilos | Cambios de atributos o presentación |
| `js/workers/` | Procesamiento de GeoJSON fuera del hilo principal | Capas pesadas o nuevos procesamientos |
| `db/migrations/` | Migraciones SQL numeradas e idempotentes | Todo cambio de schema |
| `db/roles/` | Ejemplos de roles de login (no migración) | Altas de usuarios en el VPS |
| `scripts/` | CLI, smoke tests, golden set, ingesta | Automatizaciones y tareas operativas |
| `rag/` | Manifiesto y PDFs del corpus RAG | Agregar documentos |
| `docs/` | CONTRACT, ARCHITECTURE, DEV_GUIDE, ROADMAP, CHANGELOG, DECISIONS, specs | Antes de cambios estructurales |
| `css/`, `geojson/`, `assets/` | Estilos, capas estáticas e iconos | Cambios visuales o de datos locales |
| `geojson/uploads/`, `geojson/private/` | GeoJSON de respaldo y ZIP privado del gestor de capas | Importar capas desde el panel (Sprint 47-D) |
| `vercel.json` | Functions, rewrites y `excludeFiles` | Cambios de deploy o endpoints |
| `package.json`, `.env.example` | Scripts/dependencias y variables de entorno | Nuevas tareas o configuración |

Regla práctica: si el cambio es de **comportamiento del sistema**, primero se escribe/actualiza la spec o ADR; si es de **datos**, va en `db/migrations/` + config; si es de **presentación**, va en `js/`/`css/`.

## Skills para agentes

Las skills son instrucciones reutilizables que OpenCode carga **solo cuando la tarea coincide** con su descripción. No se cargan todas en cada prompt.

- Ubicaciones: `.opencode/skills/<id>/SKILL.md` (local, en `.gitignore`), `~/.config/opencode/skills/` (global) y `.agents/skills/` (compatibilidad; este repo no la usa).
- El modelo ve `name` y `description` del frontmatter; el cuerpo se carga con la tool `skill` o mencionando `@skill-id`.
- El `README` no activa skills. Los triggers reales viven en el `description` de cada `SKILL.md` y, para reglas del proyecto, en `AGENTS.md`.

Skills disponibles hoy:

**Autoinvocables** (aparecen en la lista del modelo y se cargan cuando la tarea coincide):

| Skill | Cuándo usarla |
|---|---|
| `spec-writer` | Crear o actualizar specs de sprint con la estructura del proyecto |
| `manual` | Redactar manuales técnicos del visor (arquitectura, setup, despliegue) |
| `frontend-design` | Crear o rediseñar UI, sidebar, paneles, leyendas y chat |
| `accessibility` | Auditoría WCAG, teclado, lectores de pantalla y contraste |
| `nodejs-backend-patterns` | Endpoints, proxy, handlers, middleware, auth y acceso a datos |
| `nodejs-best-practices` | Decisiones de arquitectura Node, async, seguridad y performance |
| `seo` | Metadatos, indexabilidad, sitemap y datos estructurados |
| `javascript-pro` | JS/ESM, async, Web Workers, memoria y APIs de navegador/Node |
| `postgres-pro` | PostGIS, pgvector, EXPLAIN, índices, extensiones, VACUUM |
| `debugging-wizard` | Bugs, crashes, fuga de memoria, loops y stack traces |
| `security-reviewer` | Auditoría de secretos, SSRF, RLS, dependencias y vulnerabilidades |
| `rag-architect` | Chunking, embeddings, pgvector, búsqueda híbrida y evaluación RAG |
| `code-reviewer` | Revisar diffs/PR: bugs, seguridad, performance y tests |
| `architecture-designer` | ADRs, decisiones de arquitectura y trade-offs (VPS/plataforma) |
| `test-master` | Tests unitarios/integración/E2E con `node:test`, flaky tests y cobertura |

**Explícitas** (`metadata.opencode/autoinvoke: false`; se invocan con `@skill-id` o pidiéndolas por nombre):

| Skill | Cuándo invocarla |
|---|---|
| `api-designer` | Diseño REST/OpenAPI para el Sprint 19 (APIs/CRUD) |
| `devops-engineer` | Sprint 26: Docker Compose, Nginx, TLS, CI/CD y despliegue en VPS |
| `monitoring-expert` | Sprint 26: logs estructurados, healthchecks y alertas del VPS |
| `secure-code-guardian` | Auth, validación de input, OWASP y hardening (Sprints 15/16/26-H) |
| `sql-pro` | SQL complejo, CTEs, window functions; para Postgres usar `postgres-pro` |
| `the-fool` | Pre-mortem, red team o stress-test de una decisión grande |

**Built-in**

| Skill | Cuándo usarla |
|---|---|
| `opencode` | Configurar OpenCode, agentes, skills, plugins o MCP |
| `report` | Reportar bugs o problemas de OpenCode |

Las explícitas no aparecen en la lista automática para no competir con las de uso diario. Si el agente empieza a elegir skills de más, mover alguna autoinvocable a explícita con `metadata.opencode/autoinvoke: false`.

Para agregar una skill:

1. Copiarla a `.opencode/skills/<id>/SKILL.md`.
2. Asegurar un `description` claro que empiece con “Úsala cuando…”.
3. Si vive fuera de las rutas estándar, agregarla al array `skills` de `opencode.json`.
4. Si es una regla del proyecto, agregar el trigger en `AGENTS.md`.
5. Recargar con `/reload` si no aparece.

No conviene instalar decenas de skills a la vez: la lista que ve el modelo crece y aumenta el riesgo de elegir la equivocada. Instalar solo las que se usan en el proyecto.

## Tecnologías

Leaflet 1.9.4, Leaflet.glify, Leaflet.markerCluster, WebGL Heatmap, `geoUtils.getBbox` (sin Turf), DOMPurify, Chart.js; Vanilla JS ES Modules y CSS custom properties. **Demo/staging:** Vercel Functions + Supabase (PostGIS) + Vertex AI. **Producción final:** VPS con Node persistente, PostgreSQL/PostGIS/pgvector y Nginx (ADR 005/010). Versiones y detalle en `docs/ARCHITECTURE.md` §3.

## Configuración básica

- **Agregar una capa GeoJSON o WMS:** ver `docs/DEV_GUIDE.md` §7 y `AGENTS.md`.
- **Agregar una tool al chat:** ver `docs/DEV_GUIDE.md` §8.
- **Cambiar un prompt del chat:** cargarlo en `admin.prompt_templates` con `scripts/migrate_prompts.mjs`. Ver `AGENTS.md` y `docs/CONTRACT.md` §2.
- **Correr el golden set:** `CHAT_ROUTER_ENABLED=1 CHAT_UNAVAILABLE_ENABLED=1 npm run eval:chat`.

**Importante:** los alias se normalizan con `.toLowerCase().trim()` al hacer lookup.

## Despliegue

> **Vercel es solo demo/staging.** El despliegue final es un VPS propio (Sprint 26, ADR 005); no optimizar límites de Hobby como producción.

**Demo/staging:** push a `main` → Vercel despliega automáticamente (~30 s). Las variables de entorno se configuran en Vercel → Settings → Environment Variables (lista en `.env.example`).

**Producción final:** VPS con Node persistente, PostgreSQL/PostGIS/pgvector, Nginx/Caddy y proxy persistente. La promoción y el corte se definen en el Sprint 26/ADR 005.

```bash
# En el VPS, con .env completo y el certificado emitido
docker compose --env-file .env -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Nginx sirve el visor por 443, proxya `/api/*` a la API y cachea `/api/proxy`.
PostgreSQL y la API no publican puertos. El detalle de TLS y certbot está en
`docs/DEV_GUIDE.md` §2.8 y en `docs/specs/26-plataforma/26-D-compose-nginx.md`.

Variables de entorno relevantes (ver `.env.example` para la lista completa):

- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` (o las `GCP_*` de Workload Identity Federation)
- `ORCHESTRATOR_BUDGET_MS`, `ORCHESTRATOR_MAX_ITERATIONS`
- `CHAT_VERBOSE`, `CHAT_GEOJSON_ENABLED`
- `CHAT_ROUTER_ENABLED`, `CHAT_ROUTER_MIN_CONFIDENCE`
- `CHAT_UNAVAILABLE_ENABLED`

## Contribuir

Proyecto privado. Hoy trabaja un solo desarrollador, por lo que se commitea directo a `main`; las ramas y PRs se introducirán cuando se sume más gente (ver `docs/DEV_GUIDE.md` §4.3).

Convención de commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`.

```bash
npm run lint            # objetivo: 0 errores
npm test                # tests con node:test
npm run migrate         # migraciones al PostgreSQL local
npm run migrate:status  # estado de migraciones
npm run config:snapshot # valida/publica la config del visor
npm run admin:user      # alta/rotación del usuario admin
npm run rag:worker      # worker de ingesta RAG
npm run taxonomy:seed   # siembra dimensiones/grupos/capas desde el snapshot
npm run taxonomy:compile # compila y publica la taxonomía
npm run layer:worker     # worker de importación de capas GeoJSON
npm run check:rpcs      # RPCs registradas vs. BD
npm run db:up / db:down # PostgreSQL local en Docker/Podman
```

## Dimensiones disponibles

| Dimensión | Archivo de config | Notas |
|---|---|---|
| Agricultura | `js/config/agricultura.js` | Capas productivas |
| Agua | `js/config/agua.js` | Hidrografía, APR, desaladoras |
| Clima | `js/config/clima.js` | Zonas climáticas (Köppen), estaciones, ARClim |
| Energía | `js/config/energia.js` | Generación, transmisión |
| Minería | `js/config/mineria.js` | Yacimientos, faenas |
| Planificación | `js/config/planificacion.js` | PRC, IPT |
| Otros | `js/config/otros.js` | Áreas protegidas, turismo (WMS) |
| Suelo | `js/config/suelo.js` | Geomorfología |
| Riesgos | `js/config/riesgos.js` | Sismos, volcanes, remociones |
| Capas base | `js/config/capasBase.js` | Cartografía base |

## Troubleshooting

Ver `docs/DEV_GUIDE.md` §9 (el visor no carga, el chat no responde, Vercel bloquea el deploy, `.env.staging` en `git status`, golden set falla con "no puedo responder").

## Licencia y equipo

Propiedad de Atacama Andes Value. Todos los derechos reservados 2026.

- **Desarrollador:** Diego Velásquez
- **Cliente:** Atacama Andes Value

Versión 2.1 (octubre 2026). Historial completo en `docs/CHANGELOG.md`.