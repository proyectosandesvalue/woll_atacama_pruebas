# ROADMAP.md — Plan de sprints

> > **Fuente de verdad del roadmap.** Se actualiza al inicio y al cierre de cada sesión de trabajo.
> Última actualización: 2026-10-05.
>
> **Este roadmap es dinámico.** Se modifica cada vez que aparece un hallazgo nuevo,
> se cierra un sprint, se descubre un bug estructural, o cambia una decisión. Ninguna
> sección es definitiva. Si algo no está acá, no se hace. Si algo urge, se agrega al
> roadmap antes de ejecutarlo.
>
> **Tipos de entradas:**
> - **Sprints** — trabajo planificado con duración, dependencias y criterios.
> - **Pendientes inmediatos** — bugs conocidos sin sprint asignado.
> - **Deuda técnica activa** — hallazgos estructurales (archivos largos, funciones
>   mezcladas, duplicación) que no son bugs pero afectan el mantenimiento.
> - **Decisiones pendientes** — preguntas abiertas que bloquean diseño.

---

## Cómo usar este archivo

**Al inicio de sesión:**
1. Abrir este archivo.
2. Ver el sprint activo (`in-progress`) o el próximo `pending`.
3. Decidir el sub-sprint a hacer.
4. Cambiar estado a `in-progress` si aplica.

**Durante la sesión:**
5. Marcar checkboxes de sub-sprints completados.
6. Anotar problemas o dudas en la sección "Notas" del sprint.

**Al cierre de sesión:**
7. Actualizar Estado si terminó el sprint.
8. Agregar entrada en "Sesiones de trabajo".
9. Commit + push: `docs: actualizar roadmap`.

**Al agregar un sprint nuevo:**
10. Agregar al índice con ID correlativo.
11. Detalle en "Sprints planificados".
12. Estimar duración y dependencias.

**Convenciones:**
- Un commit por sub-sprint, con mensaje que referencia el ID: `feat: sprint-06-A backend geoespacial`.
- Los ADRs se agregan a `docs/DECISIONS/` cuando el sprint lo amerita.
- Sprint > 15 h requiere spec madre + spec por tramo.

---

## Índice

| ID | Sprint | Estado | Prioridad | Duración | Dependencias |
|---|---|---|---|---|---|
| 01 | Setup de staging | ✅ done | alta | — | — |
| 02 | Contratos y ADRs | ✅ done | alta | — | — |
| 03 | Refactor de tools + tests | ✅ done | alta | — | — |
| 04 | Rate limiting + filtros de dominio | ✅ done | alta | — | — |
| 05 | Multi-chart agnóstico | ✅ done | alta | — | — |
| 06 | Respuesta geoespacial (GeoJSON en mapa) | 🔄 in-progress | alta | 4-6h | — |
| 07 | `/api/config` + snapshot | ⏳ pending | alta | 3-4h | — |
| 08 | Migración a PostGIS (fuente principal) | ⏳ pending | alta | 40-46h | 07 |
| 09 | Soporte de imágenes raster | 🚫 blocked | media | 2-25h | decisión técnica |
| 10 | Vista 3D del visor | ⏳ pending | baja | 20-40h | 08, 09 |
| 11 | Análisis por Área de Interés (AOI) | ⏳ pending | alta | 15-28h | 08 |
| 12 | Registro y visualización de indicadores | ⏳ pending | media | 20-33h | 08, 11, 14 |
| 13 | Generación de reportes con IA | ⏳ pending | media | 20-32h | 08, 11, 12 |
| 14 | Migrar config a Supabase (`admin.*`) | ⏳ pending | alta | 4-6h | 07 |
| 15 | Panel admin — solo lectura | ⏳ pending | alta | 6-8h | 14 |
| 16 | Panel admin — CRUD de capas | ⏳ pending | alta | 8-12h | 08, 14, 15 |
| 17 | Ingesta RAG (PDFs → chunks → embeddings) | ⏳ pending | media | 8-12h | 15 |
| 18 | Retrieval RAG + tool en chat | ⏳ pending | media | 8-12h | 17 |
| 19 | APIs externas + CRUD | ⏳ pending | media | 15-25h | 16 |
| 20 | Adapter real: meteorología | ⏳ pending | baja | 4-6h | 19 |
| 21 | Adapter real: leyes (BCN) | ⏳ pending | baja | 6-8h | 19 |
| 22 | Alineación de documentación | ⏳ pending | alta | 3-4h | — |
| 23 | Hotfixes críticos del chat y la API | ⏳ pending | **crítica** | 14-15h | — |
| 24 | Decisiones y alcance de entrega | ⏳ pending | alta | 5-6h | — |
| 25 | Calidad del chat: latencia y evaluación | ⏳ pending | alta | 16h | 23 |
| 26 | Plataforma propia (Postgres + Docker + proxy) | ⏳ pending | alta | 38-45h | 23, 24 |
| 27 | CI/CD y entrega versionada | ⏳ pending | alta | 7-8h | 26-D |
| 28 | Seguridad del frontend y dependencias | ⏳ pending | alta | 9-10h | 26-D |
| 29 | Datos y gobierno de capas | ⏳ pending | media | 10-12h | 26-E |
| 30 | Pruebas de aceptación técnica | ⏳ pending | alta | 16h | 26, 27 |
| 31 | Observabilidad y operación | ⏳ pending | alta | 7-8h | 26 |
| 32 | Marco legal y privacidad | ⏳ pending | media | 5-6h | 24, 31-A |
| 33 | Entrega y traspaso | ⏳ pending | alta | 10h | Sprints Must |

**Leyenda de estados:**
- ✅ `done` — Completado y en producción.
- 🔄 `in-progress` — En desarrollo activo.
- ⏳ `pending` — En cola, listo para empezar.
- 🚫 `blocked` — Bloqueado por decisión externa o dependencia.

**Duración total pendiente:** ~200-250 h (producto) + ~135-150 h (corrección y producción).

---

## Sprints completados (01-05)

### Sprint 01 — Setup de staging ✅

**Completado**: 2026-10-02 · **Duración real**: ~3h

**Logro**: Ambiente de pruebas aislado con Vercel + Supabase + Groq.
- Repo `woll_atacama_pruebas` con rama `main`.
- Supabase staging con schema `chat` + migraciones 001-010.
- Vercel deployado apuntando a `main`.
- Chat funcional end-to-end en `wollatacamapruebas.vercel.app`.

### Sprint 02 — Contratos y ADRs ✅

**Completado**: 2026-10-02 · **Duración real**: ~2h

