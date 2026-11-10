# AGENTS.md — Plataforma_WOLL_Atacama

## Contexto

Plataforma Territorial Water Oriented Living Lab Atacama: WebGIS para la Región de Atacama, Chile. Archivos estáticos (sin build) + Vercel Functions para el chat IA + Supabase PostGIS + LLM OpenAI-compatible.

**Antes de cambiar código, lee en este orden:**

1. `docs/CONTRACT.md` — reglas que no se rompen.
2. `docs/ARCHITECTURE.md` — cómo está armado el sistema hoy.
3. `docs/ROADMAP.md` — qué sprint está activo y qué sigue.
4. `docs/DEV_GUIDE.md` — cómo hacer las tareas habituales.
5. `docs/CHANGELOG.md` — historial de cambios y bugs ya corregidos.

Si el código contradice el CONTRACT, no decidas por tu cuenta: señálalo y deja que el dev elija cuál de los dos cambia.

## Mapa de documentación

| Si necesitas… | Lee… |
|---|---|
| Reglas que no se rompen | `docs/CONTRACT.md` |
| Cómo está armado el sistema hoy | `docs/ARCHITECTURE.md` |
| Qué sprint sigue o está activo | `docs/ROADMAP.md` |
| Cómo hacer una tarea habitual | `docs/DEV_GUIDE.md` |
| Por qué se tomó una decisión | `docs/DECISIONS/` |
| Qué cambió y qué bugs se corrigieron | `docs/CHANGELOG.md` |
| Spec de un sprint | `docs/specs/` |
| Integraciones externas y proxy | `docs/integrations/` |
| Qué archivo hace qué (mapa rápido) | `README.md` → “Mapa de archivos y responsabilidades” |

Antes de crear un archivo nuevo, comprobar si ya existe uno canónico en `README.md`/`ARCHITECTURE.md`. Un recurso, un lugar.

## Skills

OpenCode descubre skills en `.opencode/skills/<id>/SKILL.md` (local, ignorado por git) y `~/.config/opencode/skills/` (global). El modelo solo ve `name` + `description`; el cuerpo se carga con la tool `skill`.

Las skills son locales y **no se versionan**: `.opencode/` está en `.gitignore`. Si se comparte el repo, cada persona debe copiar las skills que use.

Cargar la skill que aplique **antes** de implementar.

**Autoinvocables:**

| Skill | Cuándo |
|---|---|
| `spec-writer` | Nueva feature o cambio de roadmap: escribir/actualizar la spec antes de código |
| `manual` | Manuales técnicos, arquitectura, setup, despliegue |
| `frontend-design` | UI, sidebar, paneles, leyendas, chat |
| `accessibility` | WCAG, teclado, lectores de pantalla, contraste |
| `nodejs-backend-patterns` | Endpoints, proxy, handlers, middleware, auth, DB |
| `nodejs-best-practices` | Decisiones de arquitectura Node, async, seguridad |
| `seo` | Metadatos, indexabilidad, sitemap, datos estructurados |
| `javascript-pro` | JS/ESM, async, Web Workers, memoria y APIs |
| `postgres-pro` | PostGIS, pgvector, EXPLAIN, índices, VACUUM |
| `debugging-wizard` | Bugs, memoria, loops, crashes, stack traces |
| `security-reviewer` | Secretos, SSRF, RLS, dependencias, vulnerabilidades |
| `rag-architect` | Chunking, embeddings, pgvector, hybrid search, evaluación |
| `code-reviewer` | Revisión de diffs/PR: bugs, seguridad, performance, tests |
| `architecture-designer` | ADRs, arquitectura, trade-offs (VPS/plataforma) |
| `test-master` | Tests con `node:test`, integración, E2E, flaky tests |

**Explícitas** (`opencode/autoinvoke: false`; invocar con `@skill-id` o por nombre):

| Skill | Cuándo |
|---|---|
| `api-designer` | REST/OpenAPI para Sprint 19 |
| `devops-engineer` | Sprint 26: Docker Compose, Nginx, TLS, CI/CD |
| `monitoring-expert` | Sprint 26: logs, healthchecks, alertas |
| `secure-code-guardian` | Auth, input, OWASP, hardening (15/16/26-H) |
| `sql-pro` | SQL complejo/CTE/window; para Postgres preferir `postgres-pro` |
| `the-fool` | Pre-mortem, red team, stress-test de decisiones |

