# ROADMAP.md — Plan de sprints

> **Fuente de verdad del roadmap.** Se actualiza al inicio y al cierre de cada sesión de trabajo.
> Última actualización: 2026-10-03.

---

## Índice

| ID | Sprint | Estado | Prioridad | Duración | Dependencias |
|---|---|---|---|---|---|
| 01 | Setup de staging | ✅ done | alta | — | — |
| 02 | Contratos y ADRs | ✅ done | alta | — | — |
| 03 | Refactor de tools + tests | ✅ done | alta | — | — |
| 04 | Rate limiting + filtros de dominio | ✅ done | alta | — | — |
| 05 | Multi-chart agnóstico | ✅ done | alta | — | — |
| 06 | Respuesta geoespacial (GeoJSON en mapa) | ⏳ pending | alta | 4-6h | — |
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

**Leyenda de estados**:
- ✅ `done` — Completado y en producción.
- 🔄 `in-progress` — En desarrollo activo.
- ⏳ `pending` — En cola, listo para empezar.
- 🚫 `blocked` — Bloqueado por decisión externa o dependencia.

---

## Sprints completados (01-05)

### Sprint 01 — Setup de staging ✅

**Completado**: 2026-10-02
**Duración real**: ~3h

**Logro**: Ambiente de pruebas aislado con Vercel + Supabase + Groq.
- Repo `woll_atacama_pruebas` con rama `main`.
- Supabase staging con schema `chat` + migraciones 001-007.
- Vercel deployado apuntando a `main`.
- Chat funcional end-to-end en `wollatacamapruebas.vercel.app`.

### Sprint 02 — Contratos y ADRs ✅

**Completado**: 2026-10-02
**Duración real**: ~2h

**Logro**: Documentación fundacional del proyecto.
- `docs/CONTRACT.md` — reglas de diseño y desarrollo.
- `docs/ARCHITECTURE.md` — arquitectura actual.
- `docs/DECISIONS/` — 4 ADRs (repos separados, 3 planos, ambientes, promoción manual).
- `docs/DEV_GUIDE.md` — guía para desarrolladores.

### Sprint 03 — Refactor de tools + tests ✅

**Completado**: 2026-10-03
**Duración real**: ~3h

**Logro**: Una tool por archivo + tests.
- `server/chat/tools/` con 8 archivos (uno por tool).
- `_helpers.js` con `normalizeArgs` + `withTimeout`.
- 35 tests de `normalizeArgs` con `node:test`.
- `npm test` configurado.

### Sprint 04 — Rate limiting + filtros de dominio ✅

**Completado**: 2026-10-03
**Duración real**: ~4h

**Logro**: Endpoint `/api/chat` con 4 capas de defensa.
- `input-validator.js` — validación de text + history + sessionId.
- `rate-limiter.js` — rate limiting in-memory por IP.
- `geo-filter.js` — restricción LATAM + límite estricto fuera.
- `scope-filter.js` — regex de bloqueo (código, precios, jailbreak).
- `domain-classifier.js` — clasificador LLM (IN/OUT).
- 63 tests nuevos.

### Sprint 05 — Multi-chart agnóstico ✅

**Completado**: 2026-10-03
**Duración real**: ~5h

**Logro**: El chat devuelve múltiples gráficos, independiente de la tool.
- `buildChartsFromHistory` con detección por forma (no por tool).
- `extractChartableData` robusto a envoltorios de PostgREST.
- Contrato `charts: [...]` (array) + `chart` (singular) para compat.
- Frontend renderiza múltiples charts apilados.
- Soporte para `x-opencode-session` (OpenCode Go).
- 104 tests pasando.

---

## Sprints pendientes

### Sprint 06 — Respuesta geoespacial (GeoJSON en mapa)

**Estado**: ⏳ pending
**Prioridad**: alta
**Duración**: 4-6h
**Dependencias**: ninguna

