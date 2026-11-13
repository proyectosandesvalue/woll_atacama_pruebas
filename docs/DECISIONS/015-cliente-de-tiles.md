# ADR 015 — Cliente de tiles vectoriales en el visor

| Campo | Valor |
|---|---|
| Estado | Aceptada para el piloto 08-B |
| Fecha | 2026-11-13 |
| Origen | Sprint 08-B |
| Relacionado | ADR 012 (servicio de tiles), Leaflet 1.9.4 |

## Contexto

El visor usa Leaflet 1.9.4 sin build step y ya tiene capas GeoJSON, glify
(WebGL) y WMS. Para 08-B hay que pintar MVT pregenerados y conservar popups,
zoom, filtros, tabla y orden z. Opciones:

| Opción | Peso | Leaflet 1.9 | Popups/filtros | Build |
|---|---|---|---|---|
| `leaflet.vectorgrid` 1.3.0 | ~48 KB | Sí, con shim | Canvas por tile; eventos por feature | No |
| `leaflet.maplibre-gl` / MapLibre | ~800 KB | No es Leaflet nativo | Requiere otra API de capas | No, pero reemplaza el mapa |
| Decodificar MVT a mano (`pbf` + `@mapbox/vector-tile`) | ~40 KB | Sí | Habría que implementar render e hit-testing | No |
| Martin/Mapbox GL | Servicio extra | No | — | — |

## Decisión

1. Usar **`leaflet.vectorgrid@1.3.0` vendorizado** en
   `js/lib/Leaflet.VectorGrid-1.3.0.min.js` (licencia Beerware).
2. Parchear la llamada a `L.DomEvent.fakeStop` (eliminada en Leaflet 1.9) para
   que el clic marque `originalEvent._stopped` y no cierre el sidebar. Se deja
   además un shim defensivo en `vectorTileUtils.js`.
3. Crear la capa en **`overlayPane`**, no en `tilePane`, para que comparta el
   orden z con las capas SVG y `bringToFront` funcione. El mapa base queda
   debajo.
4. Limitar la carga al **bbox del manifest** (`bounds`) y usar
   `maxNativeZoom` para el sobrezoom.
5. Renderer `L.canvas.tile`; estilos por `properties`, con `dataFilter` y
   `hiddenAttributes` evaluados en cada render.
6. El GeoJSON sigue siendo el fallback si el manifest o los tiles fallan.

## Consecuencias

**Positivas**
- No se agrega build ni se cambia Leaflet.
- Los popups y filtros se resuelven con la API de eventos de la librería.
- El cliente solo pide tiles del bbox y del viewport.

**Negativas**
- La librería está sin mantenimiento desde 2017; el shim es necesario.
- El bundle no tiene source map ni tipos.
- Los tiles de puntos no se usan en el piloto; la librería no resuelve iconos
  complejos como el renderer GeoJSON.

## Validación

- `borde_costero` carga 3 tiles en z8 (todos 200), sin descargar el GeoJSON.
- El clic abre el sidebar con `ZONA_1`, `MACROZONIF`, etc.
- Tabla: 382 features desde PostGIS; filtro `ZP`: 11 (coincide con SQL).
- CSV: 382 filas.
- `npm test`: 334 tests, 0 fallos; `npm run lint`: 0 errores.

## Pendiente

- Evaluar una librería más moderna si hay que migrar a Leaflet 2 o MapLibre
  (Sprint 10).
- Prueba de accesibilidad del canvas (teclado/lectores) en 08-D.