**Built-in:** `opencode` (configurar OpenCode) y `report` (reportar bugs de OpenCode).

Reglas:
- No cargar más de 1-2 skills por tarea; si no aporta, no usarla.
- Si una skill no existe en el repo, no inventarla: proponer instalarla o escribir el trigger en `AGENTS.md`.
- Las skills no reemplazan al CONTRACT ni a las specs: son guías de ejecución.
- Para agregar una skill: copiarla a `.opencode/skills/<id>/SKILL.md`, asegurar un `description` con “Úsala cuando…”, y agregar el trigger acá si es una regla del proyecto.
- **Features nuevas o cambios de roadmap:** cargar `spec-writer`, crear/actualizar la spec en `docs/specs/` y esperar aprobación antes de implementar.

## Reglas operativas

- **Ramas:** un solo dev, se commitea **directo a `main`**. Sin `develop`.
- **Commits:** `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`; un commit por sub-sprint con el ID (`feat: sprint-06-A backend geoespacial`).
- **Migraciones:** `db/migrations/NNN_nombre.sql`, idempotentes. Nunca editar una ya aplicada; crear una nueva.
- **Chat:** el LLM nunca escribe SQL; solo invoca RPCs tipadas.
- **RAG:** la ingesta corre en `scripts/` (nunca en `api/`); los PDFs viven en `rag/inbox/` fuera de git y todo fragmento se marca `untrusted`. El corpus se declara en `rag/manifest.json` con licencia y `copyright_cleared: true`.
- **Proxy externo:** `/api/proxy` es cerrado (allowlist en `server/proxy/services.js`); `INSTANCE_ID` y `CLIENT_SECRET` viven solo en el servidor. Ver `docs/integrations/proxy-servicios-externos.md`.
- **Secretos:** solo en variables de entorno. `.env.staging` está en `.gitignore`.
- **Tests:** toda feature nueva trae al menos un test (`node:test`).
- **Configuración del chat**: los prompts y settings viven en `admin.*` (migración 024). Antes de activar un cambio, correr el golden set. Ver "Gobierno de la configuración del chat".
- **Migraciones**: la `024_admin_config.sql` y la `025_admin_rollback.sql` son las del 40-D.2. No renumerar. La `021_fix_filters_robust.sql` y la `022_fix_match_semantics.sql` son del 40-A (pre-existentes).
- **Nombres de archivo:** no renombrar archivos existentes (`layerUtils.js`, `appState.js`, etc.) para ajustarlos al CONTRACT hasta que se cierre la decisión de naming (Sprint 22-E).
- **Roadmap:** actualizar `docs/ROADMAP.md` al inicio y al cierre de cada sesión.

## Stack

Leaflet 1.9.4, Leaflet.glify, Leaflet.markerCluster, WebGLHeatMap, Turf.js 6.5.0 (solo `bbox`), DOMPurify 3.0.3, Chart.js 4.4.0 (chat). Vanilla JS ES Modules, CSS custom properties (tema claro/oscuro). Backend: Vercel Functions + Supabase + LLM OpenAI-compatible. Detalle en `docs/ARCHITECTURE.md` §3.

## Comandos

```bash
npm run lint        # ESLint sobre js/ + server/
npm run lint:fix    # ESLint con --fix
npm test            # node:test
npm run catalog     # Genera chat.chat_catalog desde allTemasConfig.js
npm run smoke:db    # Verifica conexión a Supabase
npm run smoke:chat  # Smoke test end-to-end del orquestador (acepta una pregunta)
npm run eval:chat   # Golden set completo (equivale a run-golden-set.mjs --all)
npm run ingest:dry  # Ingesta RAG: estima chunks/tokens/costo sin BD ni proveedor
npm run ingest      # Ingesta RAG real (requiere DATABASE_URL + EMBEDDINGS_*)
npm run dev:proxy   # Proxy persistente para Copernicus en local (puerto 3001)
npm run dev         # Vercel dev + proxy Copernicus juntos
```

No hay build step. Los scripts que tocan Supabase o el LLM leen `.env.staging` vía `--env-file`, por lo que requieren **Node.js 20.6+**.

## Arquitectura clave

