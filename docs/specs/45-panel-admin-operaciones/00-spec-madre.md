# Spec 45-48 — Panel admin: operaciones

| Campo | Valor |
|---|---|
| **Sprints (ROADMAP)** | 45 (RAG y APIs), 46 (taxonomía normalizada), 47 (capas), 48 (configuración del chat) |
| **Estado de la spec** | EN EJECUCIÓN — 45, 46-A/B, 47-A/B y 48 implementados; 46-C y 47-C/D pendientes |
| **Tamaño** | Grande (épica) |
| **Duración estimada** | 56-72 h |
| **Dependencias** | 08-G (tiles), 14/15 (panel/auth), 17 (RAG), 19 (APIs), 26 (VPS) |
| **Última revisión** | 2026-11-14 |

## 1. Objetivo

Convertir el panel de solo lectura en una consola de operación:

1. **RAG:** subir PDFs, completar metadatos, estimar, ingestar, ver estado y
   revisar chunks.
2. **APIs externas:** inventario de conexiones existentes, estado, prueba y
   edición de parámetros no secretos.
3. **Taxonomía:** dimensiones, grupos, subgrupos y asignación de capas en
   tablas normalizadas.
4. **Capas geográficas:** CRUD completo, carga a PostGIS, tiles, publicación y
   reversión.
5. **Configuración del chat:** prompts versionados, settings, mensajes, datos
   no disponibles y golden set editables; tools en solo lectura.

El orden de implementación es **45-A RAG → 45-B APIs → 46 taxonomía → 47
capas**, porque el gestor de capas necesita la taxonomía normalizada.

## 2. Decisiones ya tomadas

| Tema | Decisión |
|---|---|
| Ingesta RAG | Worker con cola en PostgreSQL; el request solo encola |
| Configuración de capas/dimensiones | Tablas normalizadas, no un JSON monolítico |
| Sidebar | Se adapta a la taxonomía normalizada; el snapshot queda como fallback |
| Secretos | Solo en variables de entorno; el panel muestra nombres, nunca valores |
| Publicación | Borrador en tablas → validar → snapshot activo → visor |

## 3. Arquitectura

```text
admin.html
  └─ /api/admin/* (auth por contraseña, CSRF, auditoría; TOTP opcional)
       ├─ RAG: manifest + upload + cola
       ├─ APIs: conexiones no secretas + test
       ├─ Taxonomía: dimensions/groups/subgroups/placements
       ├─ Capas: layers + upload + load/tiles
       └─ Chat: prompts + settings + messages + unavailable + golden
  └─ workers (cola en PostgreSQL)
       ├─ rag-worker   → server/rag + embeddings
       └─ layer-worker → scripts/load-layer + build-tiles
```

### 3.1. Fuente de verdad

- **Autoría:** tablas normalizadas (`admin.dimensions`, `admin.groups`,
  `admin.subgroups`, `admin.layers`, `admin.layer_placements`).
- **Lectura del visor:** `GET /api/config` sigue devolviendo un snapshot con la
  forma actual de `allTemasConfig`, generado desde las tablas. Esto mantiene
  estable el sidebar y el fallback `allTemasConfig` (INV-5).
- **Admin:** lee y escribe las tablas normalizadas por endpoints propios.
- **Publicación:** valida, compila el snapshot y reconstruye
  `admin.config_layers`; activa la versión nueva.

> Revisión pendiente: si el sidebar debe consumir directamente
> `/api/taxonomy` o seguir usando el snapshot compilado. La recomendación es
> mantener el snapshot en 46-A y agregar el endpoint nativo con feature flag
> en 46-C.

### 3.2. Cola de trabajos

Tabla `admin.ops_jobs`:

| Columna | Uso |
|---|---|
| `job_id` | PK identity |
| `kind` | `rag.ingest`, `rag.dry_run`, `layer.load`, `layer.tiles`, `layer.publish` |
| `status` | `queued`, `running`, `succeeded`, `skipped`, `needs_ocr`, `rejected`, `failed`, `cancelled` |
| `payload` | JSONB sin secretos |
| `result` | JSONB con conteos/checksum/errores |
| `requested_by` | usuario admin |
| `created_at`, `started_at`, `finished_at`, `heartbeat_at` | timestamptz |
| `error_code`, `error_message` | mensaje saneado |