**Logro**: Documentación fundacional.
- `docs/CONTRACT.md` — reglas de diseño y desarrollo.
- `docs/ARCHITECTURE.md` — arquitectura actual.
- `docs/DECISIONS/` — 4 ADRs (repos separados, 3 planos, ambientes, promoción manual).
- `docs/DEV_GUIDE.md` — guía para desarrolladores.

### Sprint 03 — Refactor de tools + tests ✅

**Completado**: 2026-10-03 · **Duración real**: ~3h

**Logro**: Una tool por archivo + tests.
- `server/chat/tools/` con 8 archivos (uno por tool).
- `_helpers.js` con `normalizeArgs` + `withTimeout`.
- 35 tests de `normalizeArgs` con `node:test`.
- `npm test` configurado.

### Sprint 04 — Rate limiting + filtros de dominio ✅

**Completado**: 2026-10-03 · **Duración real**: ~4h

**Logro**: Endpoint `/api/chat` con 4 capas de defensa.
- `input-validator.js`, `rate-limiter.js`, `geo-filter.js`, `scope-filter.js`, `domain-classifier.js`.
- 63 tests nuevos.

### Sprint 05 — Multi-chart agnóstico ✅

**Completado**: 2026-10-03 · **Duración real**: ~5h

**Logro**: El chat devuelve múltiples gráficos, independiente de la tool.
- `buildChartsFromHistory` con detección por forma (no por tool).
- Contrato `charts: [...]` (array) + `chart` (singular) para compat.
- Frontend renderiza múltiples charts apilados.
- Soporte para `x-opencode-session`.
- 104 tests pasando.

---

## Sprint en curso (06)

### Sprint 06 — Respuesta geoespacial (GeoJSON en mapa)

**Estado**: 🔄 in-progress
**Prioridad**: alta
**Duración**: 4-6h (5-7h con comportamiento móvil)
**Dependencias**: Sprint 23-A (bloqueante para cierre correcto)
**Spec**: `docs/specs/06-respuesta-geoespacial.md`

**Objetivo**:
El chat responde con texto + charts + **GeoJSON pintado en el mapa**.

**Sub-sprints**:
- [x] **A** — Backend: `get_layer_features` + extracción de geojson (2h) — commit `3a21572`
- [ ] **B** — Frontend: `chatMapUtils.js` + integración en `chatUI.js` (3h)
- [ ] **C** — Reglas del prompt sobre cuándo devolver geojson (1h)
- [ ] **D** — Verificación + commit + deploy (1h)

**Bloqueantes conocidos**:
- Sprint 23-A (geojson fuera del LLM) debe ejecutarse antes del cierre de 06.
- La spec 06 habla de `include_geometry` en `query_layer`; el código implementó `get_layer_features`. Hay que actualizar la spec.

**Pendientes de decisión**:
- Máximo de features por respuesta (500 en spec, 1000 en RPC — revisar tras Sprint 23-A).
- Comportamiento móvil (colapsar chat + botón "Volver al chat").

---

## Sprints planificados — Producto (07-21)

### Sprint 07 — `/api/config` + snapshot

**Estado**: ⏳ pending · **Prioridad**: alta · **Duración**: 3-4h · **Dependencias**: ninguna

**Objetivo**: Endpoint que devuelve la config del visor como JSON. Prepara la migración de config a BD.

**Nota de ajuste**: ejecutar después de la plataforma propia (Sprint 26). El endpoint corre en el servidor propio.

**Sub-sprints**:
- [ ] **A** — `server/config/snapshot.js` (genera JSON desde `allTemasConfig.js`) (1h)
- [ ] **B** — `api/config.js` (endpoint + cache 5 min) (1h)
- [ ] **C** — `js/config/loader.js` (fetch + fallback local) (1h)
- [ ] **D** — Verificación + commit (1h)

### Sprint 08 — Migración a PostGIS (fuente principal)

**Estado**: ⏳ pending · **Prioridad**: alta · **Duración**: 40-46h · **Dependencias**: 07

**Objetivo**: PostGIS como fuente principal de capas. GeoJSON como fallback.

**Nota de ajuste**: la opción MVT con Martin o pg_tileserv es viable en el servidor propio (Sprint 26). Las migraciones de producción usan el runner del Sprint 26-C. Los ADR de la spec pasan a 012-015.

**Sub-sprints**:
- [ ] **A** — Infraestructura de tiles MVT (8h)
- [ ] **B** — Migración piloto: 3 capas chicas (4h)
- [ ] **C** — Migración completa: 70 capas (16-24h)
- [ ] **D** — Estilos y popups vía MVT (6h)
- [ ] **E** — Exportación/descarga desde PostGIS (4h)

### Sprint 09 — Soporte de imágenes raster

**Estado**: 🚫 blocked · **Prioridad**: media · **Duración**: 2-25h · **Dependencias**: decisión técnica

**Opciones**: WMS externo (2-3h), GEE (8-12h), GeoTIFF/COG (15-25h), PostGIS Raster (10-15h).

### Sprint 10 — Vista 3D del visor

**Estado**: ⏳ pending · **Prioridad**: baja · **Duración**: 20-40h · **Dependencias**: 08, 09

### Sprint 11 — Análisis por Área de Interés (AOI)

**Estado**: ⏳ pending · **Prioridad**: alta · **Duración**: 15-28h · **Dependencias**: 08

### Sprint 12 — Registro y visualización de indicadores

**Estado**: ⏳ pending · **Prioridad**: media · **Duración**: 20-33h · **Dependencias**: 08, 11, 14

### Sprint 13 — Generación de reportes con IA

**Estado**: ⏳ pending · **Prioridad**: media · **Duración**: 20-32h · **Dependencias**: 08, 11, 12

### Sprint 14 — Migrar config a Supabase (`admin.*`)

**Estado**: ⏳ pending · **Prioridad**: alta · **Duración**: 4-6h · **Dependencias**: 07

**Nota de ajuste**: tablas `admin.*` en la misma instancia, bajo el runner de migraciones del Sprint 26-C.

### Sprint 15 — Panel admin: solo lectura

**Estado**: ⏳ pending · **Prioridad**: alta · **Duración**: 6-8h · **Dependencias**: 14

**Nota de ajuste**: autenticación de admin según ADR 007 (OIDC institucional o TOTP local), MFA y registro de auditoría desde el inicio.

### Sprint 16 — Panel admin: CRUD de capas

**Estado**: ⏳ pending · **Prioridad**: alta · **Duración**: 8-12h · **Dependencias**: 08, 14, 15

**Nota de ajuste**: carga de capas con límite de tamaño, validación de formato y geometría, procesamiento aislado (`ogr2ogr` en proceso separado), vista previa y reversión.

### Sprint 17 — Ingesta RAG (PDFs → chunks → embeddings)

**Estado**: ⏳ pending · **Prioridad**: media · **Duración**: 8-12h · **Dependencias**: 15

