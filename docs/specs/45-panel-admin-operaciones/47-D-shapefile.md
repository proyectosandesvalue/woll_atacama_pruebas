# Spec 47-D — Importación de Shapefile (ZIP) desde el panel

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 47-D |
| **Estado de la spec** | CERRADA (local 2026-11-19; VPS pendiente) |
| **Tamaño** | Mediano |
| **Duración estimada** | 6-8 h |
| **Dependencias** | 47 (gestor de capas), 08-G (tiles), 26-D (Nginx) |
| **Última revisión** | 2026-11-19 |

> **Qué es esta spec.** Extiende el gestor de capas para aceptar un ZIP con un
> Shapefile (`.shp`, `.dbf`, `.shx`, `.prj`), validarlo, cargarlo a PostGIS con
> `ogr2ogr` y generar el GeoJSON de respaldo y los tiles MVT. El flujo GeoJSON
> existente no cambia.

---

## 1. Objetivo y contexto

El panel ya importa GeoJSON, pero muchos insumos llegan como Shapefile. El
usuario sube un ZIP; el panel lo deja en una carpeta privada, encola el trabajo
y el worker lo descomprime, valida, convierte el Shapefile a GeoJSON (fallback)
y lo carga a PostGIS con `ogr2ogr` para generar los tiles.

El API no incorpora GDAL: la importación corre en una **imagen dedicada del
worker** (`docker/layer-worker`) con `gdal-bin` y `unzip`. Así el API sigue
liviano y el flujo GeoJSON no se toca.

## 2. Alcance

**Dentro**
- Upload de ZIP por `POST /api/admin/layers/upload` (`application/zip`).
- ZIP privado en `geojson/private/<key>.zip`; Nginx lo deniega.
- Validación en dos etapas: el API valida firma y tamaño del ZIP; el worker
  valida entradas, path traversal, symlinks, componente único y `.prj`
  obligatorio antes de extraer.
- Worker `docker/layer-worker` con GDAL y `unzip`.
- Conversión a `geojson/uploads/<key>.geojson` y carga con
  `load-layer.mjs <shp> --force [--tiles]`.
- Actualización de `admin.layers.config.source` y `config.url` al GeoJSON.
- UI: aceptar `.zip`, textos y tipo de fuente `shapefile`.
- Tests de validación, handler, worker y regresión del flujo GeoJSON.

**Fuera**
- Subida de `.shp` suelto o `.gdb`/GeoPackage.
- Edición geométrica en el mapa.
- Reproyección distinta de EPSG:4326 (el worker usa `-t_srs EPSG:4326`).
- Borrado físico de la tabla PostGIS o del ZIP; se archiva la capa.
- Importación de ráster desde este flujo (Sprint 49).

## 3. Reglas del CONTRACT que aplican

| Regla | Implicancia |
|---|---|
| §1.3 (un recurso, un lugar) | El ZIP privado y el GeoJSON público son artefactos distintos; la fuente de verdad es `admin.layers.config`. |
| §1.5 (tests) | Validación ZIP, handler, worker y regresión GeoJSON con `node:test`. |
| §1.7 (fallback, INV-5) | El GeoJSON generado queda como fallback del visor; si falla la importación, la capa anterior no se toca. |
| §5.1 (migraciones) | No hay schema nuevo; se reutiliza `admin.layer_jobs` (048). |
| §5.2 (RLS) | El ZIP no se expone por Nginx; el worker escribe con `DATABASE_ADMIN_URL`. |
| §5.3 (API) | El upload mantiene `{ item, file, ... }` y los errores `{ error }`. |
| §5.4 (validación) | Tipo MIME/extensión, tamaño, ZIP y componentes antes de encolar. |
| §7.5 (español neutro) | UI y mensajes en español neutro. |

## 4. Contrato de datos / API

### 4.1. Upload

`POST /api/admin/layers/upload?key=<key>&name=<nombre>`

- `Content-Type: application/zip` (o `application/x-zip-compressed`).
- Máximo **200 MB** (`MAX_SHAPEFILE_BYTES`); Nginx sube el límite a `210m` en
  esa ruta.
- Guarda `geojson/private/<key>.zip` (temporal + rename).
- Firma ZIP `PK\x03\x04`; rechaza vacío.
- `admin.layers.config`:
  ```json
  {
    "url": "geojson/uploads/<key>.geojson",
    "type": "polygon",
    "nombrePersonalizado": "...",
    "upload": {
      "format": "shapefile",
      "file": "geojson/private/<key>.zip",
      "bytes": 123456
    }
  }
  ```
- `source_type = 'shapefile'`, `has_tiles = false`.
- Devuelve `{ item, file, format: "shapefile", bytes }`.

### 4.2. Cola

`POST /api/admin/layers/jobs` con `{ layer_key, dimension_key, display_name, tiles }`.

