
### Archivos nuevos

| Ruta | Rol |
|---|---|
| `db/migrations/001_chat_fase1.sql` | Esquema `chat`, catálogo, stats precalculadas, RPCs tipadas y grants a `service_role` |
| `server/db/config.js` | Lee variables de entorno y resuelve config del driver activo |
| `server/db/pool.js` | Factoría del driver con cache de cliente por invocación |
| `server/db/drivers/supabase.js` | Driver REST de Supabase (`rpc`, `query`) con auth `service_role` |
| `server/llm/config.js` | Lee variables del proveedor LLM |
| `server/llm/provider.js` | Factoría del driver LLM (solo hay uno: openai-compatible) |
| `server/llm/drivers/openai-compatible.js` | Driver LLM sobre el dialecto OpenAI Chat Completions (Groq, OpenAI, Together, Mistral, vLLM local) |
| `server/chat/tools.js` | Definición JSON-Schema de las **3 tools** expuestas al LLM |
| `server/chat/runners.js` | Ejecutores que llaman a Supabase vía el pool + normalización defensiva de args |
| `server/chat/orchestrator.js` | Ciclo tool-calling + presupuesto de tiempo + detección de `chart` + caché del system prompt |
| `scripts/` | Carpeta para scripts Node (migraciones, inventario del catálogo, smoke tests) |
| `.env.example` | Plantilla de variables de entorno |

### Archivos modificados

| Ruta | Cambio |
|---|---|
| `package.json` | `name` y `description` actualizados al nombre oficial |
| `README.md` | Título, tagline e intro actualizados al nombre oficial |
| `AGENTS.md` | Título y descripción del proyecto actualizados al nombre oficial |
| `help.html` | `<title>` actualizado al nombre oficial |
| `api/chat.js` | Reescrito como endpoint delgado que delega al orquestador |
| `js/utils/chatAssistant.js` | Reducido a un wrapper sobre `POST /api/chat`; muere la precarga de 270 MB |
| `js/ui/chatUI.js` | Render estructurado (`reply` + `chart`), markdown mínimo, sin precarga |
| `index.html` | `<script>` de Chart.js por CDN añadido |

### Seguridad

- **Service_role key:** NUNCA llega al frontend. Solo el servidor la lee
  de variables de entorno (`SUPABASE_SERVICE_KEY` en Vercel).
- **Grants de las RPCs:** REVOKE a `anon` y `authenticated`; solo
  `service_role` puede ejecutar las funciones del esquema `chat`.
- **Anti SQL-injection:** el LLM NO escribe SQL; invoca RPCs tipadas con
  parámetros. Las RPCs filtran columnas por una whitelist derivada de
  `chat_catalog` y de `information_schema.columns`.
- **Rotación recomendada:** cualquier secreto pegado en chats o canales
  no seguros debe regenerarse desde el dashboard del proveedor (Supabase
  → Settings → API → service_role → Regenerate; Groq → API Keys →
  Revoke + crear nueva).

### Despliegue en Vercel

Configurar las siguientes variables de entorno en el dashboard de
Vercel (Settings → Environment Variables), tanto en Production como en
Preview y Development:

| Variable | Ejemplo | Notas |
|---|---|---|
| `DB_DRIVER` | `supabase` | Hoy solo hay driver `supabase` |
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | URL del proyecto |
| `SUPABASE_SERVICE_KEY` | `eyJ...` | Secreto, NO anon key |
| `LLM_PROVIDER` | `openai-compatible` | Cubre Groq, OpenAI, Together, Mistral, vLLM |
| `LLM_BASE_URL` | `https://api.groq.com/openai/v1` | Cambiar al migrar de proveedor |
| `LLM_MODEL` | `openai/gpt-oss-120b` | Modelo que soporta tool-calling |
| `LLM_API_KEY` | `gsk_...` | Secreto del proveedor |
| `LLM_MAX_TOKENS` | `1024` | Límite de la respuesta final |
| `LLM_TEMPERATURE` | `0.7` | |
| `ORCHESTRATOR_BUDGET_MS` | `8000` | Vercel Hobby = 10s; dejamos margen |
| `ORCHESTRATOR_MAX_ITERATIONS` | `2` | Rondas de tool-calling (mínimo 1) |