**Nota de ajuste**: `pgvector` en la imagen de Postgres. Guardar versión del modelo de embeddings. Marcar documentos como fuente no confiable (inyección indirecta). Registrar procedencia de cada fragmento. Verificar derechos de autor.

### Sprint 18 — Retrieval RAG + tool en chat

**Estado**: ⏳ pending · **Prioridad**: media · **Duración**: 8-12h · **Dependencias**: 17

### Sprint 19 — APIs externas + CRUD

**Estado**: ⏳ pending · **Prioridad**: media · **Duración**: 15-25h · **Dependencias**: 16

### Sprint 20 — Adapter real: meteorología

**Estado**: ⏳ pending · **Prioridad**: baja · **Duración**: 4-6h · **Dependencias**: 19

### Sprint 21 — Adapter real: leyes (BCN)

**Estado**: ⏳ pending · **Prioridad**: baja · **Duración**: 6-8h · **Dependencias**: 19

---

## Sprints planificados — Corrección y preparación para producción (22-33)

> **Origen**: auditoría técnica del proyecto y análisis de la propuesta de migración (2026-10-05).
> **Solo planificación**: nada de esto está ejecutado. Cada sprint se convierte en spec al ejecutarse.

### Sprint 22 — Alineación de documentación

**Estado**: ⏳ pending · **Prioridad**: alta · **Duración**: 3-4h · **Dependencias**: ninguna

**Objetivo**: Dejar todos los documentos coherentes entre sí y con el código actual.

**Sub-sprints**:
- [ ] **A** — Reemplazar `AGENTS.md`; corregir "8 tools" → "9 tools" (45 min)
- [ ] **B** — Actualizar `ARCHITECTURE.md`: proveedor LLM, tools por archivo, timeout 6 s, nueva tool `get_layer_features` (45 min)
- [ ] **C** — Actualizar `CONTRACT.md §6.2` y `§9.1` (30 min)
- [ ] **D** — Actualizar `DEV_GUIDE.md §8` (30 min)
- [ ] **E** — Actualizar `README.md` si tiene desalineaciones de conteos (30 min)
- [ ] **F** — Verificar coherencia entre todos los documentos (30 min)

**Ajustes adicionales (agregados 2026-10-05)**:
- Reparar ADR 004 (texto pegado, reemplazar por ADR 008).
- Documentar hueco de migración 009.
- Eliminar entrada duplicada del Sprint 22.
- CONTRACT §5.3 con excepción explícita para `/api/chat`.

### Sprint 23 — Hotfixes críticos del chat y la API

**Estado**: ⏳ pending · **Prioridad**: **crítica** · **Duración**: 14-15h · **Dependencias**: ninguna
**Recomendación**: ejecutar antes de cerrar el Sprint 06. **23-A es parte del correcto funcionamiento del Sprint 06**.

**Objetivo**: eliminar los defectos que hoy afectan seguridad, costo y corrección del chat, sin cambiar de plataforma.

**Sub-sprints**:
- [ ] **A (3h) — H1.** El geojson sale del contexto del LLM.
  - En el orquestador, tras `runTool`, separar el resultado: si es una FeatureCollection, guardarla en un almacén local de la invocación y reemplazar el contenido del mensaje `tool` por un resumen (`total`, `shown`, `truncated` y hasta 20 filas de `properties` sin geometría).
  - `buildGeojsonFromHistory` pasa a leer ese almacén, no los mensajes.
  - Decidir y documentar: la tool vigente es `get_layer_features`; actualizar la spec 06 (reemplaza `include_geometry`) y documentarla en el `SYSTEM_PROMPT`.
  - Tests: CA-9 y CA-10 de la spec 06.
- [ ] **B (2h) — H3, H7.** Errores y acoplamiento.
  - `/api/chat` devuelve mensaje genérico + `errorId`; el detalle va solo a logs.
  - Crear `server/utils/logger.js`; `domain-classifier.js` deja de importar de `js/`.
  - Regla ESLint `no-restricted-imports` que impida que `server/` importe `js/`.
- [ ] **C (3h) — H2.** Contexto de la petición configurable.
  - Módulo `server/chat/request-context.js` con `GEO_PROVIDER` (`vercel` | `cloudflare` | `none`) y `TRUST_PROXY_HOPS`.
  - La IP se toma contando desde la derecha de `x-forwarded-for`, no el primer valor.
  - Sin header de país: aplicar el límite normal (corregir el bug de `isLatam(undefined)`).
  - Tests actualizados de `geo-filter`.
- [ ] **D (2h) — H3, H10.** Superficie de entrada.
  - `ALLOWED_ORIGINS` para CORS.
  - `history`: máximo 6 turnos, delimitado en el prompt como contenido no confiable, solo roles `user`/`assistant`.
- [ ] **E (2h) — H4.** Topes de costo.
  - `LLM_DAILY_REQUEST_CAP` y `CHAT_ENABLED` (killswitch).
  - Respuesta 503 amable sin llamar al LLM. Contador en memoria detrás de una interfaz (migrable a BD).
- [ ] **F (1.5h) — H11, H12.** Prompt y tests.
  - Prompt: 9 tools, reglas numeradas sin duplicados.
  - `npm test` con el glob entre comillas; confirmar que los tests de `__tests__/` se ejecutan; `engines.node >= 20`.
- [ ] **G (1h) — L7.** Verificar `chat_aggregate`. Si falla, `011_fix_chat_aggregate.sql` (nueva migración; no se edita la 001).

**Criterios de aceptación**:
- **CA-1** Dado un resultado con 500 features, cuando se arma el mensaje al LLM, entonces no contiene coordenadas y pesa menos de 8 KB.
- **CA-2** Dado un fallo del LLM o de una RPC, cuando responde `/api/chat`, entonces el cliente ve un mensaje genérico con `errorId` y el log contiene el detalle.
- **CA-3** Dada una petición sin header de país, entonces aplica el límite normal; con `x-forwarded-for` falsificado, la IP usada es la del proxy confiable.
- **CA-4** Dado un origen no listado, entonces la respuesta no incluye cabeceras CORS.
- **CA-5** Dado el tope diario alcanzado, entonces responde 503 sin llamar al LLM.
- **CA-6** `npm test` ejecuta todos los tests (≥ 104 + los nuevos).

**Reversión**: un commit por sub-sprint; las variables nuevas tienen valores por defecto compatibles con el comportamiento actual.

### Sprint 24 — Decisiones y alcance de entrega

**Estado**: ⏳ pending · **Prioridad**: alta · **Duración**: 5-6h · **Dependencias**: ninguna (en paralelo con 23)
**Naturaleza**: gestión y documentación; sin código.

