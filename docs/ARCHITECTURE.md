
# ARCHITECTURE.md — Arquitectura actual

> Descripción del sistema actual. Se actualiza cuando cambia algo estructural.
> Última revisión: 2026-10-02.

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
│ REST │ HTTP
▼ ▼
┌──────────────────────┐ ┌──────────────────────┐
│ Supabase (PostGIS) │ │ Groq (LLM) │
│ - Tablas public.* │ │ - Chat completions│
│ - Schema chat.* │ │ - Tool calling │
│ - RPCs tipadas │ └──────────────────────┘
└──────────────────────┘

---

## 2. Ambientes

### 2.1. Producción

- **Repo**: (repo privado de producción)
- **Vercel**: proyecto de producción
- **Supabase**: proyecto de producción
- **URL**: (dominio real)

### 2.2. Pruebas (staging)

- **Repo**: `proyectosandesvalue/woll_atacama_pruebas`
- **Vercel**: `visor_atacama_pruebas`
- **Supabase**: `visor_atacama_pruebas`
- **URL**: `https://wollatacamapruebas.vercel.app`

### 2.3. Local (dev)

- **Repo**: `woll_atacama_pruebas` en tu máquina
- **Vercel CLI**: `npx vercel dev` (para testear `/api/chat` localmente)
- **`.env.staging`**: credenciales de Supabase staging

**Reglas**:
- Producción y pruebas tienen **Supabase separado**.
- Los repos **no se sincronizan**.
- La promoción a producción es **manual**.
- Los secretos **nunca** están en código.

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

### Backend (Vercel Functions)
- **Node.js** (runtime de Vercel).
- **fetch** nativo (Node 18+).
- **Sin dependencias npm** en runtime (el `package.json` solo tiene ESLint como dev dep).

### Base de datos
- **Supabase** (PostgreSQL + PostGIS).
- **RPCs tipadas** (`chat.*` + wrappers `public.chat_*`).
- **RLS activo** en todas las tablas del schema `chat`.
- **Solo `service_role`** puede ejecutar las RPCs.

### LLM
- **Groq** como proveedor (OpenAI-compatible).
- **Modelo**: `openai/gpt-oss-120b`.
- **Tool calling** nativo.
- **Driver abstraído** (`server/llm/drivers/openai-compatible.js`) → cambiar de proveedor es cambiar variables de entorno.

---

## 4. Estructura del backend

### 4.1. `api/chat.js`

Endpoint del chat. Es un **handler delgado**: delega toda la lógica al orquestador.

Recibe: { text, history }
Devuelve: { reply, chart?, geojson?, citations? }


### 4.2. `server/chat/orchestrator.js`

Orquesta el ciclo del chat:

1. Construye el system prompt con el catálogo de Supabase (cacheado 5 min).
2. Loop de tool calling (por defecto 1 iteración).
3. Síntesis forzada si el presupuesto de tiempo se agota.
4. Detección de chart desde el historial de tool calls.

**Presupuesto**: `ORCHESTRATOR_BUDGET_MS` (default 8000ms).

### 4.3. `server/chat/tools.js`

Definición JSON-Schema de las 8 tools expuestas al LLM.

**Tools actuales**:
- `get_layer_stats`
- `get_layer_schema`
- `query_layer`
- `aggregate_layer`
- `aggregate_by_admin`
- `aggregate_by_admin_and_column`
- `count_near_layer`
- `aggregate_near_layer`

### 4.4. `server/chat/runners.js`

Ejecuta cada tool contra Supabase (vía el pool).

**Normalización defensiva** de args del LLM:
- Coacción de tipos.
- Validación de whitelists (`METRICS`, `ADMIN_LEVELS`).
- Coacción de límites (`limit` entre 1 y 50).
- Timeouts de 6s por RPC.

### 4.5. `server/db/*`

Driver REST de Supabase abstraído. Cambiar de BD = cambiar `DB_DRIVER` + variables de entorno.

### 4.6. `server/llm/*`

Driver LLM OpenAI-compatible. Cambiar de proveedor = cambiar `LLM_BASE_URL` + `LLM_MODEL` + `LLM_API_KEY`.

---

## 5. Base de datos — schema `chat`

### 5.1. Tablas

- `chat.chat_catalog`: catálogo de capas para el LLM.
- `chat.chat_layer_stats`: stats precalculadas por capa.
- `chat.chat_attr_stats`: stats por atributo (min, max, mean, median, top_values).