- `js/store/appState.js` — única fuente de verdad para mapa, capas, filtros y UI.
- `js/config/` — una dimensión por archivo (agua, agricultura, clima, energia, mineria, otros, planificacion, riesgos, suelo) + `allTemasConfig.js`, `capasBase.js`, `wms_services.js`, `leyendaAliases.js`, `constants.js`.
- `geojson/` — ~71 GeoJSON estáticos, cargados on-demand.
- `js/utils/` — `layerUtils`, `glifyAdapter`, `wmsUtils`, `attributeTableUtils`, `sidebarUtils`, `searchControl`.
- `server/chat/`, `server/llm/`, `server/db/` — backend del chat (ver ARCHITECTURE §4).
- `server/proxy/` — proxy cerrado de servicios externos; `api/proxy.js` es el adapter (ver ARCHITECTURE §4.14).

## Peculiaridades del visor

**Los alias no coinciden con las claves del GeoJSON.** Normaliza con `.toLowerCase().trim()` en ambos lados al hacer lookup; si no, falla.

**`dataFilter` se ignora en algunos renderizadores.** `cargarCapaIndividual()` crea `dataParaRender` aplicando `dataFilter` *antes* de pasar a glify/heatmap/cluster/`L.geoJson`; `updateLayerFilter()` también lo aplica al reconstruir. Si agregas un renderer nuevo, haz lo mismo.

**Glify `colorCallback` no verifica `dataFilter`.** En `glifyAdapter.js:buildColorCallback()`, agrega la verificación manual si el feature debe filtrarse.

**Glify solo para polígonos.** `GLIFY_CONFIG.USE_GLIFY_RENDERER` y `GLIFY_TYPES` en `constants.js`. Los puntos nunca van a glify; las líneas van a `L.geoJson` (SVG) porque WebGL maneja mal el z-index y el anti-aliasing en líneas.

**Capas WMS.** El servicio se declara en `wms_services.js`; en la dimensión, la capa usa `tipo: 'wms'` + `servicio: '<clave>'` (sin `url`). `cargarCapaIndividual` las detecta con `isWMSLayer()` y crea `L.tileLayer.wms` con `createWMSLayer()`. Los filtros por atributo no aplican en cliente (los gestiona el servidor).

**Selector de fecha Copernicus.** La disponibilidad se consulta por mes al abrir el calendario (WFS), no al activar la capa; el historial llega a 2017-01-01 y las marcas son azules (las DGA siguen rojas).

**`capas` es el índice maestro del tema.** `grupos.<x>.capas` reutiliza subconjuntos por diseño; un duplicado entre `capas` y un grupo es legítimo. Solo es duplicado real dentro del mismo contenedor.

**Turf.js solo para `bbox`** (`attributeTableUtils.js`, `sidebarUtils.js`, `layerItem.js`).

**Web Workers.** `layerProcessor.worker.js` procesa GeoJSON fuera del hilo principal; no bloquees el hilo con datos pesados. El pool se destruye en `beforeunload`; sin `Worker`, hay fallback a `fetch` en el hilo principal.

**Estructura de una capa:** `tipo`/`type` (point/line/polygon/heatmap/wms), `renderer`, `dataFilter` (filtro de usuario), `hiddenAttributes` (categorías ocultas por leyenda).

## Chat IA

- Endpoint `api/chat.js`: handler delgado. Capas de defensa previas al orquestador: `input-validator`, `rate-limiter` (en memoria), `geo-filter`, `scope-filter` y `domain-classifier`.
- Orquestador: L1 (tool calling) + L2 (síntesis forzada). `ORCHESTRATOR_MAX_ITERATIONS` controla las rondas de tools (default 1, mínimo 1). Presupuesto: `ORCHESTRATOR_BUDGET_MS` (default 8000).
- **13 tools**, una por archivo en `server/chat/tools/`: 9 de capas (`get_layer_stats`, `get_layer_schema`, `query_layer`, `aggregate_layer`, `aggregate_by_admin`, `aggregate_by_admin_and_column`, `count_near_layer`, `aggregate_near_layer`, `get_layer_features`) y 4 de clima (`get_station_weather`, `get_historical_climate`, `list_climate_stations`, `get_arclim_forecast`). `normalizeArgs` y `withTimeout` en `tools/_helpers.js`. Las RPCs tienen timeout de 6 s. El router determinístico solo conoce las 9 de capas (`server/chat/capabilities/registry.js`); las de clima las invoca el orquestador.
- El system prompt se cachea 5 min en memoria del módulo.
- **Latencia:** `CHAT_TIMING_ENABLED=1` emite `chat.timing` (JSON por request, sin BD); baseline en `docs/chat-latency-baseline.md`.
- **Concurrencia:** rate limit por IP+sessión, caché de `chat_catalog` (5 min) y semáforo LLM (`LLM_MAX_CONCURRENCY=4`, cola 20; `503` con `Retry-After`).
- Contrato de gráficos: `charts` (array) es canónico; `chart` (singular) solo por compatibilidad. Tipos: `pie` (≤ 6 grupos), `bar` (≤ 20), `horizontalBar` (> 20); el frontend dibuja `horizontalBar` como `bar` con `indexAxis: 'y'`. `aggregate_by_admin_and_column` no genera gráfico.
- `CHAT_VERBOSE` (el LLM puede nombrar tools y `layer_id`) y `ORCHESTRATOR_DEBUG` (logs de servidor) son independientes.
- Header `x-opencode-session` para el proveedor OpenCode Go.