**Objetivo**: cerrar lo que hoy bloquea el diseño de la plataforma y definir qué significa "terminado".

**Sub-sprints**:
- [ ] **A (2h) — G5.** Cuestionario de condiciones de infraestructura a la universidad y registro de respuestas: acceso root, Docker permitido, salida HTTPS hacia la API del LLM, SSO institucional (OIDC), política de backups, DNS y certificados, VPN, SLA esperado.
- [ ] **B (2h) — G9.** Alcance de entrega (MoSCoW) validado con el cliente, y criterios de aceptación de entrega.
- [ ] **C (1-2h).** Redactar ADR 005 (plataforma y hosting), ADR 006 (Postgres propio, schemas, pgvector) y ADR 007 (autenticación de admin). Borrador del modelo de soporte/SLA y lista de custodia de accesos.

**Criterios de aceptación**:
- **CA-1** Dadas las respuestas de la universidad, entonces están registradas y cada una tiene una consecuencia de diseño anotada.
- **CA-2** Dado el alcance MoSCoW, entonces el cliente lo acepta por escrito.
- **CA-3** Los ADR 005-007 están en estado Aceptado o con preguntas abiertas explícitas.

### Sprint 25 — Calidad del chat: latencia y evaluación

**Estado**: ⏳ pending · **Prioridad**: alta · **Duración**: 16h · **Dependencias**: 23

**Objetivo**: medir y reducir la latencia, y poder cambiar prompts o modelos sin degradar respuestas sin enterarse.

**Sub-sprints**:
- [ ] **A (4h) — G7.** Conjunto de evaluación.
  - `server/chat/__evals__/golden.json` con 30-50 preguntas (tool esperada, argumentos clave, cifra esperada con tolerancia).
  - `npm run eval:chat` (usa LLM real; no corre en CI por defecto) y reporte de aciertos.
- [ ] **B (2h) — H8.** Instrumentación por etapa (clasificador, L1, tools, L2) en logs estructurados. Línea base con 20 preguntas, registrada en `docs/`.
- [ ] **C (3h) — H8, H9.** Clasificador.
  - Ejecutar en paralelo con L1 y abortar L1 si responde `OUT`.
  - Omitirlo cuando hay historial reciente o términos del dominio; pasarle el último turno como contexto.
  - Tests de preguntas de seguimiento.
- [ ] **D (2h) — L1.** Dividir `orchestrator.js` en módulos (`prompts/`, `charts.js`, `geojson.js`, `synthesis.js`) sin cambiar comportamiento.
- [ ] **E (3h) — G6.** Proveedor de respaldo: `LLM_FALLBACK_*`, reintento con espera creciente, y estado claro en la interfaz si el chat no está disponible.
- [ ] **F (2h) — Spike.** Streaming (SSE): factibilidad con el driver actual, decisión registrada en ADR.

**Criterios de aceptación**:
- **CA-1** El conjunto de evaluación corre y produce un porcentaje de aciertos base (la meta se fija tras la línea base).
- **CA-2** Dada una pregunta de seguimiento sobre una consulta anterior, entonces no es bloqueada.
- **CA-3** Dado el proveedor principal caído, entonces el chat usa el de respaldo o muestra un estado claro; el visor sigue funcionando.
- **CA-4** El p95 de latencia queda medido antes y después, y se documenta la mejora.

### Sprint 26 — Plataforma propia (épica)

**Estado**: ⏳ pending · **Prioridad**: alta · **Duración**: 38-45h · **Dependencias**: 23, 24
**Requiere**: spec madre (`docs/specs/26-plataforma/00-spec-madre.md`) y una spec por tramo.

**Objetivo**: ejecutar el sistema completo en infraestructura propia (Postgres con PostGIS y pgvector, API Node persistente, proxy con TLS), idéntico en staging y producción, sin depender de Vercel ni Supabase.

**Invariantes**:
- **INV-1** El stack actual (Vercel + Supabase) sigue operativo hasta el corte.
- **INV-2** El contrato de `/api/chat` no cambia.
- **INV-3** No hay secretos en el frontend; la BD no queda expuesta a internet.
- **INV-4** Todos los tests existentes siguen pasando.

**Tramos**:

| Tramo | Contenido | Horas |
|---|---|---|
| 26-A | **Handler puro y servidor Node.** `server/handlers/chat.js` con `handleChat(body, ctx)`; `api/chat.js` queda como wrapper delgado; `server/index.js` (node:http o Fastify) sirve `/api/chat` y `/healthz`; cierre ordenado; budget configurable | 4 |
| 26-B | **Driver Postgres y rol de mínimo privilegio (H17, G3).** `server/db/drivers/postgres.js` con `pg.Pool`, `statement_timeout`, registro de firmas de RPC con tipos (`jsonb`, `text[]`), llamada con parámetros nombrados y lista cerrada de funciones; rol `chat_ro`; tests de integración contra Postgres en contenedor | 5 |
| 26-C | **Migraciones portables (G2).** `000_compat_roles.sql` idempotente (roles `service_role`/`anon`/`authenticated` sin login, schema `extensions`, extensiones `postgis`, `pgvector`, `unaccent`); runner de migraciones con tabla de control (dbmate o node-pg-migrate); imagen Postgres propia (PostGIS + pgvector); probar 000-010 sobre BD vacía dos veces | 4 |
| 26-D | **Compose y proxy.** Servicios `postgres`, `api`, `proxy`; TLS, compresión gzip/brotli, caché de estáticos y GeoJSON, `limit_req` sobre `/api/chat`, headers; red interna, Postgres sin puerto publicado; healthchecks; `.dockerignore`; `.env.example` actualizado. Nginx trae `limit_req` nativo; Caddy requiere plugin: decidir en ADR 005 | 6 |
| 26-E | **Datos.** Dump desde Supabase y restauración; `scripts/load-layer` (shp/GeoJSON → PostGIS con SRID, índice GIST, alta en catálogo y refresh de stats); `comunas_poligonos`; `build_catalog` contra la nueva BD; verificación de conteos por capa | 5 |
| 26-F | **Staging idéntico a producción (G1).** Segundo entorno con el mismo compose, datos de prueba y variables propias | 3 |
| 26-G | **Backups y restauración (G4).** `pg_dump` diario comprimido y cifrado, retención, copia fuera del servidor, alerta si falla, simulacro de restauración con RPO/RTO medidos | 4 |
| 26-H | **Endurecimiento (G14) y ajuste de Postgres.** SSH solo con llave, sin root, firewall, fail2ban, actualizaciones de seguridad automáticas, permisos de `.env`, rotación de logs de Docker; `shared_buffers`, `work_mem`, `random_page_cost` | 4 |
| 26-I | **Corte.** Plan de corte, TTL de DNS, pruebas de humo posteriores, y retorno al stack anterior si falla | 3 |