### Pasos de implementación (orden recomendado)

1. Ejecutar `db/migrations/001_chat_fase1.sql` en el SQL Editor de Supabase
   como rol `postgres`.
2. Configurar `.env` local con las variables listadas.
3. Generar el catálogo: `node scripts/build_catalog.mjs`.
4. Refrescar stats: ejecutar `SELECT chat.chat_refresh_stats();` en el
   SQL Editor.
5. Probar localmente: `npx vercel dev` y abrir el visor, abrir el chat
   y enviar una pregunta.
6. Revisar logs en Vercel Functions (Runtime Logs) para validar el
   ciclo de tool-calling.
7. Deploy a Vercel (`vercel --prod` o push a main).

### Migración de datos: inventario + stats

El script `scripts/build_catalog.mjs` (versión Plan K):

- Lee `js/config/allTemasConfig.js` como fuente de verdad (display_name,
  dimension, popupCampos → attributes).
- Asume la convención `layer_id == nombre de tabla en public`.
- UPSERT en `chat.chat_catalog` vía la RPC `public.chat_upsert_layer(...)`.
- Al terminar, ejecuta `chat_refresh_stats()`.
- Re-ejecutable tras añadir nuevas capas.

Nota: el descubrimiento automático de geometrías (`chat_list_geom_tables`)
no funcionó en este proyecto y cae al Plan K si falla.

### Decisiones cerradas en fase 1

| Tema | Decisión |
|---|---|
| Proveedor LLM | Hoy Groq; abstracción `openai-compatible` para migrar sin tocar código |
| Driver de BD | Hoy Supabase REST; abstracción para migrar a `pg.Pool` en servidor propio |
| Tool-calling en | `openai/gpt-oss-120b` (Groq), formato OpenAI, máx 2 iteraciones |
| Chart en respuestas | Sí, con Chart.js por CDN (Chart.js v4) |
| Streaming | NO en fase 1; se evalúa en fase 2 |
| Precarga de 270 MB | Eliminada del navegador; ahora vive en `chat_refresh_stats()` |
| Latencia objetivo | < 5s por respuesta con datos estáticos y RPCs precalculadas |

### Troubleshooting

**El chat responde "El servicio de IA no está disponible en este entorno":**
- En local sin `vercel dev`: la Vercel Function no existe, devuelve 404.
- En Vercel: revisa los Runtime Logs; usualmente `SUPABASE_SERVICE_KEY`
  o `LLM_API_KEY` no están configuradas.

**El LLM responde pero los datos no cuadran:**
- `SELECT * FROM chat.chat_layer_stats LIMIT 5;` → verifica stats.
- `SELECT * FROM chat.chat_catalog;` → verifica catálogo.

**El LLM invoca una tool que falla:**
- El orquestador captura el error y lo devuelve como mensaje `role:tool`
  al LLM, que reformula o explica la limitación al usuario.

**Latencia alta (> 5s):**
- Revisar si las RPCs están precalculadas, si Groq tiene latencia elevada
  y si el system prompt del catálogo está inflando la primera llamada.

---

## Sprint 1 — Corrección de bugs críticos

**Fecha:** 2026 (actual).

**Objetivo:** corregir los bugs que rompen funcionalidad, evitar XSS,
endurecer el orquestador y añadir soporte WMS real.

### Archivos modificados

