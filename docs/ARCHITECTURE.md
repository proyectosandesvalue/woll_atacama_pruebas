# ARCHITECTURE.md — Arquitectura actual

> Descripción del sistema actual. Se actualiza cuando cambia algo estructural.
> Última revisión: 2026-11-10.

---

## 1. Vista general
┌─────────────────────────────────────────────────────────────┐
│ Usuario (navegador) │
│ - Visor Leaflet │
│ - Chat IA │
└─────────────────────────┬───────────────────────────────────┘
│ HTTPS
▼
┌─────────────────────────────────────────────────────────────┐
│ Vercel (hosting + Functions) │
│ - Archivos estáticos (index.html, js/, css/, geojson/) │
│ - /api/chat (Vercel Function) │
└──────┬────────────────────────────────────────┬─────────────┘
│ REST │ HTTPS
▼ ▼
┌──────────────────────┐ ┌──────────────────────┐
│ Supabase (PostGIS) │ │ Vertex AI │
│ - Tablas public.* │ │ (Google Cloud) │
│ - Schema chat.* │ │ - Gemini 3.1 │
│ - Schema admin.* │ │ Flash-Lite │
│ - RPCs tipadas │ │ - Tool calling │
└──────────────────────┘ └──────────────────────┘


---

## 2. Ambientes

> **Decisión 2026-11-10 (ADR 005):** la producción final es un **VPS propio**
> (Node persistente + PostgreSQL/PostGIS/pgvector + Nginx/Caddy + proxy
> persistente). **Vercel + Supabase son solo demo/staging**: Supabase llegó a
> su límite de almacenamiento y Vercel Hobby no alcanza para producción.

### 2.1. Producción final (VPS) — objetivo del Sprint 26

- **API:** Node persistente (`server/index.js`, `node:http`), sin framework.
- **Base de datos:** PostgreSQL + PostGIS + pgvector en el VPS; driver
  `pg.Pool` (`server/db/drivers/postgres.js`).
- **Borde:** Nginx 1.27 con TLS, HTTP/2, compresión, estáticos/GeoJSON, caché
  de `/api/proxy` y `limit_req`.
- **Proxy:** persistente, con caché en disco (Nginx) y caché en memoria
  (handler), reutilización de conexiones para Copernicus/tiles.
- **Operación:** backups, healthchecks, logs y monitoreo.
- **Estado:** 26-C/B/A/D cerrados; 26-E con tooling listo (falta el dump real
  de Supabase); pendientes staging, backups, hardening y corte (26-F a 26-I).
  Ver `docs/DECISIONS/005-plataforma-hosting-vps.md` y `010-borde-nginx.md`.

### 2.2. Demo/staging actual (Vercel + Supabase)

- **Repo:** `proyectosandesvalue/woll_atacama_pruebas`
- **Vercel:** proyecto `woll_atacama_pruebas` (plan Hobby; solo demo)
- **Supabase:** proyecto de pruebas; ~913 MB, en el límite del plan
- **URL:** `https://wollatacamapruebas.vercel.app`

Limitaciones de esta etapa:

- Rate limit, caché y semáforo LLM **por instancia** (serverless).
- Cold starts y `maxDuration` efectivo menor que el configurado.
- El proxy de Copernicus ejecuta una Function por tile.
- Supabase REST/PostgREST, sin pool TCP propio.
- CDN de Vercel útil para la demo, no parte de la arquitectura final.

### 2.3. Local (dev)

- **Entorno de referencia (desde 26-C):** Docker/Podman + `docker-compose.yml` +
  `docker-compose.dev.yml`; PostgreSQL 17 + PostGIS + pgvector en
  `127.0.0.1:5432`.
- **Variables:** `.env.local` con `DB_DRIVER=postgres`, `DATABASE_URL` (rol
  `woll_api`), `DATABASE_ADMIN_URL` (migraciones) y `WOLL_*_PASSWORD`.
