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