El worker reclama con `FOR UPDATE SKIP LOCKED`. Un job `running` sin heartbeat
por > 10 min se marca `failed`.

## 4. Sprint 45-A — Ingesta RAG

### 4.1. Alcance

**Dentro**
- Subir PDF a `rag/inbox/` (máx. 25 MB, firma `%PDF-`).
- Alta/edición/baja de la entrada del manifiesto con `validateEntry`.
- Estimar con dry-run: páginas, chunks, tokens, costo.
- Encolar ingesta, `--force` y reingesta por slug.
- Ver documentos, corridas y jobs.
- Ver chunks (contenido, páginas, sección, tokens) paginados.
- Estado de embeddings/worker y cancelación de jobs `queued`.
- Borrar PDF/manifiesto con confirmación; no borra versiones ya ingeridas.

**Fuera**
- OCR.
- Editar contenido de chunks.
- Aprobar `trust_level='reviewed'` (fase 45-A.2).
- Crawling web.
- Cambiar el proveedor de embeddings desde el panel.

### 4.2. Contrato de datos

`admin.rag_jobs` (migración 043):

| Columna | Tipo |
|---|---|
| `id` | bigint identity PK |
| `action` | `dry_run` / `ingest` / `reingest` |
| `slug` | text not null |
| `force` | boolean not null default false |
| `status` | check |
| `requested_by` | text |
| `result` | jsonb not null default `{}` |
| `error_code`, `error_message` | text |
| `created_at`, `started_at`, `finished_at`, `heartbeat_at` | timestamptz |

Índices: `(status, id)` y `(slug, created_at desc)`.