**Criterios de aceptación del sprint**:
- **CA-1** Dada una BD vacía, cuando se aplica el runner dos veces, entonces termina sin errores y las 71 capas cargan con el mismo conteo que en Supabase.
- **CA-2** Dado el staging, entonces tiene la misma topología y versiones que producción.
- **CA-3** Dado un respaldo del día anterior, cuando se restaura en un entorno limpio, entonces el sistema funciona y el tiempo queda registrado.
- **CA-4** Dado un escaneo de puertos desde internet, entonces solo 80/443 (y SSH restringido) responden.
- **CA-5** Dado el corte, entonces el chat responde sin el límite de 10 s y existe un procedimiento de retorno probado.

**Riesgos**:
- Condiciones de la universidad distintas a las supuestas (mitiga Sprint 24).
- Diferencias de comportamiento entre PostgREST y conexión directa (mitiga tests de integración 26-B).
- Tiempo de carga de datos por capas con geometrías complejas (mitiga 26-E con conteos de verificación).

**Reversión**: INV-1; DNS con TTL bajo antes del corte.

### Sprint 27 — CI/CD y entrega versionada

**Estado**: ⏳ pending · **Prioridad**: alta · **Duración**: 7-8h · **Dependencias**: 26-D

**Objetivo**: que cada versión sea un artefacto trazable, probado y reversible (reemplaza la promoción manual del ADR 004).

**Sub-sprints**:
- [ ] **A (3h) — H13.** GitHub Actions: lint, tests, construcción de la imagen, `npm audit`.
- [ ] **B (2h) — H6.** Versionado semántico, tags, imagen en un registro (GHCR), CHANGELOG por versión. ADR 008 que reemplaza al 004.
- [ ] **C (2h).** Script de despliegue y de rollback hacia el tag anterior.
- [ ] **D (1h).** Dependabot.

**Criterios**:
- **CA-1** Dado un push a `main`, entonces corren lint y tests, y un fallo bloquea la versión.
- **CA-2** Dado un tag candidato, entonces se despliega en staging con la misma imagen que irá a producción.
- **CA-3** Dado un rollback, entonces el sistema vuelve a la versión anterior en menos de 5 minutos (probado).

### Sprint 28 — Seguridad del frontend y dependencias

**Estado**: ⏳ pending · **Prioridad**: alta · **Duración**: 9-10h · **Dependencias**: 26-D

**Sub-sprints**:
- [ ] **A (3h) — H14.** Vendorizar Leaflet, markercluster, Turf, Chart.js y DOMPurify en `js/vendor/` (versiones fijas y checksum); alojar localmente las tipografías (Montserrat, Open Sans, Material Symbols).
- [ ] **B (2h) — H15.** CSP primero en modo solo reporte y luego en modo activo; HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. Requiere retirar los `onclick` inline de `help.html`.
- [ ] **C (2h) — H5.** Capa base con licencia: elegir proveedor (ADR 010), reemplazar `mt1.google.com`, atribuciones, revisar la política de uso de OSM.
- [ ] **D (1h).** Auditoría de `innerHTML` con `escapeHtml`.
- [ ] **E (2h).** Análisis OWASP ZAP contra staging, correcciones, `security.txt`.

**Criterios**:
- **CA-1** Dado el visor, entonces no carga ningún script ni hoja de estilo desde dominios externos.
- **CA-2** Dado el CSP activo, entonces no hay violaciones en el uso normal.
- **CA-3** Dada la capa base por defecto, entonces su licencia permite uso institucional.
- **CA-4** El informe ZAP no tiene hallazgos altos abiertos.

### Sprint 29 — Datos y gobierno de capas

**Estado**: ⏳ pending · **Prioridad**: media · **Duración**: 10-12h · **Dependencias**: 26-E

**Sub-sprints**:
- [ ] **A (3h).** Inventario de las 71 capas: fuente, licencia, fecha de actualización, responsable, frecuencia.
- [ ] **B (3h) — L5.** Sacar los GeoJSON de git (volumen `data/` con manifiesto de checksums), compresión (`.br`/`.gz`), precisión de 5 decimales, simplificación para zoom bajo. Medir bytes antes y después.
- [ ] **C (2h) — L2, L3.** Corregir color inválido, alias desalineados e IDs de DOM duplicados; ampliar `configValidator`.
- [ ] **D (2h) — L8.** Resolver doble conteo en `ST_Intersects` mediante migración nueva.
- [ ] **E (1h) — L4.** Decidir glify: activar o corregir documentación.
- [ ] **F (1h).** Fecha de última actualización visible por capa.

**Criterios**:
- **CA-1** Cada capa tiene fuente y licencia registradas.
- **CA-2** Los bytes transferidos disminuyen respecto de la línea base.
- **CA-3** El validador falla ante un color, alias o ID inválido.
- **CA-4** Dado un elemento en un límite comunal, entonces se cuenta una sola vez.

### Sprint 30 — Pruebas de aceptación técnica

**Estado**: ⏳ pending · **Prioridad**: alta · **Duración**: 16h · **Dependencias**: 26, 27 (idealmente tras Sprint 16)

**Sub-sprints**:
- [ ] **A (4h) — G13.** Playwright: carga del visor, activar dimensión, abrir tabla, filtrar, descargar, chat con LLM simulado.
- [ ] **B (2h).** k6: 10 usuarios simultáneos en el chat y 30 en el visor; umbrales definidos.
- [ ] **C (3h).** Lighthouse CI con presupuesto móvil en 4G (< 3 s).
- [ ] **D (2h).** axe y revisión manual WCAG AA.
- [ ] **E (2h).** Matriz de navegadores y dispositivos.
- [ ] **F (3h) — G4.** Simulacros de falla: contenedor caído, disco casi lleno, LLM caído, BD caída.

**Criterios**:
- **CA-1** El E2E corre en CI y cubre los flujos principales.
- **CA-2** Bajo la carga definida, el p95 cumple los umbrales.
- **CA-3** Primera carga en 4G < 3 s.
- **CA-4** Sin infracciones críticas de accesibilidad.
- **CA-5** Cada simulacro de falla tiene resultado y acción correctiva documentados.

### Sprint 31 — Observabilidad y operación

**Estado**: ⏳ pending · **Prioridad**: alta · **Duración**: 7-8h · **Dependencias**: 26

**Sub-sprints**:
- [ ] **A (2h) — H16.** Logs JSON con `requestId`, retención y rotación; sin contenido de usuario ni IP en claro (IP con hash).
- [ ] **B (2h).** Uptime Kuma con alertas: caída, disco > 80 %, certificado a < 14 días, backup no ejecutado, tasa de errores del LLM.
- [ ] **C (2h) — G12.** Reporte de errores del frontend (GlitchTip o Sentry) y analítica respetuosa de la privacidad (Umami o Plausible).
- [ ] **D (1h).** Valoración "útil / no útil" en el chat con su endpoint y tabla.
- [ ] **E (1h).** `/healthz` y `/readyz`.

