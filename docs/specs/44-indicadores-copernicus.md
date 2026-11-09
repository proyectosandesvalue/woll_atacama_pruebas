# Spec 44 — Catálogo de indicadores satelitales Copernicus

| Campo | Valor |
|---|---|
| Sprint (ROADMAP) | 44 |
| Estado de la spec | CERRADA |
| Tamaño | Mediano |
| Duración estimada | 8–10 h |
| Dependencias | Proxy de servicios externos (2026-11-06) |
| Última revisión | 2026-11-09 |

> **Nota de cierre.** Esta spec se documenta al cierre. El catálogo se implementó como una extensión no planificada del proxy Copernicus, a pedido del equipo, y se registra aquí para dejar el alcance, los criterios y las decisiones en el lugar que corresponde.

## 1. Objetivo y contexto

El visor ya consumía cuatro capas Copernicus (NDVI, AGRICULTURE, TRUE-COLOR-S2L2A y MOISTURE-INDEX) a través de `/api/proxy`. El equipo pidió ampliar el catálogo para monitoreo agrícola, hídrico y de humedad, y poder comparar con imágenes de años anteriores.

La extensión agrega **16 indicadores** con ficha divulgativa, leyenda y selector de fecha. El selector consulta la disponibilidad real por WFS y permite navegar hasta **2017-01-01**, fecha de inicio del archivo L2A usado por las capas.

## 2. Alcance

**Dentro**

- 16 capas nuevas:
  - Agricultura: `EVI`, `EVI2`, `GNDVI`, `SAVI`, `MSAVI2`, `VARI`, `MCARI`, `PSRI`, `NDYI`, `ARI_1`.
  - Clima: `MSI`, `MDMI`.
  - Agua: `NDWI`, `NDCI`, `WIW`.
  - Minería: `SWIR`.
- Ficha por capa: título, descripción para no especialistas, rango, bandas RGB, nota y leyenda (`gradient`, `note` o `items`).
- Grupo “Satélite (Copernicus)” en cada dimensión.
- Helper común `js/config/copernicusLayer.js` y factory `copernicus()` en `js/config/wms_services.js`.
- Selector de fecha histórico:
  - Disponibilidad WFS por mes visible y meses vecinos.
  - Caché de 5 minutos por mes + bbox.
  - Marcas azules en el calendario y leyenda con el número de fechas.
  - `wmsHistoryStart: "2017-01-01"` por defecto.
  - `TIME=YYYY-MM-DD/YYYY-MM-DD` en `GetMap` y `GetFeatureInfo`.
- Test de configuración `server/config/copernicus-layers.test.js`.
- Proxy persistente local (`scripts/dev-proxy.mjs`, `npm run dev`) para no ejecutar una Function por tile.

**Fuera**

- `BATHYMETRIC`, `GEOLOGY`, `NATURAL-COLOR`, `FALSE-COLOR` y `FALSE-COLOR-URBAN`: descartadas por el equipo.
- Valores numéricos del índice por píxel (Statistical API). El WMS entrega RGB y el panel lo explica.
- Comparador lado a lado o “swipe” de dos fechas. Queda como mejora futura.
- Cambios en la allowlist del proxy o nuevos servicios upstream.

## 3. Reglas del CONTRACT que aplican

| Regla | Implicancia |
|---|---|
| §5.5 Proxy cerrado | Se reutilizan `copernicus-wms` y `copernicus-wfs`; no se agrega una URL arbitraria ni un `source` nuevo. |
| §2/Plano 3 (secretos) | `INSTANCE_ID` y `CLIENT_SECRET` siguen solo en el servidor. El navegador usa `/api/proxy`. |
| §4 (timeouts y llamadas externas) | WFS/WMS pasan por el proxy con timeout y las consultas del selector son abortables. |
| §9 (tests) | La feature agrega tests `node:test` de configuración y validación de servicios. |

## 4. Contrato de datos / API

No hay cambios de schema, tablas, RPCs ni endpoints.

**Servicios** (`js/config/wms_services.js`)

- Clave `copernicus_<indicador>`.
- Factory `copernicus(layer, nombre)` con:
  - `url = ${PROXY_URL}?source=copernicus-wms&MAXCC=30`
  - `format: image/png`, `transparent: true`, `version: 1.3.0`
  - `tileSize: 512`, `maxNativeZoom: 16`, `keepBuffer: 1`
  - `updateWhenIdle: true`, `updateWhenZooming: false`

**Capas** (`js/config/<dimension>.js`)

- `tipo: "wms"`, `servicio: "copernicus_<indicador>"`.
- `wmsDateSelector: true`.
- `wmsCollection: "DSS1" | "DSS2"`.
- `wmsMaxcc: 30`, `wmsDateRangeDays: 180`, `wmsHistoryStart: "2017-01-01"`.
- `wmsFeatureInfo`: `kind: "rgb"`, `title`, `description`, `range`, `bands`, `note`.
- `wmsLegend`: `gradient`, `note` o `items`.

**WFS de disponibilidad**

- `GetFeature` con `TYPENAMES=DSS1|DSS2`, `BBOX`, `TIME`, `MAXFEATURES=100`, `FEATURE_OFFSET`, `MAXCC=30`.
- La fecha se lee de `feature.properties.date` (`YYYY-MM-DD`).
- Paginación secuencial; el WFS limita a 100 features por request.

**WMS**

- `GetMap` y `GetFeatureInfo` reciben `TIME=YYYY-MM-DD/YYYY-MM-DD` cuando hay fecha seleccionada.
- `wmsFeatureInfo.js` lee `layer.wmsParams.TIME` para que el píxel corresponda a la imagen visible.

