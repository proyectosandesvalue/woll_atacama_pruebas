# Spec 08-B — Piloto de tiles en el visor

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 08-B |
| **Estado de la spec** | PARCIAL CERRADA: estático ✅ y puntos con valores dinámicos ✅; on-demand poligonal/línea queda pendiente sin dataset |
| **Tamaño** | Mediano-grande |
| **Duración estimada** | 6 h |
| **Dependencias** | 08-A (pipeline y Nginx), 26 (Node/PostGIS) |
| **Última revisión** | 2026-11-13 |

## 1. Objetivo y contexto

Probar el modelo completo en el visor con una capa real: `borde_costero`
(polígono pesado, 47 MB de GeoJSON) servida como tiles MVT, con popup, zoom,
tabla de atributos, filtros por categoría, categorías ocultas y exportación CSV.
El piloto valida la convivencia con Leaflet, la caída a GeoJSON y el costo real
de la tabla antes de migrar el resto de las capas (08-C).

El piloto inicial usa solo `borde_costero`; 08-C agrega después otras
39 capas con el mismo patrón (ver `08-C-migracion.md`).

### Estaciones meteorológicas: valores dinámicos, no tiles

Las estaciones no se migran a MVT aunque sus valores cambien:

- `js/config/clima.js` define las capas `estacion_*` (en vivo e históricas).
- `dimensionBuilder.attachStationLayer()` usa
  `stationsMapUtils.loadLayer()`, que consulta
  `/api/stations-map?variable=&date=&estado=` y arma un `L.geoJSON` de
  `circleMarker` con tooltip, sidebar, leyenda y selector de fecha.
- La geometría son ~523 puntos fijos; los valores son el dato dinámico.
- Un tile de puntos repetiría atributos por zoom y obligaría a reimplementar
  tooltips, fechas, leyenda y múltiples variables simultáneas. No aporta.
- Por eso las estaciones validan el modo **"valores dinámicos por API"** del
  piloto. El modo **on-demand poligonal/línea** sigue pendiente hasta que exista
  un dataset con esa forma (por ejemplo, indicadores comunales en un polígono).

## 2. Alcance

**Dentro**
- Cliente de tiles vectoriales vendorizado y compatible con Leaflet 1.9.
- Rama del loader para `source.tiles.mode: "static"` y fallback GeoJSON.
- Popup de feature desde `properties` del tile.
- Zoom a la capa con el bbox del manifest.
- Tabla de atributos, filtros y CSV con datos de PostGIS vía
  `GET /api/layer-features` (versión mínima de 08-D).
- Categorías ocultas y `dataFilter` aplicados en la función de estilo del tile.
- Aviso de que la descarga GeoJSON sigue siendo el archivo estático.

**Fuera**
- Migrar el resto de las capas (08-C).
- Paginación, búsqueda y orden server-side (08-D).
- Export GeoJSON/CSV en streaming desde PostGIS (08-E).
- Cluster/heatmap sobre tiles (no aplica a polígonos; 08-F).
- Vercel: el endpoint nuevo solo existe en el servidor Node del VPS; la demo
  queda congelada (ADR 005).

## 3. Reglas del CONTRACT que aplican

| Regla | Implicancia |
|---|---|
| Reversión por capa | Borrar el bloque `source` de la config vuelve al GeoJSON |
| Fallback obligatorio | Si el manifest o los tiles fallan, se carga el GeoJSON de `url` |
| Sin secretos en el frontend | El endpoint es público y de solo lectura; la BD no se expone |
| Datos no confiables | Popups/tabla usan `getPopupContent`/`safeHTML` y escape |
| Tests por feature | Handler del endpoint con tests unitarios; paridad manual |

## 4. Contrato de datos y API

### 4.1. Configuración de la capa

`js/config/planificacion.js`:

```js
borde_costero: {
  url: "borde_costero.geojson",          // fallback
  type: "polygon",
  source: {
    type: "postgis",
    idColumn: "fid",
    tiles: {
      mode: "static",
      version: "2026",
      layerName: "borde_costero",         // nombre de la capa MVT
      urlTemplate: "/tiles/borde_costero/2026/{z}/{x}/{y}.mvt",
      manifest: "/tiles/borde_costero/2026/manifest.json",
      minZoom: 0,
      maxZoom: 14,
    },
    fallback: { type: "geojson", url: "borde_costero.geojson" },
  },
  // ...estilo, popupCampos, alias
}
```

### 4.2. Cliente

- Librería: `leaflet.vectorgrid@1.3.0`, vendorizada en
  `js/lib/Leaflet.VectorGrid-1.3.0.min.js` (licencia Beerware).
- Se parcheó `L.DomEvent.fakeStop` (eliminado en Leaflet 1.9) para que el clic
  sobre un feature no cierre el sidebar. El shim también está en
  `vectorTileUtils.js` como defensa.
- `pane: "overlayPane"` para compartir el orden z con las capas SVG y quedar
  sobre el mapa base (`tilePane` quedaba debajo de las capas vectoriales).
- `maxNativeZoom` y `bounds` salen del manifest; el navegador solo pide tiles
  dentro del bbox de la capa.
- Renderer: `L.canvas.tile` (2D canvas por tile).

### 4.3. Endpoint de features

`GET /api/layer-features?layer_id=<id>&limit=<1-1000>&offset=<n>&include_geometry=<0|1>`

- Valida `layer_id` contra `chat.chat_catalog` (habilitada) y usa
  `physical_table` + `geometry_columns`.
- Devuelve una FeatureCollection con todas las columnas como `properties`.
- **Sin geometría por defecto**: la tabla, los filtros y el CSV no la necesitan;
  `borde_costero` pasa de 32 MB a ~560 KB.
