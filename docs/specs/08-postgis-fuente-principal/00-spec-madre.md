# Spec madre 08 — Migración a PostGIS (fuente principal)

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 08 |
| **Estado de la spec** | APROBADA, revisión 2026-11-13 (pipeline pregenerado implementado; 08-0/08-A/08-G en ejecución) |
| **Tamaño** | Grande (> 15h) |
| **Duración estimada** | 56-64h |
| **Dependencias** | Sprint 07 (`/api/config` + snapshot) y Sprint 26 (imagen Docker PostgreSQL/PostGIS, Node persistente, Compose) |
| **Última revisión** | 2026-11-13 |

> **Corrección 2026-11-10.** El sprint ya estaba registrado en el ROADMAP, pero la
> spec no hacía explícita la **paridad de opciones de capa** ni corregía el
> supuesto de que "cargar desde la BD es más liviano". No lo es por sí solo:
> servir `ST_AsGeoJSON` completo desde PostGIS puede pesar **más** que el
> GeoJSON estático. El ahorro real viene de **tiles, endpoints paginados,
> filtros en servidor y caché**. La sección 2 lo detalla.
>
> **Revisión 2026-11-12.** Con el inventario real se cambia el camino principal:
> **tiles MVT pregenerados y versionados servidos por Nginx** para capas
> estáticas o por edición (catastro 2024/2026, incendios anuales, derechos 2025).
> El MVT **on-demand** queda reservado para capas/valores dinámicos y filtros
> arbitrarios. Esto hace viable el VPS de 4 vCPU/8 GB y mantiene liviano al
> navegador. Los detalles están en las secciones 3, 9 y 10.

> Elaborada a partir de ROADMAP (Sprint 08), CONTRACT, ARCHITECTURE, AGENTS.md y
> CHANGELOG. Esta spec fija el marco; el detalle de cada tramo se escribe al
> empezarlo (`08-A-*.md`, `08-B-*.md`...).

---

## 1. Objetivo y contexto

PostGIS pasa a ser la fuente principal de las capas del visor, con el GeoJSON
estático como respaldo por capa. El navegador deja de descargar archivos
completos y recibe solo lo que necesita ver: tiles del viewport, páginas de la
tabla, agregados de cluster/heatmap y exportaciones bajo demanda.

El sprint se ejecuta **después del Sprint 26**: la imagen Docker de PostgreSQL
(PostGIS + pgvector), el servidor Node persistente y Nginx son la base. No se
implementa sobre Vercel ni Supabase, que quedan congelados como demo.

Además del cambio de fuente, este sprint debe garantizar que **todas las
opciones de capa del menú actual sigan disponibles**: tabla de atributos, zoom a
la capa, filtros, cluster, mapa de calor y descarga. Una capa PostGIS sin
paridad de opciones no se considera migrada.

## 2. Corrección: "la BD es más liviana" no es automático

| Modelo | Lo que descarga el cliente | Memoria del cliente | Costo del servidor |
|---|---|---|---|
| GeoJSON estático (hoy) | El archivo completo, comprimido por el borde | Parsea y retiene todas las features y atributos | Casi nulo: es un archivo en disco/CDN |
| `ST_AsGeoJSON` completo desde PostGIS | El mismo peso o más (sin gzip ni caché de archivo) | Igual que hoy | Alto: consulta, serialización, transferencia desde la BD |
| **MVT pregenerado + endpoints paginados** | Solo los tiles del viewport, una página de tabla o un agregado | Baja: no retiene el dataset completo | Casi nulo en runtime: Nginx sirve archivos; la generación es offline |
| MVT on-demand + caché | Solo los tiles pedidos | Baja | Alto en miss: `ST_AsMVT` y CPU de PostgreSQL |

**Conclusión:** el ahorro es para el **cliente y la red**; el servidor puede
quedar barato si los tiles se generan offline. Servir el GeoJSON completo desde
la base sería un retroceso: más latencia, más CPU y el mismo peso en el
navegador.

## 3. Alcance

**Dentro del alcance**

- Modelo de dos modos de tiles por capa:
  - **Estático/pregenerado:** MVT por zoom, generado offline desde PostGIS y
    servido por Nginx. Es el modo por defecto para capas estáticas o por
    edición.
  - **On-demand:** `ST_AsMVT` en el servidor Node, solo para capas/valores
    dinámicos o filtros arbitrarios; con caché y límites de concurrencia.
- Versionado de tiles por capa y edición:
  - `catastro_fruticola/2024`, `catastro_fruticola/2026`;
  - `incendios_forestales/2025`, `incendios_forestales/2026`;
  - `derechos_agua/2025`.
  - La versión anterior no se sobrescribe; la config apunta a la activa.
- Manifest por versión con bbox, zooms, checksum, fecha y conteo de features.
- Ciclo de vida de capas: alta/edición → tiles → índice → config → caché, sin
  sobrescribir versiones publicadas (08-G).