- **Migraciones:** `npm run migrate` / `npm run migrate:status`
  (`scripts/migrate.mjs`).
- **Stack completo:** `npm run stack:up` levanta PostgreSQL, API y Nginx; el
  visor queda en `http://localhost:8080` y la API en `http://localhost:3000`.
- **TLS local:** el compose de desarrollo usa HTTP; el de producción usa
  `woll.conf` con certificados de certbot.
- **Demo legacy:** `npx vercel dev` + `.env.staging` + Supabase, congelada
  (ADR 005). Se mantiene hasta cerrar el Sprint 26.
- **Vertex AI:** requiere `gcloud auth application-default login` (ADC local) o `GOOGLE_APPLICATION_CREDENTIALS_JSON` (Service Account).

**Reglas:**

- **Vercel + Supabase no son producción**: son demo/staging para el cliente.
- La producción final usa el VPS y PostgreSQL propio; el corte se define en el Sprint 26.
- Los secretos **nunca** están en código.
- No agregar infraestructura específica de Vercel/Supabase que no sea portable al VPS sin ADR.

---

## 3. Stack

### Frontend

- **Leaflet 1.9.4** — mapas.
- **Leaflet.glify** — WebGL para polígonos pesados.
- **Leaflet.markerCluster** — clustering.
- **WebGL Heatmap** — heatmaps.
- **Turf.js 6.5.0** — solo `bbox()` para zoom a features.
- **DOMPurify 3.0.3** — sanitización XSS.
- **Chart.js 4.4.0** — gráficos del chat.
- **Vanilla JS ES Modules** — sin framework.
- **CSS custom properties** — theming.

#### Capas satelitales Copernicus

- **Servicios:** `js/config/wms_services.js` usa el factory `copernicus()` y apunta a `/api/proxy?source=copernicus-wms`; tiles de 512, `maxNativeZoom: 16`, `keepBuffer: 1`, `updateWhenIdle` y `updateWhenZooming: false`.
- **Fichas:** `js/config/copernicusLayer.js` centraliza fecha, nubosidad, bandas RGB, nota y `wmsHistoryStart`. Cada dimensión declara sus capas en `js/config/{agricultura,clima,agua,mineria}.js`.
- **Fechas:** `js/utils/copernicusDateSelector.js` consulta WFS por mes (y vecinos), cachea 5 minutos, marca los días con imágenes en azul y aplica `TIME` al WMS. El archivo llega hasta 2017-01-01.
- **Píxel:** `js/utils/wmsFeatureInfo.js` usa `layer.wmsParams.TIME`, por lo que el panel corresponde a la imagen visible.
- **Leyendas:** `js/utils/legendUtils.js` renderiza `gradient`, `note` e `items`.
- **Local:** `scripts/dev-proxy.mjs` + `js/config/proxy.js`; producción usa `/api/proxy` relativo.

### Backend (demo/staging: Vercel Functions; final: Node en VPS)

- **Node.js** (runtime de Vercel en demo; Node 22 LTS en el VPS).
- **Servidor persistente (26-A):** `server/index.js` + `server/app.js` con
  router, CORS, body limit, `/healthz`/`/readyz` y cierre ordenado.
- **Borde (26-D):** Nginx sirve estáticos/GeoJSON, proxya `/api/*` y cachea
  `/api/proxy`; solo Nginx publica puertos en producción.
- **fetch** nativo (Node 18+).
- **Dependencias de runtime acotadas**: `pg` (driver PostgreSQL), `@google-cloud/vertexai` y `google-auth-library` (Vertex AI), `csv-parser` (ingesta). El parseo de PDF (`pdfjs-dist`) es **devDependency** y solo lo usa la CLI de ingesta, nunca `api/`.

### Base de datos (demo/staging: Supabase; final: PostgreSQL/PostGIS/pgvector en VPS)

- **Supabase** (PostgreSQL + PostGIS) en demo/staging; **PostgreSQL 17 +
  PostGIS 3.7 + pgvector 0.8.7** en el VPS (imagen
  `docker/postgres/Dockerfile`, Sprint 26-C).