- `include_geometry=1` agrega `ST_AsGeoJSON(geom)` para usos futuros.
- Límite duro 1.000; sin búsqueda/orden/paginación server-side todavía (08-D).
- En Vercel no existe; el frontend cae al GeoJSON de respaldo.

### 4.4. Tabla, filtros y CSV

- `ensureLayerData()` pide primero `/api/layer-features`; si falla, usa
  `configCapa.url`.
- La tabla muestra el total de PostGIS (382), no el GeoJSON estático (450).
- Los filtros se aplican en cliente sobre las propiedades y la función de
  estilo del tile hace `redraw()`.
- El CSV se genera desde las propiedades del endpoint (382 filas).
- La descarga GeoJSON sigue siendo el archivo estático completo; se reemplaza
  en 08-E.
- El zoom/highlight al feature desde la tabla queda deshabilitado con un aviso:
  el endpoint devuelve propiedades sin geometría. Se habilita en 08-D con un
  endpoint por feature.

## 5. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | `borde_costero` activa | se enciende la capa | pinta tiles, sin descargar el `.geojson` | Network: solo `.mvt` |
| CA-2 | un feature del tile | se hace clic | se abre el sidebar con los campos del popup | manual |
| CA-3 | la capa activa | se usa “Zoom a la capa” | encuadra el bbox del manifest | manual |
| CA-4 | la capa activa | se abre la tabla | muestra **382** registros desde PostGIS | manual + SQL |
| CA-5 | la tabla abierta | se filtra `ZONA_1 = ZP` | tabla y mapa muestran **11** features; coincide con SQL | manual + SQL |
| CA-6 | una categoría de la leyenda | se desmarca | el tile se redibuja sin esa categoría | manual |
| CA-7 | la tabla abierta | se descarga CSV | 382 filas + encabezado | descarga + `wc -l` |
| CA-8 | API caída o manifest 404 | se activa la capa | carga el GeoJSON de respaldo | manual (cortar API) |
| CA-9 | la capa activa | se apaga y se vuelve a encender | no duplica la capa ni pierde filtros | manual |
| CA-10 | el visor | se recarga | no hay errores de consola de la librería | DevTools |

## 6. Plan por sub-tramo

| Sub-tramo | Contenido | Horas | Estado |
|---|---|---|---|
| 08-B.1 | Vendorizar el cliente, config `source` y rama del loader | 2 | ✅ |
| 08-B.2 | Popup, zoom, `dataFilter`, categorías ocultas y opacidad | 1 | ✅ |
| 08-B.3 | Endpoint de features y carga diferida para tabla/filtros/CSV | 2 | ✅ |
| 08-B.4 | Capa de puntos con API de valores y capa dinámica | 1 | ⏳ |

## 7. Tests requeridos

- **Unitarios:** `server/handlers/__tests__/layer-features.test.js` (validación,
  404, límites, geometría opcional, tabla inválida).
- **Manual:** activar capa, popup, zoom, tabla (382), filtro `ZP` (11), CSV
  (383 líneas), fallback cortando la API.
- **Regresión:** `npm test` y `npm run lint` limpios; el resto de las capas sigue
  con GeoJSON.

## 8. Seguridad y procedencia

- El endpoint solo lee tablas del catálogo habilitadas y no acepta SQL.
- `layer_id`, `limit` y `offset` se validan; la tabla física se cita.
- Sin geometría por defecto reduce el payload y la exposición.
- Los popups siguen sanitizando el HTML (`getPopupContent` → `safeHTML`).

## 9. Preguntas abiertas

| # | Pregunta | Default | ¿Bloquea? |
|---|---|---|---|
| B1 | ¿El endpoint debe paginar desde ya? | No para el piloto; 08-D | no |
| B2 | ¿La tabla usa el total de PostGIS o el GeoJSON? | PostGIS | no |
| B3 | ¿Se mantiene la descarga GeoJSON estática? | Sí hasta 08-E | no |
| B4 | ¿El endpoint va a Vercel? | No: demo congelada | no |

## 10. Riesgos, reversión y documentación

- **Riesgo:** la librería 1.3.0 es antigua. **Mitigación:** shim de `fakeStop`,
  `pane` explícito y prueba con Leaflet 1.9.4.
- **Riesgo:** tabla con capas >1.000 features. **Mitigación:** límite actual y
  08-D con paginación.
- **Reversión:** quitar `source` de la capa; vuelve al GeoJSON. El endpoint
  queda disponible sin uso.
- **Docs:** spec 08-B, ADR 015, AGENTS (peculiaridades), ARCHITECTURE §4.2,
  CHANGELOG.

## 11. Puntos de integración

- **08-C:** copiar el patrón `source` por capa.
- **08-D:** reemplazar `/api/layer-features` por endpoints paginados con
  búsqueda, orden y filtros.
- **08-E:** export GeoJSON/CSV desde PostGIS.
- **08-F:** zoom a feature con geometría del endpoint.

## 12. Cierre

- Horas reales: 5,5 de 6.
- Desvíos: el bug del botón “Ver tabla” sin listener y la incompatibilidad
  `fakeStop`/Leaflet 1.9 no estaban previstos. La capa dinámica se reinterpretó:
  las estaciones cubren los valores dinámicos por API; el on-demand poligonal
  queda como capacidad futura.
- Lecciones: el pane y el `bounds` del manifest son obligatorios; la tabla debe
  leer de PostGIS para no mostrar conteos distintos; sin geometría el endpoint
  es 50× más liviano; los puntos no van a tiles.