- Endpoints paginados para tabla, búsqueda, orden, conteo y filtros.
- Geometría de estaciones estática (tiles o GeoJSON) y **valores por API**
  (`/api/stations-map`, series y detalles); los valores no se congelan en tiles.
- Cluster/heatmap:
  - cliente para capas de puntos ≤ 5.000;
  - agregación server-side para > 5.000 o valores muy dinámicos;
  - TTL de caché para valores actuales.
- Descarga GeoJSON/CSV en streaming, con el mismo filtro y **todas** las
  features filtradas, no solo el viewport.
- Estilos, popups y leyenda equivalentes a los actuales.
- Migración de las ~71 capas, por dimensión y por edición.
- Pruebas de concurrencia (25 y 50 usuarios) y de disco/tiles.

**Fuera del alcance**

- Eliminar los archivos GeoJSON del repo (se evalúa en un sprint posterior).
- Imágenes raster (Sprint 09) y vista 3D (Sprint 10).
- Cambiar Leaflet por otra librería de mapas (Sprint 10).
- Panel admin y edición de capas (Sprints 15-16).
- Análisis por AOI (Sprint 11).
- Optimizaciones específicas de Vercel/Supabase: están congelados (ADR 005).
- Rediseñar la UI del menú de capas: se conserva la estructura y las acciones
  `data-action` existentes.

## 4. Paridad de opciones de capa (requisito central)

El menú de `js/sidebar/layerItem.js` expone hoy estas acciones:
`zoom-capa`, `ver-tabla`, `filter-data`, `toggle-cluster`, `toggle-heatmap` y
`descargar-capa`. Todas deben funcionar igual en capas con `source.type:
"postgis"`. En esas capas la opción no desaparece ni se degrada a "no
disponible"; las capas WMS conservan su comportamiento actual.

| Opción | Hoy (GeoJSON en memoria) | Con PostGIS | Verificación |
|---|---|---|---|
| **Zoom a la capa** | Calcula bbox con Turf sobre las features cargadas; exige capa activa | `GET /api/layers/:id/extent` con `ST_Extent` cacheado; fallback al bbox del manifest de tiles | CA-4 |
| **Zoom a un feature** | La tabla hace `fitBounds` con la geometría en memoria | `GET /api/layers/:id/features/:fid` devuelve la geometría del feature o su bbox | CA-4 |
| **Tabla de atributos** | `openAttributeTable()` usa todas las features/atributos cargados | `GET /api/layers/:id/features?limit=&offset=&search=&sort=&filter=`; conteo con `COUNT(*)`; búsqueda, orden y paginación en servidor | CA-3 |
| **Filtrar datos** | `openFilterModal()` arma `dataFilter`; `hiddenAttributes` oculta categorías de la leyenda y reconstruye la capa en cliente | El filtro viaja como especificación validada al servidor y se aplica en tabla, agregados y exportación; en tiles estáticos se aplica en cliente sobre las propiedades del tile; para filtros que cambian la geometría se usa on-demand | CA-5, CA-9 |
| **Cluster** | `markerCluster` con todos los puntos en memoria | Cliente si la capa tiene ≤ 5.000 puntos; `GET /api/layers/:id/clusters?bbox=&zoom=&filter=` para capas mayores o valores dinámicos | CA-6 |
| **Mapa de calor** | `WebGLHeatMap` con todos los puntos | Cliente si ≤ 5.000 puntos y valores estáticos; `GET /api/layers/:id/heatmap?bbox=&zoom=&filter=` para valores dinámicos o capas mayores | CA-7 |
| **Descargar capa** | `downloadUtils.js` genera GeoJSON/CSV desde memoria o desde el archivo | `GET /api/layers/:id/export?format=geojson\|csv&filter=` en streaming; dataset completo filtrado, no el viewport | CA-8 |
| **Estilos, popups y leyenda** | Config + atributos del feature | Mismos estilos/popups; los atributos llegan como `properties` del tile o de la página | CA-1 |

### 4.1. Cadencia de datos y modo de tiles

| Capa / dato | Cadencia | Modo |
|---|---|---|
| `borde_costero`, `macrozonificacion_borde_costero` | Casi nunca | Estático |
| `humedales`, `hidrografia`, `energia_*`, `prc_*` | Casi nunca | Estático |
| `comunas_poligonos` | Fijo | Estático |
| `catastro_especies_frutales`, `catastro_variedades_frutales` | Por edición (2024/2026) | Estático versionado |
| `incendios_forestales` | Anual | Estático versionado |
| `derechos_agua_2025` | Por edición | Estático versionado |
| `estaciones` (ubicaciones) | Fijo, salvo alta/baja | Estático |
| Valores meteorológicos de estaciones | Hora/día | API on-demand |
| `ingest.indicator_values` | Hora/día | API/agregados on-demand |
| Cluster/heatmap de valores actuales | Cambia con datos | On-demand con TTL |