- **RPCs tipadas** (`chat.*` + wrappers `public.chat_*`).
- **RLS activo** en todas las tablas del schema `chat`.
- **Supabase:** solo `service_role` ejecuta las RPCs. **VPS:** `woll_api` tiene
  `EXECUTE` sobre las RPCs y `SELECT` sobre las tablas de capas; no tiene
  `BYPASSRLS` ni DDL. `woll_ingest` escribe en `ingest.*`.
- **Driver (26-B):** `server/db/drivers/postgres.js` con `pg.Pool`,
  `statement_timeout`/`query_timeout` y un registro cerrado de 48 RPCs en
  `server/db/rpc-signatures.js`. `npm run check:rpcs` verifica que existan.
- **Migraciones:** runner `scripts/migrate.mjs` con checksum y
  `db/migrations/000-037`; `000_compat_roles.sql` crea extensiones, roles y
  `search_path`.
- **Schema `admin.*`**: configuración editable (prompts, settings, mensajes, datos no disponibles). PostgREST no lo expone; solo se accede vía RPCs `SECURITY DEFINER`.

### LLM

- **Vertex AI** (Google Cloud) como proveedor, vía el endpoint OpenAI-compatible.
- **Modelo primario**: `gemini-3.1-flash-lite`.
- **Modelo de fallback**: `gemini-2.5-flash-lite` (configurado en `LLM_FALLBACK_MODEL`).
- **Tool calling** nativo. Gemini 3.1 requiere que los tool calls incluyan `extra_content` (thought_signature); el driver lo propaga.
- **Driver abstraído** (`server/llm/drivers/vertex-openai.js`) → cambiar de modelo es cambiar variables de entorno.
- **Auth**: ADC local (`gcloud auth application-default login`) o Workload Identity Federation (producción en Vercel).

---

## 4. Estructura del backend

> **26-A:** en el VPS, `server/index.js` monta `createApp()` y las rutas de
> `server/routes/`; los adapters `api/*.js` quedan para la demo Vercel y
> delegan en los mismos handlers puros. `/healthz` y `/readyz` verifican la BD.

### 4.1. `api/chat.js` (demo) y `/api/chat` (VPS)

Endpoint del chat. Es un **adapter delgado**: delega toda la lógica a `handleChat()` en `server/handlers/chat.js`.