### Gobierno de la configuración del chat (Sprint 40-D.2)

Los prompts (`chat.system`, `chat.classifier`), las settings (`chat.router.*`, `chat.verbose`, killswitches), los mensajes (`chat.*`) y el inventario de datos no disponibles viven en tablas `admin.*` de Supabase. Se pueden editar sin deploy.

**Reglas antes de activar un cambio en producción**:
1. Correr el golden set en staging con el prompt/setting nuevo:
   `CHAT_ROUTER_ENABLED=1 CHAT_UNAVAILABLE_ENABLED=1 node --env-file=.env.staging scripts/run-golden-set.mjs --all`
2. Comparar el acierto por tier con la línea base. Si baja, **no se activa**.
3. Si baja, rollback con `admin_rollback_prompt(id, version, "tu-email")`.
4. Los prompts están versionados. Cada cambio crea una versión nueva (`admin_set_prompt`). Se puede ver el historial con `admin_list_prompt_versions(id)`.
5. Fallback: si la BD no responde, el chat usa el prompt hardcodeado (`SYSTEM_PROMPT_BASE`, `CLASSIFIER_SYSTEM_PROMPT`). INV-5 del CONTRACT.

**Variables de entorno del golden set** (para reproducir la corrida):
- `CHAT_ROUTER_ENABLED=1` (router determinístico).
- `CHAT_UNAVAILABLE_ENABLED=1` (detector de datos no disponibles).
- `CHAT_GEOJSON_ENABLED=1` (geojson en la respuesta).
- `CHAT_VERBOSE=0` (modo producción) o `1` (desarrollo).
- El header del runner imprime estos flags, el modelo y las versiones de prompt.

## Vercel

`vercel.json` aplica la config de Functions **solo a `api/chat.js`** (`maxDuration: 300`); el resto de endpoints (`arclim-geojson`, `stations-map`, `station-series`, etc.) usa los defaults de Vercel. `excludeFiles` excluye `geojson/`, `db/`, `scripts/`, `docs/`, `help.html`, `session_export.md`, `skills-lock.json`.

## Archivos críticos

- `js/store/appState.js` — estado global.
- `js/utils/layerUtils.js` — `cargarCapaIndividual()`, `dataParaRender`, loader WMS.
- `js/utils/glifyAdapter.js` — `buildColorCallback()` con `dataFilter`.
- `js/utils/wmsUtils.js` — creación de capas WMS.
- `js/utils/attributeTableUtils.js` — tabla, búsqueda, filtros, `refreshAttributeTableIfOpen`.
- `js/config/copernicusLayer.js` — ficha común de capas satelitales (fecha, bandas, leyenda, historial).
- `js/utils/copernicusDateSelector.js` — disponibilidad WFS por mes y fecha histórica de Copernicus.
- `index.html` — entry point de la SPA.

## Agregar una capa

- **GeoJSON:** config en `js/config/<dimension>.js` + archivo en `geojson/`. Sin build; recarga el navegador. Para que el chat la vea, ver `docs/DEV_GUIDE.md` §7.
- **WMS:** servicio en `wms_services.js` + capa con `tipo: 'wms'` y `servicio: '<clave>'` en la dimensión. No requiere GeoJSON local.
- **Copernicus (WMS satelital):** service con `copernicus()` en `wms_services.js` + `copernicusLayer(...)` en la dimensión + grupo `satelite`. Ver `docs/DEV_GUIDE.md` §3.8.