**Objetivo**:
El chat responde con texto + charts + **GeoJSON pintado en el mapa**. Cierra el ciclo de la respuesta: texto + visualización + mapa.

**Comportamiento esperado**:
- Cuando la pregunta lo amerita (o el LLM lo decide), devuelve `geojson` con las features relevantes.
- El frontend pinta esas features destacadas en el mapa.
- Zoom automático a la extensión.
- Botón "Quitar resultados del mapa".

**Sub-sprints**:
- [ ] **A** — Backend: tools devuelven `geojson` cuando aplica (2h)
- [ ] **B** — Frontend: `chatMapUtils.js` + integración en `chatUI.js` (2h)
- [ ] **C** — Reglas del prompt sobre cuándo devolver geojson (1h)
- [ ] **D** — Verificación + commit + deploy (1h)

**Decisiones**:
- Máximo 500 features por respuesta.
- Al hacer nueva pregunta, limpiar la capa anterior.
- Al cerrar el chat, limpiar.
- Estilo destacado (borde grueso, color distinto).

---

### Sprint 07 — `/api/config` + snapshot

**Estado**: ⏳ pending
**Prioridad**: alta
**Duración**: 3-4h
**Dependencias**: ninguna

**Objetivo**:
Endpoint que devuelve la config del visor (dimensiones, capas, grupos) como JSON. El visor deja de leer `js/config/*.js` directamente y consume el endpoint.

**Por qué**: prepara el camino para migrar config a BD y construir el panel admin.

**Sub-sprints**:
- [ ] **A** — `server/config/snapshot.js` (genera JSON desde `allTemasConfig.js`) (1h)
- [ ] **B** — `api/config.js` (endpoint + cache 5 min) (1h)
- [ ] **C** — `js/config/loader.js` (fetch + fallback local) (1h)
- [ ] **D** — Verificación + commit (1h)

**Fallback**: si el fetch falla, usar el import local (compatibilidad).

---

### Sprint 08 — Migración a PostGIS (fuente principal)

**Estado**: ⏳ pending
**Prioridad**: alta
**Duración**: 40-46h
**Dependencias**: Sprint 07

**Objetivo**:
PostGIS como fuente principal de capas. GeoJSON como fallback.