- Si `config.upload.format === "shapefile"`:
  - `payload.format = "shapefile"`.
  - `payload.file = "geojson/private/<key>.zip"`.
- Si no, se conserva el flujo GeoJSON:
  - `payload.format = "geojson"`.
  - `payload.file = config.url` (debe empezar con `geojson/uploads/`).
- La versión de tiles sigue siendo `YYYYMMDDHHmm`.

### 4.3. Worker

`scripts/layer-worker.mjs`, job `import` con `payload.format = "shapefile"`:

1. Valida que el ZIP esté bajo `geojson/private/` y no tenga `..`.
2. Preflight con `unzip -Z1` y `unzip -l`:
   - máximo 100 entradas y 1 GB descomprimido;
   - sin paths absolutos, `..`, backslashes ni symlinks;
   - extensiones permitidas: `.shp`, `.dbf`, `.shx`, `.prj`, `.cpg`, `.xml`.
3. Extrae a `geojson/private/<key>/` (se limpia antes y después).
4. Exige exactamente un `.shp`, con `.dbf`, `.shx` y `.prj` del mismo nombre
   base (case-insensitive). `.cpg` es opcional.
5. Genera el fallback:
   `ogr2ogr -f GeoJSON -t_srs EPSG:4326 geojson/uploads/<key>.geojson <shp>`.
6. Ejecuta `load-layer.mjs <shp> --table <key> --layer-id <key>
   --dimension <dim> --display-name <name> --force [--tiles --tiles-version <v>]`.
7. Actualiza `config.url` al GeoJSON, conserva `config.upload` y llama a
   `updateLayerSource` para escribir `source.tiles`/`source.type = "postgis"`.
8. Limpia el directorio extraído; conserva el ZIP privado como fuente.
9. Si falla, el job queda `failed` con `error_code` y la capa anterior intacta.

### 4.4. Imagen del worker

`docker/layer-worker/Dockerfile`:

- Base `node:22-bookworm-slim`.
- `apt-get install gdal-bin unzip`.
- Copia `server`, `scripts`, `db` y lo mínimo de `js/` (igual que la API).
- `CMD ["node", "scripts/layer-worker.mjs"]`.
- `docker-compose.yml`: `layer-worker` usa esta imagen; la API no cambia.
- Volúmenes: `./geojson` y `./tiles` (ya existentes). El ZIP y el GeoJSON
  viven bajo `geojson/`.

### 4.5. Nginx y UI

- `location ^~ /geojson/private/ { return 404; }` antes de `/geojson/`.
- `client_max_body_size 210m` en `/api/admin/layers/upload`.
- `admin.html`: aceptar `.zip`, texto “Shapefile (ZIP)”, tipo de fuente
  `shapefile`.
- `js/admin/api.js`: `Content-Type` según extensión/MIME.
- `js/admin/main.js`: mensaje de subida distingue GeoJSON de Shapefile.

## 5. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | ZIP con un Shapefile válido (`.shp/.dbf/.shx/.prj`) | subo y encolo | job `succeeded`; tabla PostGIS, GeoJSON fallback y tiles | integración |
| CA-2 | ZIP sin `.prj`, sin `.dbf`, sin `.shx` o con dos `.shp` | subo y encolo | job `failed` con causa; no se actualiza config ni se publica | test/integración |
| CA-3 | ZIP con `../`, path absoluto, symlink o > 100 entradas | subo y encolo | job `failed`; no se extrae ni se publica | test/integración |
| CA-4 | ZIP > 200 MB | subo | 413; no queda archivo | test |
| CA-5 | ZIP válido | pido `/geojson/private/<key>.zip` | 404 | manual |
| CA-6 | job Shapefile falla | reviso | config y snapshot anterior no se actualizan; job `failed` con causa; se puede reintentar | integración |
| CA-7 | capa importada | abro el visor | tiles y GeoJSON fallback funcionan | manual |
| CA-8 | flujo GeoJSON existente | subo e importo | sigue funcionando igual | regresión |
| CA-9 | API en ejecución | reviso imagen | no contiene GDAL; el worker sí tiene `ogr2ogr` y `unzip` | manual |

## 6. Plan por sub-sprint

| Tramo | Contenido | Horas | Estado |
|---|---|---|---|
| 47-D.1 | Spec, `.gitignore`, Nginx, imagen `layer-worker` con GDAL/unzip | 1-2 | ✅ local |
| 47-D.2 | `layer-files.js`: ZIP privado, validación de firma/tamaño y `layerFileInfo` | 1-2 | ✅ local |
| 47-D.3 | Worker: preflight, extracción segura, `ogr2ogr` y `load-layer` | 2-3 | ✅ local |
| 47-D.4 | Handler de upload/queue, UI y textos | 1 | ✅ local |
| 47-D.5 | Tests, docs y smoke local | 1 | 🔶 local; falta VPS |

## 7. Tests requeridos (`node:test`)

- `server/admin/__tests__/layer-files.test.js`: firma ZIP, tamaño, extensión,
  path privado, `saveZipStream`.
- `server/handlers/__tests__/admin-layers.test.js`: upload ZIP, MIME inválido,
  tamaño, queue con `config.upload.format`, regresión GeoJSON.
- `scripts/__tests__/layer-worker.test.js`: preflight de entradas, componentes
  requeridos, `.prj` obligatorio, un solo `.shp`, comandos `ogr2ogr`/`load-layer`
  construidos con un runner inyectado.
- Manual: importar un ZIP real, verificar tabla/tiles/fallback y 404 del ZIP.

## 8. Seguridad y procedencia

- ZIP privado en `geojson/private/`; Nginx devuelve 404.
- Sin path traversal, backslashes, symlinks ni archivos ejecutables.
- Límites de tamaño y número de entradas; preflight antes de extraer.
- `ogr2ogr` y `unzip` solo en la imagen del worker, nunca en el API.
- Logs sin contenido del archivo; solo nombre, bytes y errores acotados.
- La licencia del Shapefile se declara en los metadatos de la capa.

## 9. Preguntas abiertas

| # | Pregunta | Decisión |
|---|---|---|
| R1 | ¿Se exige `.prj`? | **Sí**. Sin `.prj` se rechaza para no asumir un CRS incorrecto. |
| R2 | ¿Dónde vive el ZIP? | **`geojson/private/<key>.zip`**, denegado por Nginx. |
| R3 | ¿GDAL en el API? | **No**. Imagen dedicada `docker/layer-worker` con `gdal-bin` + `unzip`. |
| R4 | ¿Tamaño máximo? | **200 MB** ZIP y **1 GB** descomprimido. |
| R5 | ¿Se conserva el ZIP? | **Sí**, como fuente privada; el GeoJSON queda como fallback público. |
| R6 | ¿Qué pasa con el flujo GeoJSON? | **No cambia**; el worker distingue por `payload.format`. |

## 10. Riesgos, reversión y documentación

- **ZIP mal formado o bomba:** preflight de entradas y tamaños; extracción solo
  tras validar.
- **Shapefile sin `.prj`:** se rechaza con mensaje claro.
- **Reemplazo no transaccional:** `ogr2ogr -overwrite` puede dejar la tabla a
  medio reemplazar si falla. El job queda `failed`, la config/snapshot no se
  actualiza y se puede reintentar con `--force`.
- **Worker sin GDAL:** la imagen dedicada lo incluye; se verifica con
  `ogr2ogr --version` en el arranque del worker (log).
- **Permisos de `geojson/private/`:** el deploy debe crear el directorio
  escribible por el contenedor; Nginx lo deniega.
- **Reversión:** desplegar la imagen anterior del worker y volver al flujo
  GeoJSON; los ZIP quedan en disco sin uso.
- **Documentos:** esta spec, `47-gestor-capas.md`, `ARCHITECTURE.md` §4.5,
  `DEV_GUIDE.md`, `ROADMAP.md`, `CHANGELOG.md`, `AGENTS.md`, `.gitignore`,
  `docker-compose.yml`, `docker/layer-worker/Dockerfile`, Nginx y `admin.html`.

## 11. Puntos de integración

- **47:** reutiliza `admin.layer_jobs`, `load-layer`, `tiles-sync` y
  `updateLayerSource`.
- **08-G:** versión de tiles y manifest existentes.
- **26-D:** Nginx y volumen `geojson`.
- **49:** el rápido de ráster sigue por CLI; no comparte este flujo.

## 12. Cierre

- **Horas reales:** sesión asistida que cubrió 47-D.1 a 47-D.5 (estimación
  original: 6-8 h).
- **Desvíos:**
  - El ZIP privado se guarda en `geojson/private/` (no en `data/`) para
    reutilizar el volumen `geojson/` y evitar un mount nuevo. Nginx lo deniega.
  - La imagen del worker es nueva (`docker/layer-worker`) con GDAL 3.6.2 y
    `unzip`; la API sigue sin GDAL.
  - En Podman/SELinux, los archivos creados por el worker con `:Z` pueden
    quedar con una categoría distinta a la de Nginx. El compose de desarrollo
    ya usa `label=disable` para el worker; en Docker/VPS no aplica.
- **Lecciones:** `ogr2ogr` y `unzip` deben vivir en el worker, no en la API.
  El GeoJSON de respaldo se genera antes de actualizar la config; así el visor
  mantiene un fallback válido.
- **Verificación local:** ZIP con un polígono → job `succeeded`; tabla PostGIS
  con 1 feature; GeoJSON de 363 bytes; 71 tiles MVT; `source.tiles` y
  `config.upload` actualizados; Nginx devuelve 404 para el ZIP privado y 200
  para el GeoJSON y los tiles.
- **Pendiente:** validar permisos de `geojson/private/` y el flujo completo en
  el VPS.