**Umbral de puntos.** Para capas de puntos ≤ 5.000 se permite cargar todas las
features del viewport (o del layer si es pequeño) y usar
`markerCluster`/`WebGLHeatMap` en cliente. Sobre ese umbral, cluster y heatmap
son server-side. El umbral se documenta en `AGENTS.md`.

**Filtros consistentes.** Un mismo filtro debe producir el mismo conjunto en
mapa, tabla, agregados y descarga. Se define una especificación única
(`filter`) que combina `dataFilter` y `hiddenAttributes`, se guarda en
`appState` y se reutiliza; no se permiten filtros distintos por opción.

## 5. Invariantes

| # | Invariante | Cómo se comprueba en cada puerta |
|---|---|---|
| INV-1 | El visor en producción no se rompe; cada tramo se valida en staging y se promueve explícitamente (CONTRACT §1.1, ADR 004) | El corte a VPS se hace en Sprint 26; este sprint promueve por tramo, nunca directo a producción sin validación |
| INV-2 | Toda capa puede volver a GeoJSON cambiando solo su `source.type`, sin tocar código | Reversión probada en una capa por tramo |
| INV-3 | Si PostGIS o el endpoint de tiles no responde, la capa carga desde GeoJSON automáticamente | Prueba cortando el endpoint en Docker |
| INV-4 | El chat IA sigue funcionando igual | Smoke del orquestador (`npm run smoke:chat`) |
| INV-5 | Se mantienen las peculiaridades de AGENTS.md: `dataFilter` antes del renderer, alias normalizados, glify solo para polígonos | Revisión del diff contra AGENTS.md |
| INV-6 | Sin secretos en el frontend; la BD no se expone a internet; el backend usa un rol de mínimo privilegio | Revisión del bundle y de la red de Compose |
| INV-7 | **Paridad de opciones:** toda capa PostGIS conserva tabla, zoom, filtro, cluster, heatmap y descarga | CA-3 a CA-9 por capa migrada |
| INV-8 | Un mismo filtro devuelve el mismo conjunto en mapa, tabla, cluster, heatmap y descarga | Comparación de conteos (CA-5) |
| INV-9 | El cliente no descarga el GeoJSON completo de una capa PostGIS para operaciones normales | DevTools → Network: no aparece el `.geojson` de la capa |
| INV-10 | Un tile estático no consulta PostgreSQL en runtime | Prueba con PostgreSQL detenido: Nginx sigue sirviendo tiles |
| INV-11 | Una versión de tiles publicada no se sobrescribe | Manifest/checksum y directorio de versión |
| INV-12 | Los valores dinámicos de estaciones no se congelan en tiles estáticos | El popup/heatmap consulta la API de valores |
| INV-13 | El índice de tiles y la versión activa de cada capa son consistentes | `tiles:check` y comparación índice/manifest |
| INV-14 | Una capa nueva o editada se publica sin sobrescribir la versión anterior | `tiles:sync --changed` + inspección de directorios |

## 6. Decisiones arquitectónicas

| Decisión | ADR | Estado |
|---|---|---|
| Cómo se sirven los tiles vectoriales (M2) | `012-servicio-de-tiles.md` | Aceptada: pregenerado + Nginx (medido 2026-11-13); on-demand para dinámicas |
| Cómo se cargan los puntos, cluster y heatmap (M1) | `013-capas-de-puntos.md` | Pendiente: el spike mide cliente vs agregados |
| Modelo de doble fuente (`source`) | `014-doble-fuente.md` | Propuesto (sección 10) |
| Librería cliente para tiles vectoriales y convivencia con glify (M4) | `015-cliente-de-tiles.md` | Pendiente |
| Versionado de tiles por edición/año | `012-servicio-de-tiles.md` | Incluido en la decisión de tiles |

ADR 005 ya está ocupada por la decisión de hosting/VPS. Los ADR 006 y 007 están
reservados por el ROADMAP para PostgreSQL propio y autenticación de admin.

## 7. Dependencias y entorno de ejecución

- **Sprint 07** entrega `/api/config` y el snapshot de configuración; el modelo
  `source` viaja ahí.
- **Sprint 26** entrega la imagen Docker de PostgreSQL (PostGIS + pgvector), el
  Compose, el servidor Node persistente (`server/index.js`), el driver
  `pg.Pool` y Nginx.
- **Este sprint no empieza antes de la imagen Docker.** Desde ese commit el
  entorno de referencia es Docker Compose/VPS; Vercel + Supabase quedan
  congelados (ADR 005).
- Los datos de las capas deben existir en PostGIS con SRID, índice GIST y
  columnas de atributos. El inventario del spike mide cuántas capas ya están.