### 5.2. RPCs canónicas (`chat.*`)

- `chat_catalog()` — catálogo filtrado por capas con tabla física.
- `chat_layer_stats(layer_id)` — stats de una capa.
- `chat_layer_schema(layer_id)` — schema real (columnas + top values).
- `chat_query(layer_id, filters, limit, offset)` — filas concretas.
- `chat_aggregate(layer_id, group_by, metric, field, filters)` — agregación por columna.
- `chat_aggregate_by_admin(layer_id, admin_level, metric, field, filters)` — agregación por comuna/provincia/región vía `ST_Intersects`.
- `chat_aggregate_by_admin_and_column(...)` — doble agrupación.
- `chat_count_near_layer(source, targets, distance_m, filters)` — conteo por proximidad.
- `chat_aggregate_near_layer(source, targets, distance_m, admin_level, filters)` — agregación por proximidad.
- `chat_refresh_stats()` — recalcula stats de todas las capas.
- `chat_upsert_layer(...)` — UPSERT de una capa en el catálogo.

### 5.3. Wrappers (`public.chat_*`)

PostgREST solo expone `public.*`. Los wrappers delegan a las canónicas del schema `chat`.

### 5.4. Grants

- `REVOKE ALL FROM PUBLIC, anon, authenticated` en todo.
- `GRANT EXECUTE TO service_role` en todo.

Solo el backend (con `SUPABASE_SERVICE_KEY`) puede ejecutar las RPCs.

---

## 6. Frontend

### 6.1. Entry point

- `index.html` — SPA principal.
- `help.html` — manual.
- `js/app.js` — bootstrap.
- `js/script.js` — UI shell (tema, sidebar, modal, responsive).

### 6.2. Estado

- `js/store/appState.js` — single source of truth.
- Mapas de capas, filtros, modos (cluster/heatmap), opacidades, etc.

### 6.3. Configuración de capas

- `js/config/allTemasConfig.js` — importa todas las dimensiones.
- `js/config/<dimension>.js` — cada dimensión (agua, energía, etc.).
- `js/config/capasBase.js` — capas base del mapa.
- `js/config/wms_services.js` — servicios WMS externos.

### 6.4. Utilidades clave

- `js/utils/layerUtils.js` — motor de carga de capas (GeoJSON, WMS, glify).
- `js/utils/glifyAdapter.js` — adaptador WebGL.
- `js/utils/attributeTableUtils.js` — tabla de atributos.
- `js/utils/chatAssistant.js` — cliente de `/api/chat`.
- `js/ui/chatUI.js` — panel del chat.

### 6.5. Workers

- `js/workers/layerProcessor.worker.js` — transformación GeoJSON off-main-thread.
- `js/workers/workerPool.js` — pool de 4 workers con fallback.

---

## 7. Deploy

### 7.1. Flujo
Local → git push origin main → GitHub → Vercel auto-deploy → URL

- **Rama `main`** → deploy a producción del proyecto Vercel (que en este caso es el ambiente de pruebas).
- **Rama de feature** (futuro) → preview deploy automático.

### 7.2. Variables de entorno

Configuradas en Vercel → Settings → Environment Variables.

**13 variables** (ver `docs/CONTRACT.md` § 2 y el `.env.example`).

### 7.3. Caché

- Los archivos estáticos se cachean por CDN de Vercel.
- Los deploys invalidan caché automáticamente.

---

## 8. Monitoreo

- **Vercel Logs** — `Deployments → último → Functions → chat`.
- **Vercel Analytics** — métricas de tráfico.
- **Supabase Logs** — queries, errores.

No hay alertas configuradas (a futuro).

---

## 9. Roadmap técnico

### Corto plazo (fase 2-3)
- Migrar tools a un archivo por tool.
- Tests con `node:test`.
- Rate limiting en `/api/chat`.

### Mediano plazo (fase 4-5)
- `/api/config` — el visor lee config desde un snapshot JSON.
- Migrar `admin.dimensions`, `admin.layers` a Supabase.
- Panel admin (solo lectura primero).
- Ingesta RAG (PDFs + pgvector).

### Largo plazo (fase 6+)
- Panel admin con CRUD completo.
- APIs externas (meteorología, leyes).
- Serving de capas vía MVT (vector tiles).
- Chat multi-fuente con citas.
