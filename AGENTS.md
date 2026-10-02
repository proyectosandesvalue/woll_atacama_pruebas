# AGENTS.md — Plataforma_WOLL_Atacama

## Proyecto
Plataforma Territorial Water Oriented Living Lab Atacama. WebGIS territorial para la Región de Atacama, Chile. Static files (no build system) + Vercel Functions para el chat IA.

## Stack
- Leaflet 1.9.4, Leaflet.glify (WebGL polygons), Leaflet.markerCluster, WebGLHeatMap, Turf.js 6.5.0, DOMPurify 3.0.3, Chart.js 4.4.0 (chat IA)
- Vanilla JS ES Modules, CSS custom properties (dark/light theme)
- Sin bundler — sirve archivos estáticos directo desde cualquier HTTP server
- Backend: Vercel Functions (`api/chat.js`) + Supabase PostGIS + Groq (u otro LLM OpenAI-compatible)

## Comandos
```bash
npm run lint        # ESLint sobre js/ + server/
npm run lint:fix    # ESLint con --fix
npm run catalog     # Genera chat.chat_catalog desde allTemasConfig.js
npm run smoke:db    # Verifica conexión a Supabase
npm run smoke:chat  # Smoke test end-to-end del orquestador
# No tests, no build step

Arquitectura clave
appState (js/store/appState.js) — single source of truth para mapa, capas, filtros, UI

js/config/ — archivos de dimensión (agua, agricultura, clima, energia, mineria, otros, planificacion, riesgos, suelo) + allTemasConfig.js, capasBase.js, wms_services.js, leyendaAliases.js, constants.js

geojson/ — ~70 archivos GeoJSON estáticos, cargados on-demand

js/utils/ — layerUtils, glifyAdapter, wmsUtils, attributeTableUtils, sidebarUtils, searchControl

server/chat/ — orquestador, tools, runners del chat IA

server/llm/ — driver LLM OpenAI-compatible (Groq por defecto)

server/db/ — driver BD REST de Supabase

Peculiaridades importantes
Alias no coinciden con claves GeoJSON
Usar normalización .toLowerCase().trim() en ambos lados al hacer lookup de alias. Si no, el lookup falla.

dataFilter se ignora en algunos renderizadores
cargarCapaIndividual() en layerUtils.js crea dataParaRender aplicando dataFilter ANTES de pasar a glify/heatmap/cluster/L.geoJson. updateLayerFilter() también aplica dataFilter al reconstruir. Si agregas nuevo renderer, haz lo mismo.

Glify colorCallback no verifica dataFilter
En glifyAdapter.js:buildColorCallback(), agregar verificación de dataFilter manualmente si el feature debe ser filtrado.

Glify solo para polygon, no para líneas ni puntos
GLIFY_CONFIG.USE_GLIFY_RENDERER y GLIFY_CONFIG.GLIFY_TYPES en constants.js. Los puntos nunca van a glify. Las líneas van a L.geoJson (SVG) porque WebGL no maneja bien z-index ni anti-aliasing en líneas.

Capas WMS
wms_services.js declara los servicios disponibles.

En la config de un tema, una capa WMS se declara con tipo: 'wms' + servicio: 'clave_del_servicio' (en lugar de url).

layerUtils.cargarCapaIndividual detecta el flag vía isWMSLayer() y crea L.tileLayer.wms con createWMSLayer().

Los filtros por atributo no aplican client-side en WMS (el servidor los gestiona).

Turf.js solo para bbox
El proyecto usa turf.bbox() en attributeTableUtils.js, sidebarUtils.js y layerItem.js para zoom a features/capas.

Web Workers
layerProcessor.worker.js maneja procesamiento de GeoJSON off-main-thread. No bloquear el thread principal con datos pesados.

El pool de workers se destruye en beforeunload (workerPool.destroyWorkerPool).

Si Worker no está disponible, hay fallback a fetch en el hilo principal.

Chat IA
2 llamadas LLM por respuesta (L1: tools; L2: síntesis forzada).

ORCHESTRATOR_MAX_ITERATIONS controla rondas de tools (default 1, mínimo 1).

El system prompt se cachea 5 min en memoria del módulo.

Los args del LLM se normalizan defensivamente en runners.js:normalizeArgs() antes de tocar Supabase.

Las RPCs tienen timeout de 4s (withTimeout en runners.js).

El campo chart del payload tiene tipos según cardinalidad: pie (≤ 6), bar (≤ 20), horizontalBar (> 20).

El frontend renderiza horizontalBar como bar con indexAxis: 'y'.

WMS y vercel.json
vercel.json aplica la config de Functions a api/**/*.js (no solo api/*.js).

excludeFiles excluye geojson/, db/, scripts/, docs/, help.html, session_export.md, skills-lock.json.

Estructura de capas
Cada capa tiene: tipo/type (point/line/polygon/heatmap/wms), renderer, dataFilter (filtro de usuario), hiddenAttributes (categorías ocultas por leyenda).

Archivos críticos
js/store/appState.js — estado global

js/utils/layerUtils.js — cargarCapaIndividual(), dataParaRender, loader WMS

js/utils/glifyAdapter.js — buildColorCallback() con dataFilter

js/utils/wmsUtils.js — creación de capas WMS

js/utils/attributeTableUtils.js — tabla, búsqueda, filtros, refreshAttributeTableIfOpen

index.html — single-page app entry point

Para agregar nueva capa GeoJSON
Agregar config en dimensión correspondiente (js/config/<dimension>.js)

Agregar GeoJSON en geojson/

No requiere build — solo recargar navegador

Para agregar nueva capa WMS
Declarar el servicio en js/config/wms_services.js (bajo servicios)

En la dimensión correspondiente, agregar la capa con tipo: 'wms' + servicio: '<clave>'

No requiere GeoJSON local

Bugs conocidos (ya corregidos)
Alias no coincidían → normalización en attributeTableUtils.js

Filtros no se reflejaban en mapa → dataParaRender en todos los renderizadores

Tabla no se actualizaba con filtros → refreshAttributeTableIfOpen() llamada desde apply/clear

Barra de búsqueda no se destruía al cerrar → limpieza completa en closeAttributeTable()

Sprint 1: help.js tenía const wrapper duplicado → SyntaxError en help.html

Sprint 1: capas WMS declaradas en configs pero sin loader → error al activar dimensión

Sprint 1: XSS en markers.js (popups) y styleUtils.addLabelsToLayer (etiquetas)

Sprint 1: síntesis del chat con dos mensajes user consecutivos → el LLM ignoraba las tools

Sprint 2: tabla de atributos no restauraba el sidebar derecho tras segunda apertura

Sprint 2: renderChunk con chunk.indexOf(feature) → O(n²) en la tabla

Sprint 2: dimensionBuilder con handler change duplicado en switchInput

Sprint 3: .env.example con LLM_MAX_TOKENS=512 y ORCHESTRATOR_MAX_ITERATIONS=3 (desalineados del código)

Sprint 4: mapUtils.js buscaba .navbar.fixed-top (selector inexistente)

Sprint 4: workerPool.js sin fallback si Worker no disponible

Sprint 5: energia_potencial_* con atributo declarado dos veces (el segundo ganaba)