```js
// api/chat.js
import { handleChat } from "../server/handlers/chat.js";
import { getCountryFromRequest, getIpFromRequest } from "../server/chat/geo-filter.js";

export default async function handler(req, res) {
  // CORS + method check
  const ip = getIpFromRequest(req);
  const country = getCountryFromRequest(req);
  const result = await handleChat(req.body || {}, { ip, country });
  if (result.headers) { /* set headers */ }
  return res.status(result.status).json(result.body);
}

Recibe: { text, history }
Devuelve: { reply, notice?, chart?, charts, geojson?, geojson_meta?, geojson_layers?, citations?, no_disponible? }

4.2. server/handlers/chat.js
Handler puro. Pipeline completo:

Validar input (input-validator).

Rate limit (rate-limiter, en memoria).

Scope filter (scope-filter, regex de bloqueo rápido).

Clasificador unificado (domain-classifier): dominio, intent, pipeline, slots.

Detector de datos no disponibles (unavailable): lee de admin.unavailable_data.

Router determinístico (router): ejecuta pipelines o degrada al orquestador.

Orquestador (orchestrator): si el router no resuelve.

Devuelve { status, body, headers? }.

4.3. server/chat/orchestrator.js
Orquesta el ciclo del chat cuando el router no resuelve. ~234 líneas (después del refactor 25-D).

Construye el system prompt con el catálogo de la BD (PostgreSQL o Supabase; cacheado 5 min).

Loop de tool calling (por defecto 3 iteraciones).

Síntesis forzada si el presupuesto de tiempo se agota.

Detección de chart desde el historial de tool calls.

Presupuesto: ORCHESTRATOR_BUDGET_MS (default 8000ms).

Módulos auxiliares (divididos en el refactor 25-D):

Archivo	Responsabilidad
prompts.js	SYSTEM_PROMPT_BASE, VERBOSE_RULES, NON_VERBOSE_RULES, buildSystemPrompt(). Lee chat.system de BD.
charts.js	buildChartsFromHistory(), extractChartableData(), constructores.
style-hint.js	detectStyleHint() para color_by.
evidence.js	compact(), buildGeojsonLayersFromCtx(), buildEvidence().
post-process.js	shouldFetchFeatures(), maybeFetchFeaturesForStyle().
orchestrator.js	Solo el bucle ReAct + imports.
4.4. server/chat/capabilities/
Router determinístico (40-C):

registry.js: 9 tools atómicas de capas + 4 pipelines declarativos. Las 4 tools de clima (`get_station_weather`, `get_historical_climate`, `list_climate_stations`, `get_arclim_forecast`) no están en el registro: las invoca el orquestador directamente.

pipelines.js: executePipeline() con Promise.allSettled. Sustituye slots ($layer_id, $filters, $group_by, $color_by). Resuelve aggregate_by_admin vs aggregate_layer según group_by.

Pipelines:

Pipeline	Reemplaza	Pasos
listado_con_mapa	Regla 20	query_layer + get_layer_features en paralelo.
ubicacion_con_distribucion	Reglas 13 y 14	get_layer_features + aggregate_by_admin(comuna).
distribucion_con_elementos	Regla 19	aggregate_by_admin o aggregate_layer según group_by + get_layer_features con color_by.
proximidad_conteo	Proximidad	count_near_layer.
4.5. server/chat/router.js
Recibe { domain, intent, pipeline, slots, confidence } del clasificador. Decide:

Si pipeline es válido, confidence >= umbral y los slots requeridos están → ejecuta el pipeline.

Si no → devuelve null y el handler degrada al orquestador.

Configuración (admin.settings):

chat.router.enabled (default false).

chat.router.min_confidence (default 0.7).

Env vars tienen prioridad sobre la BD (para tests y overrides rápidos).

4.6. server/chat/tools/
Una tool por archivo. Cada archivo exporta { schema, run }.

Tools actuales (13; las 9 primeras son las que conoce el router):

Tool	Propósito
get_layer_stats	Estadísticas generales de una capa.
get_layer_schema	Schema real (columnas + top values).
query_layer	Filas concretas (listado).
aggregate_layer	Agregación por una columna.
aggregate_by_admin	Agregación por comuna/provincia/región vía ST_Intersects.
aggregate_by_admin_and_column	Doble agrupación (admin + columna).
count_near_layer	Conteo por proximidad.
aggregate_near_layer	Agregación por proximidad, agrupada por admin.
get_layer_features	FeatureCollection para pintar en el mapa.
get_station_weather	Clima observado de una estación meteorológica.
get_historical_climate	Series históricas de estaciones (DGA/DGAC).
list_climate_stations	Listado de estaciones meteorológicas disponibles.
get_arclim_forecast	Proyecciones climáticas ARClim por comuna y escenario.
El registro está en tools/index.js. _helpers.js contiene normalizeArgs y withTimeout.

4.7. server/chat/runners.js
Ejecuta cada tool contra Supabase (vía el pool).

Normalización defensiva de args del LLM:

Coacción de tipos.

Validación de whitelists (METRICS, ADMIN_LEVELS).

Coacción de límites (limit entre 1 y 1000 para features, 1 y 50 para query).

Timeout de 6s por RPC.

4.8. server/chat/domain-classifier.js
Clasificador unificado (40-C.2). Emite en una sola llamada:

json
{
  "domain": "IN" | "OUT",
  "intent": "dato_simple" | "analisis_receta" | "contexto_documental" | "fuera_de_alcance",
  "pipeline": "listado_con_mapa" | "ubicacion_con_distribucion" | "distribucion_con_elementos" | "proximidad_conteo" | null,
  "slots": { "layer_id": "...", "filters": {...}, "group_by": "...", "color_by": "..." },
  "confidence": 0.0-1.0
}
Prompt: CLASSIFIER_SYSTEM_PROMPT, cacheado 5 min. Lee chat.classifier de BD con fallback al hardcodeado.

Parseo defensivo: si el LLM devuelve algo inválido, confidence: 0 y domain: "IN" (fail-open).

Caché de clasificación: 5 min por texto.

4.9. server/chat/unavailable.js
Detector de datos no disponibles (40-D.2). Lee de admin.unavailable_data vía chat_unavailable_data().

Caché: 5 min.

Killswitch: CHAT_UNAVAILABLE_ENABLED (default 0).

4.10. server/db/*
Driver REST de Supabase abstraído. Cambiar de BD = cambiar DB_DRIVER + variables de entorno.

4.11. server/llm/*
Driver LLM OpenAI-compatible. Cambiar de proveedor = cambiar LLM_BASE_URL + LLM_MODEL + LLM_API_KEY.

Auth de Vertex AI: server/llm/drivers/vertex-openai.js.

ADC local (gcloud auth application-default login).

Service Account vía GOOGLE_APPLICATION_CREDENTIALS_JSON.

Workload Identity Federation (producción en Vercel).

4.12. server/rag/*
Pipeline de ingesta de documentos (Sprint 17). No importa `pg`: recibe un pool ya construido, para poder testearse con dobles.

Archivo	Responsabilidad
config.js	Lee RAG_CHUNK_*, RAG_MAX_* y RAG_INSERT_BATCH.
errors.js	RagError con `code` estable para ingestion_runs.error_code.
extract.js	Extracción página a página con pdfjs-dist.
normalize.js	Limpieza de controles/Unicode, des-guionizado y encabezados repetidos.
chunker.js	Chunking por párrafo/oración/sección con solape controlado.
pipeline.js	Validación del manifiesto, idempotencia, embeddings y escritura atómica.

La CLI `scripts/ingest_docs.mjs` es el único punto de entrada operativo. No corre en `api/`.

4.13. server/embeddings/*
Driver de embeddings compatible con OpenAI `/embeddings` (Sprint 17). Interfaz `embed(texts[])`, batching, timeout, reintentos con backoff y validación de dimensión. El modelo activo se registra por chunk en `rag.chunks.embedding_model`. Decisión y alternativas en ADR 022.

4.14. server/proxy/* + api/proxy.js
Proxy cerrado para servicios geoespaciales externos (2026-11-06). No acepta URLs arbitrarias: cada servicio declara URL base, parámetros permitidos y límites.

Archivo	Responsabilidad
services.js	Allowlist de servicios (Copernicus WMS/WFS/WMTS, NASA Worldview Snapshots), inyección del INSTANCE_ID y construcción de la URL upstream.
validate.js	Validación de forma/tamaño: BBOX, WIDTH/HEIGHT, TIME, formatos, MAXFEATURES, TILEMATRIX.
handler.js	GET-only, timeout, allowlist de content-types, caché, rate limit y normalización de Retry-After.
cache.js	Caché LRU en memoria para JSON/XML pequeños.
rate-limiter.js	Límite por IP (no distribuido en Vercel; Redis/Nginx en el VPS).

El adapter `api/proxy.js` aplica CORS y escribe la respuesta. El frontend consume `/api/proxy?source=...` mediante `js/utils/externalServices.js`; nunca ve el INSTANCE_ID ni el client secret. Detalle en `docs/integrations/proxy-servicios-externos.md`. En local, `scripts/dev-proxy.mjs` reutiliza `handleProxy()` en el puerto 3001 y el frontend lo detecta con `js/config/proxy.js`.

### 4.2. Tiles MVT pregenerados (Sprint 08)

Las capas estáticas o por edición no se sirven desde PostgreSQL en runtime.
El flujo es offline:

```
PostGIS (tabla física)
   │  scripts/build-tiles.mjs (ST_AsMVT, simplificación por zoom)
   ▼