**Modelo de "doble fuente"**:
```json
{
  "source": {
    "type": "postgis" | "geojson" | "wms",
    "table": "public.lagunas_embalses",
    "geometry_column": "geom",
    "srid": 4326
  }
}

Sub-sprints:

□ A — Infraestructura de tiles MVT (8h)
□ B — Migración piloto: 3 capas chicas (4h)
□ C — Migración completa: 70 capas (16-24h)
□ D — Estilos y popups vía MVT (6h)
□ E — Exportación/descarga desde PostGIS (4h)
Riesgo: alto. Toca todo el frontend.

Estrategia: por fases, con reversibilidad en cada paso.

Sprint 09 — Soporte de imágenes raster
Estado: 🚫 blocked
Prioridad: media
Duración: 2-25h (según opción)
Dependencias: decisión técnica (GeoTIFF vs GEE vs WMS)

Opciones:

WMS externo: 2-3h. Ya funciona parcialmente.

Google Earth Engine: 8-12h. Series temporales.

GeoTIFF físico (COG): 15-25h. Control total.

PostGIS Raster: 10-15h. Limitado por storage.

Decisión pendiente: formato y fuente.

Sprint 10 — Vista 3D del visor
Estado: ⏳ pending
Prioridad: baja
Duración: 20-40h
Dependencias: Sprint 08, 09

Opciones:

MapLibre GL JS: 30-40h. Reescribe el visor.

CesiumJS: 40-60h. 3D completo.

Iframe externo (Cesium): 4-8h. Desconectado.

Propuesta: empezar con iframe externo, luego MapLibre si aplica.

Sprint 11 — Análisis por Área de Interés (AOI)
Estado: ⏳ pending
Prioridad: alta
Duración: 15-28h
Dependencias: Sprint 08

Objetivo:
Usuario dibuja un polígono (o elige comuna/provincia) y el sistema devuelve:

Identidad de elementos dentro.

Estadísticas.

Pintado en el mapa.

Exportación (CSV, GeoJSON).

Sub-sprints:

□ A — Infraestructura de dibujo (leaflet-geoman-free) (6h)
□ B — Backend: chat_analyze_aoi + chat_features_in_aoi (6h)
□ C — Panel de resultados (8h)
□ D — Pintado + exportación (4h)
□ E — Integración con el chat (nueva tool analyze_aoi) (4h)

Sprint 12 — Registro y visualización de indicadores

Estado: ⏳ pending
Prioridad: media
Duración: 20-33h
Dependencias: Sprint 08, 11, 14

Objetivo:
KPIs territoriales predefinidos + indicadores ad-hoc desde AOI.

Modelo:

admin.indicators — definición (slug, fórmula, unidad, display).

admin.indicator_values — valores precalculados por territorio.

Sub-sprints:

□ A — Modelo de datos + RPCs (5h)
□ B — Backend de cálculo (Tipo A SQL + Tipo B tool) (6h)
□ C — Panel de indicadores en sidebar derecho (8h)
□ D — Dashboard /indicadores (6h)
□ E — Tool get_indicator en el chat (4h)
□ F — Generación ad-hoc desde AOI (4h)

Sprint 13 — Generación de reportes con IA

Estado: ⏳ pending
Prioridad: media
Duración: 20-32h
Dependencias: Sprint 08, 11, 12

Objetivo:
Generar .docx/.pdf/.xlsx con IA que rellena plantillas.

Stack:

docxtemplater para .docx.

puppeteer + node-canvas para imágenes.

libreoffice para PDF.

Plantillas:

Informe territorial regional.

Ficha comunal.

Análisis AOI.

Reporte comparativo.

Sub-sprints:

□ A — Modelo de datos + storage (4h)
□ B — Generador de reportes (docxtemplater + LLM) (8h)
□ C — Generación de imágenes (mapas + gráficos) (4h)
□ D — Panel de reportes en el sidebar (6h)
□ E — Editor de plantillas (panel admin) (6h)
□ F — Formatos adicionales (PDF, Excel) (4h)

### Sprint 14 — Migrar config a Supabase (admin.*)

Estado: ⏳ pending
Prioridad: alta
Duración: 4-6h
Dependencias: Sprint 07

Objetivo:
Mover los 9 archivos js/config/"todos_los_archivos".js a tablas admin.dimensions, admin.layers, admin.layer_groups.

Sub-sprints:

□ A — Migración SQL: admin.dimensions, admin.layers, admin.layer_groups (2h)
□ B — Backfill desde archivos JS a BD (2h)
□ C — Endpoint /api/config lee desde BD (2h)

### Sprint 15 — Panel admin: solo lectura

Estado: ⏳ pending
Prioridad: alta
Duración: 6-8h
Dependencias: Sprint 14

Objetivo:
apps/admin/ SPA con login + lista de dimensiones, capas, groups. Sin edición todavía.

Sub-sprints:

□ A — Setup apps/admin (Vite + React) (2h)
□ B — Auth con Supabase (2h)
□ C — Vista de dimensiones/capas (3h)
□ D — Deploy separado en Vercel (1h)

### Sprint 16 — Panel admin: CRUD de capas

Estado: ⏳ pending
Prioridad: alta
Duración: 8-12h
Dependencias: Sprint 08, 14, 15

Objetivo:
CRUD completo de capas: crear, editar, eliminar. Preview de cambios. Snapshot regenerado.

Sub-sprints:

□ A — Formulario de capa (4h)
□ B — Validación estructural (2h)
□ C — Preview de cambios (2h)
□ D — Regeneración de snapshot (2h)
□ E — Audit log + rollback (2h)

### Sprint 17 — Ingesta RAG (PDFs → chunks → embeddings)

Estado: ⏳ pending
Prioridad: media
Duración: 8-12h
Dependencias: Sprint 15

Objetivo:
Subir PDFs, extraer texto, chunking, embeddings con pgvector.

Sub-sprints:

□ A — Migración: admin.documents + admin.document_chunks + extensión pgvector (2h)
□ B — Pipeline de ingesta asíncrona (4h)
□ C — Panel de documentos en admin (3h)
□ D — Verificación (1h)

### Sprint 18 — Retrieval RAG + tool en chat

Estado: ⏳ pending
Prioridad: media
Duración: 8-12h
Dependencias: Sprint 17

Objetivo:
Búsqueda semántica + tool search_docs en el chat.

Sub-sprints:

□ A — search_docs con pgvector + reranking (4h)
□ B — Router de fuentes (capas + docs) (3h)
□ C — Reglas del prompt para citar documentos (2h)
□ D — Verificación (1h)

### Sprint 19 — APIs externas + CRUD

Estado: ⏳ pending
Prioridad: media
Duración: 15-25h
Dependencias: Sprint 16

Objetivo:
Infraestructura para consumir APIs externas + CRUD en panel admin.

Sub-sprints:

□ A — Base de adapters + HttpAdapter genérico + 1 adapter real (6h)
□ B — Modelo de datos + RPCs (4h)
□ C — Panel admin CRUD (10h)
□ D — Integración con el chat (4h)
□ E — Adapter 2 (verificación del patrón) (6h)

### Sprint 20 — Adapter real: meteorología

Estado: ⏳ pending
Prioridad: baja
Duración: 4-6h
Dependencias: Sprint 19

Objetivo: Integrar API de meteorología (OpenWeather, Meteo Chile, o GEE).

Decisión pendiente: proveedor.

### Sprint 21 — Adapter real: leyes (BCN)

Estado: ⏳ pending
Prioridad: baja
Duración: 6-8h
Dependencias: Sprint 19

Objetivo: Integrar Biblioteca del Congreso Nacional para consultas de leyes.

Sesiones de trabajo
Bitácora cronológica. Se actualiza al cierre de cada sesión.

### Sprint 22 — Alineación de documentación

**Estado**: 🔄 in-progress
**Prioridad**: alta
**Duración**: 3-4h
**Dependencias**: ninguna

**Objetivo**:
Dejar todos los documentos coherentes entre sí y con el código actual, con un único dueño por tipo de información.

**Decisiones tomadas**:
- Flujo de trabajo: **commit directo a `main`** (sin `develop`).
- `IMPLEMENTATION.md` se retira: su historial pasa a `CHANGELOG.md` (etapas E0-E7), sus fases futuras ya están en este ROADMAP, y su tabla de variables de entorno se reemplaza por `.env.example`.

**Sub-sprints**:
- [ ] **A** — Reemplazar `AGENTS.md`; corregir "8 tools" → "9 tools" (45 min)
- [ ] **B** — Actualizar `ARCHITECTURE.md`: proveedor LLM (OpenCode Go), tools por archivo, timeout 6 s, nueva tool `get_layer_features` (45 min)
- [ ] **C** — Actualizar `CONTRACT.md §6.2` y `§9.1` (30 min)
- [ ] **D** — Actualizar `DEV_GUIDE.md §8` (30 min)
- [ ] **E** — Actualizar `README.md` si tiene desalineaciones de conteos (30 min)
- [ ] **F** — Verificar coherencia entre todos los documentos (30 min)

2026-10-03 (sesión 2)
✅ Sprint 05 — Multi-chart agnóstico completado. Commit cefcde3.

Sub-fix: x-opencode-session header. Commits aa201c9, 95e1ed4.

Migración a OpenCode Go (MiMo-V2.5 → GLM-5.3-Flash).

📝 Próxima sesión: Sprint 06 — Respuesta geoespacial.

### 2026-10-04
- 🔄 Sprint 22 — Alineación de documentación iniciado.
- Correcciones aplicadas: AGENTS.md, ARCHITECTURE.md, CONTRACT.md, DEV_GUIDE.md, ROADMAP.md.
- Próximo: verificar README.md y `.env.example`, después continuar con Sprint 06.

2026-10-03 (sesión 1)
✅ Sprint 03 — Refactor de tools completado.

✅ Sprint 04 — Rate limiting + filtros de dominio completado.

2026-10-02
✅ Sprint 01 — Setup de staging completado.

✅ Sprint 02 — Contratos y ADRs completados.

Pendientes inmediatos
□ Limpieza de logs de diagnóstico en orchestrator.js (dejar 1-2 días, después remover).
□ Deuda técnica: ADR del cambio a charts plural.
Notas generales
Total restante estimado: 185-275 horas (~5-7 meses a tiempo parcial).

Sprints core (indispensables para el salto de valor):

Sprint 06 (GeoJSON en mapa) — 4-6h

Sprint 07 (/api/config) — 3-4h

Sprint 14-16 (config en BD + panel admin) — 18-26h

Estos 5 sprints (~30h) llevan el proyecto de "chat funcional" a "plataforma administrable". Es el próximo hito grande.

# Entrada para ROADMAP.md — Sprint 22

## 1. Fila del índice (agregar al final de la tabla)

| 22 | Alineación de documentación | ⏳ pending | alta | 3-4h | — |

> Ejecutar **antes del Sprint 06**: los agentes de IA leen estos documentos en cada sesión y los datos obsoletos los llevan a decisiones equivocadas.

## 2. Detalle (agregar en "Sprints pendientes")

### Sprint 22 — Alineación de documentación

**Estado**: ⏳ pending
**Prioridad**: alta
**Duración**: 3-4h
**Dependencias**: ninguna

**Objetivo**:
El código base existía antes de la documentación (CONTRACT, ARCHITECTURE, DEV_GUIDE, ADRs, ROADMAP). README, AGENTS.md e IMPLEMENTATION.md quedaron describiendo un estado anterior. Este sprint deja todos los documentos coherentes entre sí y con el código, con un único dueño por tipo de información.

**Decisiones tomadas**:
- Flujo de trabajo: **commit directo a `main`** (sin `develop`).
- `IMPLEMENTATION.md` se retira: su historial pasa a `CHANGELOG.md` (etapas E0-E7), sus fases futuras ya están en este ROADMAP, y su tabla de variables de entorno se reemplaza por `.env.example`.

**Criterios de aceptación**:
- Dado un agente que lee solo `AGENTS.md`, cuando busca reglas o arquitectura, entonces encuentra enlaces a CONTRACT, ARCHITECTURE y ROADMAP.
- Dados el número de tools, tests, migraciones y variables de entorno, cuando se comparan README, ARCHITECTURE, DEV_GUIDE y el código, entonces coinciden.
- Dado el flujo de ramas, cuando se comparan README y DEV_GUIDE, entonces dicen lo mismo (`main` directo).
- Dado el historial de bugs "Sprint 1-5" de AGENTS.md, cuando termina el sprint, entonces vive en `CHANGELOG.md` con numeración E0-E7 y no choca con los Sprint 01-21.
- Dado que cada tipo de información tiene un dueño (README: qué es y cómo correrlo; AGENTS: comandos y peculiaridades; CONTRACT: reglas; ARCHITECTURE: estado actual; ROADMAP: plan; ADRs: decisiones; CHANGELOG: historial; `.env.example`: variables), cuando se busca un dato, entonces aparece en un solo lugar.

**Sub-sprints**:
- [ ] **A** — Reemplazar `AGENTS.md` y crear `CHANGELOG.md` (45 min)
- [ ] **B** — Reemplazar `README.md`; borrar `IMPLEMENTATION.md` y sus enlaces (1h)
- [ ] **C** — Actualizar `ARCHITECTURE.md`: proveedor LLM actual, tools por archivo, timeout 6 s, clasificador de dominio; quitar su §9 duplicado del roadmap (45 min)
- [ ] **D** — Limpiar restos de chat en `ROADMAP.md` y en el ADR 004 ("Cómo aplicarlo", "Cómo crearlos"); escribir el ADR de `charts` plural; corregir en el ADR 004 el comando `git diff` entre repos (30 min)
- [ ] **E** — Decidir la regla de naming (CONTRACT aspiracional o ajustado a la realidad: `layerUtils.js`, `appState.js`) y reflejarla en CONTRACT (15 min)
- [ ] **F** — (opcional) Script que compare conteos documentados contra el código: tools, migraciones, variables de `.env.example` (1h)

**Pendientes de verificación durante el sprint**:
- Cuadrar el número de variables de entorno (README listaba 11, ARCHITECTURE dice 13) contra `.env.example`, incluyendo `CHAT_VERBOSE`, `ORCHESTRATOR_DEBUG` y las del proveedor OpenCode Go.
- Confirmar el rango real de migraciones en `db/migrations/` y el número actual de tests.

## 3. Entrada en "Sesiones de trabajo"

### 2026-10-04
- 📝 Sprint 22 definido. Decisiones: `main` directo; `IMPLEMENTATION.md` se retira a `CHANGELOG.md`.

Convenciones:

Un commit por sub-sprint, con mensaje que referencia el ID: feat: sprint-06-A backend geoespacial.

Actualizar este archivo al inicio y al cierre de cada sesión.

Los ADRs se agregan a docs/DECISIONS/ cuando el sprint lo amerita.

Cómo usar este archivo
Al inicio de sesión:

Abrir este archivo.

Ver el sprint activo (in-progress) o el próximo pending.

Decidir el sub-sprint a hacer.

Cambiar estado a in-progress si aplica.

Durante la sesión:

Marcar checkboxes de sub-sprints completados.

Anotar problemas/dudas en "Notas" del sprint.

Al cierre de sesión:

Actualizar Estado si terminó el sprint.

Agregar entrada en "Sesiones de trabajo".

Commit + push: docs: actualizar roadmap.

Al agregar un sprint nuevo:

Agregar al índice con ID correlativo.

Detalle en "Sprints pendientes".

Estimar duración y dependencias.


---

## Cómo aplicarlo

```bash
cd ~/Proyectos/woll_atacama_pruebas

