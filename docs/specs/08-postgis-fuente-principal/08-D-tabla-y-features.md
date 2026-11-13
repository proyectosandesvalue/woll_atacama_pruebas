# Spec 08-D — Tabla de atributos server-side y features

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 08-D |
| **Estado de la spec** | EN EJECUCIÓN (API de búsqueda/orden/filtro/total y feature puntual ✅; paginación en la UI pendiente) |
| **Tamaño** | Mediano-grande |
| **Duración estimada** | 6 h |
| **Dependencias** | 08-B (tabla y endpoint base), 08-C (capas migradas) |
| **Última revisión** | 2026-11-13 |

## 1. Objetivo y contexto

La tabla de atributos de una capa con tiles ya no descarga el GeoJSON: usa
`/api/layer-features` para traer propiedades. Este tramo completa el contrato
del endpoint (búsqueda, orden, filtro y total) y agrega el feature puntual con
geometría para que el clic en una fila haga zoom y resalte.

La UI actual sigue cargando hasta 5.000 propiedades y pagina en cliente; todas
las capas actuales caben en ese límite. La paginación visual server-side queda
para cuando exista una capa mayor (o para el cierre de 08-D).

## 2. Alcance

**Dentro**
- `GET /api/layer-features` con `limit`, `offset`, `search`, `search_field`,
  `sort`, `order`, `filter` y `total`.
- `GET /api/layer-feature` con geometría por `id`/`id_column`.
- Filtro validado y parametrizado (mismo contrato que 08-E).
- Clic en fila de la tabla: pide geometría y hace `fitBounds` + highlight.
- Tests unitarios del handler.

**Fuera**
- Paginación visual/infinita server-side (la tabla ya pagina en cliente).
- Orden por clic en el encabezado (se puede agregar sin cambiar el contrato).
- Filtro por bbox (08-F/11).
- Cluster/heatmap server-side (08-F).
- Endpoint de extent (se usa el bbox del manifest).

## 3. Contrato de `layer-features`

```
GET /api/layer-features?layer_id=<id>
    [&limit=1..5000] [&offset>=0]
    [&search=<texto>] [&search_field=<columna>]
    [&sort=<columna>] [&order=asc|desc]
    [&filter=<json>] [&include_geometry=0|1]
```

Respuesta:

```json
{
  "type": "FeatureCollection",
  "features": [{ "type": "Feature", "geometry": null, "properties": {} }],
  "layer_id": "borde_costero",
  "total": 382,
  "limit": 500,
  "offset": 0,
  "include_geometry": false,
  "returned": 382,
  "sort": "ZONA_1",
  "order": "desc"
}
```

- `total` es el conteo del conjunto **filtrado/buscado**, no del viewport.
- `search` hace `ILIKE` sobre todas las columnas (o solo `search_field`).
- `sort`/`order` validan la columna contra la tabla; sin `sort` se ordena por
  `fid`/`gid`/`id`, o `ctid`.
- `filter` es el mismo de 08-E; columnas y operadores en allowlist.
- Sin geometría por defecto. Con `include_geometry=1` se usa `ST_AsGeoJSON`.

## 4. Contrato de `layer-feature`

```
GET /api/layer-feature?layer_id=<id>&id=<valor>[&id_column=fid]
```

- Devuelve **una** Feature con geometría y propiedades.
- `id_column` se valida contra las columnas; por defecto `fid`/`gid`/`id`.
- 404 si no existe; 400 si la columna no es válida.

La tabla lo usa al hacer clic en una fila cuando `geometry` es `null`:

1. Toma `configCapa.source.idColumn` y el valor de la fila.
2. Pide `/api/layer-feature`.
3. Hace `fitBounds` con Turf y dibuja el highlight.

## 5. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | `borde_costero` | `limit=2` | `total=382`, `returned=2` | `curl` |
| CA-2 | `search=ZP` | se consulta | `total=39` (coincidencias parciales) | `curl` |
| CA-3 | filtro `ZONA_1 in ["ZP"]` | se consulta | `total=11` | `curl` + SQL |
| CA-4 | `sort=ZONA_1&order=desc` | se consulta | primera fila `ZPQ` | `curl` |
| CA-5 | un `fid` | se pide `/api/layer-feature` | Feature con `MultiPolygon` | `curl` |
| CA-6 | una columna inválida | se consulta | 400, sin SQL del cliente | test |
| CA-7 | tabla abierta | se hace clic en una fila | se pide el detalle y se resalta/zoomea | manual + Network |
| CA-8 | tabla abierta | se busca/filtra | el conteo coincide con el endpoint | manual |
| CA-9 | capa de 2.662 features | se abre la tabla | carga completa con `total=2662` | manual |

## 6. Tests

- `server/handlers/__tests__/layer-features.test.js`:
  - 400/404, sin geometría por defecto, `include_geometry`, búsqueda + orden +
    filtro con parámetros, tabla inválida.
  - `layer-feature`: feature con geometría, 404, columna de id inválida.
- Manual: tabla de `borde_costero` (382), clic en fila (detalle 200), búsqueda
  y filtro.

## 7. Seguridad

- Columnas de búsqueda/orden/filtro validadas contra la tabla real.
- Valores parametrizados; la tabla física se cita.
- `id` se compara como texto (`::text`) para aceptar ids numéricos o strings.
- Sin geometría por defecto reduce el payload; el detalle pide una sola feature.

## 8. Pendiente / próximos pasos

1. Paginación visual server-side (si una capa supera 5.000 features).
2. Orden por clic en encabezados.
3. Filtro por bbox y endpoint de extent.
4. Agregados de cluster/heatmap (08-F).
5. `search` con índice trigram si el volumen crece.

## 9. Cierre

- Horas reales: 3.
- Desvíos: la tabla actual pagina en cliente; se priorizó el contrato y el
  detalle puntual sobre reescribir la tabla completa.
- Lecciones: el conteo del filtro debe venir del servidor para no mostrar el
  total del GeoJSON; el detalle puntual evita traer 30 MB de geometría.