| Ruta | Cambio |
|---|---|
| `js/ui/help.js` | **Fix SyntaxError**: había un `const wrapper` declarado dos veces → rompía `help.html`. Renombrado a `contentWrapper`. Se expusieron `scrollToSection`, `scrollToTop`, `toggleFaq` en `window` para los `onclick` inline. `?.` en todos los handlers de elementos opcionales. |
| `js/utils/wmsUtils.js` 🆕 | Nuevo módulo: `getWMSService`, `isWMSLayer`, `createWMSLayer`. Saca la lógica WMS de `layerUtils.js` y centraliza la lectura de `wms_services.js`. |
| `js/utils/layerUtils.js` | **Loader WMS** integrado (rama al inicio de `cargarCapaIndividual`). `updateLayerFilter` respeta WMS y **reusa el heatmap** (evita fuga de contextos WebGL). `estimateLayerSize` reescrito por tipo de geometría (las listas hardcoded estaban obsoletas). `estimateLayerSizeFromUrl` nuevo. `sampleLineIntoPoints` extraído. `setLayerOpacity` maneja WMS. |
| `js/utils/styleUtils.js` | **Fix XSS**: `addLabelsToLayer` ahora escapa `labelText`; `getPopupContent` escapa `nombreVisible`; `convertirURLsAEnlaces` escapa TODO el texto antes de generar `<a>`. |
| `js/search/markers.js` | **Fix XSS**: los popups de resultados escapan `displayName`, `nombreCapa`, `capaName`. |
| `server/llm/drivers/openai-compatible.js` | Acepta `signal: AbortSignal` en `llm.chat(...)`. Envía `parallel_tool_calls: true` cuando hay tools. |
| `server/chat/orchestrator.js` | **`buildSynthesisMessages` reescrito**: agrupa resultados de tools en un único mensaje user (`Resultados de herramientas:`), evita los dos mensajes user consecutivos que confundían al LLM. **Guard** para `ORCHESTRATOR_MAX_ITERATIONS < 1`. **Timeout real** en la síntesis vía `AbortSignal.timeout(remaining)`. **Fallback devuelve `chart`**. **`buildChartFromHistory` filtra por `aggregate_layer`**. **Caché del system prompt** (`SYSTEM_TTL_MS = 5 min`). |

### Impacto

- `help.html` deja de romperse al cargar.
- Las capas WMS (`wms_ide_minagri`, `wms_ide_ciren_agroindustrias` en `otros.js`)
  ahora se renderizan correctamente en lugar de fallar.
- Los popups y etiquetas ya no son vectores de XSS con GeoJSON malicioso.
- El chat responde con datos reales de tools sin alucinar cuando el
  presupuesto se agota (fallback con chart).
- El system prompt se cachea → menos llamadas a Supabase por request.

---

## Sprint 2 — Bugs funcionales secundarios y coherencia

**Fecha:** 2026 (actual).

**Objetivo:** corregir los bugs secundarios de interacción y alinear la
validación de configuración con el estado real del proyecto.

### Archivos modificados

| Ruta | Cambio |
|---|---|
| `js/utils/attributeTableUtils.js` | **`sidebarRightWasVisible`** solo se captura si la tabla no estaba abierta (evita perder la referencia al cerrar tras una segunda apertura). **`renderChunk`** usa `forEach((f, i) => start + i)` en vez de `chunk.indexOf(feature)` (elimina O(n²)). **`IntersectionObserver`** local por chunk y auto-desconectado. **Preserva `scrollTop`** en `refreshAttributeTableIfOpen`. `updateLayerFilter` importado estático (adiós `import()` dinámico). `err.message` y `extra` escapados. |
| `js/sidebar/dimensionBuilder.js` | **Eliminado el `switch` duplicado** en el handler `change` de `switchInput` (un solo `if/else`). **`appState.layers.loaded.add(capaNombre)` redundante eliminado** (ya lo hace `cargarCapaIndividual`). **`estimateLayerSize`** recibe `configCapa` para estimar por tipo. `seCargaInicialmente` simplificado en la rama sin grupos. |
| `js/sidebar/layerItem.js` | **`import()` dinámicos → imports estáticos** (`toggleClusterMode`, `toggleHeatmapMode`, `applySavedOpacity`, `updateLayerFilter`, `openFilterModal`). **`loaded.add` redundante eliminado**. **`data-valor` decodificado por el navegador** (adiós 8 `.replace()` manuales). **`closeOtherMenu`** localiza el `li` correcto vía `menu._originalParent?.closest('.layer-item-container')`. `escapeHtml(capaNombre)` en sub-layers. |
| `js/utils/configUtils.js` | Documentado el caso WMS. Nuevo helper **`isCapaWMS(configCapa)`**. Docstrings simplificados. |
| `js/utils/configValidator.js` | **Valida WMS** (requiere `servicio` si `tipo: 'wms'`, requiere `url` si es GeoJSON). **Valida `type`** contra `point|line|polygon|heatmap`. **Detecta duplicados** entre `capas` y `grupos`. **Coherencia `atributo` ↔ `colores/iconos`**. Devuelve `{errores, advertencias}`. Separa errores/advertencias en logs. |
| `server/chat/runners.js` | **`normalizeArgs` defensivo**: coacciona `layer_id`/`group_by`/`field` a string, acota `limit` entre 1 y 50, fuerza `filters` a objeto plano, valida `metric` contra whitelist, degrada `avg/sum/min/max` a `count` si falta `field`. **Validaciones mínimas** (`layer_id`, `group_by`). **`withTimeout`** de 4s por RPC. **`runTool` uniforme**: tool desconocida devuelve `{ok:false, error}` en vez de lanzar. |