**Decisiones de ficha**

- `MDMI`: `(B08 - B11) / (B08 + B11)`; tres clases en `-0.4` y `0.1`; leyenda `items`.
- `ARI_1`: rango de referencia `0–0.2` según el artículo original; leyenda verde → púrpura.
- `WIW`: clasificación binaria con `B8A < 0.1804` y `B12 < 0.1131`; leyenda `note`.
- `SWIR`: composición `12, 11, 4` según `GetCapabilities`; pendiente confirmar si el evalscript usa `B08A`.

## 5. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | Una dimensión con capas Copernicus | Se abre el visor | Las 16 capas aparecen en “Satélite (Copernicus)” con su nombre | Manual / test de config |
| CA-2 | Una capa nueva | Se abre su ficha | Tiene título, descripción, rango, bandas, nota y leyenda | Test `copernicus-layers.test.js` |
| CA-3 | Una capa con `wmsDateSelector` | Se abre el calendario | Se consulta WFS y se marcan en azul los días con imágenes | Manual / red |
| CA-4 | El calendario abierto | Se navega a 2019 | Se cargan las fechas del mes y la leyenda muestra el conteo | Manual (probado enero/febrero 2019) |
| CA-5 | Una fecha histórica seleccionada | Se redibuja la capa | `GetMap` envía `TIME=fecha/fecha` y devuelve 200 | Red / manual |
| CA-6 | Una fecha histórica seleccionada | Se hace clic en un píxel | `GetFeatureInfo` usa el mismo `TIME` | Código / manual |
| CA-7 | Cambio de mes o año | Se navega con flechas o selector | Se consulta el mes correcto y se actualiza la leyenda | Manual |
| CA-8 | Cambio de viewport | Se reabre el calendario | Se invalidan las fechas del bbox anterior | Código / manual |

## 6. Plan por sub-sprint

| Tramo | Contenido | Horas | Estado |
|---|---|---|---|
| 44-A | Servicios y helper `copernicusLayer.js`; capas y grupos | 3 h | ✅ |
| 44-B | Fichas, rangos, leyendas y textos divulgativos | 2 h | ✅ |
| 44-C | Selector histórico, WFS por mes, caché y marcas | 2–3 h | ✅ |
| 44-D | Tests, lint, documentación y verificación manual | 1–2 h | ✅ |

## 7. Tests requeridos

- `server/config/copernicus-layers.test.js`:
  - Toda capa Copernicus tiene ficha, leyenda, servicio, `capas` y grupo.
  - Las 16 capas nuevas apuntan al layer WMS correcto.
- `npm run lint` sin errores.
- Verificación manual en navegador:
  - NDVI/EVI, calendario de enero y febrero de 2019.
  - `TIME=2019-01-04/2019-01-04` en `GetMap` (200).
  - Panel de píxel con fecha/escena coherente.

## 8. Seguridad y procedencia

- No se agregan secretos ni se exponen identificadores.
- Las consultas WFS las arma el frontend con parámetros acotados; el proxy valida la allowlist y los tipos.
- Solo lectura: WMS/WFS no escriben datos.
- `MAXCC=30` acota las escenas; el bbox se limita a la vista actual.

## 9. Preguntas abiertas

| # | Pregunta | Default | ¿Bloquea? |
|---|---|---|---|
| R1 | ¿La composición `SWIR` usa B11 o B08A en su evalscript? | B11, según `GetCapabilities` de la instancia (“bands 12,11,4”) | No |
| R2 | ¿Se necesita un comparador de dos fechas lado a lado? | Fuera de alcance; mejora futura | No |

## 10. Riesgos, reversión y documentación

- **Riesgo:** el WFS puede tardar en viewports muy amplios (paginación de 100 features). Mitigación: caché por mes, 3 páginas máximo y aborto al cambiar de mes.
- **Riesgo:** una capa nueva puede no tener archivo histórico aunque el WFS marque fechas. Mitigación: la ficha y la prueba visual; si ocurre, se ajusta `wmsHistoryStart`.
- **Reversión:** quitar las entradas de `wms_services.js`, las capas de la dimensión y el ítem del test. No hay migraciones ni datos que revertir.
- **Documentación:** `docs/CHANGELOG.md`, `docs/ARCHITECTURE.md` §3, `docs/DEV_GUIDE.md` §3.8, `README.md`, `AGENTS.md` y esta spec.

## 11. Puntos de integración

- Proxy `copernicus-wms` / `copernicus-wfs` y `docs/integrations/proxy-servicios-externos.md`.
- `js/utils/copernicusDateSelector.js` y `wmsFeatureInfo.js`.
- `js/utils/legendUtils.js` (`items` para MDMI y notas para SWIR/WIW).
- `js/config/allTemasConfig.js` (las dimensiones ya están registradas).
- **Catálogo del chat:** `npm run catalog` recorre `allTemasConfig`; las capas WMS no tienen tabla física y se excluyen en `scripts/build_catalog.mjs` (`tipo/type === "wms"`).

## 12. Cierre

- **Horas reales:** ~8–10 h (catálogo, fichas, selector histórico, pruebas y documentación).
- **Desvíos:** se implementó sin spec previa por ser una extensión directa del proxy; se agrega el comparador de fechas como mejora futura y queda pendiente confirmar las bandas exactas de `SWIR`.
- **Lecciones:** documentar la ficha y el rango junto con la capa; confirmar las bandas del evalscript antes de escribir la leyenda; el WFS devuelve como máximo 100 features por request y ordena por fecha descendente, así que el selector debe paginar o acotar el rango.