- **Concurrencia objetivo:** 20-50 usuarios. La generación de tiles es offline;
  el runtime no debe consultar PostGIS para capas estáticas.
- **Disco:** los tiles pregenerados y sus versiones se suman al disco del VPS.
  El spike mide tamaño por capa/zoom antes de fijar el plan.

## 8. Spike (fase 0, máximo 4h)

**Entregable:** ADR 012, ADR 013 y ADR 015 con una recomendación respaldada
por mediciones, más la línea base, el inventario y el tamaño estimado de tiles.

| Tarea | Salida |
|---|---|
| Medir línea base: bytes y tiempo de carga de 3 capas de referencia (puntos, líneas, polígonos pesados), sin caché y con caché | Tabla de bytes y tiempos |
| Inventario de las ~71 capas: ¿tabla física existe?, tipo, SRID, nº de features, peso, GIST, columnas filtrables, cadencia (estática/edición/anual/dinámica) | Planilla (alimenta M3 y el orden de los tramos) |
| Prototipo de pregeneración `ST_AsMVT` para 1 capa pesada (`borde_costero` o `humedales`), z0-z14 | Tamaño total, cantidad de tiles, tiempo de generación, CPU |
| Prototipo de MVT on-demand para 1 capa dinámica y medición con 10 consultas concurrentes | Latencia frío/caché, CPU |
| Prueba de cliente de tiles dentro del visor, con una capa | Compatibilidad con glify, `dataFilter`, popups y z-index |
| Prueba de cluster/heatmap cliente con 523 estaciones y 920 derechos | Memoria, tiempo de render, paridad visual |
| Estimación de disco para todas las versiones (2024/2026, incendios por año) | GB necesarios y política de retención |

| Pregunta | Opciones | Criterios de decisión |
|---|---|---|
| ¿Cómo se sirven los tiles? (M2) | **(a)** MVT pregenerado en directorios `z/x/y.mvt` + Nginx · **(b)** PMTiles pregenerado + Nginx · **(c)** MVT on-demand con `ST_AsMVT` + caché · **(d)** Martin/pg_tileserv | CPU runtime, disco, cantidad de archivos, caché, actualización, portabilidad |
| ¿Cómo se cargan los puntos? (M1) | **(a)** geometría estática en tiles/GeoJSON + valores por API + cluster/heatmap cliente ≤5k · **(b)** agregados server-side para >5k · **(c)** MVT también para puntos | Paridad de iconos/popups, memoria del cliente, valores dinámicos |
| ¿Cómo se filtran los tiles estáticos? (M9) | **(a)** cliente sobre `properties` del tile · **(b)** MVT on-demand filtrado · **(c)** precargar combinaciones comunes | Consistencia, CPU, UX |

## 9. Mapa de tramos

Tramos de máximo 8h. El tramo C del ROADMAP se parte por dimensión y edición;
cada dimensión es un tramo de 2-3h con su puerta.

| Tramo | Nombre | Horas | Depende de | Reversión | Spec | Estado |
|---|---|---|---|---|---|---|
| 08-0 | Spike: línea base, inventario, tamaños de tiles y ADRs 012/013/015 | 4 | Sprint 07 + 26 | Nada que revertir (descartable) | 08-0-spike.md | cerrada |
| 08-A | Pipeline de tiles pregenerados, manifest/versionado, Nginx y esqueleto on-demand | 10 | 08-0 | Apagar las rutas; ninguna capa las usa aún | 08-A-pipeline-tiles.md | parcial: pipeline/Nginx ✅, on-demand pendiente |
| 08-B | Piloto: 1 capa pesada pregenerada, 1 capa de puntos con API y 1 capa dinámica | 6 | 08-A | Cambiar `source.type` de las 3 capas | 08-B-piloto.md | parcial: `borde_costero` ✅; puntos/dinámica pendientes |
| 08-D | Estilos, popups, leyenda, tabla completa (búsqueda, orden, filtros y conteo) | 6 | 08-B | Igual que 08-B | 08-D-tabla-y-features.md | parcial: búsqueda/orden/filtro/total y feature ✅; paginación UI pendiente |
| 08-F | Zoom a capa/feature, cluster/heatmap cliente y agregados server-side >5k | 8 | 08-D | Volver al renderer en cliente para esas capas | 08-D-tabla-y-features.md | cerrada por umbral: máximo 2.946 puntos, cliente suficiente |
| 08-C1 … C9 | Migración por dimensión y edición (agua, agricultura, clima, energía, minería, otros, planificación, riesgos, suelo) | 2-3 c/u (16-24 total) | 08-F | Por capa (`source.type`) | 08-C-migracion.md | cerrada: 40/40 capas visibles no-punto |
| 08-E | Exportación/descarga en streaming desde PostGIS | 4 | 08-D | Quitar la opción de la UI | 08-E-export.md | cerrada |
| 08-G | Ciclo de vida de capas nuevas: sync, índice, verificación y retención | 4 | 08-A | Volver a la versión anterior desde la config | 08-G-*.md | en ejecución |