### Impacto

- La tabla de atributos restaura correctamente el sidebar derecho.
- El scroll de la tabla se mantiene al aplicar filtros.
- Las dimensiones se activan/desactivan sin duplicar handlers.
- La configuración se valida al arranque con mensajes más útiles
  (detecta capas sin `url`, sin `servicio` WMS, con `type` inválido,
  duplicadas, o con `atributo` sin `colores/iconos`).
- Los argumentos del LLM se normalizan antes de tocar Supabase: una
  alucinación (`limit: -1`, `filters` como array, `metric` inventado) ya
  no produce un 500.

---

## Fases futuras (pendientes)

### Fase 2 — Respuestas espaciales en el mapa + charts completos

- RPCs adicionales: `chat_spatial(layer, mode, geom)` con `ST_Contains`,
  `ST_Intersects`, `ST_DWithin`.
- El runner devuelve `geojson` (FeatureCollection) además del texto.
- `chatUI.js` pinta el `geojson` como capa temporal en el mapa.
- Botón "Quitar resultados" para limpiar la capa temporal.
- Streaming opcional si las respuestas pasan de 5s.

### Fase 3 — Panel de administración

- `admin.html` SPA estática en el mismo repo, detrás de Supabase Auth.
- Módulos: re-import de capas, métricas del sitio, gestión de APIs
  externas, ingesta de documentos (PDFs → embeddings).

### Fase 4 — APIs externas

- `api/integrations/*.js` con caché en tabla Supabase.
- Nuevas tools: `get_weather(...)`, `get_normativa(...)`.

### Fase 5 — RAG con pgvector

- pgvector: `chat.documents` + `chat.document_chunks` con `vector(1536)`.
- Tool `search_docs(query)` que devuelve top-k chunks.

---

## Cambios incompatibles / migración

- El contrato de `POST /api/chat` cambió de `{messages}` a `{text, history}`.
  Frontend actualizado en la misma fase, sin necesidad de compatibilidad
  hacia atrás.
- El system prompt del chat dejó de inyectar estadísticas precalculadas y
  ahora usa el catálogo de Supabase (`chat.chat_catalog`).
- `js/utils/chatAssistant.js` perdió la API anterior (`getAllAnalytics`,
  `getLayerAnalytics`, `getChatPreloadState`, `subscribeChatPreload`,
  `extractRichStatistics`, `startChatPreload`).
- **Sprint 1**: `layerUtils.estimateLayerSize(capaNombre)` cambia de firma
  a `estimateLayerSize(capaNombre, configCapa)`. Si algún consumidor la
  usaba sin `configCapa`, sigue funcionando (fallback a `10`), pero la
  estimación por tipo requiere pasar el segundo argumento.
- **Sprint 1**: `layerUtils.updateLayerFilter` ahora respeta WMS y reusa
  el heatmap en vez de recrearlo. No rompe consumidores externos.
- **Sprint 2**: `configValidator.validarConfiguracionGlobal` devuelve
  `{errores, advertencias}` en lugar de `void`. Los consumidores actuales
  (solo `app.js`) lo ignoran, sin cambios.

  ---

## Sprint 3 — Limpieza de archivos huérfanos y alineación de defaults

**Fecha:** 2026 (actual).

**Objetivo:** alinear `.env.example` con los defaults reales del código,
limpiar `.gitignore` y sacar del repositorio archivos que deben quedar
solo en local.

### Cambios

| Ruta | Cambio |
|---|---|
| `.env.example` | `LLM_MAX_TOKENS`: `512` → `1024`. `ORCHESTRATOR_MAX_ITERATIONS`: `3` → `1`. Ambos ahora coinciden con los defaults de `server/llm/config.js` y `server/chat/orchestrator.js`. Añadido comentario sobre la relación entre ambos valores y el TPM del proveedor. |
| `.gitignore` | Eliminado `.vercel` duplicado del final (ya estaba `.vercel/` arriba). Añadido `.env.*.local` para cubrir overrides locales por entorno. Eliminado `temas_config.js` de la lista de ignorados (se elimina del disco). |
| `session_export.md` | `git rm --cached`. Queda en local, ignorado por `.gitignore`. |
| `skills-lock.json` | `git rm --cached`. Queda en local, ignorado por `.gitignore`. |
| `js/config/temas_config.js` | `git rm`. Eliminado del repo y del disco. Era un objeto suelto sin `export` ni uso (código muerto). |

### Impacto

- Copiar `.env.example` produce una configuración que cabe en el tier
  free de Groq (8000 TPM).
- El repositorio deja de trackear archivos de sesión/agente que deben
  ser locales.
- Se elimina código muerto que confundía sobre cómo se configuran las
  etiquetas en el proyecto.

  ---

## Sprint 4 — Arquitectura y coherencia de infraestructura

**Fecha:** 2026 (actual).

**Objetivo:** corregir decisiones arquitectónicas que no rompen pero
degradan la calidad (exposición innecesaria de estado, `alert()`
bloqueantes, redundancias de inicialización, config de Vercel demasiado
estrecha, `Worker` sin fallback).

### Cambios

| Ruta | Cambio |
|---|---|
| `vercel.json` | `api/*.js` → `api/**/*.js` para que futuras subcarpetas (`api/integrations/*.js`) hereden la config. `excludeFiles` amplía a `db/`, `scripts/`, `docs/`, `help.html`, `session_export.md`, `skills-lock.json`. |
| `js/store/appState.js` | `window.appState` solo se expone si `LOG_CONFIG.ENABLE_DEBUG`. `.catch()` añadido a `mapReady` para evitar unhandled rejection si `script.js` no llega a cargar. |
| `js/sidebar/groupManager.js` | Eliminados los 3 `alert()` y los botones inútiles (Zoom, Ver tabla, Descargar) de las capas base. Menú de capas base queda vacío (no aplica). |
| `js/utils/mapUtils.js` | Eliminado `L.control.zoom` nativo (la app usa botones propios y el CSS oculta el nativo). Corregido `.navbar.fixed-top` → `.header` (era un selector inexistente). |
| `js/ui/themeUI.js` | `import()` dinámico → import estático de `allTemasConfig`. |
| `api/chat.js` | `history` acotado a 20 items antes de pasarlo al orquestador. Ternario inútil eliminado; `isConfigError` → 503, resto → 500. |
| `js/workers/workerPool.js` | `supportsWorkers()` con fallback a `fetch` en el hilo principal. `destroyWorkerPool()` + listener en `beforeunload` para no dejar workers huérfanos. |

### Impacto

- Menos peso por invocación de Function (bundle más limpio).
- Ningún `alert()` bloqueante en la UI.
- Menos round-trips (`themeUI` importa `allTemasConfig` una sola vez).
- `Worker` no es requisito duro: la app sigue funcionando sin él.
- `history` acotado evita un vector de abuso trivial.

---

## Sprint 5 — Oportunidades y mejoras puntuales

**Fecha:** 2026 (actual).

**Objetivo:** ampliar el contrato del chat (tipos de chart, limpieza de
conversación), reforzar la seguridad de paths de iconos, desacoplar la
leyenda del DOM y afinar validaciones de configuración.

### Cambios

