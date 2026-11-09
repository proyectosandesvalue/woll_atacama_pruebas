# Proxy de servicios externos (`/api/proxy`)

> Estado: implementado (2026-11-06). Cubre Copernicus WMS/WFS/WMTS y NASA
> Worldview Snapshots. El proxy es **cerrado**: no acepta URLs arbitrarias.

## 1. Por qué existe

- **Oculta credenciales**: el `INSTANCE_ID` de Copernicus se inyecta en el
  servidor; el navegador solo llama a `/api/proxy?source=...`.
- **Controla la cuota**: Copernicus General Users tiene 10.000 requests/mes
  y 300/min. El proxy cachea y aplica rate limit.
- **Evita CORS y mixed content**: el frontend consume un endpoint del mismo
  origen.
- **Filtra parámetros**: solo se reenvían los de una allowlist por servicio.
- **Evita SSRF**: la URL base es fija; nunca se acepta `url=` del cliente.

## 2. Endpoints

| `source` | Upstream | Uso |
|---|---|---|
| `copernicus-wms` | `https://sh.dataspace.copernicus.eu/ogc/wms/<INSTANCE_ID>` | Imágenes, GetCapabilities, GetFeatureInfo |
| `copernicus-wfs` | `https://sh.dataspace.copernicus.eu/ogc/wfs/<INSTANCE_ID>` | Footprints de escenas (GeoJSON) |
| `copernicus-wmts` | `https://sh.dataspace.copernicus.eu/ogc/wmts/<INSTANCE_ID>` | Tiles |
| `worldview-snapshot` | `https://wvs.earthdata.nasa.gov/api/v1/snapshot` | Snapshot de NASA GIBS/Worldview |

## 3. Ejemplos

### WMS: GetMap

```bash
curl "http://localhost:3000/api/proxy?source=copernicus-wms\
&SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap\
&LAYERS=TRUE-COLOR-S2L2A&CRS=EPSG:4326\
&BBOX=-27.5,-70.4,-27.3,-70.2&WIDTH=512&HEIGHT=512\
&FORMAT=image/png&TIME=2026-01-01/2026-03-01&MAXCC=30" \
  -o copernicus.png
```

### WMS: GetFeatureInfo

```bash
curl "http://localhost:3000/api/proxy?source=copernicus-wms\
&SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo\
&LAYERS=NDVI&QUERY_LAYERS=NDVI&CRS=EPSG:4326\
&BBOX=-27.38,-70.34,-27.36,-70.32&WIDTH=1&HEIGHT=1&I=0&J=0\
&INFO_FORMAT=application/json&TIME=2026-01-01/2026-03-01&MAXCC=30"
```

Devuelve un `FeatureCollection` con metadatos de la escena
(`id`, `date`, `time`, `cloudCoverPercentage`) y las bandas de salida del
evalscript (`out1`, `out2`, ...).

### WFS: footprints

```bash
curl "http://localhost:3000/api/proxy?source=copernicus-wfs\
&SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature\
&TYPENAMES=DSS2&SRSNAME=EPSG:4326\
&BBOX=-27.5,-70.4,-27.3,-70.2&TIME=2026-01-01/2026-03-01\
&MAXFEATURES=20&OUTPUTFORMAT=application/json"
```

### Worldview Snapshot

```bash
curl "http://localhost:3000/api/proxy?source=worldview-snapshot\
&REQUEST=GetSnapshot&LAYERS=MODIS_Terra_CorrectedReflectance_TrueColor\
&CRS=EPSG:4326&BBOX=-29,-71,-26,-68&WIDTH=512&HEIGHT=512\
&TIME=2026-02-26&FORMAT=image/jpeg" -o worldview.jpg
```

### Frontend

```js
import {
  createCopernicusWMSLayer,
  createCopernicusWMTSLayer,
  fetchCopernicusFootprints,
  buildWorldviewSnapshotUrl,
} from "./js/utils/externalServices.js";

const ndvi = createCopernicusWMSLayer({
  layer: "NDVI",
  time: "2026-01-01/2026-03-01",
  maxcc: 30,
});
ndvi.addTo(map);

const trueColor = createCopernicusWMTSLayer({
  layer: "TRUE-COLOR-S2L2A",
  time: "2026-01-01/2026-03-01",
});
trueColor.addTo(map);

const footprints = await fetchCopernicusFootprints({
  typename: "DSS2",
  bbox: "-27.5,-70.4,-27.3,-70.2",
  time: "2026-01-01/2026-03-01",
});

const snapshotUrl = buildWorldviewSnapshotUrl({
  layers: "MODIS_Terra_CorrectedReflectance_TrueColor",
  bbox: "-29,-71,-26,-68",
  width: 512,
  height: 512,
  time: "2026-02-26",
});
```

## 4. Selector de fecha (Copernicus)

Las capas WMS de Copernicus con `wmsDateSelector: true` muestran un calendario
flatpickr debajo de la capa:

1. Al abrir el calendario (no al activar la capa) se consulta WFS (`DSS1`/`DSS2`)
   para el mes visible y los meses vecinos, con el viewport actual y `MAXCC=30`.
2. Los días con imágenes se marcan en azul (`has-data-satellite`) y la leyenda
   del calendario indica cuántas fechas hay en el mes visible.
3. Al navegar a otro mes o año se consulta ese mes. Hay caché de 5 minutos por
   mes + bbox.
4. El historial llega hasta `wmsHistoryStart` (`2017-01-01` por defecto).
5. Al elegir un día se aplica `TIME=YYYY-MM-DD/YYYY-MM-DD` a `GetMap` y
   `GetFeatureInfo`.
6. El botón “x” quita `TIME` y vuelve a la imagen válida más reciente.

Configuración por capa (helper `copernicusLayer`):

```js
copernicusLayer({
  servicio: "copernicus_ndvi",
  nombre: "NDVI (Sentinel-2)",
  collection: "DSS1", // DSS1 = L1C, DSS2 = L2A
  maxcc: 30,
  historyStart: "2017-01-01",
  // title, description, range, legend...
});
```

Limitación: el WFS devuelve como máximo 100 features por request y ordena por
fecha descendente. El selector consulta hasta 3 páginas por mes (300 features)
para cubrir el mes visible y los vecinos; en viewports muy grandes puede faltar
algún día del extremo más antiguo. Si se necesita precisión total, aumentar
`MAX_PAGES` o acotar el bbox.

## 5. GetFeatureInfo y leyenda

### GetFeatureInfo

`js/utils/wmsFeatureInfo.js` registra un `map.on("click")` después de
`initSidebarUI(map)`. Si hay capas WMS Copernicus visibles:

1. Calcula un `BBOX` de un píxel de pantalla alrededor del clic y consulta
   `GetFeatureInfo` con `WIDTH=1`, `HEIGHT=1`, `I=0`, `J=0`,
   `INFO_FORMAT=application/json`, el `TIME` seleccionado y `MAXCC`. Es más
   rápido y estable que pedir la imagen completa del viewport.
2. Muestra en `#sidebarInfo` el nombre del indicador, una descripción
   breve para usuarios no especialistas, el color/valor del píxel y los
   metadatos de la escena (fecha, hora, nubosidad e ID). No muestra
   coordenadas ni el índice I/J.

Las capas actuales (`NDVI`, `AGRICULTURE`, `MOISTURE-INDEX`,
`TRUE-COLOR-S2L2A`) son visualizaciones en color: `out1..out3` son RGB.
Para mostrar un índice numérico grande se necesita una capa de **1 banda**
en la instancia y configurar:

```js
wmsFeatureInfo: {
  kind: "value",
  primary: "out1",
  primaryLabel: "NDVI",
  decimals: 3,
  bands: { out1: "NDVI" },
}
```

### Leyenda

Sentinel Hub no implementa `GetLegendGraphic` (devuelve 404). Por eso la
leyenda se declara en la capa con `wmsLegend`:

```js
wmsLegend: {
  type: "gradient",
  min: -0.2,
  max: 0.8,
  unit: "NDVI",
  labels: ["Bajo", "Alto"],
  stops: [
    { value: -0.2, color: "#8c6d4a" },
    { value: 0, color: "#d9c58a" },
    { value: 0.4, color: "#76c76a" },
    { value: 0.8, color: "#004d00" },
  ],
}
```

También acepta `type: "note"` (texto) o `items: [{ color, label }]`.
`legendUtils.js` la renderiza solo para capas visibles.

## 6. Variables de entorno

```bash
# Obligatoria para Copernicus (se acepta INSTANCE_ID por compatibilidad).
COPERNICUS_INSTANCE_ID=...
# INSTANCE_ID=...

# Solo si se implementa Statistical API u ODP (no lo usa el proxy OGC).
COPERNICUS_CLIENT_ID=...
COPERNICUS_CLIENT_SECRET=...

PROXY_RATE_LIMIT_PER_MIN=600
PROXY_RATE_LIMIT_BURST=120
PROXY_TIMEOUT_MS=25000
```

El `CLIENT_SECRET` nunca debe llegar al navegador. El `INSTANCE_ID` tampoco
se envía al cliente: el proxy lo inyecta.

## 7. Seguridad

- Solo `GET` y `OPTIONS`.
- Servicios y parámetros en allowlist; `url`, `host`, `source` duplicado y
  parámetros desconocidos se descartan.
- `WIDTH`/`HEIGHT` ≤ 2048; `MAXFEATURES` ≤ 100; `TILEMATRIX` ≤ 30.
- `BBOX` debe tener cuatro números; `TIME` se valida como ISO8601.
- `INFO_FORMAT` no permite `text/html` (evita XSS same-origin).
- Los content-types upstream permitidos son imagen, JSON, XML, texto plano,
  GeoJSON, GML y ZIP/Shapefile. Cualquier otro devuelve 502.
- No se siguen redirects (`redirect: "manual"`).
- Timeout y límite de bytes por servicio.
- Los logs no incluyen la URL upstream ni el `INSTANCE_ID`.
- CORS: solo los orígenes de `ALLOWED_ORIGINS`.

## 8. Caché y cuota

| Respuesta | `s-maxage` | Caché en memoria |
|---|---:|---|
| WMS/WMTS/Worldview imagen | 1 h (Worldview histórico: 7 días) | No |
| GetCapabilities | 6 h | Sí (≤ 256 KB) |
| GetFeatureInfo | 60 s | Sí |
| WFS GetFeature | 5 min | Sí |

La caché en memoria vive por instancia de Vercel. En el VPS conviene
sustituirla por disco o Redis y añadir `limit_req` en Nginx (Sprint 26-D).

### Rendimiento en local

`vercel dev` ejecuta una Function por cada tile. No es un servidor de tiles:
si activas varias capas Sentinel y haces zoom, puede saturarse y devolver
502. Para trabajar en local:

- Levantar el proxy persistente: `npm run dev:proxy` (puerto 3001). El
  frontend local lo detecta y lo usa en vez de `/api/proxy`.
- `vercel dev` sigue siendo necesario para `/api/chat` y el resto de
  endpoints, pero no para los tiles.
- Activar **una capa Sentinel a la vez**.
- Mantener zoom **13–16**.
- Las capas usan `tileSize: 512`, `maxNativeZoom: 16`, `keepBuffer: 1`,
  `updateWhenIdle: true` y `updateWhenZooming: false` para reducir requests.
- El selector de fecha consulta WFS **solo al abrir el calendario**, no al
  activar la capa.
- Si aparecen 502, reiniciar `vercel dev` y hacer **hard reload**; el
  navegador puede conservar el JS anterior (por ejemplo, con `tiled=true`).
- En el VPS, usar un proxy persistente con caché en disco en vez de una
  Function por tile.

## 9. Agregar otro servicio

1. Agregar una entrada en `server/proxy/services.js` con `buildUrl`,
   `params`, `defaults`, `validate` y `maxBytes`.
2. Agregar el validador en `server/proxy/validate.js`.
3. Agregar tests en `server/proxy/__tests__/`.
4. Documentar el `source` y un ejemplo en este archivo.

No agregar un servicio que acepte una URL del cliente. Si el upstream
necesita un token, se inyecta en `buildUrl`/headers del servidor y nunca se
reenvía desde el navegador.

## 10. Verificación realizada

- `GetCapabilities` de Copernicus: capas `NDVI`, `TRUE-COLOR-S2L2A`,
  `NATURAL-COLOR`, `FALSE-COLOR`, `AGRICULTURE`, `GEOLOGY`, `MOISTURE-INDEX`,
  `SWIR`, `EVI`, `EVI2`, `GNDVI`, `SAVI`, `MSAVI2`, `VARI`, `MCARI`, `PSRI`,
  `NDYI`, `ARI_1`, `NDWI`, `NDCI`, `MSI`, `MDMI`, `WIW`.
- WMS `GetMap`: 200, `image/png`.
- WMS `GetFeatureInfo`: 200, `application/json`, con `out1..out4`.
- WFS `GetFeature`: 200, `application/json`, footprints L2A.
- WFS enero/febrero 2019: 12 fechas por mes en el viewport de prueba.
- WMS `TIME=2019-01-04/2019-01-04`: 200, `image/png` con imagen histórica.
- Worldview Snapshot: 200, `image/jpeg` 512×512.
- CORS upstream: `*` en Copernicus y Worldview.