tiles/<layer_id>/<version>/<z>/<x>/<y>.mvt + manifest.json
   │  scripts/tiles-sync.mjs (índice, verificación, retención)
   ▼
Nginx /tiles/ (MIME MVT, gzip, Cache-Control: immutable)
   │
   ▼
Navegador (cliente de tiles, Sprint 08-B)
```

- Cada zoom materializa una vez la geometría simplificada en 3857 y la indexa
  con GIST; los tiles se recortan desde esa tabla. Los candidatos se calculan
  por cobertura real de features, no por bbox de la capa.
- `manifest.json` guarda bbox, zooms, conteo de features, columnas, bytes y
  checksum SHA-256. `tiles/index.json` lista versiones y la activa.
- Una versión publicada es inmutable. Una edición publica una versión nueva y
  la config apunta a ella; la caché se invalida por cambio de URL.
- Nginx sirve archivos: no hay proxy a la API ni a PostgreSQL. Funciona con la
  base detenida.
- Capas de puntos ≤5.000: geometría GeoJSON + valores por API y cluster/heatmap
  en cliente. Por medición, los tiles de puntos pesan más que el GeoJSON gzip.
- Límite por capa: 20.000 tiles; si un zoom lo supera, se publica hasta el zoom
  anterior y se registra en el manifest (`maxzoom` vs `maxzoom_requested`).
- Alta de capa: `load-layer --tiles` encadena tabla + catálogo + tiles + índice.
- Comandos: `npm run tiles:build`, `npm run tiles:sync`, `npm run tiles:check`.
- **Cliente:** `leaflet.vectorgrid@1.3.0` vendorizado en `js/lib`. Se usa en
  `pane: overlayPane` (comparte orden z con las capas SVG) y con `bounds` del
  manifest. El bundle está parcheado para `L.DomEvent.fakeStop` (Leaflet 1.9).
- **Datos para tabla/filtros/CSV:** `GET /api/layer-features?layer_id=...`
  devuelve propiedades desde PostGIS sin geometría. Si la API no responde, el
  visor cae al GeoJSON de respaldo. La paginación y la búsqueda server-side
  llegan en 08-D.
- **Exportación:** `GET /api/layer-export?layer_id=...&format=geojson|csv`
  transmite por lotes desde PostGIS, aplica el mismo filtro y usa las columnas
  visibles del CSV. En Vercel el visor cae al archivo estático/cliente.
- **Tabla server-side:** `/api/layer-features` acepta `search`, `sort`, `order`,
  `filter` y devuelve `total`; la tabla de capas PostGIS pagina 100 por página
  con scroll infinito y busca/ordena en el servidor. `/api/layer-feature`
  entrega una feature con geometría para el zoom/highlight. Las capas GeoJSON
  conservan el renderer local.
- **On-demand:** `/api/layer-tiles?layer_id=&z=&x=&y=` genera MVT con
  `ST_AsMVT` para capas dinámicas; Nginx cachea por URL 5 min. No hay una capa
  dinámica en producción todavía; el cliente acepta `mode: "on-demand"`.
- Capas migradas (08-B/08-C): 40 capas no-punto visibles con `source.type: "postgis"`; `comunas_poligonos` no está en la config. Los puntos quedan en GeoJSON + API.
- Detalle: `docs/specs/08-postgis-fuente-principal/08-A-pipeline-tiles.md`,
  `08-B-piloto.md` y `08-G-ciclo-vida-capas.md`.


5. Base de datos — schemas chat, admin y rag
5.1. Schema chat — tablas
chat.chat_catalog: catálogo de capas para el LLM.

chat.chat_layer_stats: stats precalculadas por capa.

chat.chat_attr_stats: stats por atributo (min, max, mean, median, top_values).

chat.audit_run / chat.audit_column / chat.audit_column_results: auditoría de datos (Sprint 37).

5.2. RPCs canónicas (chat.*)
chat_catalog() — catálogo filtrado por capas con tabla física.

chat_layer_stats(layer_id) — stats de una capa.

chat_layer_schema(layer_id) — schema real (columnas + top values).

chat_query(layer_id, filters, limit, offset) — filas concretas.

chat_aggregate(layer_id, group_by, metric, field, filters) — agregación por columna.

chat_aggregate_by_admin(layer_id, admin_level, metric, field, filters) — agregación por comuna/provincia/región vía ST_Intersects.

chat_aggregate_by_admin_and_column(...) — doble agrupación.

chat_count_near_layer(source, targets, distance_m, filters) — conteo por proximidad.

chat_aggregate_near_layer(source, targets, distance_m, admin_level, filters) — agregación por proximidad.

chat_refresh_stats() — recalcula stats de todas las capas.

chat_upsert_layer(...) — UPSERT de una capa en el catálogo.

chat_column_coverage(layer_id) — cobertura por columna (40-C.3).

5.3. Wrappers (public.chat_*)
PostgREST solo expone public.*. Los wrappers delegan a las canónicas del schema chat.

5.4. Grants
REVOKE ALL FROM PUBLIC, anon, authenticated en todo.

GRANT EXECUTE TO service_role en todo.

Solo el backend (con SUPABASE_SERVICE_KEY) puede ejecutar las RPCs.

5.5. Schema admin — configuración editable (40-D.2)
Tablas:

Tabla	Propósito
admin.prompt_templates	Prompts versionados (chat.system, chat.classifier). Cada cambio crea una versión nueva (version + 1).
admin.settings	Key-value con tipos (chat.router.min_confidence, chat.router.enabled, chat.unavailable.enabled, chat.geojson.enabled, chat.verbose).
admin.messages	Mensajes estándar (chat.out_of_scope, chat.no_response, chat.llm_error).
admin.unavailable_data	Datos que el visor no tiene (produccion_frutales_kg, aptitud_cultivos, rendimiento_por_hectarea, heladas_historicas).
RPCs de lectura (service_role):

chat_get_prompt(id) — devuelve el content de la versión activa.

chat_get_setting(key, default) — devuelve el value (jsonb).

chat_get_message(key) — devuelve el content.

chat_unavailable_data() — devuelve el inventario activo como jsonb.

RPCs de escritura (panel admin, Sprint 15):

admin_set_setting(key, value, by) — UPSERT.

admin_set_prompt(id, content, description, by) — crea versión nueva y desactiva la anterior.

admin_rollback_prompt(id, version, by) — reactiva una versión anterior como nueva versión.

admin_list_prompt_versions(id) — lista todas las versiones de un prompt.

Gobierno (CONTRACT §1.7 y §2):

Versionado: cada cambio de prompt crea una versión nueva. Se puede volver atrás con admin_rollback_prompt.

Golden antes de activar: correr el golden set en staging antes de promover un prompt a producción.

Fallback (INV-5): si la BD no responde, el código usa el hardcodeado. El chat no se rompe sin BD.

Caché: prompts y settings se cachean 5 min en memoria del módulo.

Acceso: SECURITY DEFINER y solo service_role. PostgREST no expone el schema admin.

5.6. Schema rag — índice documental (Sprint 17)
Migración `036_rag_schema.sql`. Diseñado para PostgreSQL propio con pgvector; no usa RPCs ni PostgREST.

Tabla	Propósito
rag.documents	Documento versionado por slug, con sha256, procedencia, licencia, trust_level y estado (ready/superseded/needs_ocr/failed).
rag.chunks	Fragmentos con embedding vector(1024), embedding_model, páginas, sección, sha256 de contenido y tsv español generado.
rag.ingestion_runs	Bitácora de corridas (estado, chunks, modelo, tokens y costo estimado). Sin contenido.

Índices: HNSW coseno sobre `embedding`, GIN sobre `tsv`, único parcial que garantiza una sola versión `ready` por slug.

Roles y RLS:

Rol	Permisos
rag_writer	SELECT/INSERT/UPDATE/DELETE en las tres tablas; secuencias.
chat_ro	SELECT solo de documentos `ready` y sus chunks; lectura de ingestion_runs.

La ingesta calcula los embeddings antes de abrir la transacción y reemplaza la versión anterior en un único COMMIT. El chat del Sprint 18 usará `chat_ro` y delimitará los fragmentos como contenido no confiable (CONTRACT §6.6).

6. Frontend
6.1. Entry point
index.html — SPA principal.

help.html — manual.

js/app.js — bootstrap.

js/script.js — UI shell (tema, sidebar, modal, responsive).

6.2. Estado
js/store/appState.js — single source of truth.

Mapas de capas, filtros, modos (cluster/heatmap), opacidades, etc.

6.3. Configuración de capas
js/config/allTemasConfig.js — importa todas las dimensiones.

js/config/<dimension>.js — cada dimensión (agua, energía, etc.).

js/config/capasBase.js — capas base del mapa.

js/config/wms_services.js — servicios WMS externos.

6.4. Utilidades clave
js/utils/layerUtils.js — motor de carga de capas (GeoJSON, WMS, glify).

js/utils/glifyAdapter.js — adaptador WebGL.

js/utils/attributeTableUtils.js — tabla de atributos.

js/utils/chatAssistant.js — cliente de /api/chat.

js/ui/chatUI.js — panel del chat.

6.5. Workers
js/workers/layerProcessor.worker.js — transformación GeoJSON off-main-thread.

js/workers/workerPool.js — pool de 4 workers con fallback.

7. Deploy
7.1. Flujo
text
Local → git push origin main → GitHub → Vercel auto-deploy → URL
Rama main → deploy a producción del proyecto Vercel (que en este caso es el ambiente de pruebas).

Rama de feature (futuro) → preview deploy automático.

7.2. Variables de entorno
Configuradas en Vercel → Settings → Environment Variables.

Variables principales (ver .env.example):

SUPABASE_URL, SUPABASE_SERVICE_KEY

LLM_PROVIDER, LLM_BASE_URL, LLM_MODEL, LLM_API_KEY, LLM_MAX_TOKENS, LLM_TEMPERATURE

GOOGLE_APPLICATION_CREDENTIALS_JSON (o las GCP_* de Workload Identity Federation)

ORCHESTRATOR_BUDGET_MS, ORCHESTRATOR_MAX_ITERATIONS, ORCHESTRATOR_DEBUG

CHAT_VERBOSE, CHAT_GEOJSON_ENABLED

CHAT_ROUTER_ENABLED, CHAT_ROUTER_MIN_CONFIDENCE

CHAT_UNAVAILABLE_ENABLED

7.3. Caché
Los archivos estáticos se cachean por CDN de Vercel.

Los deploys invalidan caché automáticamente.

8. Monitoreo
Vercel Logs — Deployments → último → Functions → chat.

Vercel Analytics — métricas de tráfico.

Supabase Logs — queries, errores.

No hay alertas configuradas (a futuro).

9. Roadmap técnico
Corto plazo
Migrar js/config/*.js (dimensiones, capas, alias) a admin.* (Sprint 14).

Panel admin (solo lectura primero, Sprint 15).

CI/CD y entrega versionada (Sprint 27).

Seguridad del frontend y dependencias (Sprint 28).

Mediano plazo
/api/config — el visor lee config desde un snapshot JSON.

Ingesta RAG (PDFs + pgvector) — Sprint 17 y 18.

Recetas de análisis (Sprint 41).

Largo plazo
Panel admin con CRUD completo.

APIs externas (meteorología, leyes).

Serving de capas vía MVT (vector tiles).

Chat multi-fuente con citas.

