# Spec 49 — Publicador de ráster precalculado

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 49 (nuevo, aprobado 2026-11-19) |
| **Estado de la spec** | CERRADA (local 2026-11-19; validación visual y carga/VPS pendientes) |
| **Tamaño** | Mediano |
| **Duración estimada** | 10-12 h |
| **Dependencias** | 08-G (versionado de tiles), 26-D (Nginx), 47 (gestor de capas); 41 para el consumo MCDA |
| **Última revisión** | 2026-11-19 |

> **Qué es esta spec.** Fija cómo se publica un ráster ya calculado en QGIS,
> GDAL o GRASS: validación, versión, tiles, manifiesto, índice, configuración y
> estadísticas. **No** define análisis de ráster: el servidor no calcula
> pendientes, sombras ni modelos multicriterio. Esa decisión está en el
> ADR 027; el MCDA vive en el Sprint 41 (ADR 017).

---

## 1. Objetivo y contexto

El visor necesita mostrar capas ráster que hoy no existen en el catálogo:
pendiente, orientación, sombra, aptitud de cultivo y, más adelante, modelos de
probabilidad de incendio. Esos productos se calculan **offline** en el equipo
del analista y se suben como resultado. El servidor solo los valida, versiona,
publica y sirve.

La meta es que una capa ráster se comporte como una capa vectorial publicada:
URL inmutable por versión, manifiesto con metadatos, índice global, rollback por
configuración y fallback controlado si falta el archivo. La diferencia es que
los tiles son imágenes (WebP/PNG), no MVT, y que la tabla/filtros por atributo
no aplican. Las estadísticas por comuna/provincia/región se calculan en QGIS y
se importan como CSV; se publican en una tabla de solo lectura para la ficha y,
más adelante, para el chat del Sprint 41.

## 2. Alcance

**Dentro del alcance**

- CLI `raster:publish`: valida un GeoTIFF/COG, copia la fuente a `data/raster/`,
  genera tiles WebP/PNG, escribe `manifest.json` y actualiza `raster/index.json`.
- CLI `raster:sync`: `--index`, `--check`, `--prune`, `--dry-run`.
- Contrato de versión inmutable: `raster/<layer_id>/<version>/`.
- Validación de CRS, bbox, tamaño, NoData, licencia, fuente y método.
- Límite de 20.000 tiles por capa, con degradación automática del `maxzoom`
  (misma regla que ADR 012).
- Nginx sirviendo `/raster/` con caché inmutable y `/raster/index.json` sin
  caché; la fuente COG queda privada bajo `data/` (ya denegado).
- Config `source.type: "raster"` y rama de carga en el visor con `L.tileLayer`.
- Ficha de metadatos: fuente, productor, método, fecha, resolución, licencia,
  atribución y, si es MCDA, criterios y pesos.
- Tabla `public.raster_stats` (migración `052`) y `GET /api/raster-stats`.
- Carga de estadísticas desde CSV calculado en QGIS. El servidor no calcula
  estadísticas zonales.
- Tests `node:test` de validación, manifiesto, índice, versionado y CSV.

**Fuera del alcance**

- Cálculo de pendiente, orientación, sombra, modelos de incendio o MCDA en el
  servidor. Eso se hace en QGIS/GDAL/GRASS.
- GeoServer, MapServer, QGIS Server, WMS/WCS/WMTS propios o titiler.
- Tiles COG on-demand en runtime.
- Edición de rásteres o reclasificación en el visor.
- Consulta de valor en un punto (`lat/lon`) en runtime; se evalúa si aparece un
  caso de uso.
- Criterios, pesos y validación experta del MCDA (Sprint 41 / ADR 017).
- Upload desde el panel admin. En este sprint se publica por CLI/SCP; el panel
  se integra después con el gestor de capas (Sprint 47/16).
- Herramienta del chat para consultar rásteres; el Sprint 41 la agrega cuando
  existan las recetas.

## 3. Reglas del CONTRACT que aplican

| Regla | Implicancia |
|---|---|
| §1.3 (un recurso, un lugar) | El manifest es la fuente de verdad de la versión; la config solo apunta a ella. No se duplican metadatos en dos sitios. |
| §1.5 (todo lo que no se testea se rompe) | Validación, manifest, índice, versionado y CSV con tests `node:test`. |
| §1.7 (fallback, INV-5) | Si falta el ráster o el manifest, la capa no se muestra y el visor sigue funcionando; no se cae el resto del mapa. |
| §2 (tres planos) | El ráster y su manifest son datos; la definición de la capa vive en la config/snapshot; no hay secretos en archivos públicos. |
| §4.5 (errores) | Mensajes genéricos al usuario; el detalle (ruta, GDAL) solo en logs del servidor. |
| §5.1 (migraciones) | `052_raster_stats.sql` idempotente; no se edita una migración aplicada. |
| §5.2 (RLS) | `public.raster_stats` es de solo lectura para `woll_api`; escribe el publicador con `DATABASE_ADMIN_URL`. |
| §5.3 (contratos de API) | `GET /api/raster-stats` devuelve `{ ok, data?, error? }`. |
| §5.4 (validación) | Se valida el archivo, el CRS, el bbox, el tamaño, la licencia y el CSV antes de publicar. |
| §6.3 (cero SQL del LLM) | El chat del Sprint 41 consultará estadísticas por RPC tipada; nunca álgebra de ráster. |
| §9.1 (tests) | Un test por función pura y una integración opt-in con GDAL. |

## 4. Contrato de datos / API

### 4.1. Estructura de archivos

```
data/raster/<layer_id>/<version>/source.tif      # privado, .gitignore, Nginx 404
raster/<layer_id>/<version>/manifest.json        # público
raster/<layer_id>/<version>/<z>/<x>/<y>.webp     # público, inmutable
raster/index.json                                # público, no-cache
```

- `data/` ya está denegado por Nginx y en `.gitignore`; el COG fuente nunca se
  sirve.
- `raster/` se agrega a `.gitignore` (los tiles se generan; no se versionan).
- El manifest público no contiene rutas absolutas ni secretos.
- La fuente se normaliza a COG con `gdal_translate -of COG` antes de generar
  tiles; si el archivo ya es COG, el paso es idempotente.

### 4.2. Manifest por versión

```json
{
  "layer_id": "aptitud_jojoba",
  "version": "2026-11",
  "name": "Aptitud para jojoba",
  "description": "Aptitud relativa 0-1 para plantación de jojoba en Atacama.",
  "source": {
    "file": "aptitud_jojoba.tif",
    "producer": "QGIS 3.40 / GDAL 3.9",
    "method": "Weighted overlay: pendiente 30%, orientación 20%, suelo 20%, clima 20%, restricciones 10%.",
    "created_at": "2026-11-18",
    "license": "Uso institucional; DEM Copernicus 30 m",
    "attribution": "WOLL Atacama"
  },
  "crs": "EPSG:4326",
  "bbox": [-71.5, -29.5, -68.2, -25.2],
  "resolution_m": 30,
  "width": 10000,
  "height": 12000,
  "nodata": -9999,
  "values": { "type": "float32", "min": 0, "max": 1 },
  "legend": {
    "type": "classes",
    "classes": [
      { "id": 0, "min": 0, "max": 0.2, "label": "No apta", "color": "#b23b3b" },
      { "id": 1, "min": 0.2, "max": 0.5, "label": "Marginal", "color": "#d9a441" },
      { "id": 2, "min": 0.5, "max": 0.8, "label": "Apta", "color": "#3f8f5a" },
      { "id": 3, "min": 0.8, "max": 1, "label": "Muy apta", "color": "#1f6f43" }
    ]
  },
  "model": {
    "id": "aptitud_jojoba",
    "version": "1.0",
    "criteria": [
      { "variable": "pendiente", "weight": 0.3, "source": "DEM 30 m" },
      { "variable": "orientacion", "weight": 0.2, "source": "DEM 30 m" }
    ],
    "constraints": ["areas_protegidas", "cuerpos_agua"]
  },
  "tiles": {
    "format": "webp",
    "minzoom": 8,
    "maxzoom": 13,
    "maxzoom_requested": 13,
    "count": 1234,
    "bytes": 4567890,
    "checksum": "sha256:…"
  },
  "generated_at": "2026-11-19T12:00:00.000Z",
  "checksum": "sha256:…"
}
```

- `source.license`, `source.producer`, `source.method` y `source.created_at` son
  obligatorios. Sin licencia no se publica.
- `model` es obligatorio si el ráster es un resultado MCDA; si no, se omite.
- `values` y `legend` son obligatorios: la ficha y la leyenda no se inventan en
  el cliente. Si no se pasa `--legend`, el publicador genera un gradiente
  neutro entre el mínimo y el máximo y lo deja registrado en el manifest.
- `checksum` cubre el COG fuente; `tiles.checksum` cubre el conjunto de tiles.

### 4.3. Índice global

`raster/index.json`:

```json
{
  "generated_at": "2026-11-19T12:00:00.000Z",
  "layers": [
    {
      "layer_id": "aptitud_jojoba",
      "active_version": "2026-11",
      "versions": [
        {
          "version": "2026-11",
          "manifest": "/raster/aptitud_jojoba/2026-11/manifest.json",
          "url_template": "/raster/aptitud_jojoba/2026-11/{z}/{x}/{y}.webp",
          "tiles": 1234,
          "bytes": 4567890,
          "checksum": "sha256:…",
          "bbox": [-71.5, -29.5, -68.2, -25.2],
          "minzoom": 8,
          "maxzoom": 13,
          "generated_at": "2026-11-19T12:00:00.000Z"
        }
      ]
    }
  ]
}
```

La versión activa del índice es la publicada más recientemente. El rollback se
hace en la config del visor, que puede apuntar a una versión explícita, igual
que en 08-G.

### 4.4. Config de la capa

```js
{
  nombre: "Aptitud para jojoba",
  tipo: "raster",
  source: {
    type: "raster",
    raster: {
      mode: "static",
      version: "2026-11",
      layerName: "aptitud_jojoba",
      urlTemplate: "/raster/aptitud_jojoba/2026-11/{z}/{x}/{y}.webp",
      manifest: "/raster/aptitud_jojoba/2026-11/manifest.json",
      minZoom: 8,
      maxZoom: 13,
      bounds: [[-29.5, -71.5], [-25.2, -68.2]],
      opacity: 0.75,
      attribution: "WOLL Atacama"
    }
  }
}
```

- `source.raster` evita colisión con `source.tiles` (MVT) y con WMS.
- El visor resuelve `bounds`, `minZoom`, `maxNativeZoom` y la leyenda desde el
  manifest; la config puede declarar `bounds` y zooms como fallback, pero el
  manifest manda.
- La definición se agrega también a `js/config/<dimension>.js` (autoría en
  código) para que el fallback `allTemasConfig` (INV-5) incluya la capa. Desde
  ahí se publica el snapshot con `npm run config:snapshot -- --publish` y se
  verifica con `npm run config:snapshot -- --check`.
- `configValidator` debe aceptar `tipo: "raster"` y exigir
  `source.raster.urlTemplate` y `source.raster.manifest`.

### 4.5. CLI

```bash
npm run raster:publish -- \
  --file ./aptitud_jojoba.tif \
  --layer aptitud_jojoba \
  --version 2026-11 \
  --name "Aptitud para jojoba" \
  --license "Uso institucional; DEM Copernicus 30 m" \
  --producer "QGIS 3.40 / GDAL 3.9" \
  --method "Weighted overlay: pendiente 30%, orientación 20%, suelo 20%, clima 20%, restricciones 10%." \
  --minzoom 8 --maxzoom 13 --format webp \
  --stats-csv ./aptitud_jojoba_stats.csv
```

Opciones mínimas:

| Opción | Default | Regla |
|---|---|---|
| `--file` | — | `.tif`/`.tiff`; firma TIFF válida; máx. `RASTER_MAX_MB` (2048). |
| `--layer` | — | slug `[a-z0-9_]+`; no puede salir de `raster/`. |
| `--version` | — | `[A-Za-z0-9._-]+`; una versión publicada no se sobrescribe sin `--force`. |
| `--name`, `--license`, `--producer`, `--method` | — | obligatorios; se copian al manifest. |
| `--description` | — | texto de la ficha. |
| `--attribution` | `WOLL Atacama` | atribución visible en el mapa. |
| `--legend` | gradiente mínimo/máximo | JSON con `type: "gradient"` o `"classes"`; si falta, se genera un gradiente neutro. |
| `--model` | — | JSON con criterios, pesos y restricciones del MCDA. |
| `--created-at` | hoy | fecha del producto. |
| `--minzoom` | 8 | entero 0-18. |
| `--maxzoom` | 13 | entero ≥ minzoom; si supera 20.000 tiles, baja un zoom y lo registra. |
| `--format` | `webp` | `webp` (3/4 bandas) o `png`; si el ráster tiene 1 banda/paleta se usa PNG automáticamente. |
| `--resampling` | `bilinear` | `near` para clases/categóricos; `bilinear` para continuos. |
| `--max-mb` | 2048 | tamaño máximo de la fuente. |
| `--engine` | auto | `podman` o `docker`; también `RASTER_ENGINE`. |
| `--gdal-image` | `ghcr.io/osgeo/gdal:alpine-normal-latest` | imagen con GDAL (`RASTER_GDAL_IMAGE`). |
| `--stats-csv` | — | CSV de estadísticas; si falta, la capa se publica sin tabla. |
| `--dry-run` | — | valida y estima tiles/bytes sin escribir. |
| `--force` | — | republica una versión existente; solo para corregir una publicación fallida. |

`raster:sync`:

```bash
npm run raster:sync -- --index
npm run raster:sync -- --check
npm run raster:sync -- --prune --keep 2 --dry-run
```

- `--check` recalcula tiles/bytes/checksum, compara con el manifest y sale con
  código 1 si hay diferencias.
- `--prune --keep N` conserva las N versiones más recientes de tiles; las
  fuentes COG se conservan salvo `--prune-sources`.
- `--dry-run` informa sin borrar.
- `--prune` solo borra directorios bajo `raster/<layer>/<version>` con manifest
  válido; no sigue symlinks ni acepta paths externos.

### 4.6. Estadísticas (`public.raster_stats`)

Migración `052_raster_stats.sql` (`052` es el siguiente libre al escribir la
spec; si cambia, se ajusta antes de aplicarla):

```sql
CREATE TABLE IF NOT EXISTS public.raster_stats (
  layer_id     text NOT NULL,
  version      text NOT NULL,
  admin_level  text NOT NULL CHECK (admin_level IN ('comuna', 'provincia', 'region')),
  admin_code   text NOT NULL,
  admin_name   text NOT NULL,
  class_id     integer NOT NULL DEFAULT -1,
  class_label  text,
  class_min    double precision,
  class_max    double precision,
  hectares     double precision,
  mean         double precision,
  min          double precision,
  max          double precision,
  p10          double precision,
  p90          double precision,
  computed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (layer_id, version, admin_level, admin_code, class_id)
);

CREATE INDEX IF NOT EXISTS idx_raster_stats_lookup
  ON public.raster_stats (layer_id, version, admin_level);

REVOKE ALL ON TABLE public.raster_stats FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.raster_stats TO woll_api;
```

- `class_id = -1` representa el total de la capa; `0..n` son las clases del
  manifest.
- El CSV debe traer `admin_level,admin_code,admin_name,class_id,class_label,
  class_min,class_max,hectares,mean,min,max,p10,p90`; `layer_id` y `version`
  salen de los argumentos del CLI.
- `raster:publish --stats-csv` valida y hace UPSERT por la clave primaria.
- Sin CSV, la capa se publica igual; la ficha muestra “Sin estadísticas
  publicadas”.
- El cálculo se hace en QGIS y se exporta a CSV. No hay cálculo zonal en el
  servidor; si más adelante se automatiza, será un job batch fuera de runtime y
  con su propia decisión.

`GET /api/raster-stats?layer_id=&version=&admin_level=`:

```json
{
  "ok": true,
  "data": {
    "layer_id": "aptitud_jojoba",
    "version": "2026-11",
    "admin_level": "comuna",
    "rows": [
      {
        "admin_code": "03101",
        "admin_name": "Copiapó",
        "class_id": -1,
        "hectares": 12345.6,
        "mean": 0.62,
        "min": 0.01,
        "max": 1.0,
        "p10": 0.31,
        "p90": 0.88
      }
    ]
  }
}
```

- Solo lectura; `woll_api`; sin SQL dinámico.
- Si se omite `version`, se usa la última versión con `computed_at` en
  `public.raster_stats`; si no hay filas, responde 200 con `rows: []`.
- Nginx cachea 5 min por URL (los datos cambian solo al publicar).
- El frontend lo usa para la ficha; el chat lo consumirá en el Sprint 41 por una
  RPC tipada, no por este endpoint.

### 4.7. Comportamiento en el visor

- `layerUtils.cargarCapaIndividual()` detecta `source.type === "raster"` antes
  de WMS/glify y llama a `createRasterLayer()` (`js/utils/rasterUtils.js`, a
  crear).
- `L.tileLayer(urlTemplate, { bounds, minZoom, maxNativeZoom, maxZoom, opacity,
  attribution, tileSize: 256, keepBuffer: 2 })`.
- No aplica `dataFilter`, `hiddenAttributes`, tabla de atributos, búsqueda,
  filtros por atributo ni export CSV. El sidebar oculta esas acciones para
  `tipo: "raster"`.
- La ficha muestra `source`, `values`, `legend` y `model` del manifest. Todo
  texto se escapa antes de `innerHTML` (CONTRACT §5.4 y Sprint 28).
- Si el manifest o los tiles fallan, se registra un warning y la capa no se
  muestra; el resto del visor sigue funcionando.
- Si `/api/raster-stats` falla, la ficha muestra la metodología y omite la
  sección de estadísticas; el mapa no se bloquea.
- El clic no abre popup de feature; el panel de información muestra la ficha
  metodológica.

### 4.8. Nginx

```nginx
location = /raster/index.json {
    default_type application/json;
    expires -1;
    access_log off;
    try_files $uri =404;
}

location ^~ /raster/ {
    default_type image/webp;
    add_header Cache-Control "public, max-age=31536000, immutable";
    add_header X-Content-Type-Options "nosniff" always;
    access_log off;
    try_files $uri =404;
}
```

- El prefijo `^~` evita que la regla genérica de imágenes (`expires 7d`) pise la
  caché inmutable de los tiles.
- `data/raster/` sigue denegado por la regla existente de `data/`.
- El índice global cambia con cada publicación: no se cachea como inmutable.

## 5. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | un GeoTIFF/COG válido con licencia y metadatos | se ejecuta `raster:publish` | existen `data/raster/.../source.tif`, `raster/.../manifest.json`, tiles e índice | test/CLI |
| CA-2 | una versión ya publicada | se republica sin `--force` | falla con mensaje claro y no sobrescribe nada | test |
| CA-3 | una versión nueva | se publica | la anterior sigue en disco y en el índice; `active_version` apunta a la nueva | test |
| CA-4 | un archivo sin licencia, sin método o con CRS ausente | se publica | se rechaza antes de copiar y de generar tiles | test |
| CA-5 | un archivo mayor a `RASTER_MAX_MB` o con extensión distinta de `.tif`/`.tiff` | se publica | se rechaza con causa | test |
| CA-6 | un ráster que supera 20.000 tiles | se publica | baja el maxzoom, registra `maxzoom_requested` y publica la versión degradada | test/integración |
| CA-7 | un tile borrado o alterado | se ejecuta `raster:sync --check` | detecta la diferencia y sale con código 1 | test/manual |
| CA-8 | 3 versiones publicadas | se ejecuta `--prune --keep 2` | quedan las 2 más recientes; las fuentes COG se conservan | test |
| CA-9 | Nginx sirviendo `/raster/` | se pide un tile y el índice | tile con `Cache-Control: immutable`; índice sin caché; `data/raster/...` responde 404 | manual |
| CA-10 | PostgreSQL detenido | se piden tiles publicados | el visor sigue mostrando el ráster; el chat falla controlado | manual |
| CA-11 | una capa `source.type: "raster"` | se activa en el visor | carga con `L.tileLayer`, muestra la ficha y no ofrece tabla/filtros | manual |
| CA-12 | un CSV de estadísticas válido | se publica con `--stats-csv` | `public.raster_stats` tiene las filas y `GET /api/raster-stats` las devuelve | integración |
| CA-13 | un CSV con comuna inexistente o columnas faltantes | se publica | se rechaza el CSV y la capa no queda con estadísticas parciales | test |
| CA-14 | la migración 052 | se aplica dos veces | no falla (idempotencia) | integración |
| CA-15 | el stack en ejecución | se revisa `docker compose ps` | no hay GeoServer ni JVM; solo los servicios existentes | manual |

## 6. Plan por sub-sprint

| Tramo | Contenido | Horas | Estado |
|---|---|---|---|
| 49-A | ADR 027, contrato de directorios, `.gitignore`, decisiones de GDAL/formato | 1 | ✅ local |
| 49-B | `scripts/raster-publish.mjs`: validación, manifest, índice, versionado | 2 | ✅ local |
| 49-C | Generación de tiles con GDAL, límite 20k, `raster:sync --check/--prune` | 2-3 | ✅ local |
| 49-D | Nginx `/raster/`, config `source.raster`, `rasterUtils.js`, ficha y ocultamiento de tabla/filtros | 2 | ✅ local |
| 49-E | Migración 052, CSV de estadísticas, `GET /api/raster-stats` | 2 | ✅ local |
| 49-F | Tests, docs, smoke de publicación, carga de 50 usuarios y CHANGELOG | 1-2 | 🔶 local; falta carga/VPS |

Un commit por tramo, con el ID en el mensaje (`feat: sprint-49-A ...`).

## 7. Tests requeridos (`node:test`)

- `scripts/__tests__/raster-utils.test.js`: args, slug, versión, extensión,
  licencia, `parseGdalInfo` (4326/CRS inválido), leyenda, manifest, índice,
  CSV (columnas, duplicados, `admin_level`, `class_id=-1`), `verifyVersion` y
  `configValidator` para `tipo: "raster"`.
- `scripts/__tests__/raster-sync.test.js`: `--index` con versión activa,
  `--prune --keep 1`, retención de la versión reciente.
- `server/handlers/__tests__/raster-stats.test.js`: parámetros inválidos,
  versión omitida (última `computed_at`), sin filas, error de BD sin filtrar.
- **Integración manual:** publicación real de un GeoTIFF con GDAL en Podman
  (22 tiles, manifest, índice, `--check`), Nginx con caché inmutable, fuente
  privada 404 y `GET /api/raster-stats` contra PostgreSQL local.
- **Pendiente:** prueba visual en navegador visible y carga de 50 usuarios
  sobre tiles ráster estáticos.

## 8. Seguridad y procedencia

- La fuente COG vive en `data/`, denegado por Nginx y en `.gitignore`; nunca se
  publica.
- El manifest público no incluye rutas absolutas, usuarios del sistema ni
  secretos.
- `--prune` solo opera bajo `raster/<layer>/<version>` con manifest válido; no
  sigue symlinks ni acepta paths externos.
- Se valida el archivo antes de pasarlo a GDAL: firma TIFF, tamaño máximo,
  extensión, nombre de capa y versión.
- La licencia y la atribución son obligatorias; si el DEM de origen tiene
  restricciones, se declaran en `source.license`.
- Todo texto del manifest se escapa antes de `innerHTML` en la ficha.
- Nginx sirve `/raster/` con `X-Content-Type-Options: nosniff`, sin listado de
  directorios y con `Cache-Control: immutable`; el índice va sin caché.
- No hay secretos ni credenciales en el manifest, el CSV ni los tiles.

## 9. Decisiones de cierre

Las preguntas quedaron cerradas el 2026-11-19. La spec pasa a **APROBADA**.

| # | Pregunta | Decisión |
|---|---|---|
| R1 | ¿GDAL en el host o en un contenedor efímero? | **Contenedor efímero** con Podman o Docker (`--engine` / `RASTER_ENGINE`, `--gdal-image` / `RASTER_GDAL_IMAGE`). No se instala GDAL en el host ni se agrega al contenedor de la API. |
| R2 | ¿WebP o PNG? | **WebP** para RGB/RGBA; **PNG automático** para 1 banda o paleta (WebP de GDAL requiere 3/4 bandas). `--format` permite forzar. |
| R3 | ¿Tamaño máximo de fuente? | **2048 MB** (`RASTER_MAX_MB`), configurable. |
| R4 | ¿Maxzoom por defecto? | **13** para rásteres regionales; límite de **20.000 tiles** con degradación automática. |
| R5 | ¿Estadísticas solo por CSV o se automatizan? | **CSV desde QGIS**. El servidor no calcula estadísticas zonales; automatizar queda para una decisión futura. |
| R6 | ¿Upload desde el panel en este sprint? | **No**. CLI/SCP en el 49; el panel se integra después con el gestor de capas. |
| R7 | ¿Consulta de valor en un punto? | **Fuera de alcance**; se evalúa si aparece un caso de uso. |
| R8 | ¿titiler para tiles on-demand? | **No**; tiles pregenerados. |
| R9 | ¿`--prune` borra las fuentes COG? | **No**; solo tiles. `--prune-sources` es explícito. |

**Por qué el contenedor y no el host:** el equipo de desarrollo no tiene GDAL
instalado y el VPS no debe cargar con otra dependencia global. La imagen
`ghcr.io/osgeo/gdal:alpine-normal-latest` se ejecuta solo durante la publicación
y no queda como servicio residente. El CLI detecta Podman o Docker y falla con
un mensaje claro si no hay ninguno.

## 10. Riesgos, reversión y documentación

- **Crecimiento de disco:** cada versión deja tiles; `--prune --keep 2` y
  monitoreo de disco. Las fuentes COG se conservan por defecto.
- **Tiempo de generación:** GDAL puede tardar minutos en un ráster regional; se
  corre offline, nunca en un request.
- **CRS/NoData mal declarados:** validación con `gdalinfo` y rechazo antes de
  publicar; los tiles deben quedar transparentes en NoData.
- **Leyenda inconsistente:** el manifest es la fuente de verdad; la config no
  redefine colores.
- **Ráster demasiado grande:** límite de 2 GB y maxzoom adaptativo; si no
  alcanza, recortar por comuna o bajar resolución.
- **Estadísticas desactualizadas:** `computed_at` y republicación en el mismo
  commit que la versión.
- **Reversión:** cambiar la config a la versión anterior; los tiles viejos
  siguen en disco hasta `--prune`.
- **Documentos a actualizar:** ADR 027, este archivo, `ROADMAP.md`,
  `ARCHITECTURE.md` §4.8, `DEV_GUIDE.md` §2.12, `README.md`, `AGENTS.md`,
  `CHANGELOG.md`, `.gitignore`, `.env.example`,
  `deploy/nginx/woll-locations.conf`, `docs/specs/README.md`.

## 11. Puntos de integración

- **08-G:** reutiliza el patrón de versión inmutable, manifest e índice.
- **26-D:** agrega `location ^~ /raster/` y `location = /raster/index.json`.
- **47:** el panel podrá encolar publicaciones de ráster; requiere extender
  `admin.layer_jobs.action` en una migración nueva (fuera de este sprint).
- **41:** las recetas MCDA consumen `public.raster_stats` y el `model` del
  manifest; agregan la RPC/tool del chat cuando existan.
- **29-A:** el inventario de fuentes y licencias incorpora los rásteres.
- **30:** la prueba de carga incluye tiles ráster estáticos.
- **26-J:** timer opcional para `raster:sync --check` y `--prune`.

## 12. Cierre

- **Horas reales:** no cronometradas; sesión asistida que cubrió 49-A a 49-F
  (estimación original: 10-12 h).
- **Desvíos:**
  - La imagen `alpine-small` no incluye `gdal2tiles.py`; se usa
    `ghcr.io/osgeo/gdal:alpine-normal-latest`.
  - GDAL 3.14 solo genera WebP con 3/4 bandas; un ráster de 1 banda o paleta se
    publica automáticamente como PNG. `--format` queda como override.
  - `--activate` no se implementó: la versión activa del índice es la más
    reciente y el rollback se hace en la config.
  - Si se omite `version` en `/api/raster-stats`, se usa la última
    `computed_at` de la tabla, no el índice.
- **Lecciones:** el tileado moderno de GDAL (`gdal raster tile`) es más
  estricto que el legacy; conviene validar bandas/formato antes de publicar.
  El flujo offline + Nginx + manifest se comporta igual que los MVT y no
  requiere un servicio residente.
- **Estado:** **cierre local 2026-11-19**. Implementación verificada con
  publicación real, `--check`, índice, Nginx, fuente privada y endpoint contra
  PostgreSQL. La validación visual en un navegador visible y la prueba de carga
  en VPS quedan como follow-up de despliegue (49-F).
