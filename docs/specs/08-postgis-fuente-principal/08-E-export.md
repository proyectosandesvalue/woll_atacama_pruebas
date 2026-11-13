# Spec 08-E — Exportación GeoJSON/CSV desde PostGIS

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 08-E |
| **Estado de la spec** | CERRADA (streaming GeoJSON/CSV, filtros y columnas visibles) |
| **Tamaño** | Mediano |
| **Duración estimada** | 4 h |
| **Dependencias** | 08-B (visor y endpoint de features), 08-C (capas con tiles) |
| **Última revisión** | 2026-11-13 |

## 1. Objetivo y contexto

La descarga de una capa migrada no puede usar el GeoJSON estático: ese archivo
puede tener otro conteo (450 vs 382 en `borde_costero`) y no respeta el filtro
activo. Este tramo agrega un endpoint que lee la tabla física, aplica el mismo
filtro que la tabla y escribe GeoJSON/CSV **en streaming**, sin armar el archivo
completo en memoria.

El visor usa el endpoint cuando la capa tiene `source.type: "postgis"` y la API
está disponible; en Vercel (demo congelada) cae al archivo estático o al CSV
generado en cliente.

## 2. Alcance

**Dentro**
- `GET /api/layer-export` con `format=geojson|csv`.
- Filtro validado y parametrizado (mismo `dataFilter` del visor).
- CSV con las columnas visibles de la tabla y sus alias.
- Streaming por lotes (40 features para GeoJSON, 200 filas para CSV).
- Fallback del frontend al archivo estático/cliente si la API no existe.
- gzip de Nginx para `application/geo+json` y `text/csv`.

**Fuera**
- Búsqueda y orden server-side (08-D).
- Export de capas no migradas (siguen con su GeoJSON).
- Descarga en otros formatos (Shapefile, GeoPackage).
- Compresión en el cliente o reanudación de descargas.

## 3. Contrato del endpoint

```
GET /api/layer-export?layer_id=<id>&format=geojson|csv
    [&filter=<json>] [&columns=<json>] [&labels=<json>]
```

- `layer_id` se valida contra `chat.chat_catalog` (habilitada).
- `filter` usa el contrato de 08-D:
  `{ "op": "and", "conditions": [{ "column": "ZONA_1", "operator": "in", "value": ["ZP"] }] }`.
  Operadores: `=`, `!=`, `>`, `>=`, `<`, `<=`, `in`, `contains`.
  Columnas validadas contra la tabla; valores parametrizados.
- `columns` y `labels` son arrays JSON; si no se envían, el CSV exporta todas
  las columnas no-geométricas con su nombre técnico.
- GeoJSON incluye geometría (`ST_AsGeoJSON`) y todas las propiedades.
- CSV: BOM UTF-8, delimitador `;`, comillas dobles escapadas, saltos de línea
  normalizados a espacio.
- `Content-Disposition: attachment` con el nombre de la capa.
- Sin `Content-Length`: la respuesta es un stream; `Cache-Control: no-store`.

### 3.1. Lotes y timeout

- GeoJSON: 40 features por consulta (geometrías grandes).
- CSV: 200 filas por consulta.
- El pool tiene `statement_timeout` de 5 s; con lotes chicos cada consulta
  queda muy por debajo. Un lote de 250 con `borde_costero` superaba el límite.

### 3.2. Frontend

`js/utils/downloadUtils.js`:
- `buildExportFilter()` traduce `dataFilter` a la especificación.
- `buildExportUrl()` agrega `filter`, `columns` y `labels`.
- `hasLayerApi()` prueba `/api/layer-features?limit=1`; si falla, usa el
  GeoJSON estático (GeoJSON) o el CSV en cliente (CSV).
- El CSV en cliente ahora aplica `dataFilter` (antes exportaba todo).

## 4. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | `borde_costero` | se descarga GeoJSON | tiene 382 features, no 450 | `jq '.features|length'` |
| CA-2 | filtro `ZONA_1=ZP` | se descarga GeoJSON | 11 features | `jq` |
| CA-3 | filtro `ZP` | se descarga CSV | 11 filas + encabezado | `wc -l` |
| CA-4 | tabla con alias | se descarga CSV | encabezados visibles (`Zona`, `Nombre de la Zona`) | `head -1` |
| CA-5 | filtro con columna inexistente (`geom`) | se llama el endpoint | 400, sin SQL | `curl` |
| CA-6 | API no disponible (Vercel) | se descarga | usa el archivo estático/cliente | manual |
| CA-7 | descarga grande | se ejecuta | no bloquea el event loop ni arma todo en memoria | `curl` + logs |
| CA-8 | `Accept-Encoding: gzip` | se descarga CSV/GeoJSON | Nginx comprime | `curl -D -` |

## 5. Tests

- Unitarios (`server/handlers/__tests__/layer-export.test.js`):
  filtros `in`/numéricos, columna/operador inválidos, JSON inválido,
  columnas/labels, escape CSV y streaming CSV/GeoJSON con DB mock.
- Manual: descargas con/sin filtro, alias, gzip y fallback.
- Regresión: `npm test` y `npm run lint`.

## 6. Seguridad

- Columnas y operadores en allowlist; sin concatenar SQL del cliente.
- `layer_id` validado contra el catálogo; tabla física citada.
- El stream no expone la cadena de conexión ni errores internos.
- `Cache-Control: no-store` para no guardar datos filtrados en caché.
- El CSV conserva el escape de comillas y saltos.

## 7. Riesgos y reversión

- **Riesgo:** descargas concurrentes grandes. **Mitigación:** lotes, timeout y
  Nginx; a futuro, límite de concurrencia o cola.
- **Riesgo:** el navegador no finaliza streams sin `Content-Length`.
  **Mitigación:** probado con `curl`; si un navegador lo requiere, se evalúa
  buffer o `Content-Length` calculado.
- **Reversión:** quitar el uso del endpoint en `downloadUtils`; los archivos
  estáticos siguen disponibles.

## 8. Puntos de integración

- **08-D:** reutiliza el compilador de filtros y la paginación.
- **08-F:** el export de agregados no aplica.
- **Sprint 16:** el panel admin puede ofrecer la misma descarga.
- **Vercel:** no tiene el endpoint; fallback explícito.

## 9. Cierre

- Horas reales: 3.
- Desvíos: el primer lote de 250 con geometría superaba el `statement_timeout`;
  se redujo a 40. El navegador in-app deja descargas grandes en `pending` sin
  `Content-Length`; `curl` confirma que el stream termina.
- Lecciones: el export debe compartir el compilador de filtros con la tabla y
  usar lotes chicos cuando hay geometría.
