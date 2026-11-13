# ROADMAP.md — Plan de sprints

> **Fuente de verdad del roadmap.** Se actualiza al inicio y al cierre de cada sesión de trabajo.
> Última actualización: 2026-11-10.
>
> **Infraestructura (2026-11-10):** el destino final es un **VPS propio** (Node persistente + PostgreSQL/PostGIS/pgvector + Nginx/Caddy + proxy persistente). **Vercel + Supabase son solo demo/staging**: Supabase alcanzó su límite de almacenamiento y Vercel Hobby no alcanza para producción. Las optimizaciones serverless son para la demo; no invertir en Upstash/Redis/cron para Vercel salvo que sea portable. **Sprint 26 es la prioridad de producción.** Ver ADR 005.
> **Disparador de migración:** la creación de la **imagen Docker de PostgreSQL (PostGIS + pgvector)** marca el inicio de la migración. Desde ese commit, el entorno de desarrollo es Docker Compose/VPS, Vercel + Supabase quedan congelados para demo, y todo cambio debe funcionar primero en la imagen local y luego replicarse en el servidor.
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
| 06 | Respuesta geoespacial (GeoJSON en mapa) | ✅ done | alta | 4-6h | — |
| 06-B.7 | Pintado multi-capa del chat | ✅ done | alta | 3-4h | 06-B.2 |
| 07 | `/api/config` + snapshot | ⏳ pending | alta | 3-4h | — |
| 08 | Migración a PostGIS (fuente principal) | 🔶 en ejecución (08-0/08-A/08-G parciales) | alta | 56-64h | 07, 26 |
| 09 | Rasters y capas meteorológicas dinámicas | 🔶 parcial (Copernicus cubre indicadores; NASA/raster pendientes) | media-alta | ~30-50h | decisión técnica |
| 09-A | Spike/ADR de rasters (semi-resuelto) | 🔶 semi-resuelto | media | 4-6h | — |
| 09-B | Implementación de rasters (NASA + lectura IMG/TIFF/COG + variables derivadas) | ⏳ pending (bloqueado por 09-A) | media | 12-20h | 09-A |
| 09-C | Capas meteorológicas dinámicas tipo Windy (viento, nubes, lluvia) | ⏳ pending | media-alta | 10-18h | — (requiere spec) |
| 09-D | Optimización y variables meteorológicas adicionales | ⏳ pending (depende de 09-C) | media | 4-8h | 09-C |
| 10 | Vista 3D del visor | ⏳ pending | baja | 20-40h | 08, 09 |
| 11 | Análisis por Área de Interés (AOI) | ⏳ pending | alta | 15-28h | 08 |
| 12 | Registro y visualización de indicadores | ⏳ pending | media | 20-33h | 08, 11, 14 |
| 13 | Generación de reportes con IA | ⏳ pending | media | 20-32h | 08, 11, 12 |
| 14 | Migrar config a Supabase (`admin.*`) | ⏳ pending | alta | 4-6h | 07 |
| 15 | Panel admin — solo lectura | ⏳ pending | alta | 6-8h | 14 |
| 16 | Panel admin — CRUD de capas | ⏳ pending | alta | 8-12h | 08, 14, 15 |
| 17 | Ingesta RAG (PDFs → chunks → embeddings) | 🔶 parcial | media | 8-12h | — (CLI); 15 solo para el panel |
| 18 | Retrieval RAG + tool en chat | ⏳ pending | media | 8-12h | 17 |
| 19 | APIs externas + CRUD | ⏳ pending | media | 15-25h | 16 |
| 20 | Adapter real: meteorología | ⏳ pending | baja | 4-6h | 19 |
| 21 | Adapter real: leyes (BCN) | ⏳ pending | baja | 6-8h | 19 |
| 22 | Alineación de documentación | 🔶 parcial (A-E cerrados; F y ajustes pendientes) | alta | 3-4h | — |
| 23 | Hotfixes críticos del chat y la API | ✅ done | **crítica** | 14-15h | — |
| 24 | Decisiones y alcance de entrega | ⏳ pending | alta | 5-6h | — |
| 25 | Calidad del chat: latencia y evaluación | ✅ done | alta | 16h | 23 |
| 26 | Plataforma propia (Postgres + Docker + proxy) | 🔶 parcial (26-E v1 ✅; 26-K diferido al panel admin; 26-F después) | alta | 42-46h | 23, 24 |
| 27 | CI/CD y entrega versionada | ⏳ pending | alta | 7-8h | 26-D |
| 28 | Seguridad del frontend y dependencias | ⏳ pending | alta | 9-10h | 26-D |
| 29 | Datos y gobierno de capas | ⏳ pending | media | 10-12h | 26-E |
| 30 | Pruebas de aceptación técnica | ⏳ pending | alta | 16h | 26, 27 |
| 31 | Observabilidad y operación | ⏳ pending | alta | 7-8h | 26 |
| 32 | Marco legal y privacidad | ⏳ pending | media | 5-6h | 24, 31-A |
| 33 | Entrega y traspaso | ⏳ pending | alta | 10h | Sprints Must |
| 34 | Refactor de mantenibilidad (frontend) | ⏳ pending | media | 20-25h | 26-D, 28 |
| 35 | Refactor de estilos CSS | ⏳ pending | media | 8-10h | 34 |
| 36 | Refactor de configs de capas | ⏳ pending | media | 6-8h | 29-C |
| 37 | Auditoría y normalización de datos | ⏳ pending (diferido) | media | 22-26h | 23 |
| 40 | Orquestación determinística del chat (épica) | 🔶 parcial (40-C y 40-D.2 cerrados) | alta | 26-31h | 25-A, 25-D |
| 41 | Recetas de análisis (épica) | ⏳ pending | media | 14-20h + experto | 40-C |
| 42 | Ingesta de fuentes externas (DGAC, ArClim) | 🔄 parcial (42-A y 42-C completados) | media | 18-28h | 24-A, 24-B |
| 43 | Normativa urbana: BCN + planes reguladores | ⏳ pending | media | 20-32h | 17, 18, 41-A |
| 44 | Catálogo de indicadores satelitales Copernicus | ✅ done | media | 8-10h | proxy (2026-11-06) |

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

## Sprint 06 — Respuesta geoespacial (GeoJSON en mapa) ✅

**Estado**: ✅ done (cerrado 2026-10-12)
**Prioridad**: alta
**Duración**: 4-6h (5-7h con comportamiento móvil)
**Dependencias**: Sprint 23-A (bloqueante para cierre correcto)
**Spec**: `docs/specs/06-respuesta-geoespacial.md`

**Objetivo**:
El chat responde con texto + charts + **GeoJSON pintado en el mapa**.

**Sub-sprints**:
- [x] **A** — Backend: `get_layer_features` + extracción de geojson (2h) — commit `3a21572`
- [X] **B** — Frontend: `chatMapUtils.js` + integración en `chatUI.js` (3h)
- [X] **C** — Reglas del prompt sobre cuándo devolver geojson (1h)
- [X] **D** — Verificación + commit + deploy (1h)

**Bloqueantes conocidos**:
- [X]Sprint 23-A (geojson fuera del LLM) debe ejecutarse antes del cierre de 06.
- []La spec 06 habla de `include_geometry` en `query_layer`; el código implementó `get_layer_features`. Hay que actualizar la spec.

**Pendientes de decisión**:
- Máximo de features por respuesta (500 en spec, 1000 en RPC — revisar tras Sprint 23-A).
- Comportamiento móvil (colapsar chat + botón "Volver al chat").

### Sprint 06-B.7 — Pintado multi-capa del chat

**Estado**: ✅ done (2026-10-12) · **Prioridad**: alta · **Duración**: 3-4h
**Dependencias**: 06-B.2 (backend informa layer_id)

**Objetivo**: que el chat pueda pintar varias capas simultáneas, cada una
con un color distinto, y que persistan hasta que el usuario las quite.