**Total:** 56-64h.

**Por qué D y F antes de C:** migrar las capas sin que tabla, zoom, filtros,
cluster, heatmap y descarga funcionen sobre la nueva fuente multiplica el
trabajo de corrección. El piloto (B) valida los tres modos (estático, puntos con
API y dinámico); D completa estilos/filtros; F completa cluster/heatmap; C
escala por dimensión/edición. El orden del ROADMAP (A, B, C, D, E) se altera a
propósito.

**El orden de las dimensiones en C se decide con el inventario del spike**,
empezando por las capas pesadas y estáticas (mayor ahorro de bytes) y siguiendo
por las de menor riesgo.

## 10. Modelo de doble fuente y contrato de API

### 10.1. Configuración de la capa

```json
{
  "source": {
    "type": "postgis",
    "table": "public.borde_costero",
    "id_column": "gid",
    "geometry_column": "geom",
    "srid": 4326,
    "geometry_type": "polygon",
    "columns": ["nombre", "tipo", "comuna"],
    "filterable": ["tipo", "comuna"],
    "tiles": {
      "mode": "static",
      "version": "2026",
      "url_template": "/tiles/borde_costero/2026/{z}/{x}/{y}.mvt",
      "manifest": "/tiles/borde_costero/2026/manifest.json",
      "minzoom": 0,
      "maxzoom": 14
    },
    "capabilities": {
      "table": true,
      "zoom": true,
      "filter": true,
      "cluster": false,
      "heatmap": false,
      "download": true
    },
    "fallback": {
      "type": "geojson",
      "url": "geojson/borde_costero.geojson"
    }
  }
}
```

Para puntos con valores dinámicos:

```json
{
  "tiles": {
    "mode": "static",
    "version": "2026",
    "url_template": "/tiles/estaciones/2026/{z}/{x}/{y}.mvt"
  },
  "values_api": "/api/stations-map",
  "cluster": { "mode": "client", "max_points": 5000 },
  "heatmap": { "mode": "client", "max_points": 5000 }
}
```

Para una capa dinámica/filtrada:

```json
{
  "tiles": {
    "mode": "on-demand",
    "url_template": "/api/layers/:id/tiles/{z}/{x}/{y}.mvt",
    "max_zoom": 16
  }
}
```

### 10.2. Tiles estáticos

- Directorio: `/srv/woll/tiles/<layer_id>/<version>/<z>/<x>/<y>.mvt`.
- Manifest: `manifest.json` con `layer_id`, `version`, `bbox`, `minzoom`,
  `maxzoom`, `feature_count`, `generated_at`, `checksum`.
- Nginx sirve `/tiles/...` con `Cache-Control: public, max-age=31536000,
  immutable` (la versión es inmutable).
- Generación: `scripts/build-tiles.mjs` (a crear) con:
  - `ST_TileEnvelope(z,x,y)`,
  - `ST_Transform(geom, 3857)`,
  - `ST_AsMVTGeom(..., 4096, 256, true)`,
  - `ST_AsMVT(...)`,
  - simplificación por zoom y `maxzoom` de la capa.
- La generación puede correr en el VPS con poca carga o en una máquina de
  desarrollo/CI; se suben los tiles y el manifest.
- Una versión publicada no se sobrescribe. Si se actualiza la edición, se crea
  una versión nueva y se cambia la config.

### 10.3. Tiles on-demand

- `GET /api/layers/:id/tiles/:z/:x/:y.mvt` solo para `tiles.mode: "on-demand"`.
- Nginx cachea por URL (incluye `filter`), con TTL corto y `proxy_cache_lock`.
- Límites: `z` 0-18, tamaño de tile, timeout 5 s, concurrencia acotada.
- Si el tile no existe o la capa es estática, la ruta devuelve 404.

### 10.4. Endpoints de datos

| Endpoint | Devuelve | Límites |
|---|---|---|
| `GET /api/layers/:id/features` | Página de features (`rows`, `total`, `limit`, `offset`) | `limit` ≤ 500, default 100; `bbox`, `search`, `sort`, `filter` |
| `GET /api/layers/:id/features/:fid` | Feature puntual con geometría/bbox | `fid` validado |
| `GET /api/layers/:id/extent` | `{ bbox: [minx,miny,maxx,maxy] }` | cacheado por capa |
| `GET /api/layers/:id/clusters` | Celdas `{lat, lng, count}` | solo >5k o valores dinámicos; `bbox`, `zoom`, `filter` |
| `GET /api/layers/:id/heatmap` | Celdas ponderadas `{lat, lng, weight}` | solo >5k o valores dinámicos; `bbox`, `zoom`, `filter` |
| `GET /api/layers/:id/export` | GeoJSON/CSV en streaming | `format`, `filter`; sin límite de viewport |

Todos responden con el sobre del CONTRACT §5.3:

```json
{ "ok": true, "data": { } }
{ "ok": false, "error": "mensaje" }
```

**Filtro.** Especificación validada contra `filterable`:

```json
{
  "op": "and",
  "conditions": [
    { "column": "tipo", "operator": "=", "value": "salar" },
    { "column": "comuna", "operator": "in", "value": ["Copiapó", "Huasco"] }
  ]
}
```

Operadores permitidos: `=`, `!=`, `>`, `>=`, `<`, `<=`, `in`, `contains`.
Columnas y operadores se validan contra una allowlist; los valores se pasan
como parámetros (`$1`, `$2`...). Nunca se concatena SQL del cliente.

**Seguridad.** Rol de mínimo privilegio de solo lectura (a definir/crear en el
Sprint 26-B), sin `SELECT *`, sin acceso a tablas `admin.*`/`rag.*`,
`statement_timeout`, límite de celdas y de filas, y validación de `z/x/y` y
`bbox`.

## 11. Criterios de aceptación del sprint completo

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | cualquier capa migrada | se activa en el visor | muestra la misma cantidad de features, estilo, popups y leyenda que su versión GeoJSON | prueba de paridad por capa (manual + script de conteo) |
| CA-2 | una capa migrada | el endpoint de tiles falla, responde 5xx o timeout | la capa se carga desde su `fallback` GeoJSON y el usuario ve un aviso discreto | manual en Docker cortando el endpoint |
| CA-3 | una capa migrada | se abre la tabla de atributos, se busca, se ordena y se pagina | funciona con datos del servidor; el total coincide con el conteo de la BD | test de integración + manual |
| CA-4 | una capa migrada | se usa "Zoom a la capa" o se hace zoom a un feature desde la tabla | el mapa encuadra la extensión correcta sin descargar todo el dataset | manual + Network |
| CA-5 | una capa migrada | se aplica un filtro | mapa, tabla, cluster, heatmap y conteo devuelven el mismo conjunto | comparación de conteos |
| CA-6 | una capa de puntos ≤5k | se activa cluster y se navega entre zooms | los clusters se calculan en cliente y el total coincide con el filtro | manual + comparación con `markerCluster` |
| CA-7 | una capa de puntos ≤5k con valores | se activa mapa de calor | la intensidad y distribución son equivalentes a la versión GeoJSON | manual (captura comparada) |
| CA-8 | una capa migrada | se descarga en GeoJSON o CSV | el archivo contiene todas las features filtradas, no solo el viewport, con el mismo conteo que la tabla | comparación de conteos |
| CA-9 | una capa migrada con `dataFilter` o `hiddenAttributes` activos | se renderiza | el filtro y las categorías ocultas se respetan en el mapa (INV-5) | manual |
| CA-10 | una capa PostGIS | se activa y se usan sus opciones | el navegador no descarga su `.geojson` completo | DevTools → Network (INV-9) |
| CA-11 | una capa mediana | se activa en 4G | transfiere ≥ 70 % menos bytes que el GeoJSON completo y la primera carga sigue < 3 s | Lighthouse + Network |
| CA-12 | el VPS de staging | 25 y 50 usuarios concurrentes ejecutan tiles estáticos, tabla y agregados | sin 5xx; p95 de tile estático < 100 ms; tabla < 500 ms; CPU estable | prueba de carga (k6/autocannon) |
| CA-13 | una capa migrada | se cambia su `source.type` a `geojson` | vuelve a cargar desde GeoJSON sin tocar código | manual (INV-2) |
| CA-14 | el chat IA | se hace una pregunta cualquiera | responde igual que antes (INV-4) | smoke del orquestador |
| CA-15 | las 9 dimensiones | terminan los tramos C1-C9 | 71 capas resueltas: 69 con `source.type: "postgis"` y 2 WMS documentadas como excepción | inventario final |
| CA-16 | una capa de puntos | se activan cluster y heatmap | ambas opciones siguen visibles en el menú y funcionan (INV-7) | manual |
| CA-17 | un tile estático | se sirve con PostgreSQL detenido | Nginx responde 200 y el visor sigue mostrando la capa | prueba de corte (INV-10) |
| CA-18 | una capa versionada | se publica 2026 y se conserva 2024 | ambas versiones tienen manifest y tiles; la config usa la activa | inspección de directorios/manifest |
| CA-19 | estaciones | se cambia el valor de una estación | el popup/heatmap muestra el valor actual de la API, no el tile estático | prueba con dato actualizado |
| CA-20 | una capa >5k | se activa cluster/heatmap | la API devuelve celdas y el cliente las pinta | test de integración + manual |

## 12. Puertas entre tramos

Un tramo no se cierra hasta cumplir todo:

- [ ] `npm test` y `npm run lint` limpios.
- [ ] INV-1 a INV-14 comprobados.
- [ ] Verificado en el entorno Docker local, incluida la prueba de corte del
      endpoint (INV-3) y de PostgreSQL detenido para tiles estáticos (INV-10).
- [ ] Reversión probada al menos una vez (INV-2).
- [ ] Paridad de opciones verificada en las capas del tramo (INV-7).
- [ ] Manifest/checksum y versión de tiles revisados.
- [ ] Índice de tiles actualizado y `tiles:check` sin errores (INV-13).
- [ ] Alta/edición de una capa de prueba publica una versión nueva sin
      sobrescribir la anterior (INV-14).
- [ ] Docs y CHANGELOG actualizados; ARCHITECTURE si cambia algo estructural.
- [ ] Re-estimación del resto. Si un tramo tomó el doble, se detiene el sprint y
      se revisa esta spec.

## 13. Tests requeridos

| Nivel | Qué se prueba |
|---|---|
| Unitario (`node:test`) | Compilador de filtros (columnas/operadores allowlist, valores parametrizados), resolución de `source`, paginación y topes, envelope `{ ok, data, error }`, fallback, generación de URLs de tiles/manifest, cálculo de tiles/tolerancias, checksum y versiones del ciclo de vida |
| Integración (Docker + `DATABASE_URL`) | Tile MVT válido y no vacío, manifest/checksum, versión, conteo de tabla, búsqueda/orden, extent, agregados de cluster/heatmap, export GeoJSON/CSV completo, `tiles:check` y `tiles:sync --changed` |
| Regresión | Capa sin `source` sigue usando GeoJSON; WMS no se ve afectada; `dataFilter` sigue aplicándose; estaciones siguen usando la API de valores |
| Manual | Paridad visual por capa, popups, leyenda, zoom, cluster, heatmap, descarga, selector de edición |
| Carga | 25 y 50 usuarios concurrentes; p95 de tile estático y on-demand; CPU/RAM; disco |
| Operación | Regenerar una versión de tiles, publicar, rollback a la versión anterior |

Toda feature nueva de este sprint trae al menos un test. Los tests de
integración corren contra la imagen PostgreSQL del Sprint 26, no contra
Supabase.

## 14. Seguridad y procedencia

- El frontend nunca recibe credenciales de la BD ni el rol de escritura.
- El backend usa un rol de solo lectura sobre las tablas de capas.
- Filtros, `bbox`, `sort` y `z/x/y` se validan; no se concatena SQL del cliente.
- Límites duros de filas, celdas y tamaño de tile; `statement_timeout`.
- La BD no publica puertos fuera de la red de Compose; solo Nginx/Node exponen
  HTTP/TLS.
- Los tiles estáticos se sirven solo desde el directorio versionado; no se
  permite path traversal.
- Los atributos de las capas se tratan como datos no confiables al renderizar
  popups/tabla (DOMPurify donde corresponda).

## 15. Riesgos

| Riesgo | Prob. | Impacto | Mitigación | Señal de alarma |
|---|---|---|---|---|
| El disco se llena por tiles pregenerados y versiones | Alta | Medio | Medir en el spike, PMTiles, retención de versiones y 80/160 GB | `df` > 80 % |
| Los tiles pregenerados quedan obsoletos tras una actualización | Media | Alto | Manifest/versionado y regeneración por edición | Conteo distinto entre tiles y tabla |
| La generación de tiles tarda demasiado en capas pesadas | Media | Medio | Generación offline, simplificación, límites de zoom | Script > 8h por capa |
| Cluster/heatmap cliente no rinden con capas grandes | Media | Medio | Umbral 5k; agregados server-side >5k | Memoria del navegador o FPS |
| Filtros sobre tiles estáticos no excluyen geometrías | Alta | Medio | Filtro cliente sobre properties; on-demand para filtros geométricos | Features visibles que no deberían |
| El VPS 4/8 no alcanza para valores dinámicos concurrentes | Media | Alto | TTL corto, caché, límites; upgrade a 8/16 si la medición lo pide | CPU > 80 % o p95 > 1s |
| Glify (WebGL) y la librería de tiles compiten por z-index/contexto | Media | Medio | Prueba en el spike (M4); pane propio | Capas se tapan o parpadean |
| El sprint crece por "ya que estamos" | Alta | Medio | Fuera de alcance; solo paridad | Tramo supera 8h |
| Dependencia del Sprint 26 retrasa el inicio | Alta | Medio | No empezar hasta la imagen Docker | Sprint 26 sin cerrar |

## 16. Decisiones aprobadas y preguntas abiertas