**Criterios**:
- **CA-1** Dada una caída simulada, entonces llega la alerta en menos de 5 minutos.
- **CA-2** Los logs no contienen texto de consultas de usuarios.
- **CA-3** Hay un panel con uso, errores y valoraciones.

### Sprint 32 — Marco legal y privacidad

**Estado**: ⏳ pending · **Prioridad**: media · **Duración**: 5-6h · **Dependencias**: 24, 31-A
**Nota**: este plan no es asesoría legal; el punto D debe hacerlo un profesional.

**Sub-sprints**:
- [ ] **A (2h).** Páginas de términos de uso, privacidad y fuentes de datos.
- [ ] **B (1h).** Política de retención de logs y consultas.
- [ ] **C (1h).** Declaración del proveedor LLM y aviso visible en el chat (ADR 011).
- [ ] **D (2h).** Revisión legal externa (Ley 21.719 y normativa aplicable).

**Criterios**:
- **CA-1** Dado el visor, entonces las tres páginas son accesibles desde la interfaz.
- **CA-2** Dado el chat, entonces el usuario ve qué proveedor procesa sus consultas.
- **CA-3** La política de retención está implementada y documentada.

### Sprint 33 — Entrega y traspaso

**Estado**: ⏳ pending · **Prioridad**: alta · **Duración**: 10h · **Dependencias**: todos los sprints Must

**Sub-sprints**:
- [ ] **A (3h).** Runbook del operador: arranque, parada, actualización, rotación de claves, backup y restauración, procedimientos ante fallas.
- [ ] **B (2h).** Prueba de traspaso: una persona ajena al desarrollo despliega el sistema con el README en menos de una hora.
- [ ] **C (1h).** Inventario de custodia de accesos y gestor de contraseñas compartido.
- [ ] **D (2h).** Acuerdo de soporte y SLA, período de garantía, licencia y propiedad intelectual.
- [ ] **E (2h).** Capacitación a administradores y checklist de aceptación firmada.

**Criterios**:
- **CA-1** Dada la prueba de traspaso, entonces se completa en menos de 1 hora sin ayuda del desarrollador.
- **CA-2** Ningún acceso crítico depende de una sola persona.
- **CA-3** El checklist de aceptación está firmado por el cliente.

---

## Ajustes a sprints existentes

| Sprint | Ajuste |
|---|---|
| **06** | Depende de 23-A; reemplazar `include_geometry` por `get_layer_features` en la spec y actualizar CA-9/CA-10. |
| **07** | Ejecutar después de la plataforma (26): `/api/config` corre en el servidor propio. |
| **08** | Quitar referencias a Supabase; MVT con Martin o pg_tileserv; migraciones con el runner del 26-C. ADRs renumerados a 012-015. |
| **14** | Tablas `admin.*` bajo el runner del 26-C. |
| **15** | Auth de admin según ADR 007, MFA y auditoría desde el inicio. |
| **16** | Carga de capas con límites, validación, `ogr2ogr` aislado, preview y reversión. |
| **17** | `pgvector` en la imagen Postgres; versión de embeddings; documentos como fuente no confiable; procedencia; ingesta asíncrona. |
| **18** | Prompt delimita documentos recuperados y exige citarlos. |
| **22** | Reparar ADR 004, documentar hueco de 009, eliminar duplicado del Sprint 22, CONTRACT §5.3 con excepción para `/api/chat`. |
| **09-13, 19-21, 10** | Fuera del alcance de entrega salvo acuerdo expreso (ver §6 del análisis). |

---

## ADRs a escribir

| ADR | Tema | Origen |
|---|---|---|
| 005 | Plataforma y hosting (servidor, proxy, Node sin framework o Fastify) | 24-C |
| 006 | Postgres propio: instancia única, schemas `public`/`admin`/`rag`, pgvector | 24-C |
| 007 | Autenticación de administradores | 24-C |
| 008 | Entrega por artefactos versionados (reemplaza al 004) | 27-B |
| 009 | Contrato de `charts` plural (pendiente desde antes) | Deuda técnica |
| 010 | Capa base con licencia | 28-C |
| 011 | Proveedor LLM, respaldo y privacidad | 25-E, 32-C |
| 012-015 | Los previstos en la spec 08 (renumerados) | Ajuste al 08 |

---

## Orden de ejecución y alcance

**Secuencia propuesta:**
22 ─► 23 ─┬─► 06 (cierre) ─► 25 ─► 26 ─► 27 ─┬─► 28 ─┐
│ ├─► 29 ─┤
└─► 24 (en paralelo) ───────────────┘ │
31 ─────┤
▼
07 ─► 14 ─► 15 ─► 16 ─► [08, 17, 18 según alcance] ─► 30 ─► 32 ─► 33


**Alcance de entrega (propuesta para validar con el cliente en 24-B):**

| Categoría | Sprints |
|---|---|
| **Must** (antes de entregar) | 23, 24, 25, 26, 27, 28, 30, 31, 33; de producto: 06, 07, 14, 15, 16 |
| **Should** (según contrato y mediciones) | 08, 17, 18, 11, 29, 32 (legal puede ser Must según cliente) |
| **Could** | 12, 13, 19 |
| **No ahora** | 09 (bloqueado), 10, 20, 21 |

---

## Sesiones de trabajo

Bitácora cronológica descendente. Se actualiza al cierre de cada sesión.

### 2026-10-05 (sesión 2)
- 📝 Agregados Sprints 34-36 (refactor de mantenibilidad, estilos, configs).
- 📝 Nueva sección "Deuda técnica activa" con archivos > 500 líneas y duplicaciones.
- 📝 Nota de dinamismo al inicio del documento.

### 2026-10-05
- 📝 Auditoría técnica y análisis de la propuesta de migración.
- Definidos los Sprints 23-33 (corrección y preparación para producción) y los ajustes a los Sprints 06-08, 14-18 y 22.
- Sprint 23 marcado como **crítico**. Se recomienda ejecutar 23-A antes de cerrar Sprint 06.
- Pendientes de decisión: condiciones de hosting de la universidad, alcance de entrega, autenticación de admin.
- Próximo: Sprint 22 (alineación docs) y Sprint 23 (hotfixes) en paralelo.

### 2026-10-04
- 🔄 Sprint 22 — Alineación de documentación iniciado.
- Correcciones aplicadas: AGENTS.md, ARCHITECTURE.md, CONTRACT.md, DEV_GUIDE.md, ROADMAP.md.
- Próximo: verificar README.md y `.env.example`.