**Comportamiento esperado**:
- Si el usuario pide 2 capas ("muéstrame las plantas desaladoras y los
  puertos"), cada una se pinta con un color distinto.
- Si el usuario pide una nueva capa ("muéstrame los humedales"), las
  anteriores **siguen visibles**.
- El usuario puede quitar todas las capas con el botón "Quitar resultados".
- El usuario puede quitar una capa específica (necesita UI nueva).
- La leyenda muestra qué color corresponde a cada capa.

**Sub-sprints**:
- [X] **A (1h)** — `appState.chat.resultsLayers` (array) en lugar de
  `resultsLayer` (objeto único).
- [X] **B (1h)** — `showResults()` agrega al array en lugar de reemplazar;
  paleta de colores rotativa.
- [X] **C (1h)** — `clearResults()` limpia todas; `clearResultsByLayerId()`
  limpia una específica.
- [X] **D (1h)** — UI: leyenda que muestra el nombre de cada capa + botón
  para quitar una capa específica.

**CA**:
- **CA-1** Si el usuario pide 2 capas, cada una se pinta con un color
  distinto.
- **CA-2** Si el usuario pide una 3ra capa, las 2 anteriores siguen
  visibles.
- **CA-3** El usuario puede quitar todas las capas con el botón
  "Quitar resultados".
- **CA-4** El usuario puede quitar una capa específica.
- **CA-5** La leyenda muestra qué color corresponde a cada capa.
- **CA-6** Si el usuario pide más capas que colores disponibles, se
  recicla la paleta con una nota.

**Reversión**: un commit por sub-sprint.
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

**Estado**: 🔶 en ejecución (08-0 parcial, 08-A en curso, 08-G en curso) · **Prioridad**: alta · **Duración**: 56-64h · **Dependencias**: 07, 26
**Spec**: `docs/specs/08-postgis-fuente-principal/00-spec-madre.md` (APROBADA, revisión 2026-11-12)

**Objetivo**: PostGIS como fuente principal de capas, con GeoJSON como fallback. El navegador deja de descargar archivos completos y recibe tiles del viewport, páginas de tabla, agregados de cluster/heatmap y exportaciones bajo demanda. **Todas las opciones de capa deben seguir disponibles**: tabla de atributos, zoom a la capa/feature, filtros, cluster, mapa de calor y descarga.

**Corrección del modelo de carga (2026-11-10)**: "cargar desde la BD" no es más liviano por sí solo. Servir `ST_AsGeoJSON` completo desde PostGIS puede pesar más que el GeoJSON estático (consulta + serialización + transferencia + parse en cliente). El ahorro real viene de **tiles, endpoints paginados, filtros server-side, agregados y caché Nginx**. Ver §2 de la spec.

**Revisión 2026-11-12 (pregeneración)**: con el inventario real, el camino principal pasa a ser **MVT pregenerado y versionado servido por Nginx** para capas estáticas o por edición (catastro 2024/2026, incendios anuales, derechos 2025). El **MVT on-demand** queda solo para capas/valores dinámicos y filtros arbitrarios. Estaciones: geometría estática + valores por API; cluster/heatmap cliente ≤5.000 puntos y server-side solo por encima. Esto hace viable el VPS 4 vCPU/8 GB; el disco es el recurso a medir.

**Entorno**: se ejecuta sobre la imagen Docker PostgreSQL (PostGIS + pgvector), Node persistente y Nginx/Caddy del Sprint 26. Vercel + Supabase quedan congelados (ADR 005). Los ADR de este sprint son 012-015.

**Avance 2026-11-13 (08-0/08-A/08-G)**:
- `scripts/build-tiles.mjs`: MVT por capa/versión con geometría simplificada materializada por zoom, cobertura real de features, feature ids, manifest/checksum y maxzoom adaptativo (20.000 tiles).
- `scripts/tiles-sync.mjs`: publicación por lote, detección de capas nuevas/editadas (`chat_catalog.updated_at`), índice `tiles/index.json`, `--check` y `--prune`.
- `load-layer --tiles`: alta de capa + generación en un paso.
- Nginx sirve `/tiles/` con MIME MVT, gzip y `Cache-Control: immutable`; `try_files` evita el fallback a la SPA.
- Mediciones: `borde_costero` 382 features → 2.887 tiles / 7,8 MB (GeoJSON 47 MB); `humedales` → 2.518 tiles / 3,6 MB (GeoJSON 24 MB). Puntos: 920 derechos → 8,2 MB de tiles vs 0,19 MB gzip → se quedan en GeoJSON/API.
- **Corrida completa:** 41 capas, 88.152 tiles, 146,6 MB lógicos / 393 MB en disco; 7 capas regionales degradadas a z13; 27 puntos, 2 WMS y 1 tabla vacía omitidos. `tiles:check` valida las 41 versiones. Tiles servidos con PostgreSQL detenido (Nginx 200) y 6.502 req/s con 50 conexiones.
- **08-C cerrado (2026-11-13):** 40 capas no-punto usan tiles: `borde_costero`, `hidrografia`, `humedales`, `cuencas_dga`, los 3 decretos de escasez, `zonas_climaticas`, los 2 planes reguladores costeros, `unidades_geomorfologicas`, `capacidad_uso_suelo`, `energia_linea_transmision` y `energia_potencial_fotovoltaico`. La tabla subió a un límite de 5.000 propiedades; falta paginar/buscar (08-D), exportar desde PostGIS (08-E) y migrar la capa de puntos solo si cambia la decisión de M1.
- **08-B (2026-11-13):** `borde_costero` se pinta con `leaflet.vectorgrid` (3 tiles en z8, sin GeoJSON), popup desde `properties`, zoom por manifest, tabla de 382 features desde PostGIS, filtro `ZP`=11 (coincide con SQL), CSV de 382 filas y fallback GeoJSON. La tabla dejó de mostrar 450 (GeoJSON) y ahora usa `/api/layer-features`. Pendiente: capa de puntos con API y capa dinámica.
- **08-A.5 on-demand (2026-11-13):** `/api/layer-tiles` genera MVT por tile con `ST_AsMVT`, Nginx cachea (MISS/HIT), 204 para tiles vacíos y el cliente acepta `tiles.mode: "on-demand"`. Probado con `borde_costero` y revertido a static.
- **08-D parcial (2026-11-13):** `/api/layer-features` acepta `search`, `sort`, `order`, `filter` y devuelve `total`; `/api/layer-feature` devuelve una feature con geometría y la tabla la usa para zoom/highlight. La tabla sigue paginando en cliente (todas las capas actuales <5.000).
- **08-E cerrado (2026-11-13):** `/api/layer-export` transmite GeoJSON (382 features) y CSV (382 filas; 11 con filtro ZP) con columnas/alias desde PostGIS. El frontend usa el endpoint si la API existe y cae al archivo estático en Vercel. Lotes de 40/200 para no superar el `statement_timeout`.
- **08-0 cerrado (2026-11-13):** Lighthouse 0.85 accesibilidad / 0.83 buenas prácticas / 0.50 SEO; se agregaron `meta description` y `robots.txt`. El canvas y los clusters no son navegables por teclado (Sprint 28). ADRs 012/013/015 escritos.

**Sub-sprints**:
- [x] **0** — Spike: inventario, mediciones, cliente, carga y ADRs 012/013/015 ✅ (4h)
- [x] **A** — Pipeline de tiles pregenerados, manifest/versionado, Nginx y esqueleto on-demand con caché ✅ (10h)
- [~] **B** — Piloto: `borde_costero` con tiles/popup/zoom/tabla/filtros/CSV ✅, puntos con API ✅ y esqueleto on-demand probado ✅; falta una capa dinámica real (6h)
- [~] **D** — Estilos, popups, leyenda y tabla ✅; `/api/layer-features` con búsqueda, orden, filtro y total, y `/api/layer-feature` para zoom al feature; paginación visual server-side pendiente (6h)
- [x] **F** — Zoom a capa/feature ✅ (08-D); cluster/heatmap cliente ✅; máximo 2.946 puntos <5.000, no se requieren agregados server-side (8h)
- [x] **C** — Migración por dimensión: 40/40 capas visibles no-punto con `source`; `comunas_poligonos` no está en la config; puntos quedan GeoJSON/API (16-24h)
- [x] **E** — Exportación/descarga en streaming desde PostGIS: GeoJSON/CSV con filtro, alias y lotes (4h)
- [~] **G** — Ciclo de vida de capas nuevas: sync, índice, verificación y retención (4h)

### Sprint 09 — Rasters y capas meteorológicas dinámicas

**Estado**: 🔶 parcial (Copernicus cubre indicadores satelitales; NASA y lectura raster pendientes; 09-C por implementar) · **Prioridad**: media-alta.

**Contexto (2026-11-09)**: el spike 09-A quedó semi-resuelto. Copernicus WMS ya cubre los indicadores satelitales (NDVI, EVI, SAVI, etc.). Queda:
1. Agregar data NASA vía WMS de mayor resolución (30 m/píxel).
2. Implementar lectura de archivos raster (IMG, TIFF/COG) para indicadores satelitales y variables derivadas de GIS (pendiente, orientación/aspecto, exposición solar, etc.).
3. Redefinir 09-C como implementación de capas meteorológicas dinámicas (viento, nubes, lluvia) con `leaflet-velocity` o similar.

#### 09-A: Spike/ADR de rasters (semi-resuelto)

**Estado**: 🔶 semi-resuelto · **Duración restante**: 4-6h · **Dependencias**: ninguna.

**Ya resuelto**:
- Copernicus WMS cubre los indicadores satelitales del visor (NDVI, EVI, EVI2, GNDVI, SAVI, MSAVI2, VARI, MCARI, PSRI, NDYI, ARI_1, NDWI, NDCI, MSI, MDMI, WIW, SWIR).

**Pendiente de decisión**:
- **NASA WMS 30 m/píxel**: evaluar cobertura, licencia, formato, zoom máximo y disponibilidad; definir las capas prioritarias.
- **Lectura de archivos raster** (IMG, TIFF/COG): evaluar `geotiff.js`, `gdal3.js`/WASM o preprocesamiento; límites de tamaño/memoria en el navegador.
- **Variables derivadas GIS** (pendiente, orientación/aspecto, exposición solar): decidir si se calculan en cliente (WASM), se preprocesan como COG/PNG o se consultan por WMS.
- **Sin VPS/BD**: descartar PostGIS Raster y GEE para esta fase; priorizar WMS y archivos estáticos.

**Salida**: ADR con la decisión + lista de 3-5 rasters/variables prioritarias y caso de uso (visualización, análisis o cruce con vectoriales).

**Criterios de aceptación**:
- ADR aceptado.
- Lista de 3-5 rasters/variables priorizadas.
- Caso de uso definido y costo estimado de 09-B.

#### 09-B: Implementación de rasters (12-20h)

**Estado**: ⏳ pending (bloqueado por 09-A) · **Dependencias**: 09-A.

**Objetivo**: implementar la decisión de 09-A: NASA WMS, lectura de raster y variables derivadas.

**Tareas**:
- Integrar las capas NASA WMS de 30 m.
- Implementar la lectura de IMG/TIFF/COG (cliente o preprocesado) y su visualización en Leaflet.
- Calcular/mostrar variables derivadas (pendiente, orientación/aspecto, exposición solar) cuando aplique.
- Tool del chat `get_raster_value(lat, lon, raster_id)` vía WMS `GetFeatureInfo` o metadatos del raster; **sin nuevas tablas**.
- Documentar el formato de archivo y el flujo de carga.

**Criterios de aceptación**:
- 2-3 rasters visibles en el visor.
- Un TIFF/COG de prueba se lee y se muestra.
- Una variable derivada (ej. pendiente) se calcula y visualiza.
- El chat puede consultar un valor puntual.
- Sin regresiones y sin nuevas tablas.

#### 09-C: Capas meteorológicas dinámicas tipo Windy (10-18h)

**Estado**: ⏳ pending · **Prioridad**: media-alta · **Dependencias**: ninguna (requiere spec `09-C`).

**Objetivo**: consumir datos de satélites meteorológicos y mostrarlos como capas dinámicas de viento, nubes y lluvia, con animación tipo Windy.

**Alcance**:
- **Fuente de datos**: evaluar NOAA/NASA/EUMETSAT, GFS/Open-Meteo, RainViewer u otra API; definir licencia, formato y frecuencia en la spec/ADR.
- **Viento**: `leaflet-velocity` (partículas animadas de velocidad/dirección) o plugin similar.
- **Nubes y lluvia**: tiles/radar o capas canvas con opacidad, leyenda y control temporal.
- **UI**: selector de variable, leyenda, play/pause, time slider y opacidad.
- **Sin nuevas tablas**: datos en vivo o caché en memoria; no se persisten en la BD.
- **Sin VPS**: APIs/tiles externos y, si hace falta, una Function de Vercel para normalizar datos.

**Criterios de aceptación**:
- Viento animado con `leaflet-velocity`.
- Nubes y lluvia conmutables, con opacidad y control de tiempo.
- Sin regresiones y sin nuevas tablas.
- Documentar la fuente, licencia y límites de uso.

**Requiere**: `docs/specs/09-C-capas-meteorologicas.md` antes de código.

#### 09-D: Optimización y variables adicionales (4-8h)

**Estado**: ⏳ pending (depende de 09-C) · **Dependencias**: 09-C.

**Objetivo**: pulir rendimiento, caché y agregar variables (temperatura, humedad) si la fuente lo permite.

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

**Estado**: 🔶 parcial (código, migración y tests listos; falta aplicar la migración en el VPS y validar con PDFs reales) · **Prioridad**: media · **Duración**: 8-12h · **Dependencias**: ninguna para la CLI; 15 solo para visualizar estado en el panel

**Objetivo**: índice vectorial versionado y trazable de PDFs públicos, listo para la recuperación del Sprint 18.

**Decisión de arquitectura**: con la migración a PostgreSQL propio se abandona el patrón RPC `begin/append/finalize` + wrappers `public.rag_*`. La CLI usa `pg` y escribe en una única transacción local. Los embeddings se calculan antes del `BEGIN`. Ver ADR 022 y `docs/specs/17-ingesta-rag.md`.

**Entregables**:
- `db/migrations/036_rag_schema.sql` — schema `rag`, pgvector, `tsv`, RLS, roles `rag_writer`/`chat_ro`.
- `db/roles/rag_roles.example.sql` — usuarios de login (fuera de migración).
- `server/rag/` — `config`, `errors`, `extract`, `normalize`, `chunker`, `pipeline`.
- `server/embeddings/` — driver OpenAI-compatible con batching, timeout y backoff.
- `scripts/ingest_docs.mjs` — manifiesto, `--dry-run`, `--force`, `--only`.
- `rag/manifest.json` + `rag/inbox/` (PDFs fuera de git).
- Tests `node:test`; integración CA-1..CA-4 con `RAG_TEST_DATABASE_URL`.

**Sub-sprints**:

| Tramo | Contenido | Estado |
|---|---|---|
| 17-0 | ADR 022, número de migración 036, `rag/**` en `.gitignore` y `excludeFiles` | ✅ |
| 17-A | Migración 036 (DDL, RLS, roles, grants) | ✅ (pendiente aplicar) |
| 17-B | Extracción, normalización y chunker + tests | ✅ |
| 17-C | Driver de embeddings + tests | ✅ |
| 17-D | CLI de ingesta, manifiesto, dry-run, ingestion_runs | ✅ |
| 17-E | 3 PDFs reales + reporte CA-12 + validación de chunks | ⏳ |

**Pendiente bloqueante de 17-E**: elegir 3-5 documentos públicos con licencia verificada (BCN/DGA) y completar `rag/manifest.json`.

**Nota de ajuste**: `pgvector` en la imagen de Postgres (tramo 26-C). Guardar versión del modelo de embeddings. Marcar documentos como fuente no confiable (inyección indirecta). Registrar procedencia de cada fragmento. Verificar derechos de autor.

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

**Estado**: 🔶 parcial (A-E cerrados; F y ajustes pendientes) · **Prioridad**: alta · **Duración**: 3-4h · **Dependencias**: ninguna

**Objetivo**: Dejar todos los documentos coherentes entre sí y con el código actual.

**Sub-sprints**:
- [X] **A** — Reemplazar `AGENTS.md`; mantener el conteo de tools sincronizado (hoy 13) (45 min)
- [X] **B** — Actualizar `ARCHITECTURE.md`: proveedor LLM, tools por archivo, timeout 6 s, nueva tool `get_layer_features` (45 min)
- [X] **C** — Actualizar `CONTRACT.md §6.2` y `§9.1` (30 min)
- [X] **D** — Actualizar `DEV_GUIDE.md §8` (30 min)
- [X] **E** — Actualizar `README.md` si tiene desalineaciones de conteos (30 min)
- [ ] **F** — Verificar coherencia entre todos los documentos (30 min)

**Ajustes adicionales (agregados 2026-10-05)**:
- [ ] Reparar ADR 004 (texto pegado, reemplazar por ADR 008).
- [ ] Documentar hueco de migración 009.
- [X] Eliminar entrada duplicada del Sprint 22.
- [ ] CONTRACT §5.3 con excepción explícita para `/api/chat`.

### Sprint 23 — Hotfixes críticos del chat y la API

**Estado**: ✅ done (2026-10-23) · **Prioridad**: **crítica** · **Duración**: 14-15h · **Dependencias**: ninguna
**Recomendación**: ejecutar antes de cerrar el Sprint 06. **23-A es parte del correcto funcionamiento del Sprint 06**.

**Objetivo**: eliminar los defectos que hoy afectan seguridad, costo y corrección del chat, sin cambiar de plataforma.

**Sub-sprints**:
- [X] **A (3h) — H1.** El geojson sale del contexto del LLM.
  - En el orquestador, tras `runTool`, separar el resultado: si es una FeatureCollection, guardarla en un almacén local de la invocación y reemplazar el contenido del mensaje `tool` por un resumen (`total`, `shown`, `truncated` y hasta 20 filas de `properties` sin geometría).
  - `buildGeojsonFromHistory` pasa a leer ese almacén, no los mensajes.
  - Decidir y documentar: la tool vigente es `get_layer_features`; actualizar la spec 06 (reemplaza `include_geometry`) y documentarla en el `SYSTEM_PROMPT`.
  - Tests: CA-9 y CA-10 de la spec 06.
- [X] **B (2h) — H3, H7.** Errores y acoplamiento.
  - `/api/chat` devuelve mensaje genérico + `errorId`; el detalle va solo a logs.
  - Crear `server/utils/logger.js`; `domain-classifier.js` deja de importar de `js/`.
  - Regla ESLint `no-restricted-imports` que impida que `server/` importe `js/`.
- [X] **C (3h) — H2.** Contexto de la petición configurable.
  - Módulo `server/chat/request-context.js` con `GEO_PROVIDER` (`vercel` | `cloudflare` | `none`) y `TRUST_PROXY_HOPS`.
  - La IP se toma contando desde la derecha de `x-forwarded-for`, no el primer valor.
  - Sin header de país: aplicar el límite normal (corregir el bug de `isLatam(undefined)`).
  - Tests actualizados de `geo-filter`.
- [X] **D (2h) — H3, H10.** Superficie de entrada.
  - `ALLOWED_ORIGINS` para CORS.
  - `history`: máximo 6 turnos, delimitado en el prompt como contenido no confiable, solo roles `user`/`assistant`.
- [X] **E (2h) — H4.** Topes de costo.
  - `LLM_DAILY_REQUEST_CAP` y `CHAT_ENABLED` (killswitch).
  - Respuesta 503 amable sin llamar al LLM. Contador en memoria detrás de una interfaz (migrable a BD).
- [X] **F (1.5h) — H11, H12.** Prompt y tests.
  - Prompt: reglas numeradas sin duplicados; el inventario de tools lo aportan los schemas.
  - `npm test` con el glob entre comillas; confirmar que los tests de `__tests__/` se ejecutan; `engines.node >= 20`.
- [X] **G (1h) — L7.** Verificar `chat_aggregate`. Si falla, `011_fix_chat_aggregate.sql` (nueva migración; no se edita la 001).

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

**Estado**: ✅ done · **Prioridad**: alta · **Duración**: 16h · **Dependencias**: 23

> **Actualizado 2026-11-09.** 25-A/B/C/D/E implementados. 25-F cerrado con el ADR 023: fase 1 (SSE de estado) aceptada; fase 2 (tokens) diferida por concurrencia.

**Objetivo**: medir y reducir la latencia, y poder cambiar prompts o modelos sin degradar respuestas sin enterarse.

**Sub-sprints**:
- [X] **A (4h) — G7.** Conjunto de evaluación. **Implementado:** `golden.json` con 38 casos y runner `npm run eval:chat`.
- [X] **B (2h) — H8.** Instrumentación por etapa. **Implementado:** `server/chat/timing.js`, flag `CHAT_TIMING_ENABLED`, logs `chat.timing` y baseline de 20 preguntas en `docs/chat-latency-baseline.md`.
- [X] **C (3h) — H8, H9.** Clasificador. **Cubierto por 40-C.2.**
  - Ejecutar en paralelo con L1 y abortar L1 si responde `OUT`.
  - Omitirlo cuando hay historial reciente o términos del dominio; pasarle el último turno como contexto.
  - Tests de preguntas de seguimiento.
- [X] **D (2h) — L1.** Dividir `orchestrator.js` en módulos. **Implementado:** `orchestrator.js` en 257 líneas.
- [X] **E (3h) — G6.** Proveedor de respaldo. **Implementado:** `server/llm/provider.js` reintenta con `LLM_FALLBACK_*`.
- [X] **F (2h) — Spike.** Streaming (SSE). **Implementado:** ADR 023; fase 1 de eventos de estado aceptada, fase 2 de tokens diferida.

**Criterios de aceptación**:
- **CA-1** ✅ Golden set de 38 casos y runner funcionando.
- **CA-2** ✅ Router/clasificador (40-C.2) y tests de seguimiento.
- **CA-3** ✅ Fallback implementado en `server/llm/provider.js`.
- **CA-4** ✅ Baseline: p50 3.553 ms / p95 15.234 ms (n=20, producción).

### Sprint 26 — Plataforma propia (épica)

**Estado**: 🔶 parcial (26-E v1 ✅; 26-K diferido al panel admin; 26-F después) · **Prioridad:** alta · **Duración**: 42-46h · **Dependencias**: 23, 24
**Spec**: `docs/specs/26-plataforma/00-spec-madre.md` (APROBADA 2026-11-10) y una spec por tramo.

**Decisión 2026-11-10 (ADR 005)**: VPS propio para producción; Vercel + Supabase quedan como demo/staging. Supabase está en el límite de almacenamiento (~913 MB) y Vercel Hobby no es comercial ni suficiente. No se agrega infraestructura específica de Vercel que no sea portable.

**Disparador de migración:** comenzar por la imagen Docker de PostgreSQL (PostGIS + pgvector) y el Compose local (26-C/26-D). Desde ese commit se congela Vercel/Supabase y todo el desarrollo se hace para el entorno Docker/VPS. La misma imagen se replica en el servidor.

**Objetivo**: ejecutar el sistema completo en infraestructura propia (Postgres con PostGIS y pgvector, API Node persistente, proxy con TLS), idéntico en staging y producción, sin depender de Vercel ni Supabase.

**Invariantes**:
- **INV-1** El stack actual (Vercel + Supabase) sigue operativo hasta el corte.
- **INV-2** El contrato de `/api/chat` no cambia.
- **INV-3** No hay secretos en el frontend; la BD no queda expuesta a internet.
- **INV-4** Todos los tests existentes siguen pasando.

**Tramos**:

| Tramo | Contenido | Horas |
|---|---|---|
| 26-A | **Servidor Node y paridad de endpoints.** Extraer handlers de estaciones/ARClim; `server/index.js` (node:http) y `server/http/` con router, body limit, CORS, errores y cierre ordenado; rutas de los 10 endpoints y `/healthz`; budget configurable | 6 |
| 26-B | **Driver Postgres y roles de mínimo privilegio (H17, G3).** `server/db/drivers/postgres.js` con `pg.Pool`, `statement_timeout`, registro de firmas de RPC con tipos (`jsonb`, `text[]`), llamada con parámetros nombrados y lista cerrada de funciones; roles `woll_api`/`woll_ingest`; tests de integración contra Postgres en contenedor | 5 |
| 26-C | **Imagen Postgres y migraciones portables (G2).** `000_compat_roles.sql` idempotente (roles `service_role`/`anon`/`authenticated` sin login, PostGIS en `public`, `pgvector`/`unaccent` en `extensions`); runner `scripts/migrate.mjs` con tabla de control y checksum; imagen PostgreSQL 17 + PostGIS + pgvector; probar 000-040 sobre BD vacía dos veces | 5 |
| 26-D | **Compose, Nginx y proxy.** Servicios `postgres`, `api`, `nginx`, `ingest`; TLS, compresión, caché de estáticos/GeoJSON y de `/api/proxy`, `limit_req` sobre `/api/chat`; red interna, Postgres sin puerto publicado; healthchecks; `.dockerignore`; `.env.example` actualizado | 6 |
| 26-E | **Datos v1.** Dump desde Supabase y restauración; `scripts/load-layer` (shp/GeoJSON → PostGIS con SRID, índice GIST, alta en catálogo y refresh de stats); `comunas_poligonos`; `build_catalog` contra la nueva BD; verificación de conteos por capa | 5 |
| 26-K | **Completitud local y dump v2 (parcial).** Stack local completo y auditoría ✅; capas faltantes, RAG/ingesta de prueba y dump v2 se harán cuando exista el panel admin (Sprints 15/16) | 8-10 (3 hechos) |
| 26-J | **Ingestas programadas.** Reemplazar los 4 workflows de GitHub Actions por systemd timers sobre `docker compose run --rm ingest`; `flock`, logs y verificación de no duplicar datos | 3 |
| 26-F | **Staging idéntico a producción (G1).** Segundo entorno con el mismo compose, datos de prueba y variables propias | 3 |
| 26-G | **Backups y restauración (G4).** `pg_dump` diario comprimido y cifrado, retención, copia fuera del servidor, alerta si falla, simulacro de restauración con RPO/RTO medidos | 4 |
| 26-H | **Endurecimiento (G14), monitoreo y ajuste de Postgres.** SSH solo con llave, sin root, firewall, fail2ban, actualizaciones de seguridad automáticas, permisos de `.env`, rotación de logs de Docker; `shared_buffers`, `work_mem`, `random_page_cost`; prueba de carga 20/50; healthcheck externo y rotación de secretos | 4 |
| 26-I | **Corte.** Plan de corte, TTL de DNS, pruebas de humo posteriores, y retorno al stack anterior si falla | 3 |

**26-C cerrado (2026-11-10):** imagen PostgreSQL 16 + PostGIS 3.7.0 + pgvector 0.8.7 (actualizada a PostgreSQL 17 el 2026-11-11 para igualar Supabase), Compose base, `000_compat_roles.sql`, runner `scripts/migrate.mjs` y `scripts/bootstrap-roles.sh`. 34 migraciones aplicadas dos veces; roles y extensiones verificados. Validado con Podman 5.8 + `podman-compose`; Docker Compose no estaba disponible en el entorno. Tests: 258.

**26-B cerrado (2026-11-10):** driver `pg.Pool`, registro cerrado de 48 RPCs, `check:rpcs` y 10 tests de integración contra PostgreSQL. `check:rpcs` detectó 12 RPCs heredadas que llegaron con el dump de 26-E. Tests: 277.

**26-A cerrado (2026-11-11):** servidor Node persistente, router HTTP, CORS, body limit, `/healthz`/`/readyz`, cierre ordenado y paridad de los 10 endpoints. Handlers de estaciones/ARClim compartidos con Vercel. Smoke real con PostgreSQL y SIGTERM. Tests: 310.

**26-D cerrado (2026-11-11):** imagen API, Compose dev/prod, Nginx con TLS, estáticos, caché de `/api/proxy`, `limit_req` y denegación de rutas internas. Validado con Podman: stack healthy, caché servida con API detenida, 40 requests a chat → 400/429 y `nginx -t` con TLS autofirmado.

**26-E v1 restaurado (2026-11-11):** dump real de Supabase en PostgreSQL 17.11 (90 tablas, 71 capas, 1.425.842 valores), baseline 000-035, migraciones 036-040, `check:rpcs` 48/48 y `db:verify` local OK. **No es el cierre definitivo:** 26-K completa capas faltantes, RAG/ingesta, auditoría de schema y dump v2; 26-F queda bloqueado por 26-K.

**26-K parcial (2026-11-11, revisado 2026-11-13):** stack local (PostgreSQL 17.11 + API + Nginx) con el dump v1 restaurado. Auditoría: 71 tablas en public, 69 tablas con geometría, 37 geometrías inválidas, 1.4M valores de ingest, RAG vacío y 2 GeoJSON huérfanos (`estaciones_metereologicas_atacama`, `macrozonificacion_borde_costero`). PostGIS está en `public`; se mantiene hasta decidir con la auditoría.

**Decisión 2026-11-13:** las capas faltantes, la ingesta RAG y el dump v2 **no bloquean el Sprint 08**. Se harán contra el panel admin (Sprints 15/16) para probar el alta de capas geográficas y la ingesta como flujo real. 26-K queda parcial y 26-F sigue esperando el panel.

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

### Sprint 37 — Auditoría y normalización de datos

**Estado**: ⏳ pending (diferido) · **Prioridad**: media · **Duración**: 22-26h · **Dependencias**: 23
**Requiere**: acceso al cliente para validación (37-E).
**Nota**: diferido por decisión del equipo (2026-11-09); se retomará cuando haya espacio/backups y ventana de mantenimiento.

**Objetivo**: dejar las tablas del catálogo con esquema documentado y columnas
normalizadas (numéricos como `numeric`, fechas como `date`, categorías con dominios
cerrados). **No se hace todo de una**: se auditan las 71 tablas, pero se normalizan
por fases, empezando por las que el chat y la Pieza 2 usan.

**Hallazgos confirmados (2026-10-05):**

| Tabla / Columna | Estado real | Acción |
|---|---|---|
| `derechos_agua_2025.Caudal Anual Promedio` | 914/920 (99.3%) coma decimal o entero; 6 con comillas literales | Parser `parse_caudal_cl()` con `TRIM(BOTH '" ')` |
| `derechos_agua_2025.Naturaleza del Agua` | 4 valores: Subterranea (709), Superficial (110), Superficial y Corriente (99), Superficial y Detenida (2) | Normalizar a 2 categorías + conservar subcategoría |
| `derechos_agua_2025.Uso del Agua` | **59% (545/920) "Sin informacion"** | Documentar + regla de cobertura en el prompt |
| `derechos_agua_2025.Tipo Derecho` | Consuntivo (901) / No Consuntivo (19) | Normalizar trivial |
| `catastro_especies_frutales.sup_frutal` | 2956/2956 numéricos | Castear directo |
| `catastro_variedades_frutales.superf_fru` | (verificar en 37-A) | Probablemente casteo directo |
| `decrero_escasez_2021/2022/2023` | Existen, typo en el nombre | Vistas `decreto_escasez_YYYY` |
| `comunas_poligonos` | Columnas correctas, `SHAPE_Area` numérico | Sin acción |
| `chat_catalog.attributes` | Guardado como string JSON | Fix con `(p_attributes #>> '{}')::jsonb` |

**Sub-sprints**:
- [ ] **A (4h) — Inventario y diagnóstico.** Script `scripts/audit-tables.mjs`.
- [ ] **B (2h) — Clasificación.** Categorías A-G en `docs/DATA_AUDIT.md`.
- [ ] **B.1 (1h) — Inspección de valores raros de caudal.** Confirmar que son solo comillas literales.
- [ ] **C (2h) — Modelo de normalización.**
- [ ] **D (8-10h) — Migraciones de normalización.**
  - Función `public.parse_caudal_cl(text) RETURNS numeric`.
  - Tabla `derechos_normalizado`.
  - Tabla `frutales_normalizado`.
  - Vistas `decreto_escasez_YYYY`.
  - Registro en catálogo.
- [ ] **E (2h) — Verificación con el cliente.**
- [ ] **E.1 (1h) — Documentar cobertura de uso.**
- [ ] **E.2 (30 min) — Vistas `decreto_escasez_YYYY`.**
- [ ] **F (2h) — Fix `chat_upsert_layer`.**

**Criterios de aceptación**:
- **CA-1** `docs/DATA_AUDIT.md` lista las 71 tablas con problemas clasificados.
- **CA-2** ≥ 99% de caudales parseados correctamente.
- **CA-3** Los `attributes` en `chat_catalog` son array jsonb.
- **CA-4** El cliente validó las interpretaciones.
- **CA-5** El chat sigue funcionando sin regresiones.

**Reversión**: cada migración es aditiva. Las tablas originales no se tocan.
---

## Sprint 39 — Capas del chat en el sidebar izquierdo

**Estado**: ⏳ pending · **Prioridad**: media · **Duración**: 4-6h
**Dependencias**: 06-B.7 (multi-capa del chat)

**Objetivo:** que las capas pintadas por el chat aparezcan en el
sidebar izquierdo (panel de capas del visor) como "capas
provisorias" o "resultados del chat", con controles de visibilidad
y eliminación.

**Diseño:**
- Nueva sección en el sidebar izquierdo: "Resultados del chat".
- Aparece solo cuando hay capas del chat activas.
- Cada item muestra: visibilidad (ojo), nombre, eliminar (papelera).
- Se sincroniza bidireccionalmente con la leyenda derecha.

**Beneficios:**
- Un solo punto de control para el usuario.
- Consistencia visual con las capas del visor.
- Extensible (futuro: ajustar opacidad, ordenar, ver propiedades).

**Reutiliza:**
- `appState.chat.resultsLayers` como fuente de verdad.
- Patrón visual de `layerItem.js`.
- Función `clearResultsByLayerId()` de `chatMapUtils.js`.

**Desafíos:**
- Persistencia vs sesión (son temporales).
- Interacción con el ciclo de vida de las capas del visor.
- Comportamiento mobile.
- Agregar/quitar dinámicamente sin romper la estructura del sidebar.

## Sprints planificados — Orquestación determinística del chat (40-43)

> **Origen**: evaluación de la estrategia de orquestación del chat (2026-10-16) y ADR 016-019.
> **Principio (ADR 016)**: el código decide qué se ejecuta y con qué datos; el LLM interpreta la intención y redacta desde la evidencia. Jerarquía de verdad: BD estructurada > API oficial > RAG > conocimiento del LLM.

### Sprint 40 — Orquestación determinística (épica)

**Estado**: 🔶 parcial (40-C cerrado y activo en producción, 40-C.4 diferido al 41, 40-D pendiente) · **Prioridad**: alta · **Duración**: 26-31h · **Dependencias**: 25-A, 25-D

| Tramo | Estado | Commit | Notas |
|---|---|---|---|
| 40-D.1 Runner completo y línea base real | ✅ | d4bdb33 | |
| 40-A Filtros con operadores y coincidencia robusta | ✅ | b532a05 | |
| 40-B.1 Retrieval de capas | ✅ | 405c6bf | |
| 40-B.2 Resolución de entidades (opcional) | ❌ descartado | — | La evidencia empírica mostró que empeora el comportamiento del LLM |
| 40-B.3 Prompt reducido y reglas retiradas | ✅ | a1c9e45 | |
| Refactor 25-D (división de `orchestrator.js`) | ✅ | ad78b46 | 1100 → 234 líneas (-79%) |
| 40-C.0 `handleChat()` extraído | ✅ | f446242 | |
| 40-C.1 Registro de capacidades y pipelines | ✅ | 0f8f598 | 9 tools, 4 pipelines |
| 40-C.2 Clasificador unificado y router | ✅ | 2a9fcbb | |
| 40-C.3 Paquete de evidencia y cobertura | ✅ | 4fbd751 | |
| 40-C.4 Retiro de reglas 13, 19, 20 y parches | ⏳ pendiente (bloqueado por ADR 019) | — | Condición: paridad en el golden con `--repeat 3` en ambos modos. Hoy el router ON da 37/38 con 1 flaky; falta la corrida formal para desbloquearlo. |
| 40-C.5 Medición, docs y deploy | ✅ | ab85419 | Router activo en producción (staging web) |
| **40-D.2 Inventario de datos no disponibles** | ✅ | **a2db540** | Con refactor de config a BD (`admin.*`) |
| 40-D.3 Casos nuevos del golden y cierre | ⏳ pendiente | — | |

**Resultado de la medición** (`--repeat 3`):
- Router OFF (baseline): **27-28/28** (fluctúa por no determinismo del LLM y el pendiente de historial).
- Router ON (con los 5 fixes de `ab85419`): **27-28/28** (mismo comportamiento, sin regresiones).
- Los 2-3 fallos residuales son ruido del LLM, no del router.

**Estado en producción**: `CHAT_ROUTER_ENABLED=1` en Vercel (staging web). Validado con:
- Preguntas de listado, ubicación, distribución, filtro.
- Degradación elegante al orquestador cuando el clasificador devuelve `pipeline: null`.

**Pendientes inmediatos de 40-C**:
- Optimizar `count_near_layer` (timeout con `derechos_agua_2025` × `red_hidrografica`). No es bug del router.
- Bug del runner `--remote`: se reporta como warning, no failure (fix aplicado en `ab85419`).

**Ver**:
- `docs/DECISIONS/019-router-deterministico.md` (ADR 019).
- `docs/specs/40-C.md` (spec del núcleo determinístico).
- `scripts/run-golden-set.mjs` (runner con verificación de tools y filtros).

### Sprint 41 — Recetas de análisis (épica)

**Estado**: ⏳ pending · **Prioridad**: media · **Duración**: 14-20h + validación experta · **Dependencias**: 40-C

**Objetivo**: análisis multicriterio (aptitud para jojoba, etc.) como dato versionado que el código ejecuta con operaciones fijas (ADR 017).

**Tramos**:
- 41-A: ejecutor y vocabulario cerrado.
- 41-B: validador de registro y fichas.
- 41-C: primera receta (jojoba).
- 41-D: validación experta.

**Además**: en 41 se retiran las reglas 13, 19, 20 del prompt y los parches `shouldFetchFeatures`, `maybeFetchFeaturesForStyle`, `detectStyleHint` (diferidos de 40-C.4).

### Sprint 42 — Ingesta de fuentes externas (DGAC, ArClim)

**Estado**: 🔄 parcial · **Prioridad**: media · **Duración**: 18-28h · **Dependencias**: 24-A, 24-B

**Objetivo**: ingestar fuentes externas por temática (ADR 018).

**Tramos**:
- [X] **42-A: Inventario y verificación de fuentes.** API de ARClim validada. Se identificaron las 5 variables climáticas clave y los 3 escenarios.
- [ ] **42-B: Infraestructura de ingesta.** (Pendiente: refactorizar el endpoint para cachear respuestas de ARClim).
- [X] **42-C: Primera ingesta (ArClim).** 
  - Endpoint proxy `api/arclim-geojson.js` creado con filtro para Atacama.
  - 21 capas ARClim integradas en `clima.js` con UI de doble selector (Escenario + Temporada).
  - Gráficos comparativos Chart.js integrados en el panel de información.
- [X] **42-D: Ingesta DGAC (Pozos).** Script `ingest-dga-control-nivel.mjs` creado y ejecutado para niveles estáticos.

### Sprint 43 — Normativa urbana: BCN + planes reguladores

**Estado**: ⏳ pending · **Prioridad**: media · **Duración**: 20-32h · **Dependencias**: 17, 18, 41-A, 42-A

**Objetivo**: responder "¿qué norma aplica en esta zona?" uniendo textos (LGUC, OGUC, ordenanzas) con la zonificación de cada comuna (ADR 018).

**Tramos**:
- 43-A: ingesta BCN al RAG.
- 43-B: ingesta de textos de PRC.
- 43-C: zonificación de PRC en PostGIS.
- 43-D: receta `normativa_predio`.

### Decisiones abiertas de los Sprints 40-43

1. Valor vigente de `ORCHESTRATOR_MAX_ITERATIONS` en Vercel (el código usa 3 por defecto; la documentación dice 1).
2. Ante slots faltantes: repreguntar o asumir un default y declararlo (24-B).
3. Quién escribe y valida las recetas (antes de 41-C).
4. Modalidad de acceso y términos de uso de DGAC, ArClim y BCN (42-A).
5. Qué PRC se priorizan (antes de 43-B y 43-C).
6. Fluid Compute y límite real de duración en Vercel.

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
| 005 | Plataforma y hosting: VPS propio para producción; Vercel + Supabase solo demo (Aceptada 2026-11-10) | 24-C |
| 006 | Postgres propio: instancia única, schemas, extensiones y roles de mínimo privilegio (Aceptada 2026-11-10) | 26-C |
| 007 | Autenticación de administradores | 24-C |
| 008 | Entrega por artefactos versionados (reemplaza al 004) | 27-B |
| 009 | Contrato de `charts` plural (pendiente desde antes) | Deuda técnica |
| 010 | Borde y entrega estática: Nginx + TLS + caché + `limit_req` (Aceptada 2026-11-11) | 26-D |
| 011 | Ingestas programadas: systemd timers sobre `docker compose run` | 26-J |
| 010 | Capa base con licencia | 28-C |
| 011 | Proveedor LLM, respaldo y privacidad | 25-E, 32-C |
| 012-015 | Los previstos en la spec 08 (renumerados) | Ajuste al 08 |
| 023 | Streaming SSE del chat (fase 1); fase 2 diferida | 25-F |

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

## Sprints completados fuera de plan

### Sprint 44 — Catálogo de indicadores satelitales Copernicus

**Estado**: ✅ done · **Prioridad**: media · **Duración**: 8–10 h · **Dependencias**: proxy de servicios externos (2026-11-06)

**Objetivo**: ampliar el catálogo satelital a 16 indicadores con ficha, leyenda y selector histórico.

**Entregado**:
- EVI, EVI2, GNDVI, SAVI, MSAVI2, VARI, MCARI, PSRI, NDYI y ARI_1 en Agricultura; MSI y MDMI en Clima; NDWI, NDCI y WIW en Agua; SWIR en Minería.
- `js/config/copernicusLayer.js` (ficha común) y factory `copernicus()` en `js/config/wms_services.js`.
- Selector de fecha con WFS por mes, caché, marcas azules y archivo desde 2017-01-01.
- `server/config/copernicus-layers.test.js`; lint 0 errores.
- Spec `docs/specs/44-indicadores-copernicus.md`.

**Pendiente**:
- Confirmar las bandas del evalscript de `SWIR` (B11 vs B08A).
- Comparador de dos fechas lado a lado (fuera de alcance).

**Ver**: `docs/specs/44-indicadores-copernicus.md`.

---

## Sesiones de trabajo

Bitácora cronológica descendente. Se actualiza al cierre de cada sesión.

### 2026-11-10
- ✅ **Fix de proximidad (migración 037)**.
  - EXPLAIN actual: `Seq Scan on hidrografia` + cast geography; muestra de 50 derechos: 9,5 s; extrapolación 920: ~175 s.
  - Opción A: índice funcional `((geom::geography))` + proyección `geog`; count 580 ms, aggregate 759 ms; índice usado.
  - Migración 037: índices en tablas objetivo, funciones reescritas y `statement_timeout=5s`.
  - `AbortSignal` en `server/db/context.js`, `supabase.js` y `withTimeout`; tests.
  - **037 aplicado en Supabase**; RPC directo: count 1.799 ms, aggregate 785 ms.
  - Caso remoto `core-proximidad-derechos-rio`: 19.743 ms → **11.211 ms**, 1/1 PASS.
  - Router de proximidad corregido (`layer_id_targets` array + prompt): **3.763 ms**, ruta `router`.
  - Caché de `chat_catalog` (5 min), rate limit IP+sessión (120/30 y 12/4) y semáforo LLM (4 por instancia, cola 20).
  - Concurrencia: 10/10 y 20/20 requests 200; p95 5,45 s y 10,03 s en ráfaga; sin 429/503.
  - Fast path de proximidad (`classifier-fast.js`): caso único 2,259 s; 20 concurrentes p95 5,58 s; 30 concurrentes p95 11,33 s.
  - 20 preguntas de orquestador concurrentes: 20/20 200, p95 8,90 s (semáforo/cola funcionando).
- ✅ **Decisión de infraestructura (ADR 005)**: el destino final es un **VPS propio**; Vercel + Supabase quedan como demo/staging. Supabase llegó a su límite (~913 MB) y Vercel Hobby no alcanza para producción. Las optimizaciones serverless son para la demo.
- 📝 Próximo: **Sprint 26 (VPS)** — ADR 005, spec madre, driver Postgres, servidor Node, proxy persistente y migración de datos. Las optimizaciones Vercel restantes quedan para la demo.

### 2026-11-09
- ✅ **Catálogo satelital Copernicus (Sprint 44)**.
  - 16 capas nuevas con ficha, leyenda y selector de fecha: 10 en Agricultura, 2 en Clima, 3 en Agua y 1 en Minería.
  - `js/config/copernicusLayer.js` centraliza fecha, nubosidad, bandas RGB y nota; `wms_services.js` usa el factory `copernicus()`.
  - Selector histórico: WFS por mes y meses vecinos, caché de 5 min, marcas azules, leyenda con el conteo y archivo desde 2017-01-01.
  - `TIME` se aplica a `GetMap` y `GetFeatureInfo`; el panel del píxel coincide con la imagen histórica.
  - Proxy local persistente (`scripts/dev-proxy.mjs`, `js/config/proxy.js`, `npm run dev`) para evitar una Function por tile.
  - Tests `server/config/copernicus-layers.test.js`; verificación en navegador de enero/febrero 2019.
  - Textos de NDVI, MSAVI2, VARI, MCARI, PSRI, NDYI, NDWI, NDCI, MSI y SWIR alineados a lenguaje no especialista.
  - Docs actualizadas: CHANGELOG, ROADMAP, ARCHITECTURE §3, DEV_GUIDE §3.8, README, AGENTS, `docs/integrations/proxy-servicios-externos.md` y spec 44.
- ✅ Push y deploy en Vercel verificados (proxy + 20 capas Copernicus).
- 🔄 **Roadmap reclassificado**:
  - 25-A/C/D/E cerrados; quedan 25-B y 25-F.
  - 09-A semi-resuelto: Copernicus cubre indicadores; quedan NASA WMS 30 m, lectura IMG/TIFF/COG y variables derivadas GIS.
  - 09-C redefinido como implementación de capas meteorológicas dinámicas (viento, nubes, lluvia) con `leaflet-velocity`.
  - 09-D pasa a optimización/variables adicionales; 37 (auditoría) diferido.
- ✅ **25-B — Instrumentación de latencia** cerrado. Baseline de 20 preguntas en `docs/chat-latency-baseline.md` (p50 3.553 ms, p95 15.234 ms en producción).
- ✅ **25-F — Spike SSE** cerrado con `docs/DECISIONS/023-streaming-sse.md`: fase 1 (eventos de estado) aceptada; tokens diferidos.
- 📝 Próximo: **40-D.3 + 22**; luego **comparador de fechas Copernicus**. Después 09-B/09-C.

### 2026-11-06
- ✅ **Sprint 17 — Ingesta RAG (código base)**.
  - Migración `036_rag_schema.sql` (schema `rag`, pgvector, `tsv`, RLS, roles `rag_writer`/`chat_ro`).
  - `server/rag/*` (extracción, normalización, chunker, pipeline atómico), `server/embeddings/*`, CLI `scripts/ingest_docs.mjs`.
  - Spec `docs/specs/17-ingesta-rag.md`, ADR 022, tests `node:test`.
  - Pendiente: aplicar la migración en el VPS y validar con 3 PDFs reales (17-E).
- ✅ **Proxy de servicios externos**.
  - `api/proxy.js` + `server/proxy/*`: Copernicus WMS/WFS/WMTS y NASA Worldview Snapshots con allowlist, inyección del `INSTANCE_ID` en servidor, validación, caché y rate limit.
  - Helpers `js/utils/externalServices.js`; tests de proxy, CORS e IP.
  - Capas en el sidebar: Agricultura (NDVI, AGRICULTURE, TRUE-COLOR-S2L2A) y Clima (MOISTURE-INDEX), grupo “Satélite (Copernicus)”.
  - Selector de fecha por capa: disponibilidad vía WFS, días resaltados y `TIME` aplicado al WMS.
  - Leyenda WMS en el panel y GetFeatureInfo al clic con valores del píxel, escena y nubosidad.
  - Panel de píxel con nombre del indicador, descripción, valor/color y metadatos; sin coordenadas ni I/J.
  - Fix del `TIME` de WFS (Date → YYYY-MM-DD) y de los iconos con espacios (renombrados a snake_case).
  - Proxy: timeout 25 s y limpieza de `info_format` en `GetMap`.
  - Sentinel WMS: `maxNativeZoom: 16`, `keepBuffer: 1`, `tileSize: 512`, `updateWhenIdle` y `updateWhenZooming: false` para reducir carga de tiles.
  - Selector de fecha: disponibilidad WFS solo al abrir el calendario, para no competir con los tiles.
  - Selector de fecha: destrucción de pickers y aborto de WFS al re-renderizar (posible fuga de memoria).
  - Verificado contra la instancia real `Woll-Atacama`: WMS PNG, GetFeatureInfo JSON, WFS GeoJSON y Worldview JPEG.
  - Doc `docs/integrations/proxy-servicios-externos.md`.
- 📝 Próximo: integrar las capas Copernicus en el sidebar y decidir si se agrega un NDVI-L2A de 1 banda para valores puntuales. (La integración se amplió el 2026-11-09; queda pendiente el NDVI-L2A de 1 banda para valores puntuales.)

### 2026-11-05
- ✅ **Sincronización de documentación (adelanto del Sprint 22)**.
  - `AGENTS.md`, `ARCHITECTURE.md` y `README.md` alineados con el código: 13 tools (9 de capas + 4 de clima), 71 GeoJSON, Node 20.6+.
  - `package.json` v2.1.0: scripts `catalog`, `smoke:db`, `smoke:chat`, `eval:chat` y `lint:fix` ahora existen.
  - `ROADMAP.md`: sprints 06 y 23 marcados como cerrados, 06-B.7 cerrado, índice reparado (sprints 34-36 agregados, fila del 42 corregida), anexos de instrucciones eliminados.
  - `README.md`: bloques de código y encabezados reparados.
  - `.gitignore`: reglas de `.env*` limpias, con excepción para `.env.example`.
- 📝 Próximo: **Sprint 15** (panel admin), **Sprint 26** (plataforma propia) o **40-D.3** (casos nuevos del golden set).

### 2026-11-04
- ✅ **Integración masiva de ARClim completada (Sprint 42)**.
  - Creación del endpoint dinámico `/api/arclim-geojson` (filtrando Atacama).
  - 21 capas coropléticas con selector de escenarios (Histórico, SSP2-4.5, SSP5-8.5) y temporadas (Anual, Verano, Invierno).
  - Panel lateral de ARClim con descripciones del IPCC y gráficos de barra comparativos (Chart.js) con opciones de expandir/descargar.
  - Refactor del sidebar (`dimensionBuilder.js`) para soportar jerarquías de 3 niveles (Grupo → Subgrupo → Capa).
  - Fix del Web Worker para capas `/api/` y corrección del filtro de comunas de Atacama.
- ✅ **Ingesta DGA (Pozos)** completada con `ingest-dga-control-nivel.mjs`. Se cargaron 5,491 registros históricos.
- 📝 Próximo: **Sprint 39** (Capas del chat en sidebar) o **Sprint 40-D.3** (Casos nuevos del golden set).

### 2026-10-23
- ✅ **Sprint 23 completado**: hotfixes críticos del chat y la API.
  - 23-A: geojson fuera del LLM (ya resuelto en 40-C.3).
  - 23-B (`eeb1e8c`): errores genéricos con errorId + logger desacoplado de `js/`.
  - 23-C (`23d482e`): IP real (TRUST_PROXY_HOPS), país (GEO_PROVIDER), CORS restringido (ALLOWED_ORIGINS), history máximo 6 turnos.
  - 23-D (`b4a662b`): history delimitado como contenido no confiable + REGLA 21 en el prompt.
  - 23-E (`82b0341`): cost guard (killswitch CHAT_ENABLED + tope diario LLM_DAILY_REQUEST_CAP).
  - 23-F (`07dfc95`): tests desactualizados corregidos. 134/134 tests pasan.
  - 23-G: `chat_aggregate` verificado, funciona correctamente.
  - `chore` (`b7c1e3c`): eliminado `021_admin_config.sql` (renombrado a 024).
- 📝 Próximo: **40-C.4** (retirar reglas 13, 19, 20 del prompt y parches, bloqueado por ADR 019), o **Sprint 15** (panel admin), o **Sprint 26** (plataforma propia).

### 2026-10-22
- ✅ **40-D.2 completado: configuración del chat en BD (`admin.*`)**.
  - Migración 021 aplicada en staging: 4 tablas (`admin.unavailable_data`,
    `admin.prompt_templates`, `admin.settings`, `admin.messages`) + 6 RPCs
    (`chat_unavailable_data`, `chat_get_prompt`, `chat_get_setting`,
    `chat_get_message`, `admin_set_setting`, `admin_set_prompt`).
  - Refactor de `prompts.js`, `domain-classifier.js`, `unavailable.js` y
    `router.js` para leer de la BD. Fallback al hardcodeado si la BD falla.
  - `scripts/migrate_prompts.mjs`: carga `chat.system` y `chat.classifier`
    en `admin.prompt_templates` (versionado, idempotente). Corrido en staging:
    `chat.system` v1 (7.475 chars), `chat.classifier` v1 (7.356 chars).
  - `server/chat/data/no-disponible.json` eliminado (migrado a BD).
  - Golden set: 25-26/28 (los fallos son flaky conocidos, no regresiones).
  - **Migración 021 en producción**: pendiente hasta que se migre todo al
    entorno real (SiteGround + Neon, o el que se decida). El código tiene
    fallback en todas partes, así que producción no se rompe.
- 📝 Próximo: **40-D.3** (casos nuevos del golden) o **Sprint 22** (alineación
  de documentación). Decidir según prioridad.
  - 📝 **40-C.4 desbloqueado condicionalmente**: se puede hacer cuando, con `--repeat 3` en ambos modos, el acierto por tier con el router ON sea ≥ al del ciclo actual. No está atado al Sprint 41.

### 2026-10-21
- ✅ **Sprint 40-C completado y activo en producción (staging web)**.
  - 40-C.0 a 40-C.3 implementados (commits f446242, 0f8f598, 2a9fcbb, 4fbd751).
  - 5 fixes del router determinístico (commit e935440 + ab85419).
  - Router activo: `CHAT_ROUTER_ENABLED=1` en Vercel.
  - Golden set con `--repeat 3`: router OFF 27-28/28, router ON 27-28/28 (paridad).
  - Los 5 fallos previos resueltos:
    - `smoke-count-humedales-por-comuna` (F3b + F4).
    - `smoke-count-derechos-por-provincia` (F3b + F4).
    - `core-color-humedales-clasificacion` (F3b).
    - `core-filter-derechos-consuntivos-copiapo` (F2 + F3b).
    - `ext-correccion-consuntivos` (F2 + F5b).
  - 3 archivos críticos que faltaban en el deploy (`proximidad_conteo` en `registry.js`, `thought_signature` en `vertex-openai.js`, `.env.example`) se commitearon en `ab85419`.
  - Runner `--remote` corregido: los checks de `trace` se reportan como warning, no failure (CA-4 de la spec 40-D).
  - **40-C.4 diferido al 41**: las reglas 13, 19, 20 del prompt y los parches se retiran con calma en 41.
  - **Pendiente**: optimizar `count_near_layer` (timeout con `derechos_agua_2025` × `red_hidrografica`).
- 📝 Próximo: **40-D.2** (inventario de datos no disponibles) con `CHAT_UNAVAILABLE_ENABLED`.


### 2026-10-12
- ✅ **Sprint 06 completado** (respuesta geoespacial).
  - 06-A a 06-D todos cerrados.
  - 06-B.6: pintar en listados.
  - 06-B.7: multi-capa con color por capa.
  - Fixes: clasificador, capas huérfanas, multi-fetch.
  - Deuda anotada: fallback LLM, historial, sidebar.
- 📝 Próximo: **Fallback de proveedor LLM** (2-3h).

### 2026-10-08
- ✅ **Sprint 06-B.2 completado.**
  - `geojson_meta` en el payload de `/api/chat`.
  - Tool `get_layer_features` devuelve `_layer_id`.
  - Fix en `api/chat.js` que descartaba el campo.
  - Prerequisito de 06-B.3 y 06-B.4.
- 📝 Próximo: **Sprint 06-B.4 — coropleta de puntos por comuna**.

### 2026-10-07
- ✅ **Sprint 06-C completado**: reglas del prompt para geojson.
  - Regla 13: el LLM no dice "he pintado en el mapa".
  - Regla 17: precisión en el conteo ("polígonos", no "glaciares").
  - Regla 18: contexto del historial (ignorar bloqueos previos).
  - Fix en chatUI.js: no guardar bloqueos en el historial.
  - Migración a Gemini 3.1 Flash-Lite (~6s vs ~82s con GLM).
- 📝 Pendiente del Sprint 06: 06-B (frontend pinta geojson) y 06-D.
- 📝 Próximo: 06-B (frontend del geojson en el mapa).

### 2026-10-06
- ✅ **Sprint 23-A completado** (backend del chat).
  - Bucle ReAct con salida única (`finish`). Sin returns internos.
  - `ctx.raw` como almacén por invocación para geojson.
  - Charts limitados (3 total, 2 por schema), filtro de relevancia.
  - Prompt: 22 → 13 reglas. Base: 1401 → 568 tokens.
  - Modelo: GLM-5.3-Flash → DeepSeek V4.1 Flash.
  - Case-sensitivity en columnas (regla 13).
  - Doble agrupación sin chart, con tabla markdown (regla 8).
  - Latencia: 82s → 9s. Reply: de "Sin respuesta." a análisis real.
- 📝 Pendiente del Sprint 23: 23-B a 23-G (hotfixes API).
- 📝 Próximo: Sprint 06-B (frontend del geojson en el mapa).

### 2026-10-05 (sesión 4)
- 📝 Diagnóstico del Sprint 37 cerrado:
  - `derechos_agua_2025`: 920 filas, caudal en coma decimal (99.3% parseable).
  - `Uso del Agua`: 59% "Sin informacion" → nueva regla de cobertura en el CONTRACT.
  - `Naturaleza del Agua`: 4 valores consistentes, normalizables.
  - `catastro_especies_frutales.sup_frutal`: casteo directo.
  - `decrero_escasez_*`: typo en el nombre, se crearán vistas con nombre correcto.
- Próximo: aplicar cambios al ROADMAP + CONTRACT, después arrancar Sprint 23-A.

### 2026-10-05 (sesión 3)
- 📝 Auditoría externa integrada. Cambio de enfoque en el chat: de 3 capas de LLM
  a bucle ReAct único + tablas de análisis precalculadas + playbooks.
- 📝 Nuevo Sprint 37 (auditoría y normalización de datos).
- 📝 Detectado bug estructural: el `while` del orquestador no itera (los `return`
  están dentro). Forma parte del Sprint 23-A.
- 📝 Detectado bug en `vercel.json`: doble clave `functions`.
- 📝 Detectado bug en el fix de 23-A: `payload.geojson` nunca matchea con la
  FeatureCollection directa de la RPC.
- Próximo: 5 queries de diagnóstico → Sprint 37 → Sprint 23 completo.

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

- [ ] **Migración a VPS (Sprint 26) — prioridad de producción.** Supabase está en el límite de almacenamiento (~913 MB) y Vercel Hobby no alcanza. Vercel + Supabase son demo/staging. No seguir optimizando límites de Hobby; escribir la spec 26 y ejecutar el corte (Node persistente + PostgreSQL/PostGIS/pgvector + Nginx + proxy persistente).

- [X] **H1 — `get_layer_features` envía hasta 1000 features al LLM.** Contradice la spec 06. Resuelto en Sprint 23-A.
- [X] **H2 — Geo-filter con `isLatam(undefined) = false`.** Aplica límite estricto sin header. Resuelto en Sprint 23-C.
- [X] **H3 — `err.message` crudo y CORS `*`.** Resuelto en Sprint 23-B y 23-D.
- [X] **H4 — Sin tope de costo ni abuso real.** Resuelto en Sprint 23-E (el límite distribuido queda para 26-D).
- [X] **H9 — Clasificador bloquea preguntas de seguimiento.** Resuelto en Sprint 25-C (router/clasificador).
- [X] **H11 — Prompt desalineado (8 vs 9 tools) y deriva spec 06 ↔ código.** Resuelto en Sprint 23-F (conteo actual: 13).
- [X] **H12 — `npm test` con glob sin comillas.** Verificar. Resuelto en Sprint 23-F.
- [ ] **L6 — Migración 009 ausente; ADR 004 con texto pegado.** Resuelto en Sprint 22.
- [X] **L7 — `chat_aggregate` (001) con `ORDER BY` sobre alias.** Verificar. Sprint 23-G.
- [ ] **L9 — CONTRACT §5.3 vs formato real del chat.** Resuelto en Sprint 22.
- [ ] **Timeout por tool (CA-12 spec 06).** Hoy `RPC_TIMEOUT_MS=6000` es global. Fix: parámetro `timeoutMs` en `withTimeout`. Sprint corto (1h). Urgencia: baja.
- [ ] **Limpieza de logs de diagnóstico en `orchestrator.js`.** Dejar 1-2 días, después remover.
- [X] **Fallback de proveedor LLM.**
      Implementado en `server/llm/provider.js` (25-E): reintenta con
      `LLM_FALLBACK_*` ante 503/502/504/timeout.

- [ ] **Contexto del historial (mezcla de temas).**
      El LLM mezcla la pregunta actual con turnos previos.
      Fix: reducir `history.slice(-3)` a `slice(-2)`.

- [ ] **Bug visual del sidebar izquierdo.**
      Al desactivar dimensiones cargadas por defecto, se contrae.
      Al reactivar "Territorio", queda en blanco.

- [ ] **Evitar duplicación del contrato en `api/chat.js`.**
      Ya nos mordió 3 veces (geojson_meta, geojson_layers, notice).

- [ ] **Vercel cache de estáticos.**

- [X] **Sprint 39: capas del chat en el sidebar izquierdo.**
- [X] **Optimizar `count_near_layer` (proximidad).** Resuelto en `037_proximity_geography.sql` y aplicado en Supabase: GIST funcional, funciones con `geog` y `statement_timeout=5s`. RPC: count 1.799 ms, aggregate 785 ms. Caso remoto: 19.743 ms → **11.211 ms**. El cuello restante es LLM/orquestación.

- [ ] **Panel admin para config del chat (Sprint 15).** La migración 024
      agregó 4 tablas (`admin.unavailable_data`, `admin.prompt_templates`,
      `admin.settings`, `admin.messages`) y 6 RPCs. Falta la UI en el panel
      admin (Sprint 15) para que el admin pueda editar prompts, settings,
      mensajes y datos no disponibles sin tocar SQL.

- [ ] **Confirmar las bandas del evalscript de `SWIR`.**
      La capa de la instancia declara `bands 12,11,4`; el texto de referencia
      del equipo menciona `B08A`. Hoy la ficha usa B11. Urgencia: baja.

- [X] **Excluir capas WMS de `chat_catalog`.**
      Resuelto: `scripts/build_catalog.mjs` salta las capas con
      `tipo/type === "wms"`, que no tienen tabla física en PostGIS.

- [ ] **Comparador de dos fechas para capas Copernicus.**
      Permite ver lado a lado una imagen histórica y la más reciente
      (split/swipe). Fuera del alcance del Sprint 44. Urgencia: media.

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


Detectados en el diagnóstico inicial (2026-10-05). Sprint 37 los resuelve.

| Tabla | Problema | Sprint |
|---|---|---|
| `derechos_agua_2025` | `Caudal Anual Promedio` y `Naturaleza del Agua` son `character varying` | 37-D |
| `catastro_especies_frutales` | `sup_frutal` y `ano_planta` son `character varying` | 37-D |
| `catastro_variedades_frutales` | `superf_fru` y `ano_plant` son `character varying` | 37-D |
| `catastro_especies_frutales` / `catastro_variedades_frutales` | Solapan información. Definir fuente canónica | 37-E |
| `chat_catalog.attributes` | Guardado como string JSON, no array jsonb | 37-F |

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