M1, M2 y M7 quedaron **aprobadas** como decisión inicial y se **revisaron el
2026-11-12** con el inventario real. El spike las valida con mediciones; si las
contradicen, se actualiza el ADR y esta spec antes de empezar 08-A.

| # | Pregunta | Decisión | Impacto si cambia | ¿Bloquea? |
|---|---|---|---|---|
| M1 | ¿Cómo se manejan los puntos (cluster y heatmap)? | **Geometría estática** (tiles/GeoJSON) + valores por API; cluster/heatmap cliente ≤5k; agregados server-side >5k | Si se usa MVT para puntos, hay que reimplementar iconos/popups; si no hay agregados, las capas grandes cargan todo | no (el spike valida) |
| M2 | ¿Cómo se sirven los tiles? | **Aprobado por medición:** pregenerado en directorios `z/x/y.mvt` + Nginx (gzip, caché inmutable); on-demand solo para dinámicas/filtros; PMTiles descartado por ahora | Cambia el pipeline de 08-A y el storage | no |
| M3 | ¿Cuántas capas tienen tabla física con geometría, SRID e índice GIST? | **71 capas en el catálogo** (69 tablas con geometría + 2 WMS) en el dump v1; las faltantes se cargan con `load-layer` | Si faltan, el tramo C crece | no |
| M4 | ¿Qué librería cliente se usa para tiles vectoriales en Leaflet? | **Aprobada:** `leaflet.vectorgrid@1.3.0` vendorizado, con shim de `fakeStop` y `pane: overlayPane`; validado con `borde_costero` | Si exige otro mapa, el alcance toca el Sprint 10 | no |
| M5 | ¿Orden de las dimensiones en el tramo C? | Primero capas pesadas/estáticas (mayor ahorro), luego el resto | Solo reordena los tramos | no |
| M6 | ¿Los filtros se aplican en cliente o en servidor? | En cliente sobre `properties` del tile estático; en servidor para tabla/agregados/export; on-demand para filtros geométricos | Afecta el diseño del tramo D | no |
| M7 | ¿Umbral de puntos para cargar todo en cliente vs. agregación server-side? | 5.000 puntos por capa | Cambia qué capas usan cluster/heatmap server-side | no (el spike valida) |
| M8 | ¿Versionado de tiles? | `<layer_id>/<version>/...` con manifest y checksum; la versión anterior se conserva | Cambia el storage y la config | no |
| M9 | ¿Filtros sobre tiles estáticos? | Cliente sobre properties; on-demand si el filtro cambia la geometría | Cambia la UX de filtros | no |

## 17. Reversión global y promoción

- **Reversión global:** cambiar `source.type` de todas las capas a `geojson` (un
  valor por capa; la config puede hacerlo en lote). El fallback GeoJSON
  permanece en el repo durante todo el sprint y después de él.
- **Reversión de tiles:** la config apunta a una versión; volver a la versión
  anterior es cambiar el `version` de la capa. Las versiones publicadas no se
  borran durante el sprint.
- **Promoción:** el corte inicial a VPS es el Sprint 26. Dentro de este sprint,
  cada tramo se valida en el Compose local y se replica en el VPS de staging;
  la promoción a producción sigue el ADR 004 y se hace por tramo, nunca directo
  sin validación. No se promueve nada a Vercel/Supabase.
- **No se retira en este sprint:** los GeoJSON del repo ni el loader GeoJSON.

## 18. Documentos a actualizar

ROADMAP (estado por tramo, duración y dependencias), CHANGELOG, ARCHITECTURE
(§4 backend, §5 BD, §6 frontend, §7 caché), AGENTS.md (peculiaridades nuevas de
renderers, filtros, umbral de puntos, pregeneración, ciclo de vida y paridad de
opciones), DEV_GUIDE (comandos `tiles:build`/`tiles:sync` y alta con `--tiles`),
CONTRACT (si el modelo `source` agrega reglas), `.env.example`, ADRs 012-015.

## 19. Puntos de integración

- **Sprint 07:** `/api/config` y snapshot; el `source` y el `tiles` de cada capa
  viajan ahí.
- **Sprint 26:** imagen PostgreSQL, Compose, Node persistente, Nginx, driver
  `pg.Pool` y migraciones.
- **Sprint 09:** las capas raster/WMS no pasan por este modelo; conviven.
- **Sprint 11 (AOI):** reutiliza los endpoints paginados y de agregados.
- **Sprint 14/15:** la config de capas pasa a la BD y el admin valida `source`.
- **Sprint 16:** la carga de capas usa el mismo contrato de `source` y dispara
  la regeneración de tiles.
- **Chat IA:** sigue consultando las tablas físicas; no depende de MVT.

## 20. Cierre

- Fecha de cierre:
- Horas reales por tramo vs. estimadas:
- Desvíos y lecciones:
