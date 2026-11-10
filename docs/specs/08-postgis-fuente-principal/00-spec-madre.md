# Spec madre 08 — Migración a PostGIS (fuente principal)

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 08 |
| **Estado de la spec** | DRAFT (M1, M2 y M7 abiertas; M1 y M2 bloquean el spike) |
| **Tamaño** | Grande (> 15h) |
| **Duración estimada** | 48-58h |
| **Dependencias** | Sprint 07 (`/api/config` + snapshot) y Sprint 26 (imagen Docker PostgreSQL/PostGIS, Node persistente, Compose) |
| **Última revisión** | 2026-11-10 |

> **Corrección 2026-11-10.** El sprint ya estaba registrado en el ROADMAP, pero la
> spec no hacía explícita la **paridad de opciones de capa** ni corregía el
> supuesto de que "cargar desde la BD es más liviano". No lo es por sí solo:
> servir `ST_AsGeoJSON` completo desde PostGIS puede pesar **más** que el
> GeoJSON estático. El ahorro real viene de **MVT/vector tiles, endpoints
> paginados, filtros en servidor y caché**. La sección 2 lo detalla.

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
(PostGIS + pgvector), el servidor Node persistente y Nginx/Caddy son la base. No
se implementa sobre Vercel ni Supabase, que quedan congelados como demo.

Además del cambio de fuente, este sprint debe garantizar que **todas las
opciones de capa del menú actual sigan disponibles**: tabla de atributos, zoom a
la capa, filtros, cluster, mapa de calor y descarga. Una capa PostGIS sin
paridad de opciones no se considera migrada.

## 2. Corrección: "la BD es más liviana" no es automático

| Modelo | Lo que descarga el cliente | Memoria del cliente | Costo del servidor |
|---|---|---|---|
| GeoJSON estático (hoy) | El archivo completo, comprimido por el borde | Parsea y retiene todas las features y atributos | Casi nulo: es un archivo en disco/CDN |
| `ST_AsGeoJSON` completo desde PostGIS | El mismo peso o más (sin gzip ni caché de archivo) | Igual que hoy | Alto: consulta, serialización, transferencia desde la BD |
| **MVT + endpoints paginados + agregados** | Solo los tiles del viewport, una página de tabla o un agregado | Baja: no retiene el dataset completo | Medio-alto: CPU de tiles/consultas y caché |

**Conclusión:** el ahorro es para el **cliente y la red**, no necesariamente
para el servidor. El VPS se dimensiona para generar tiles y servir consultas;
Nginx cachea tiles y respuestas, y PostgreSQL necesita índices GIST y
`statement_timeout`. Servir el GeoJSON completo desde la base sería un
retroceso: más latencia, más CPU y el mismo peso en el navegador.

Con 20-50 usuarios concurrentes, el diseño debe incluir:

- caché de tiles en Nginx (y ETag),
- pool de conexiones acotado,
- endpoints paginados con límites duros,
- agregados de cluster/heatmap en servidor,
- timeout y degradación a GeoJSON por capa.

## 3. Alcance

**Dentro del alcance**

- Servir capas desde PostGIS: MVT para polígonos y líneas; puntos según M1.
- Endpoints paginados para tabla de atributos, búsqueda, orden y conteo.
- Filtros de usuario (`dataFilter`) y categorías ocultas por leyenda
  (`hiddenAttributes`) aplicados de forma consistente en mapa, tabla, cluster,
  heatmap y descarga.
- Zoom a la capa y zoom a un feature desde la tabla, sin cargar todo el dataset.
- Cluster y heatmap con agregación en servidor para capas PostGIS.
- Descarga GeoJSON/CSV en streaming, con el mismo filtro y **todas** las
  features filtradas, no solo el viewport.
- Estilos, popups y leyenda equivalentes a los actuales.
- Modelo de doble fuente por capa, con `fallback` automático a GeoJSON.
- Migración de las ~70 capas, por dimensión, con paridad verificada.
- Pruebas de concurrencia (25 y 50 usuarios) y de latencia de tiles.

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
"postgis"`. La opción no desaparece ni se degrada a "no disponible".

| Opción | Hoy (GeoJSON en memoria) | Con PostGIS | Verificación |
|---|---|---|---|
| **Zoom a la capa** | Calcula bbox con Turf sobre las features cargadas; exige capa activa | `GET /api/layers/:id/extent` con `ST_Extent` cacheado; fallback al bbox de features cargadas | CA-4 |
| **Zoom a un feature** | La tabla hace `fitBounds` con la geometría en memoria | `GET /api/layers/:id/features/:fid` devuelve la geometría del feature o su bbox | CA-4 |
| **Tabla de atributos** | `openAttributeTable()` usa todas las features/atributos cargados | `GET /api/layers/:id/features?limit=&offset=&search=&sort=&filter=`; conteo con `COUNT(*)`; búsqueda, orden y paginación en servidor | CA-3 |
| **Filtrar datos** | `openFilterModal()` arma `dataFilter`; `hiddenAttributes` oculta categorías de la leyenda y reconstruye la capa en cliente | El filtro viaja como especificación validada al servidor y se aplica en tiles, tabla, cluster, heatmap y exportación; `dataFilter` y `hiddenAttributes` se siguen aplicando en cliente para los renderers que lo necesitan | CA-5, CA-9 |
| **Cluster** | `markerCluster` con todos los puntos en memoria | `GET /api/layers/:id/clusters?bbox=&zoom=&filter=` devuelve celdas `{lat, lng, count}`; clic expande; se recalcula al hacer zoom | CA-6 |
| **Mapa de calor** | `WebGLHeatMap` con todos los puntos | `GET /api/layers/:id/heatmap?bbox=&zoom=&filter=` devuelve celdas ponderadas; el render usa la misma intensidad y radio equivalentes | CA-7 |
| **Descargar capa** | `downloadUtils.js` genera GeoJSON/CSV desde memoria o desde el archivo | `GET /api/layers/:id/export?format=geojson\|csv&filter=` en streaming; dataset completo filtrado, no el viewport | CA-8 |
| **Estilos, popups y leyenda** | Config + atributos del feature | Mismos estilos/popups; los atributos llegan como `properties` del tile o de la página | CA-1 |

**Umbral de carga completa.** Para capas pequeñas (a definir en M7, propuesta:
≤ 5.000 puntos) se permite cargar todas las features por el endpoint paginado y
usar `markerCluster`/`WebGLHeatMap` en cliente. Sobre ese umbral, cluster y
heatmap son obligatoriamente server-side. El umbral se documenta en
`AGENTS.md`.

**Filtros consistentes.** Un mismo filtro debe producir el mismo conjunto en
mapa, tabla, agregados y descarga. Se define una especificación única
(`filter`) que combina `dataFilter` y `hiddenAttributes`, se guarda en
`appState` y se reutiliza; no se permiten filtros distintos por opción.

## 5. Invariantes

| # | Invariante | Cómo se comprueba en cada puerta |
|---|---|---|
| INV-1 | El visor en producción no cambia hasta la promoción explícita (CONTRACT §1.1, ADR 004) | El corte a VPS se hace en Sprint 26; este sprint no toca producción |
| INV-2 | Toda capa puede volver a GeoJSON cambiando solo su `source.type`, sin tocar código | Reversión probada en una capa por tramo |
| INV-3 | Si PostGIS o el endpoint de tiles no responde, la capa carga desde GeoJSON automáticamente | Prueba cortando el endpoint en Docker |
| INV-4 | El chat IA sigue funcionando igual | Smoke del orquestador (`npm run smoke:chat`) |
| INV-5 | Se mantienen las peculiaridades de AGENTS.md: `dataFilter` antes del renderer, alias normalizados, glify solo para polígonos | Revisión del diff contra AGENTS.md |
| INV-6 | Sin secretos en el frontend; la BD no se expone a internet; el backend usa un rol de mínimo privilegio | Revisión del bundle y de la red de Compose |
| INV-7 | **Paridad de opciones:** toda capa PostGIS conserva tabla, zoom, filtro, cluster, heatmap y descarga | CA-3 a CA-9 por capa migrada |
| INV-8 | Un mismo filtro devuelve el mismo conjunto en mapa, tabla, cluster, heatmap y descarga | Comparación de conteos (CA-5) |
| INV-9 | El cliente no descarga el GeoJSON completo de una capa PostGIS para operaciones normales | DevTools → Network: no aparece el `.geojson` de la capa |

## 6. Decisiones arquitectónicas

| Decisión | ADR | Estado |
|---|---|---|
| Cómo se sirven los tiles vectoriales (M2) | `012-servicio-de-tiles.md` | Pendiente: la resuelve el spike |
| Cómo se cargan los puntos, cluster y heatmap (M1) | `013-capas-de-puntos.md` | Pendiente: la resuelve el spike |
| Modelo de doble fuente (`source`) | `014-doble-fuente.md` | Propuesto (sección 10) |
| Librería cliente para tiles vectoriales y convivencia con glify (M4) | `015-cliente-de-tiles.md` | Pendiente |

ADR 005 ya está ocupada por la decisión de hosting/VPS. Los ADR 006 y 007 están
reservados por el ROADMAP para PostgreSQL propio y autenticación de admin.

## 7. Dependencias y entorno de ejecución

- **Sprint 07** entrega `/api/config` y el snapshot de configuración; el modelo
  `source` viaja ahí.
- **Sprint 26** entrega la imagen Docker de PostgreSQL (PostGIS + pgvector), el
  Compose, el servidor Node persistente (`server/index.js`), el driver
  `pg.Pool` y Nginx/Caddy.
- **Este sprint no empieza antes de la imagen Docker.** Desde ese commit el
  entorno de referencia es Docker Compose/VPS; Vercel + Supabase quedan
  congelados (ADR 005).
- Los datos de las capas deben existir en PostGIS con SRID, índice GIST y
  columnas de atributos. El inventario del spike mide cuántas capas ya están.
- **Concurrencia objetivo:** 20-50 usuarios. Los criterios de latencia y las
  pruebas de carga se definen en la sección 11 y en el tramo 08-A.

## 8. Spike (fase 0, máximo 4h)

**Entregable:** ADR 012 y ADR 013 con una recomendación respaldada por
mediciones, más la línea base y el inventario.

| Tarea | Salida |
|---|---|
| Medir línea base: bytes y tiempo de carga de 3 capas de referencia (puntos, líneas, polígonos pesados), sin caché y con caché | Tabla de bytes y tiempos |
| Inventario de las ~70 capas: ¿tabla física existe?, tipo de geometría, SRID, nº de features, peso, índice GIST, columnas filtrables | Planilla (alimenta M3 y el orden de los tramos) |
| Prototipo descartable del endpoint `ST_AsMVT` para 1 capa de polígonos, dentro de Docker | Latencia en frío, con caché y bajo 10 consultas concurrentes |
| Prueba de cliente de tiles dentro del visor, con una capa | Compatibilidad con glify, `dataFilter`, popups y z-index |
| Prueba de agregación de puntos (cluster/heatmap) para una capa mediana | Comparación de conteos y aspecto contra `markerCluster`/`WebGLHeatMap` |

| Pregunta | Opciones | Criterios de decisión |
|---|---|---|
| ¿Cómo se sirven los tiles? (M2) | **(a)** ruta Node con `ST_AsMVT` + caché Nginx · **(b)** Martin o pg_tileserv como sidecar · **(c)** tiles pregenerados | Latencia, CPU/RAM del VPS, complejidad de operar, caché, portabilidad |
| ¿Cómo se cargan los puntos? (M1) | **(a)** MVT también para puntos + agregados server-side · **(b)** GeoJSON paginado por bbox + agregados server-side · **(c)** GeoJSON completo bajo umbral | Paridad de cluster/heatmap, peso real de las capas de puntos, memoria del cliente |

## 9. Mapa de tramos

Tramos de máximo 8h. El tramo C del ROADMAP se parte por dimensión; cada
dimensión es un tramo de 2-3h con su puerta.

| Tramo | Nombre | Horas | Depende de | Reversión | Spec | Estado |
|---|---|---|---|---|---|---|
| 08-0 | Spike: línea base, inventario y ADRs 012-013 | 4 | Sprint 07 + 26 | Nada que revertir (descartable) | esta spec | pendiente |
| 08-A | Infraestructura de tiles y endpoints (Node + PostGIS + caché Nginx) | 8 | 08-0 | Apagar las rutas; ninguna capa las usa aún | 08-A-*.md | pendiente |
| 08-B | Piloto: 3 capas chicas con doble fuente, tabla paginada y zoom | 4 | 08-A | Cambiar `source.type` de las 3 capas | 08-B-*.md | pendiente |
| 08-D | Estilos, popups, leyenda, tabla de atributos paginada y filtros | 6 | 08-B | Igual que 08-B | 08-D-*.md | pendiente |
| 08-F | Zoom a capa/feature, cluster y heatmap sobre PostGIS | 6 | 08-D | Volver al renderer en cliente para esas capas | 08-F-*.md | pendiente |
| 08-C1 … C9 | Migración por dimensión (agua, agricultura, clima, energía, minería, otros, planificación, riesgos, suelo) | 2-3 c/u (16-26 total) | 08-F | Por capa (`source.type`) | 08-C*.md | pendiente |
| 08-E | Exportación/descarga en streaming desde PostGIS | 4 | 08-D | Quitar la opción de la UI | 08-E-*.md | pendiente |

**Total:** 48-58h.

**Por qué D y F antes de C:** migrar 70 capas sin que tabla, zoom, filtros,
cluster, heatmap y descarga funcionen sobre la nueva fuente multiplica el
trabajo de corrección. El piloto (B) valida tiles + tabla + zoom; D completa
estilos y filtros; F completa cluster/heatmap; C escala por dimensión. El orden
del ROADMAP (A, B, C, D, E) se altera a propósito.

**El orden de las dimensiones en C se decide con el inventario del spike**,
empezando por las de menor riesgo (capas chicas, ya con tabla física).

## 10. Modelo de doble fuente y contrato de API

### 10.1. Configuración de la capa

```json
{
  "source": {
    "type": "postgis",
    "table": "public.lagunas_embalses",
    "id_column": "gid",
    "geometry_column": "geom",
    "srid": 4326,
    "geometry_type": "polygon",
    "columns": ["nombre", "tipo", "comuna"],
    "filterable": ["tipo", "comuna"],
    "capabilities": {
      "table": true,
      "zoom": true,
      "filter": true,
      "cluster": true,
      "heatmap": true,
      "download": true
    },
    "fallback": {
      "type": "geojson",
      "url": "geojson/lagunas_embalses.geojson"
    }
  }
}
```

La capa decide su fuente; el código no tiene "capas especiales". Mientras exista
el fallback, volver atrás es cambiar un valor (INV-2). Al estar este modelo en
`/api/config` (Sprint 07), el cambio de fuente no requiere deploy de frontend
cuando la config pase a la BD (Sprint 14).

### 10.2. Endpoints (a crear en el servidor Node del Sprint 26)

| Endpoint | Devuelve | Límites |
|---|---|---|
| `GET /api/layers/:id/tiles/:z/:x/:y.mvt` | Tile MVT del viewport | `z` 0-18; `filter` opcional; 204 si vacío |
| `GET /api/layers/:id/features` | Página de features (`rows`, `total`, `limit`, `offset`) | `limit` ≤ 500, default 100; `bbox`, `search`, `sort`, `filter` |
| `GET /api/layers/:id/features/:fid` | Feature puntual con geometría/bbox | `fid` validado |
| `GET /api/layers/:id/extent` | `{ bbox: [minx,miny,maxx,maxy] }` | cacheado por capa |
| `GET /api/layers/:id/clusters` | Celdas `{lat, lng, count}` | `bbox`, `zoom`, `filter`; máx. celdas |
| `GET /api/layers/:id/heatmap` | Celdas ponderadas `{lat, lng, weight}` | `bbox`, `zoom`, `filter`; máx. celdas |
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

**Seguridad.** Rol de mínimo privilegio (`chat_ro`/`layer_ro`), sin `SELECT *`,
sin acceso a tablas `admin.*`/`rag.*`, `statement_timeout`, límite de celdas y
de filas, y validación de `z/x/y` y `bbox`.

## 11. Criterios de aceptación del sprint completo

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | cualquier capa migrada | se activa en el visor | muestra la misma cantidad de features, estilo, popups y leyenda que su versión GeoJSON | prueba de paridad por capa (manual + script de conteo) |
| CA-2 | una capa migrada | el endpoint de tiles falla, responde 5xx o timeout | la capa se carga desde su `fallback` GeoJSON y el usuario ve un aviso discreto | manual en Docker cortando el endpoint |
| CA-3 | una capa migrada | se abre la tabla de atributos, se busca, se ordena y se pagina | funciona con datos del servidor; el total coincide con el conteo de la BD | test de integración + manual |
| CA-4 | una capa migrada | se usa "Zoom a la capa" o se hace zoom a un feature desde la tabla | el mapa encuadra la extensión correcta sin descargar todo el dataset | manual + Network |
| CA-5 | una capa migrada | se aplica un filtro | mapa, tabla, cluster, heatmap y conteo devuelven el mismo conjunto | comparación de conteos |
| CA-6 | una capa de puntos migrada | se activa cluster y se navega entre zooms | los clusters se recalculan en servidor y el total agregado coincide con el filtro | manual + comparación con `markerCluster` |
| CA-7 | una capa de puntos migrada | se activa mapa de calor | la intensidad y distribución son equivalentes a la versión GeoJSON | manual (captura comparada) |
| CA-8 | una capa migrada | se descarga en GeoJSON o CSV | el archivo contiene todas las features filtradas, no solo el viewport, con el mismo conteo que la tabla | comparación de conteos |
| CA-9 | una capa migrada con `dataFilter` activo | se renderiza | el filtro se respeta en el mapa (INV-5) | manual |
| CA-10 | una capa PostGIS | se activa y se usan sus opciones | el navegador no descarga su `.geojson` completo | DevTools → Network (INV-9) |
| CA-11 | una capa mediana | se activa en 4G | transfiere ≥ 70 % menos bytes que el GeoJSON completo y la primera carga sigue < 3 s | Lighthouse + Network |
| CA-12 | el VPS de staging | 25 y 50 usuarios concurrentes ejecutan tiles, tabla y agregados | sin 5xx; p95 de tile < 300 ms con caché y < 800 ms en frío; tabla < 500 ms | prueba de carga (k6/autocannon) |
| CA-13 | una capa migrada | se cambia su `source.type` a `geojson` | vuelve a cargar desde GeoJSON sin tocar código | manual (INV-2) |
| CA-14 | el chat IA | se hace una pregunta cualquiera | responde igual que antes (INV-4) | smoke del orquestador |
| CA-15 | las 9 dimensiones | terminan los tramos C1-C9 | 70 de 70 capas con `source.type: "postgis"` o excepción documentada y aprobada | inventario final |
| CA-16 | una capa de puntos | se activan cluster y heatmap | ambas opciones siguen visibles en el menú y funcionan (INV-7) | manual |

## 12. Puertas entre tramos

Un tramo no se cierra hasta cumplir todo:

- [ ] `npm test` y `npm run lint` limpios.
- [ ] INV-1 a INV-9 comprobados.
- [ ] Verificado en el entorno Docker local, incluida la prueba de corte del
      endpoint (INV-3) en los tramos que lo afecten.
- [ ] Reversión probada al menos una vez (INV-2).
- [ ] Paridad de opciones verificada en las capas del tramo (INV-7).
- [ ] Docs y CHANGELOG actualizados; ARCHITECTURE si cambia algo estructural.
- [ ] Re-estimación del resto. Si un tramo tomó el doble, se detiene el sprint y
      se revisa esta spec.

## 13. Tests requeridos

| Nivel | Qué se prueba |
|---|---|
| Unitario (`node:test`) | Compilador de filtros (columnas/operadores allowlist, valores parametrizados), resolución de `source`, paginación y topes, envelope `{ ok, data, error }`, fallback |
| Integración (Docker + `DATABASE_URL`) | Tile MVT válido y no vacío, conteo de tabla, búsqueda/orden, extent, agregados de cluster/heatmap, export GeoJSON/CSV completo |
| Regresión | Capa sin `source` sigue usando GeoJSON; WMS no se ve afectada; `dataFilter` sigue aplicándose |
| Manual | Paridad visual por capa, popups, leyenda, zoom, cluster, heatmap, descarga |
| Carga | 25 y 50 usuarios concurrentes; p95 de tile/tabla; sin 5xx |

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
- Los atributos de las capas se tratan como datos no confiables al renderizar
  popups/tabla (DOMPurify donde corresponda).

## 15. Riesgos

| Riesgo | Prob. | Impacto | Mitigación | Señal de alarma |
|---|---|---|---|---|
| El costo de CPU de tiles/consultas satura el VPS con 50 usuarios | Media | Alto | Caché Nginx, índices GIST, `statement_timeout`, prueba de carga temprana | p95 de tile > 800 ms o CPU > 80 % |
| Cluster/heatmap server-side no logran paridad visual | Alta | Alto | M1 en el spike; umbral de carga completa para capas chicas; comparación de capturas | CA-6/CA-7 fallan en el piloto |
| Filtros inconsistentes entre mapa, tabla y descarga | Alta | Alto | Una sola especificación de filtro reutilizada por todos los endpoints (INV-8) | Conteos distintos en CA-5 |
| La tabla de atributos se implementa solo en cliente y vuelve a cargar todo | Media | Alto | Paginación y búsqueda server-side desde el piloto (CA-3) | Aparece el `.geojson` en Network |
| Pocas capas tienen tabla física con SRID/índice | Media | Alto | Inventario en el spike; carga de datos con `ogr2ogr` en el tramo C | 08-C se duplica |
| Glify (WebGL) y la librería de tiles compiten por z-index/contexto | Media | Medio | Prueba en el spike (M4); pane propio | Capas se tapan o parpadean |
| El sprint crece por "ya que estamos" (estilos nuevos, mejoras de UI) | Alta | Medio | Fuera de alcance explícito; solo se corrige paridad | Tramo supera 8h |
| Dependencia del Sprint 26 retrasa el inicio | Alta | Medio | No empezar hasta la imagen Docker; el spike usa esa imagen | Sprint 26 sin cerrar |

## 16. Preguntas abiertas

| # | Pregunta | Default propuesto | Impacto si cambia | ¿Bloquea? |
|---|---|---|---|---|
| M1 | ¿Cómo se manejan los puntos (cluster y heatmap)? | MVT/GeoJSON paginado + agregados server-side; carga completa solo bajo umbral (≤ 5.000) | Si todo va por MVT sin agregados, hay que reimplementar cluster/heatmap | **sí (spike)** |
| M2 | ¿Cómo se sirven los tiles? | Ruta Node con `ST_AsMVT` + caché Nginx; Martin/pg_tileserv solo si las mediciones lo justifican | Cambia la infraestructura del tramo A | **sí (spike)** |
| M3 | ¿Cuántas de las ~70 capas ya tienen tabla física con geometría, SRID e índice GIST? | Las del catálogo del chat; el resto, por verificar | Si son pocas, el tramo C crece (carga desde QGIS/ogr2ogr) | no (lo mide el spike) |
| M4 | ¿Qué librería cliente se usa para tiles vectoriales en Leaflet? | La más simple que conviva con glify (evaluar `leaflet.vectorgrid`); decidir con la prueba del spike | Si exige otro mapa, el alcance toca el Sprint 10 | no (spike) |
| M5 | ¿Orden de las dimensiones en el tramo C? | De menor a mayor riesgo según el inventario | Solo reordena los tramos | no |
| M6 | ¿Los filtros se aplican en cliente o en servidor? | En servidor para capas PostGIS; `dataFilter` se mantiene en cliente para los renderers legacy | Afecta el diseño del tramo D y de AGENTS.md | no |
| M7 | ¿Umbral de puntos para cargar todo en cliente vs. agregación server-side? | 5.000 puntos por capa | Cambia qué capas usan cluster/heatmap server-side | **sí (spike)** |

## 17. Reversión global y promoción

- **Reversión global:** cambiar `source.type` de todas las capas a `geojson` (un
  valor por capa; la config puede hacerlo en lote). El fallback GeoJSON
  permanece en el repo durante todo el sprint y después de él.
- **Promoción:** el corte a producción es el Sprint 26. Dentro de este sprint,
  cada tramo se valida en el Compose local y luego se replica en el VPS de
  staging. No se promueve nada a Vercel/Supabase.
- **No se retira en este sprint:** los GeoJSON del repo ni el loader GeoJSON.

## 18. Documentos a actualizar

ROADMAP (estado por tramo, duración y dependencias), CHANGELOG, ARCHITECTURE
(§4 backend, §5 BD, §6 frontend, §7 caché), AGENTS.md (peculiaridades nuevas de
renderers, filtros, umbral de puntos y paridad de opciones), CONTRACT (si el
modelo `source` agrega reglas), `.env.example`, ADRs 012-015.

## 19. Puntos de integración

- **Sprint 07:** `/api/config` y snapshot; el `source` de cada capa viaja ahí.
- **Sprint 26:** imagen PostgreSQL, Compose, Node persistente, Nginx, driver
  `pg.Pool` y migraciones.
- **Sprint 09:** las capas raster/WMS no pasan por este modelo; conviven.
- **Sprint 11 (AOI):** reutiliza los endpoints paginados y de agregados.
- **Sprint 14/15:** la config de capas pasa a la BD y el admin valida `source`.
- **Sprint 16:** la carga de capas usa el mismo contrato de `source`.
- **Chat IA:** sigue consultando las tablas físicas; no depende de MVT.

## 20. Cierre

- Fecha de cierre:
- Horas reales por tramo vs. estimadas:
- Desvíos y lecciones:
