# Spec 08-A — Pipeline de tiles pregenerados, manifest y Nginx

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 08-A |
| **Estado de la spec** | EN EJECUCIÓN (pipeline y Nginx ✅; esqueleto on-demand pendiente) |
| **Tamaño** | Grande |
| **Duración estimada** | 10 h |
| **Dependencias** | 08-0, Sprint 26 (PostgreSQL/PostGIS, Nginx) |
| **Última revisión** | 2026-11-13 |

## 1. Objetivo y contexto

Construir el camino offline que convierte una tabla PostGIS en una versión
inmutable de tiles MVT servida por Nginx, sin que el runtime consulte
PostgreSQL. El pipeline debe ser repetible por capa y por edición, dejar un
manifest verificable y permitir que el visor arme la URL de tiles desde la
configuración.

Este tramo no integra todavía el cliente de tiles en el visor (08-B) ni los
endpoints de tabla/agregados (08-D/F). Entrega la infraestructura y el contrato.

## 2. Alcance

**Dentro**
- `scripts/build-tiles.mjs`: generador MVT por capa, zoom y versión.
- `scripts/tiles-sync.mjs`: publicación por lote, detección de cambios, índice,
  verificación y retención (detalle en 08-G).
- Manifest por versión con bbox, zooms, features, columnas, bytes y checksum.
- Índice global `tiles/index.json`.
- Ruta `/tiles/` en Nginx con MIME correcto, gzip y caché inmutable.
- `.gitignore`/`.dockerignore` para no versionar ni empaquetar tiles.
- Tests unitarios del generador y de `tiles-sync`.
- Scripts npm `tiles:build`, `tiles:sync`, `tiles:check`.

**Fuera**
- Cliente de tiles en el navegador (08-B) y decisión de librería (ADR 015).
- Endpoints `/api/layers/:id/*` (08-D/F).
- Generación on-demand y su caché (se implementa cuando exista una capa
  dinámica; el contrato queda en la spec madre §10.3).
- Panel admin y automatización por systemd (Sprint 16/26-J).

## 3. Reglas del CONTRACT que aplican

| Regla | Implicancia |
|---|---|
| Sin build step | Los tiles son archivos estáticos; no se agrega bundler ni runtime nuevo |
| Sin secretos en el frontend | La URL de tiles es pública; la cadena de conexión solo existe en scripts/API |
| La BD no se expone | Nginx sirve archivos; no hay proxy a PostgreSQL en `/tiles/` |
| Reversión por capa | La config apunta a una versión; volver atrás es cambiar `version` |
| Datos no confiables | Los `properties` del tile se tratan como datos al renderizar popups/tabla |
| Tests por feature | Generador y sync tienen tests `node:test` |

## 4. Contrato de datos

### 4.1. Directorio y versiones

```
tiles/
  index.json
  <layer_id>/
    <version>/
      manifest.json
      <z>/<x>/<y>.mvt
```

- `layer_id` y `version` solo admiten `[A-Za-z0-9._-]` / `[a-z0-9_]`.
- Una versión con `manifest.json` **no se sobrescribe** salvo `--overwrite` /
  `--force`.
- La versión anterior se conserva hasta aplicar retención (`--prune`).

### 4.2. Manifest

```json
{
  "layer_id": "borde_costero",
  "version": "2026",
  "physical_table": "public.borde_costero",
  "geometry_type": "MULTIPOLYGON",
  "srid": 4326,
  "bbox": { "minx": -71.62, "miny": -29.18, "maxx": -70.35, "maxy": -25.99 },
  "feature_count": 382,
  "minzoom": 0,
  "maxzoom": 14,
  "maxzoom_requested": 14,
  "columns": ["id", "fid", "ZONA_1", "GLOSA"],
  "feature_id": "fid",
  "simplified": true,
  "generated_at": "2026-11-13T03:58:11.000Z",
  "tile_url_template": "/tiles/borde_costero/2026/{z}/{x}/{y}.mvt",
  "tiles": 2887,
  "bytes": 8180211,
  "checksum": "<sha256>"
}
```

- `checksum` es SHA-256 sobre la metadata estable (capa, versión, bbox, zooms)
  más la lista ordenada `z/x/y:bytes`. Detecta tiles faltantes o alterados.
- `maxzoom` es el zoom efectivamente publicado; `maxzoom_requested` conserva el
  pedido original cuando el límite de tiles obligó a bajar un zoom.

### 4.3. Índice global

`tiles/index.json` lista todas las capas y versiones publicadas, con la versión
activa (la más reciente por `generated_at`) y los datos del manifest. Es la
fuente para que `/api/config` (Sprint 07) o el panel admin (Sprint 16) resuelvan
la URL sin hardcodear versiones.

### 4.4. Configuración de la capa

```json
{
  "source": {
    "type": "postgis",
    "table": "public.borde_costero",
    "geometry_column": "geom",
    "srid": 4326,
    "tiles": {
      "mode": "static",
      "version": "2026",
      "url_template": "/tiles/borde_costero/2026/{z}/{x}/{y}.mvt",
      "manifest": "/tiles/borde_costero/2026/manifest.json",
      "minzoom": 0,
      "maxzoom": 14
    },
    "fallback": { "type": "geojson", "url": "geojson/borde_costero.geojson" }
  }
}
```

`npm run tiles:build -- --layer X --version V --publish` imprime este snippet.

### 4.5. Comandos

| Comando | Qué hace |
|---|---|
| `npm run tiles:build -- --layer <id> --version <v> [--minzoom] [--maxzoom] [--workers] [--out]` | Genera una capa/versión |
| `npm run tiles:sync -- --changed` | Publica capas nuevas o editadas |
| `npm run tiles:sync -- --layer <id> --version <v>` | Publica una capa puntual |
| `npm run tiles:check` | Verifica manifests, archivos y conteo en la BD |
| `npm run tiles:sync -- --index` | Regenera `tiles/index.json` |
| `npm run tiles:sync -- --prune --keep 2` | Retención de versiones |

Variables: `DATABASE_ADMIN_URL` (preferida) o `DATABASE_URL`. El generador crea
tablas temporales, así que necesita un rol con permiso de `CREATE TEMP TABLE`.

### 4.6. Nginx

```nginx
location ^~ /tiles/ {
    default_type application/vnd.mapbox-vector-tile;
    add_header Cache-Control "public, max-age=31536000, immutable";
    add_header X-Content-Type-Options "nosniff" always;
    access_log off;
    try_files $uri =404;
}
```

`gzip_types` incluye `application/vnd.mapbox-vector-tile` en dev y producción.
La ruta se sirve desde el bind mount `/srv/woll` (dev y VPS). No hay proxy a la
API ni a PostgreSQL.

## 5. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | una tabla PostGIS 4326 | se ejecuta `tiles:build` | genera `tiles/<layer>/<version>/...` y un manifest con checksum | test de integración |
| CA-2 | una capa poligonal pesada | se genera z0–z14 | el cliente descarga menos bytes que el GeoJSON completo | medición 08-0 |
| CA-3 | una capa regional | z14 supera 20.000 tiles | publica hasta z13 y lo informa, sin abortar | log + manifest |
| CA-4 | una versión ya publicada | se intenta regenerar sin `--overwrite` | falla con mensaje claro | test |
| CA-5 | un tile estático | se pide por Nginx | responde 200, MIME MVT, `Cache-Control: immutable` y gzip | `curl -I` |
| CA-6 | un tile inexistente | se pide por Nginx | responde 404, no el `index.html` | `curl` |
| CA-7 | PostgreSQL detenido | se pide un tile ya generado | Nginx sigue respondiendo 200 | prueba manual |
| CA-8 | un manifest | se ejecuta `tiles:check` | valida tiles, bytes, checksum y conteo de features | test/CLI |
| CA-9 | `tiles/index.json` | se publica una versión nueva | la lista como activa y conserva la anterior | inspección |
| CA-10 | una versión antigua | se ejecuta `--prune --keep 2` | conserva las 2 más recientes y borra el resto | test |

