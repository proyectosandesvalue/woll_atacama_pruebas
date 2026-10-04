# AGENTS.md — Plataforma_WOLL_Atacama

## Contexto

Plataforma Territorial Water Oriented Living Lab Atacama: WebGIS para la Región de Atacama, Chile. Archivos estáticos (sin build) + Vercel Functions para el chat IA + Supabase PostGIS + LLM OpenAI-compatible.

**Antes de cambiar código, lee en este orden:**

1. `docs/CONTRACT.md` — reglas que no se rompen.
2. `docs/ARCHITECTURE.md` — cómo está armado el sistema hoy.
3. `docs/ROADMAP.md` — qué sprint está activo y qué sigue.
4. `docs/DEV_GUIDE.md` — cómo hacer las tareas habituales.
5. `CHANGELOG.md` — historial de cambios y bugs ya corregidos.

Si el código contradice el CONTRACT, no decidas por tu cuenta: señálalo y deja que el dev elija cuál de los dos cambia.

## Reglas operativas

- **Ramas:** un solo dev, se commitea **directo a `main`**. Sin `develop`.
- **Commits:** `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`; un commit por sub-sprint con el ID (`feat: sprint-06-A backend geoespacial`).
- **Migraciones:** `db/migrations/NNN_nombre.sql`, idempotentes. Nunca editar una ya aplicada; crear una nueva.
- **Chat:** el LLM nunca escribe SQL; solo invoca RPCs tipadas.
- **Secretos:** solo en variables de entorno. `.env.staging` está en `.gitignore`.
- **Tests:** toda feature nueva trae al menos un test (`node:test`).
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
npm run smoke:chat  # Smoke test end-to-end del orquestador
```

No hay build step.

## Arquitectura clave

- `js/store/appState.js` — única fuente de verdad para mapa, capas, filtros y UI.
- `js/config/` — una dimensión por archivo (agua, agricultura, clima, energia, mineria, otros, planificacion, riesgos, suelo) + `allTemasConfig.js`, `capasBase.js`, `wms_services.js`, `leyendaAliases.js`, `constants.js`.
- `geojson/` — ~70 GeoJSON estáticos, cargados on-demand.
- `js/utils/` — `layerUtils`, `glifyAdapter`, `wmsUtils`, `attributeTableUtils`, `sidebarUtils`, `searchControl`.
- `server/chat/`, `server/llm/`, `server/db/` — backend del chat (ver ARCHITECTURE §4).

## Peculiaridades del visor

**Los alias no coinciden con las claves del GeoJSON.** Normaliza con `.toLowerCase().trim()` en ambos lados al hacer lookup; si no, falla.

**`dataFilter` se ignora en algunos renderizadores.** `cargarCapaIndividual()` crea `dataParaRender` aplicando `dataFilter` *antes* de pasar a glify/heatmap/cluster/`L.geoJson`; `updateLayerFilter()` también lo aplica al reconstruir. Si agregas un renderer nuevo, haz lo mismo.

**Glify `colorCallback` no verifica `dataFilter`.** En `glifyAdapter.js:buildColorCallback()`, agrega la verificación manual si el feature debe filtrarse.

**Glify solo para polígonos.** `GLIFY_CONFIG.USE_GLIFY_RENDERER` y `GLIFY_TYPES` en `constants.js`. Los puntos nunca van a glify; las líneas van a `L.geoJson` (SVG) porque WebGL maneja mal el z-index y el anti-aliasing en líneas.

**Capas WMS.** El servicio se declara en `wms_services.js`; en la dimensión, la capa usa `tipo: 'wms'` + `servicio: '<clave>'` (sin `url`). `cargarCapaIndividual` las detecta con `isWMSLayer()` y crea `L.tileLayer.wms` con `createWMSLayer()`. Los filtros por atributo no aplican en cliente (los gestiona el servidor).

**`capas` es el índice maestro del tema.** `grupos.<x>.capas` reutiliza subconjuntos por diseño; un duplicado entre `capas` y un grupo es legítimo. Solo es duplicado real dentro del mismo contenedor.

**Turf.js solo para `bbox`** (`attributeTableUtils.js`, `sidebarUtils.js`, `layerItem.js`).

**Web Workers.** `layerProcessor.worker.js` procesa GeoJSON fuera del hilo principal; no bloquees el hilo con datos pesados. El pool se destruye en `beforeunload`; sin `Worker`, hay fallback a `fetch` en el hilo principal.

**Estructura de una capa:** `tipo`/`type` (point/line/polygon/heatmap/wms), `renderer`, `dataFilter` (filtro de usuario), `hiddenAttributes` (categorías ocultas por leyenda).

## Chat IA

- Endpoint `api/chat.js`: handler delgado. Capas de defensa previas al orquestador: `input-validator`, `rate-limiter` (en memoria), `geo-filter`, `scope-filter` y `domain-classifier`.
- Orquestador: L1 (tool calling) + L2 (síntesis forzada). `ORCHESTRATOR_MAX_ITERATIONS` controla las rondas de tools (default 1, mínimo 1). Presupuesto: `ORCHESTRATOR_BUDGET_MS` (default 8000).
- 9 tools, una por archivo en `server/chat/tools/`; `normalizeArgs` y `withTimeout` en `tools/_helpers.js`. Las RPCs tienen timeout de 6 s.
- El system prompt se cachea 5 min en memoria del módulo.
- Contrato de gráficos: `charts` (array) es canónico; `chart` (singular) solo por compatibilidad. Tipos: `pie` (≤ 6 grupos), `bar` (≤ 20), `horizontalBar` (> 20); el frontend dibuja `horizontalBar` como `bar` con `indexAxis: 'y'`. `aggregate_by_admin_and_column` no genera gráfico.
- `CHAT_VERBOSE` (el LLM puede nombrar tools y `layer_id`) y `ORCHESTRATOR_DEBUG` (logs de servidor) son independientes.
- Header `x-opencode-session` para el proveedor OpenCode Go.

## Vercel

`vercel.json` aplica la config de Functions a `api/**/*.js`. `excludeFiles` excluye `geojson/`, `db/`, `scripts/`, `docs/`, `help.html`, `session_export.md`, `skills-lock.json`.

## Archivos críticos

- `js/store/appState.js` — estado global.
- `js/utils/layerUtils.js` — `cargarCapaIndividual()`, `dataParaRender`, loader WMS.
- `js/utils/glifyAdapter.js` — `buildColorCallback()` con `dataFilter`.
- `js/utils/wmsUtils.js` — creación de capas WMS.
- `js/utils/attributeTableUtils.js` — tabla, búsqueda, filtros, `refreshAttributeTableIfOpen`.
- `index.html` — entry point de la SPA.

## Agregar una capa

- **GeoJSON:** config en `js/config/<dimension>.js` + archivo en `geojson/`. Sin build; recarga el navegador. Para que el chat la vea, ver `docs/DEV_GUIDE.md` §7.
- **WMS:** servicio en `wms_services.js` + capa con `tipo: 'wms'` y `servicio: '<clave>'` en la dimensión. No requiere GeoJSON local.