### 2026-10-03 (sesión 2)
- ✅ Sprint 05 — Multi-chart agnóstico completado. Commit `cefcde3`.
- Sub-fix: `x-opencode-session` header. Commits `aa201c9`, `95e1ed4`.
- Migración a OpenCode Go (MiMo-V2.5 → GLM-5.3-Flash).

### 2026-10-03 (sesión 1)
- ✅ Sprint 03 — Refactor de tools completado.
- ✅ Sprint 04 — Rate limiting + filtros de dominio completado.

### 2026-10-02
- ✅ Sprint 01 — Setup de staging completado.
- ✅ Sprint 02 — Contratos y ADRs completados.

---

## Pendientes inmediatos

Deudas técnicas y bugs conocidos, sin sprint asignado. Se revisan al inicio de cada sesión.

- [ ] **H1 — `get_layer_features` envía hasta 1000 features al LLM.** Contradice la spec 06. Resuelto en Sprint 23-A.
- [ ] **H2 — Geo-filter con `isLatam(undefined) = false`.** Aplica límite estricto sin header. Resuelto en Sprint 23-C.
- [ ] **H3 — `err.message` crudo y CORS `*`.** Resuelto en Sprint 23-B y 23-D.
- [ ] **H4 — Sin tope de costo ni abuso real.** Resuelto en Sprint 23-E y 26-D.
- [ ] **H9 — Clasificador bloquea preguntas de seguimiento.** Resuelto en Sprint 25-C.
- [ ] **H11 — Prompt desalineado (8 vs 9 tools) y deriva spec 06 ↔ código.** Resuelto en Sprint 23-F.
- [ ] **H12 — `npm test` con glob sin comillas.** Verificar. Resuelto en Sprint 23-F.
- [ ] **L6 — Migración 009 ausente; ADR 004 con texto pegado.** Resuelto en Sprint 22.
- [ ] **L7 — `chat_aggregate` (001) con `ORDER BY` sobre alias.** Verificar. Sprint 23-G.
- [ ] **L9 — CONTRACT §5.3 vs formato real del chat.** Resuelto en Sprint 22.
- [ ] **Timeout por tool (CA-12 spec 06).** Hoy `RPC_TIMEOUT_MS=6000` es global. Fix: parámetro `timeoutMs` en `withTimeout`. Sprint corto (1h). Urgencia: baja.
- [ ] **Limpieza de logs de diagnóstico en `orchestrator.js`.** Dejar 1-2 días, después remover.

---

## Deuda técnica activa

Hallazgos estructurales que no son bugs ni features, pero degradan el mantenimiento.
Se revisan al inicio de cada sesión y se asignan a un sprint cuando corresponda.

### Archivos y funciones fuera de límites

**Regla del CONTRACT (§4.3):** un archivo no debería superar las 300 líneas; una función
no debería superar las 50. Los siguientes archivos están fuera de límites y necesitan
refactor.

| Archivo | Líneas aprox. | Problema | Sprint sugerido |
|---|---|---|---|
| `js/utils/attributeTableUtils.js` | ~1000 | Tabla de atributos + modal de filtros + búsqueda + renderizado de chunks todo mezclado | 34 |
| `js/utils/glifyAdapter.js` | ~600 | Adaptador WebGL + callbacks de color + gestión de contextos + sanitización | 34 |
| `js/utils/layerUtils.js` | ~650 | Carga de capas + WMS + glify + heatmap + manejo de errores mezclados | 34 |
| `js/utils/styleUtils.js` | ~400 | Estilos + popups + colores + leyendas — responsabilidades mezcladas | 34 |
| `js/utils/legendUtils.js` | ~300 | Cerca del límite, revisar | 34 |
| `server/chat/orchestrator.js` | ~750 | Prompts + charts + geojson + síntesis + clasificador + lógica de tools | 25-D |
| `js/ui/chatUI.js` | ~450 | Render + estado + eventos + llamadas a backend | 34 |
| `css/components.css` | ~2500 | Todos los componentes en un solo archivo | 35 |
| `js/config/planificacion.js` | ~800 | 16 capas + WMS + estilos, todo en un archivo | 29-C |
| `js/config/agua.js` | ~700 | 19 capas + subgrupos | 29-C |
| `js/config/mineria.js` | ~500 | 10 capas + estilos | 29-C |
| `js/config/energia.js` | ~500 | 15 capas + estilos | 29-C |

**Impacto:**
- Difícil de testear (funciones con muchas dependencias).
- Difícil de revisar (PRs muy grandes).
- Difícil de extender (agregar una capa toca un archivo gigante).
- Merge conflicts frecuentes si hay más de un dev.

**Fix propuesto (Sprint 34 y 35):**
- Dividir por responsabilidad.
- Extraer lógica pura a módulos testeables.
- Un archivo, una responsabilidad.
- Aplicar a medida que se toca cada archivo, no en un big-bang.

### Duplicaciones conocidas

| Duplicación | Ubicación | Sprint |
|---|---|---|
| `transformCoordinates` | `js/workers/layerProcessor.worker.js` y `js/workers/workerPool.js` | 34 |
| Lógica de alias en leyendas | `leyendaAliases.js` global + `leyendaAlias` local por capa | 29-C |
| `tiposMap` en búsqueda | `js/search/index.js` duplica información del catálogo | 29-C |
| Configs de capas | 9 archivos `js/config/*.js` con estructura repetida | 29-C |

### Estilos y CSS

| Problema | Ubicación | Sprint |
|---|---|---|
| `!important` masivo (> 50 usos) | `css/components.css`, `css/base.css` | 35 |
| Sin sistema de tokens completo | `css/base.css` parcial | 35 |
| Componentes sin BEM consistente | Todo el CSS | 35 |
| `onclick` inline | `help.html` | 28-B |

### Complejidad algorítmica y rendimiento

| Hallazgo | Sprint |
|---|---|
| `escapeHtml` escapa `=`, `/` innecesariamente | 23-B |
| `getEstiloCapa` con fallback silencioso a `#3388ff` | 34 |
| `appState` con `setTimeout(15000)` a nivel de módulo | 34 |
| `document.getElementById` en top-level de módulos | 34 |
| `localStorage` sin namespacing ni versión | 34 |

### Cobertura de tests

| Módulo | Tests actuales | Meta |
|---|---|---|
| `_helpers.js` (normalizeArgs) | 35 | ✅ |
| `input-validator.js`, `rate-limiter.js`, `geo-filter.js`, `scope-filter.js` | 63 | ✅ |
| `orchestrator.js` | 0 | Sprint 25-A (golden set) |
| `charts.js` (buildChartsFromHistory) | 0 | Sprint 25-D |
| `geojson.js` (buildGeojsonFromHistory) | 0 | Sprint 23-A |
| `styleUtils.js`, `layerUtils.js`, `glifyAdapter.js` | 0 | Sprint 34 |