# Crear el archivo
nano docs/ROADMAP.md
# Pegar todo el contenido de arriba
# Guardar (Ctrl+O, Enter, Ctrl+X)

# Verificar
wc -l docs/ROADMAP.md
# Debería tener ~350 líneas

# Commit
git add docs/ROADMAP.md
git commit -m "docs: crear roadmap completo con 21 sprints"
git push origin main

Después del commit
Cuando confirmes que está en GitHub:

Verificá en GitHub: https://github.com/proyectosandesvalue/woll_atacama_pruebas/blob/main/docs/ROADMAP.md

Marcá en el archivo los sprints 01-05 como done (ya lo tienen).

Próxima decisión: elegir el sprint activo (mi recomendación: Sprint 06).

### Pendientes inmediatos

- [ ] **Clasificador de dominio rechaza preguntas de seguimiento.**
  El clasificador `classifyDomain(text, sessionId)` solo recibe la pregunta
  actual, sin contexto del historial. Preguntas como "¿cuál es la más
  grande en km²?" (seguimiento de "¿cuántas lagunas hay?") son bloqueadas
  incorrectamente.
  Fix propuesto (Opción D): skip del clasificador si hay historial reciente
  O si la pregunta contiene palabras del dominio. Ver conversación
  2026-10-04.
  Impacto: usuarios que hacen preguntas de seguimiento reciben bloqueo.
  Urgencia: media-alta.

- [ ] Limpieza de logs de diagnóstico en orchestrator.js (dejar 1-2 días, después remover).

- [ ] Deuda técnica: ADR del cambio a charts plural.