### 4.3. Endpoints

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/api/admin/rag/overview` | manifiesto + documentos + runs + jobs + config |
| `POST` | `/api/admin/rag/upload?slug=` | PDF binario; escribe `rag/inbox/<slug>.pdf` |
| `POST` | `/api/admin/rag/manifest` | alta/edición validada |
| `DELETE` | `/api/admin/rag/manifest?slug=` | quita del manifiesto (opcional `file=1`) |
| `POST` | `/api/admin/rag/jobs` | encola `{slug, action, force}` |
| `GET` | `/api/admin/rag/jobs?id=` | estado / últimos jobs |
| `GET` | `/api/admin/rag/chunks?document_id=&limit=&offset=` | preview de chunks |
| `POST` | `/api/admin/rag/jobs/cancel` | cancela un job `queued` |

Todos exigen sesión y CSRF salvo GET. `upload` lee el stream con límite y
valida `Content-Type: application/pdf`; no usa JSON.

### 4.4. Worker

`scripts/rag-worker.mjs` reclama jobs, lee el manifiesto y llama
`ingestDocument` con `RAG_DATABASE_URL` y el embedder. `dry_run` no abre BD ni
llama al proveedor. Heartbeat cada 15 s. `--once` para tests/cron.

Imagen `docker/rag-worker/Dockerfile` con `npm ci` completo (incluye
`pdfjs-dist`), volumen compartido `./rag:/app/rag` y servicio `rag-worker` en
Compose. El API solo escribe uploads y consulta.

### 4.5. Criterios de aceptación

| # | Dado | Cuando | Entonces |
|---|---|---|---|
| CA-1 | PDF y manifiesto válidos | encolo `ingest` | job `succeeded`, documento `ready`, chunks > 0 |
| CA-2 | PDF escaneado | encolo | `needs_ocr`, sin chunks |
| CA-3 | entrada sin `copyright_cleared` | guardo | 400, no se escribe el manifiesto |
| CA-4 | PDF > 25 MB o sin `%PDF-` | subo | 413/400, no queda archivo |
| CA-5 | dry-run | encolo | páginas/chunks/tokens/costo sin escribir `rag.*` |
| CA-6 | mismo PDF | reingesta | `skipped`, 0 llamadas al proveedor |
| CA-7 | worker caído | consulto | aviso “sin heartbeat”; visor sigue funcionando |
| CA-8 | job `queued` | cancelo | `cancelled`, no se ejecuta |
| CA-9 | documento existente | abro chunks | contenido, páginas, sección y tokens, sin embeddings |
| CA-10 | migración | aplico dos veces | sin error |

## 5. Sprint 45-B — Gestor de APIs

**Dentro**
- Listar conexiones existentes del proxy: `copernicus-wms/wfs/wmts`,
  `worldview-snapshot`, ARClim, estaciones y embeddings.
- Mostrar URL base, host permitido, variables de entorno requeridas (solo
  nombres), timeout, rate limit y último estado.
- Probar conexión desde el servidor y guardar HTTP/latencia.
- Editar label, timeout, límites y activo (no secretos).
- Archivar/reactivar una conexión: desactiva su uso en el backend sin borrar
  su definición de código.
- Mostrar una guía de alta cuando se necesita una conexión nueva.
- Alertar si falta una variable de entorno.

**Fuera**
- Escribir secretos desde el panel.
- Agregar URLs arbitrarias: el proxy sigue siendo una allowlist cerrada. Una
  conexión nueva requiere código/deploy; el panel muestra los pasos.
- Eliminar una conexión operativa desde el panel: se hace por código
  (registro y allowlist) y deploy. El panel solo archiva/desactiva.

**Modelo:** `admin.api_connections` (key, label, kind, base_url, secret_env,
timeout_ms, rate_limit, activo, last_check_at/status/latency). Los secretos
siguen en `.env`.

**Endpoints:** `GET /api/admin/apis`, `POST /api/admin/apis/test?key=`,
`PUT /api/admin/apis` (solo campos no secretos).

## 6. Sprint 46 — Taxonomía normalizada + sidebar

### 6.1. Modelo

| Tabla | Campos |
|---|---|
| `admin.dimensions` | `id`, `key` unique, `nombre`, `icono`, `orden`, `activo`, auditoría |
| `admin.groups` | `id`, `dimension_id`, `key`, `nombre`, `orden`, `activo`, unique(dimension_id,key) |
| `admin.subgroups` | `id`, `group_id`, `key`, `nombre`, `orden`, `activo`, unique(group_id,key) |
| `admin.layers` | `id`, `layer_key` unique, `nombre`, `tipo`, `source_type`, `has_tiles`, `config jsonb`, `activo`, auditoría |
| `admin.layer_placements` | `id`, `layer_id`, `dimension_id`, `group_id`, `subgroup_id`, `scope` (`master`/`group`/`subgroup`), `orden`, `activo` |
| `admin.dimension_initial_items` | `id`, `dimension_id`, `kind` (`group`/`layer`), `group_id`, `layer_id`, `orden` |

`admin.layers.config` conserva el objeto completo de estilo/fuente/popup/alias/
leyenda. Las columnas planas son para búsqueda y validación.

### 6.2. Publicación

`scripts/config-compile.mjs`:

1. Lee las tablas normalizadas.
2. Compone la forma actual de `allTemasConfig` (dimensiones, `capas`,
   `cargaInicial`, `grupos`, `subgrupos`, `estilo`).
3. Valida con `validarConfiguracionGlobal`.
4. Crea `admin.config_snapshots` + `admin.config_layers` y activa la versión.

El visor sigue leyendo `/api/config` con la forma actual. El snapshot se
mantiene como contrato estable y fallback.

### 6.3. Sidebar

**46-A:** publicación y snapshot; el sidebar no cambia.
**46-B:** CRUD de dimensiones/grupos/subgrupos y asignaciones en el panel.
**46-C:** `GET /api/taxonomy` con el árbol normalizado y adaptación del
sidebar/`dimensionBuilder` con feature flag. Fallback al snapshot si falla.

La migración es aditiva. Las tablas se siembran desde el snapshot v1
(`scripts/taxonomy-seed.mjs`) para no perder la config actual.

### 6.4. Criterios de aceptación

| # | Dado | Cuando | Entonces |
|---|---|---|---|
| CA-1 | snapshot v1 | ejecuto el seed | dimensiones/grupos/subgrupos/capas quedan en tablas |
| CA-2 | tablas normalizadas | compilo | snapshot idéntico al actual (diff vacío) |
| CA-3 | creo una dimensión/grupo/subgrupo | publico | aparece en `/api/config` y en el sidebar |
| CA-4 | asigno una capa a un grupo | publico | aparece en ese grupo y mantiene su estilo |
| CA-5 | quito una capa | publico | desaparece del snapshot; no se borra de PostGIS |
| CA-6 | taxonomía inválida | publico | 400 y el snapshot activo no cambia |
| CA-7 | sidebar nativo | `/api/taxonomy` falla | cae a `/api/config` |
| CA-8 | migración | aplico dos veces | sin error |

## 7. Sprint 47 — Gestor de capas geográficas

**Dentro**
- CRUD de `admin.layers`: clave, nombre, tipo, estilo, popup, alias, leyenda,
  fuente y placements.
- Subir GeoJSON (MVP) o ZIP Shapefile (fase 2) con validación y límite.
- Cargar a PostGIS con `scripts/load-layer` y generar tiles con
  `scripts/build-tiles` en worker.
- Editar/duplicar/archivar/reordenar capas.
- Publicar snapshot y revertir.
- Estado de tabla física, tiles, manifest y conteo de features.

**Fuera del MVP**
- Edición geométrica en mapa.
- Borrado físico de tablas PostGIS desde el panel (solo archivar).
- Shapefile/GeoPackage si no hay `ogr2ogr` en la imagen.

**Endpoints:** `/api/admin/layers` (GET/POST/PUT/DELETE),
`/api/admin/layers/upload`, `/api/admin/layers/jobs`,
`/api/admin/layers/preview`.

## 8. Plan por fases

| Fase | Contenido | Horas | Estado |
|---|---|---|---|
| 45-A | RAG: migración, manifest, upload, cola, worker, UI y tests | 18-22 | ✅ |
| 45-B | APIs: inventario, test y edición no secreta | 6-8 | ✅ |
| 46-A | Migración y seed de taxonomía; compilador de snapshot | 6-8 | ✅ |
| 46-B | CRUD de dimensiones/grupos/subgrupos y assignments | 8-10 | ✅ |
| 46-C | `/api/taxonomy` + adaptación del sidebar con flag | 6-8 | ⏳ |
| 47 | Capas: CRUD, upload GeoJSON, load/tiles worker, UI | 18-24 | 🔶 local |
| 48 | Chat: CRUD de prompts/settings/mensajes/unavailable/golden; tools read-only | 8-10 | ✅ |

Cada fase es un commit y actualiza ROADMAP/CHANGELOG.

## 9. Seguridad

- Mismo auth por contraseña/CSRF/rate limit/auditoría del Sprint 15; TOTP opcional para flujos sensibles.
- Uploads: tamaño, extensión, firma `%PDF-`, nombre desde slug validado,
  escritura atómica, sin path traversal.
- Chunks/PDFs solo con sesión; `Cache-Control: no-store`.
- Logs sin contenido, prompts ni secretos.
- `rag.documents` sigue `untrusted`; revisión explícita.
- Workers con mínimo privilegio (`rag_writer`/`woll_api`), nunca superusuario.
- Nginx: `client_max_body_size 30m` solo en uploads.

## 10. Preguntas abiertas

| # | Pregunta | Default | ¿Bloquea? |
|---|---|---|---|
| R1 | ¿Sprint 45 = RAG + APIs y Sprint 46 = taxonomía + sidebar? | **aprobado 2026-11-13** | no (resuelto) |
| R2 | ¿El sidebar sigue leyendo el snapshot compilado o pasa a `/api/taxonomy`? | snapshot en 46-A; nativo con flag en 46-C | no para 45-A; sí para 46 |
| R3 | ¿El manifiesto RAG se versiona en git y se edita desde el panel? | sí, escritura atómica | no |
| R4 | ¿Capas arranca con GeoJSON y Shapefile queda para fase 2? | sí | no |
| R5 | ¿El gestor de APIs solo edita conexiones existentes? | sí; nuevas requieren deploy | no |

R1 quedó aprobada y 45-A está implementado. R2 se decide al iniciar el Sprint 46 (recomendado: snapshot en 46-A y nativo con flag en 46-C).

## 11. Riesgos y reversión

- **Doble fuente:** tablas normalizadas + snapshot compilado. Mitigación:
  compilar siempre desde tablas y comparar checksum.
- **Migración de taxonomía:** seed desde snapshot v1 y diff vacío como CA-2.
- **Sidebar:** flag para volver al snapshot si `/api/taxonomy` falla.
- **Uploads:** cuota y monitoreo de disco.
- **PDFs maliciosos:** extracción en worker aislado.
- **Costo de embeddings:** dry-run obligatorio y tope diario.
- **Worker caído:** jobs quedan `queued`; el visor no se afecta.
- **Reversión:** desactivar workers y activar snapshot anterior.

## 12. Puntos de integración

- Sprint 16 (CRUD de capas) se absorbe en 47.
- Sprint 17 (CLI RAG) se reutiliza; 45-A agrega la operación.
- Sprint 19 (APIs externas) se conecta con 45-B.
- Sprint 26: workers, volúmenes y backups de `rag/`.
- Sprint 28: uploads, CSP y sesión.
- Sprint 31: alertas de worker caído/jobs fallidos.

## 13. Resultados 45-A (2026-11-13)

- Migración `043_admin_rag_jobs.sql` aplicada y reaplicable.
- Flujo validado: upload de PDF → manifiesto → dry-run → ingesta con worker →
  documento `ready`, 1 chunk, overview y preview de chunks.
- Worker con `pdfjs-dist` en imagen propia; API sin la dependencia.
- Tests: 392 tests, 380 pasan, 12 omitidos, 0 fallos; lint 0 errores.
- Prueba local con embeddings fake de 1024 dims; los datos de prueba se
  eliminaron al terminar.
- Pendiente: configurar `EMBEDDINGS_*` reales en staging/VPS y validar PDFs
  con licencia (17-E).

## 14. Resultados 45-B (2026-11-13)

- Migración `044_admin_api_connections.sql` aplicada y reaplicable.
- Registro de 8 conexiones (Copernicus WMS/WFS/WMTS, Worldview, ARClim,
  Agromet, MeteoChile y embeddings) con estado de variables de entorno.
- Prueba real de ARClim: HTTP 200, ~180 ms; edición de timeout/rate limit y
  persistencia en `admin.api_connections`.
- UI **APIs** validada en navegador; no expone valores de secretos.
- Tests: 401 tests, 389 pasan, 12 omitidos, 0 fallos; lint 0 errores.

## 15. Resultados 46-A/46-B (2026-11-13)

- Migraciones 045/046/047 aplicadas; seed desde snapshot v1 con **mismo
  checksum** (`f85f80273f3b…`) y 9 dimensiones, 37 grupos, 7 subgrupos,
  139 capas y 315 asignaciones.
- Compilador `taxonomy:compile -- --check` valida el snapshot activo.
- Panel **Taxonomía** con CRUD de dimensiones/grupos/subgrupos y asignaciones;
  publicación de snapshot desde el panel (v2 validado).
- El sidebar sigue leyendo `/api/config`; `/api/taxonomy` nativo queda para
  46-C.
- Tests: 408 tests, 396 pasan, 12 omitidos, 0 fallos; lint 0 errores.

## 16. Cierre

- Horas reales: 14 (45-A 6 h; 45-B 4 h; 46-A/B 4 h).
- Desvíos: hubo que separar `validateEntry` en `server/rag/manifest.js` para
  que el API no importe `pdfjs-dist`; el worker necesita `npm ci --include=dev`.
- Lecciones: el worker debe ser una imagen separada; el volumen `rag/` necesita
  permisos SELinux compartidos (`:z` + dev `label=disable`).

## 17. Resultados 48 — CRUD de configuración del chat (2026-11-14)

**Spec de tramo:** `48-crud-config-chat.md`.

**Dentro:** CRUD de `admin.prompt_templates`, `admin.settings`,
`admin.messages`, `admin.unavailable_data` y `admin.golden_cases`; inventario
read-only de tools; seed del golden y lectura desde la BD con fallback.

**Fuera:** crear/editar tools desde el panel (son código y RPCs tipadas,
CONTRACT §6.2/§6.3) y editar los prompts hardcodeados de fallback (INV-5).

**Resultado:** migraciones 049/050; 38 casos sembrados; UI **Chat IA**
validada en navegador; 13 tools en solo lectura; 455 tests (443 pasan, 12
omitidos, 0 fallos); lint 0 errores.