---

## Sprint 34 — Refactor de mantenibilidad (frontend)

**Estado**: ⏳ pending · **Prioridad**: media · **Duración**: 20-25h · **Dependencias**: 26-D, 28
**Requiere**: spec madre (`docs/specs/34-refactor-frontend/00-spec-madre.md`).

**Objetivo**: reducir archivos > 500 líneas, separar responsabilidades mezcladas, eliminar
duplicaciones conocidas. **Sin cambiar comportamiento.** Se hace por fases con tests de
regresión en cada paso.

**Invariantes:**
- **INV-1** El visor sigue funcionando idéntico.
- **INV-2** No se agregan features nuevas.
- **INV-3** Cada archivo dividido tiene tests que aseguran que el comportamiento es el mismo.

**Sub-sprints**:
- [ ] **A (5h)** — `attributeTableUtils.js` → `attributeTable/` con `table.js`, `filters.js`, `search.js`, `render.js`, `state.js`. Tests de regresión.
- [ ] **B (4h)** — `glifyAdapter.js` → `glify/` con `adapter.js`, `colors.js`, `contexts.js`, `sanitize.js`.
- [ ] **C (4h)** — `layerUtils.js` → `layerLoader/` con `loader.js`, `wms.js`, `glify.js`, `heatmap.js`, `errors.js`.
- [ ] **D (3h)** — `chatUI.js` → `chat/` con `render.js`, `state.js`, `events.js`, `api.js`.
- [ ] **E (3h)** — Extraer `transformCoordinates` a `js/utils/geometry.js` único; que ambos workers lo importen.
- [ ] **F (3h)** — Corregir anti-patrones: `escapeHtml`, `getEstiloCapa`, `appState` sin `setTimeout` top-level, `localStorage` con namespace, `document.getElementById` diferido.
- [ ] **G (2h)** — Verificación: E2E de los flujos principales + Lighthouse sin regresión.

**Criterios de aceptación**:
- **CA-1** Ningún archivo de `js/utils/` supera las 300 líneas (excepto `glify-browser.js` que es bundle).
- **CA-2** Ninguna función supera las 50 líneas.
- **CA-3** `transformCoordinates` existe una sola vez.
- **CA-4** Los E2E de Sprint 30 pasan después del refactor.
- **CA-5** Lighthouse sin regresión.

**Reversión**: un commit por sub-sprint. Si un sub-sprint rompe algo, `git revert` individual.

---

## Sprint 35 — Refactor de estilos CSS

**Estado**: ⏳ pending · **Prioridad**: media · **Duración**: 8-10h · **Dependencias**: 34
**Requiere**: spec simple (no épica).

**Objetivo**: reducir `!important`, sistematizar tokens, separar componentes.

**Sub-sprints**:
- [ ] **A (3h)** — Auditar `!important`: listar cada uso, agrupar por causa raíz, eliminar la mayor cantidad posible corrigiendo la cascada.
- [ ] **B (2h)** — Completar sistema de tokens en `base.css`: colores, spacing, tipografía, sombras, bordes, radios, z-index.
- [ ] **C (3h)** — Dividir `components.css` por dominio: `components/chat.css`, `components/sidebar.css`, `components/table.css`, `components/modal.css`, `components/legend.css`, `components/search.css`.
- [ ] **D (2h)** — Verificar visualmente todas las pantallas con el CSS refactorizado.

**Criterios de aceptación**:
- **CA-1** Ningún archivo CSS supera las 500 líneas.
- **CA-2** El número de `!important` baja al menos un 80% (de ~50 a < 10).
- **CA-3** Sistema de tokens cubre el 90% de los valores usados.
- **CA-4** Sin regresión visual en ningún componente.

**Reversión**: un commit por sub-sprint.

---

## Sprint 36 — Refactor de configs de capas

**Estado**: ⏳ pending · **Prioridad**: media · **Duración**: 6-8h · **Dependencias**: 29-C
**Requiere**: spec simple.

**Objetivo**: reducir los 9 archivos `js/config/*.js` (algunos > 700 líneas). Separar por dimensión.

**Sub-sprints**:
- [ ] **A (2h)** — Dividir `planificacion.js` (~800 líneas) en `planificacion/` con un archivo por grupo de capas.
- [ ] **B (2h)** — Dividir `agua.js` (~700 líneas) en `agua/` con `derechos.js`, `glaciares.js`, `humedales.js`, `lagunas.js`, `superficial.js`, etc.
- [ ] **C (1h)** — Dividir `mineria.js` y `energia.js`.
- [ ] **D (1h)** — Mover lógica repetida (colores, iconos, aliases) a helpers compartidos.
- [ ] **E (1h)** — Verificación: el visor carga las mismas capas con los mismos estilos.

**Criterios de aceptación**:
- **CA-1** Ningún archivo de configuración de dimensión supera las 300 líneas.
- **CA-2** La estructura de capas es idéntica antes y después.
- **CA-3** `configValidator` sigue sin errores.

**Reversión**: un commit por sub-sprint.

---

## Cambio 3 — Fila en el índice

Agregar al índice del ROADMAP:

| 34 | Refactor de mantenibilidad (frontend) | ⏳ pending | media | 20-25h | 26-D, 28 |
| 35 | Refactor de estilos CSS | ⏳ pending | media | 8-10h | 34 |
| 36 | Refactor de configs de capas | ⏳ pending | media | 6-8h | 29-C |


---

## Cambio 4 — Actualizar la nota de "Última actualización"

Cada vez que modifiques el ROADMAP, actualizá la fecha:

```markdown
> Última actualización: 2026-10-05.

---

## Notas generales

**Total restante estimado:**
- Producto: ~200-250 h.
- Corrección y producción: ~135-150 h.
- **Total: ~335-400 h.**

**Sprints core (indispensables para el salto de valor):**
- Sprint 06 (GeoJSON en mapa) — 4-6h.
- Sprint 07 (`/api/config`) — 3-4h.
- Sprint 14-16 (config en BD + panel admin) — 18-26h.

**Sprints críticos antes de entrega:**
- Sprint 23 (hotfixes) — 14-15h.
- Sprint 24 (decisiones) — 5-6h.
- Sprint 26 (plataforma propia) — 38-45h.
- Sprint 27 (CI/CD) — 7-8h.
- Sprint 33 (traspaso) — 10h.

**Regla de oro:** si no está en este roadmap, no se hace. Si algo es urgente, se agrega al roadmap primero.