| Ruta | Cambio |
|---|---|
| `server/chat/orchestrator.js` | **Tipos de chart según cardinalidad**: `pie` (≤ 6 grupos), `bar` (≤ 20), `horizontalBar` (> 20). **`inferAggregateMeta`** extrae `metric` y `group_by` del `tool_call` original para títulos descriptivos. **`totalGroups`** añadido al payload. Coerción de `value` a number. |
| `js/ui/chatUI.js` | **Botón "limpiar conversación"** (`#clearChatBtn`): borra historial y mensajes renderizados, conservando el saludo inicial. **Manejo explícito de error de Chart.js** (placeholder si no cargó). **Soporte `horizontalBar`** con `indexAxis: 'y'`. **`ai-chart-note`** ("Mostrando 10 de N"). `CHART_PALETTE` y `MAX_HISTORY` como constantes de módulo. |
| `js/utils/attributeTableUtils.js` | `refreshAttributeTableIfOpen` preserva `scrollLeft` además de `scrollTop`. |
| `js/search/index.js` | `normalizeText` maneja comillas tipográficas y guiones largos. `AbortController` global cancela fetches al reconstruir el índice. Manejo de `AbortError` sin loguear como error real. |
| `js/utils/legendUtils.js` | `sanitizeIconFile` valida el nombre del icono (bloquea `/`, `\`, `..`). `obtenerCapasVisibles` usa `appState.layers.byName` + `appState.map.hasLayer` en lugar del DOM. Maneja glify con `isActive()`. |
| `js/utils/configValidator.js` | Valida que cada capa en `cargaInicial.capas` exista en `estilo`. |
| `js/config/energia.js` | Eliminados los 3 `atributo: "COMUNA"` duplicados en `energia_potencial_fotovoltaico`, `energia_potencial_solar_csp` y `energia_potencial_eolico`. Añadido `fillOpacity: 0.3` explícito. |
| `css/components.css` | Estilos `.chat-actions`, `.ai-chart-placeholder`, `.ai-chart-note`. |
| `index.html` | Añadido botón `#clearChatBtn` en el header del sidebar de chat. |

### Contrato de `chart` (frontend ↔ backend)

Después de Sprint 5, el campo `chart` que devuelve `/api/chat` tiene
esta forma:

```json
{
  "type": "pie" | "bar" | "horizontalBar" | "line",
  "title": "Distribución por comuna (top 10)",
  "labels": ["Copiapó", "Vallenar", ...],
  "values": [42, 31, ...],
  "totalGroups": 24
}

Reglas del orquestador:

aggregate_layer con metric: 'count' y pocos grupos → pie.

aggregate_layer con muchos grupos (> 20) → horizontalBar.

En el resto de casos → bar.

El frontend respeta type y renderiza el eje correcto según
horizontalBar.

Impacto
El usuario puede limpiar la conversación sin recargar la página.

Los gráficos se adaptan a la cardinalidad (un count por comuna sale
como pie si son 5 comunas, como bar horizontal si son 30).

Si Chart.js no carga, el usuario lo ve (placeholder) en vez de un
hueco silencioso.

El índice de búsqueda ya no queda obsoleto al cambiar de tema.

Las rutas de los iconos de leyenda están sanitizadas.

energia_potencial_* ahora usan REGION como atributo (antes JS
sobreescribía COMUNA por REGION silenciosamente).

### Hotfix posterior — Sprint 5.1

**Síntoma 1:** `Uncaught (in promise) ReferenceError: _indexAbortController is not defined`
en `js/search/index.js:181`, disparado desde `buildSearchIndex()`.

**Causa:** el refactor de Sprint 5 introdujo un `AbortController` global
para cancelar fetches al reconstruir el índice, pero la declaración de la
variable (`let _indexAbortController = null;`) no se añadió al bloque de
variables del módulo.

**Fix:** declarar `let _indexAbortController = null;` junto a
`isIndexing`/`searchCache`/`configCache`/`themeCache`.

---

**Síntoma 2:** ~70 warnings en consola del tipo
`[Validación Config] Tema "agua": la capa "X" aparece más de una vez (entre capas y grupos).`

**Causa:** la validación de duplicados de Sprint 5 interpretaba como
"duplicado" cualquier capa presente en `capas` **y** en algún grupo.
Pero en este proyecto `capas` es el **índice maestro** del tema y
`grupos.<x>.capas` reutiliza subconjuntos de esa lista por diseño.

**Fix:** el validador ahora solo avisa de duplicados **dentro del mismo
contenedor** (dos veces en `capas`, o dos veces en el mismo grupo).
Duplicados entre `capas` ↔ `grupos` son legítimos y no se avisan.

**Archivos afectados:** `js/search/index.js`, `js/utils/configValidator.js`.

---

## Sprint 6 — Geoprocesos espaciales en el chat IA (Fase 1)

**Fecha:** 2026 (actual).

**Objetivo:** permitir que el chat responda preguntas del tipo
*"¿cuántas plantas desaladoras por comuna?"* aunque la capa no tenga
columna `comuna`, mediante intersección espacial en PostGIS. Añadir
también introspección de esquema para que el LLM no alucine nombres de
columnas.

### Cambios

| Ruta | Cambio |
|---|---|
| `db/migrations/002_chat_spatial.sql` 🆕 | Índices GIST iterando catálogo. RPC `chat_layer_schema(layer_id)` (columnas reales + top 5 valores). RPC `chat_aggregate_by_admin(layer_id, admin_level, metric, field, filters)` que agrupa vía `ST_Intersects` contra `public.comunas_poligonos`. Grants solo a `service_role`. Idempotente. |
| `server/chat/tools.js` | 2 tools nuevas: `get_layer_schema` (introspección) y `aggregate_by_admin` (geoproceso). Descripciones reescritas para guiar al LLM sobre cuándo usar cada una. |
| `server/chat/runners.js` | 2 runners nuevos (`runGetLayerSchema`, `runAggregateByAdmin`). Timeout de RPC subido a 6s (los geoprocesos pueden tardar más). `normalizeArgs` maneja `admin_level` (lowercase + whitelist + fallback a `comuna`). |
| `server/chat/orchestrator.js` | `SYSTEM_PROMPT` reescrito: 5 tools + regla explícita *"para 'por comuna' usa aggregate_by_admin, NO aggregate_layer"*. Slice del system prompt ampliado a 12000 chars, 15 columnas por capa. `inferAggregateMeta` y `buildChartFromHistory` reconocen también `aggregate_by_admin`. |
| `scripts/build_catalog.mjs` | `attributes` ahora se leen de `information_schema.columns` (columnas reales de Postgres) en lugar de `popupCampos` del visor. Fallback a `popupCampos` si falla. |
| `scripts/register_admin_layer.mjs` 🆕 | Registra `public.comunas_poligonos` en `chat.chat_catalog` con `dimension: "contexto"` y `enabled: true`. Verifica existencia de la tabla y de las columnas `COMUNA`, `PROVINCIA`, `REGION`, `geom`. |

### Requisitos previos

- Tabla `public.comunas_poligonos` en Supabase con:
  - `COMUNA` text
  - `PROVINCIA` text
  - `REGION` text
  - `geom` geometry(MultiPolygon, 4326)
- PostGIS instalado en Supabase (ya lo está).

### Instrucciones de aplicación

1. **Subir la capa** `comunas_poligonos` desde QGIS:
   - SRID 4326.
   - Nombre de tabla: `comunas_poligonos`.
   - Columna geométrica: `geom`.
   - Campos: `COMUNA`, `PROVINCIA`, `REGION`.

2. **Ejecutar la migración** `002_chat_spatial.sql` en el SQL Editor de Supabase como rol `postgres`.

3. **Registrar la capa** en el catálogo:
   ```bash
   node scripts/register_admin_layer.mjs



   ### Sprint 6.3 — Mejoras de formato de respuesta del chat

**Problema detectado en producción**: al preguntar *"¿en qué comunas se
encuentran las plantas desaladoras?"*, el LLM respondía con una **tabla
markdown** (que el frontend no renderizaba) **y** un **gráfico pie** con
la misma información → redundante y desalineado.

**Cambios**:

1. **`orchestrator.js` → SYSTEM_PROMPT**: nuevas reglas 11-14 que
   instruyen al LLM a:
   - NO repetir la misma información como tabla Y gráfico.
   - Cuando la tool haya sido una agregación (`aggregate_layer` o
     `aggregate_by_admin`), el frontend ya dibuja el gráfico → el LLM
     solo redacta 2-4 frases de análisis.
   - Cuando los datos NO vengan de una agregación, puede usar tablas
     markdown estándar (`| col | col |`).
   - Listas simples con `-` en lugar de tablas para enumeraciones.

2. **`chatUI.js` → `renderRichText`**: soporte de renderizado para
   tablas markdown, listas con viñetas y párrafos. Antes solo procesaba
   `**negrita**` y saltos de línea.

3. **`chatUI.js` → `renderChart`**: pie con leyenda en la parte inferior
   (`position: 'bottom'`, `usePointStyle: true`), fuentes legibles,
   tooltips con label + valor. Evita el solapamiento de labels dentro
   de las porciones.

4. **`components.css`**: estilos para `.ai-message-table`,
   `.ai-message-list`, `.ai-message-paragraph`. Canvas del chart subido
   a 240px para que la leyenda del pie no se corte.

**Impacto**:
- Respuestas coherentes: un solo formato de presentación por respuesta.
- Tablas markdown renderizadas correctamente (antes aparecían como texto
  plano con pipes).
- Gráficos legibles en todos los tipos (pie, bar, horizontalBar).

### Sprint 6.4 — Modo verbose/producción del chat

**Problema**: durante el desarrollo, el LLM mencionaba tools
(`【get_layer_stats】`), layer_ids (`plantas_desaladoras_puntos`) y
nombres técnicos en las respuestas al usuario. Útil para debug, pero en
producción contamina la respuesta.

**Solución**: variable de entorno `CHAT_VERBOSE` que controla las reglas
de estilo del system prompt:

- `CHAT_VERBOSE=1` → modo desarrollo. El LLM puede mencionar tools,
  layer_ids y columnas de BD. Útil para debug.
- `CHAT_VERBOSE=0` → modo producción. El LLM habla solo en lenguaje
  natural, con nombres visibles de capas y etiquetas en español.

**Cambios**:

- `orchestrator.js`: `SYSTEM_PROMPT` y `SYNTHESIS_SYSTEM_PROMPT`
  parametrizados. Reglas 15-20 dinámicas según `CHAT_VERBOSE`.
- `.env.example`: nueva variable documentada.

**Independencia**:

- `ORCHESTRATOR_DEBUG=1` → logs técnicos en la consola del server.
- `CHAT_VERBOSE=1` → el LLM menciona detalles técnicos en la respuesta
  visible del usuario.

Son ortogonales: se pueden activar por separado.

**Configuración recomendada**:

| Entorno | `CHAT_VERBOSE` | `ORCHESTRATOR_DEBUG` |
|---|---|---|
| `.env` local | `1` | `0` |
| Vercel Preview | `1` | `1` |
| Vercel Production | `0` | `0` |

### Sprint 7.1 — Prompt actualizado con las 8 tools

**Problema**: tras añadir las 3 tools espaciales nuevas
(`count_near_layer`, `aggregate_near_layer`,
`aggregate_by_admin_and_column`) y la capa unificada
`agua_superficial`, el `SYSTEM_PROMPT` seguía listando solo 5 tools,
por lo que el LLM no sabía que existían las nuevas.

**Cambios**:
- `SYSTEM_PROMPT_BASE`: "5 herramientas" → "8 herramientas", organizadas
  en 3 categorías (consultas tabulares, geoprocesos administrativos,
  geoprocesos de proximidad).
- Reglas renumeradas (16 en total).
- Nueva regla 6: doble agrupación con `aggregate_by_admin_and_column`.
- Nueva regla 7: proximidad con `count_near_layer` /
  `aggregate_near_layer`, con mención a la capa unificada
  `agua_superficial`.
- Regla 13 aclarada: `aggregate_by_admin_and_column` NO dispara
  gráfico (el frontend solo grafica `{group, value}`), así que el LLM
  debe presentar los datos como tabla o texto.