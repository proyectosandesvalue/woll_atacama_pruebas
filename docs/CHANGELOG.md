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