## 6. Plan por sub-tramo

| Sub-tramo | Contenido | Horas | Estado |
|---|---|---|---|
| 08-A.1 | Generador MVT: resolución de tabla/geometría/columnas, simplificación, manifest | 4 | ✅ |
| 08-A.2 | Optimización por zoom con geometría materializada y candidatos por cobertura | 2 | ✅ |
| 08-A.3 | Nginx `/tiles/`, gzip, `.gitignore`/`.dockerignore` | 1 | ✅ |
| 08-A.4 | Tests unitarios y de integración | 1 | ✅ |
| 08-A.5 | Esqueleto on-demand y caché (solo contrato) | 2 | ⏳ |

## 7. Tests requeridos

- **Unitarios** (`scripts/__tests__/build-tiles.test.js`): cálculo de tiles,
  tolerancia por zoom, maxzoom por tipo, manifest/checksum, validación de args,
  formato de versión.
- **Integración** (opt-in con `TILES_TEST_DATABASE_URL`): genera una capa real
  en z6, verifica manifest y tiles en disco.
- **Manual/CLI**: `tiles:check` sobre una versión publicada; corte de PostgreSQL
  para CA-7.
- **Regresión**: `npm test` incluye `scripts/**/*.test.js`.

## 8. Seguridad y procedencia

- Nombres de tabla, columnas y versiones se validan y citan; no se concatena SQL
  del cliente.
- Los tiles se sirven solo desde el directorio versionado; `try_files` evita el
  fallback a la SPA y Nginx normaliza el path (probado con `%2e%2e` → 400).
- `DATABASE_ADMIN_URL` no se expone al navegador ni a la imagen de la API.
- Los `properties` del tile son datos no confiables al renderizar.

## 9. Preguntas abiertas

| # | Pregunta | Default | ¿Bloquea? |
|---|---|---|---|
| A1 | ¿PMTiles en vez de archivos `z/x/y`? | No: los archivos medidos caben en disco y Nginx los sirve sin runtime | no |
| A2 | ¿Zoom máximo por tipo? | 14 polígonos/líneas, 12 puntos, con degradación por límite | no |
| A3 | ¿Se generan tiles de puntos? | No por defecto; GeoJSON + API | no |
| A4 | ¿Dónde se genera en producción? | En el VPS o en desarrollo + `rsync`; offline en ambos casos | no |

## 10. Riesgos, reversión y documentación

- **Riesgo:** demasiados archivos pequeños. **Mitigación:** límite de tiles,
  degradación de zoom y retención de versiones.
- **Riesgo:** tiles obsoletos tras una edición. **Mitigación:** 08-G detecta
  `updated_at` y publica una versión nueva.
- **Reversión:** apagar la ruta `/tiles/` o cambiar `source.type` a `geojson`;
  ninguna capa del visor usa tiles todavía.
- **Docs:** `docs/DEV_GUIDE.md` (comandos), `docs/ARCHITECTURE.md` (§7 caché),
  `docs/CHANGELOG.md`.

## 11. Puntos de integración

- **08-B:** consume `source.tiles.url_template` y el manifest.
- **08-D/F:** tabla, búsqueda, agregados y export usan los endpoints, no los tiles.
- **Sprint 07:** `/api/config` puede resolver la versión activa desde
  `tiles/index.json`.
- **Sprint 16:** el alta de capas llama a `tiles:sync`.
- **26-J:** un timer puede ejecutar `tiles:sync --changed` y `--prune`.

## 12. Cierre

- Horas reales: 7 de 10 (falta on-demand).
- Desvíos: la optimización por zoom y el maxzoom adaptativo no estaban en el
  plan original; agregaron ~2 h y evitaron abortar capas regionales.
- Lecciones: el generador debe medir cobertura real, no bbox; el límite de tiles
  tiene que degradar el zoom; los puntos no van a tiles.
