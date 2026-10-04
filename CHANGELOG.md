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

## Etapa ROADMAP (2026-10-02 / 2026-10-03)

Sprints 01-05 del ROADMAP (staging, contratos y ADRs, tools por archivo + tests, rate limiting + filtros de dominio, multi-chart). El detalle de cada uno está en `docs/ROADMAP.md`.

---

## E7 — Prompt con las 8 tools

- Tras añadir `count_near_layer`, `aggregate_near_layer`, `aggregate_by_admin_and_column` y la capa unificada `agua_superficial`, el `SYSTEM_PROMPT` seguía listando 5 tools.
- `SYSTEM_PROMPT_BASE` pasa a 8 tools en 3 categorías (tabulares, geoprocesos administrativos, geoprocesos de proximidad). 16 reglas renumeradas.
- Regla 6: doble agrupación con `aggregate_by_admin_and_column`. Regla 7: proximidad con `count_near_layer` / `aggregate_near_layer`.
- Regla 13: `aggregate_by_admin_and_column` **no** dispara gráfico (el frontend solo grafica `{group, value}`); el LLM presenta tabla o texto.

## E6 — Geoprocesos espaciales en el chat

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

## E5 — Mejoras puntuales (+ hotfix 5.1)

- Chart por cardinalidad: `pie` (≤ 6), `bar` (≤ 20), `horizontalBar` (> 20); `totalGroups` en el payload; `inferAggregateMeta` para títulos descriptivos.
- Botón "limpiar conversación"; placeholder si Chart.js no carga; nota "Mostrando 10 de N".
- `sanitizeIconFile` bloquea `/`, `\`, `..` en iconos de leyenda; `obtenerCapasVisibles` usa `appState` en vez del DOM.
- Índice de búsqueda cancelable con `AbortController`; `normalizeText` maneja comillas tipográficas.
- `configValidator` valida que `cargaInicial.capas` exista en `estilo`.
- `energia_potencial_*`: eliminado `atributo: "COMUNA"` duplicado (el segundo, `REGION`, ganaba en silencio).
- **5.1:** `_indexAbortController` sin declarar → `let _indexAbortController = null;`. Además el validador dejó de avisar duplicados entre `capas` y `grupos` (legítimos: `capas` es el índice maestro del tema).

## E4 — Arquitectura e infraestructura

- `vercel.json`: `api/**/*.js`; `excludeFiles` amplía a `db/`, `scripts/`, `docs/`, `help.html`, `session_export.md`, `skills-lock.json`.
- `window.appState` solo se expone con `LOG_CONFIG.ENABLE_DEBUG`; `.catch()` en `mapReady`.
- Eliminados 3 `alert()` y botones inútiles de capas base; eliminado `L.control.zoom` nativo; `.navbar.fixed-top` → `.header`.
- `themeUI` con import estático; `history` del chat acotado a 20; `isConfigError` → 503, resto → 500.
- `workerPool`: `supportsWorkers()` con fallback a `fetch`; `destroyWorkerPool()` en `beforeunload`.

## E3 — Huérfanos y defaults

- `.env.example` alineado con el código: `LLM_MAX_TOKENS` 1024, `ORCHESTRATOR_MAX_ITERATIONS` 1.
- `.gitignore` depurado (`.env.*.local`); `session_export.md` y `skills-lock.json` fuera del tracking; eliminado `js/config/temas_config.js` (código muerto).

## E2 — Bugs funcionales y coherencia

- Tabla de atributos: restaura el sidebar derecho tras una segunda apertura; `renderChunk` sin `indexOf` (O(n²) → O(n)); `IntersectionObserver` por chunk; conserva `scrollTop`/`scrollLeft` al refrescar.
- `dimensionBuilder`: handler `change` duplicado eliminado; `loaded.add` redundante eliminado.
- `layerItem`: `import()` dinámicos → estáticos; `closeOtherMenu` corregido.
- `configValidator` devuelve `{errores, advertencias}`; valida WMS, `type`, duplicados y coherencia `atributo` ↔ `colores/iconos`.
- `normalizeArgs` defensivo (coacción de tipos, `limit` 1-50, whitelist de `metric`, degradación a `count` sin `field`); `withTimeout` por RPC; tool desconocida devuelve `{ok:false}`.

## E1 — Bugs críticos

- `help.js`: `const wrapper` duplicado rompía `help.html` (SyntaxError).
- Nuevo `wmsUtils.js` y loader WMS en `cargarCapaIndividual`; `updateLayerFilter` respeta WMS y reutiliza el heatmap (evita fuga de contextos WebGL); `estimateLayerSize` por tipo de geometría.
- **XSS** corregido en `styleUtils` (etiquetas, popups, enlaces) y `markers.js` (popups de búsqueda).
- Orquestador: `buildSynthesisMessages` agrupa resultados de tools en un solo mensaje user (dos mensajes user consecutivos hacían que el LLM ignorara las tools); guard para `ORCHESTRATOR_MAX_ITERATIONS < 1`; timeout real con `AbortSignal.timeout`; el fallback devuelve `chart`; caché del system prompt (5 min).

## E0 — Fase 1: chat con tool-calling sobre Supabase

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

## Superado por documentos actuales

Cosas que decía `IMPLEMENTATION.md` y hoy se resuelven en otro lugar:

| Decía | Hoy |
|---|---|
| `tools.js` con 3 tools | 8 tools, una por archivo, en `server/chat/tools/` |
| `normalizeArgs` en `runners.js` | `server/chat/tools/_helpers.js` |
| Timeout de RPC de 4 s | 6 s (desde E6) |
| `chart` singular | `charts` (array) canónico + `chart` por compatibilidad (CONTRACT §6.2) |
| Fases 2-5 (`admin.html`, `api/integrations/`) | Sprints 06-21 del ROADMAP (el panel admin es `apps/admin`, no `admin.html`) |
| Tabla de variables de entorno | `.env.example` |

## Versiones

- **v2.0 (septiembre 2026):** refactor completo desde la base IFI Atacama; Leaflet.glify; Web Worker; asistente IA con Supabase; tabla de atributos; tema claro/oscuro; buscador global; soporte WMS.
- **v1.x:** versión inicial para la Región de Atacama (basada en `diegoxkaf/visor_woll_atacama`).