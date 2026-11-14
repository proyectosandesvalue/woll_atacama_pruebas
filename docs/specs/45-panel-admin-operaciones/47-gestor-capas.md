# Spec 47 — Gestor e importador de capas (GeoJSON)

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 47 |
| **Estado de la spec** | EN EJECUCIÓN |
| **Tamaño** | Grande |
| **Duración estimada** | 16-20 h |
| **Dependencias** | 08-G (tiles), 45 (panel), 46 (taxonomía) |
| **Última revisión** | 2026-11-14 |

## 1. Objetivo

Gestionar capas geográficas desde el panel: metadatos, archivo GeoJSON,
carga a PostGIS, generación de tiles y publicación del snapshot que usa el
visor. En esta fase solo se importa **GeoJSON**; Shapefile/ZIP queda para
47-D.

## 2. Alcance

**Dentro**
- CRUD de metadatos en `admin.layers` (clave, nombre, tipo, fuente, config,
  activo). La clave no cambia después de crear.
- Subida de GeoJSON (máx. 100 MB) con validación de `FeatureCollection`,
  geometrías y conteo de features.
- Archivo en `geojson/uploads/<key>.geojson`; el GeoJSON original queda como
  fallback.
- Cola `admin.layer_jobs` y worker `scripts/layer-worker.mjs`.
- Importación: `load-layer --force --tiles`, tabla PostGIS y tiles MVT.
- Actualización de `admin.layers.config.source.tiles` al terminar.
- Listado de capas, placements, archivo, jobs y estado de tiles.
- Publicación del snapshot con el flujo de taxonomía.
- Tests de validación, handlers y worker.

**Fuera**
- Shapefile/ZIP y `ogr2ogr` (47-D).
- Edición geométrica en mapa.
- Borrado físico de tablas PostGIS; se archiva la capa.
- Edición de estilos por formulario estructurado: el campo avanzado es JSON.

## 3. Contrato de datos

`admin.layer_jobs` (migración 048):

| Columna | Tipo |
|---|---|
| `id` | bigint identity PK |
| `action` | `import` / `tiles` |
| `layer_key` | text not null |
| `status` | `queued/running/succeeded/failed/cancelled` |
| `payload` | jsonb sin secretos |
| `result` | jsonb |
| `requested_by` | text |
| `created_at`, `started_at`, `finished_at`, `heartbeat_at` | timestamptz |
| `error_code`, `error_message` | text |

Un job activo por capa (índice parcial).

## 4. Endpoints

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/api/admin/layers` | capas + placements + jobs + estado de archivo |
| `POST` | `/api/admin/layers` | crear metadatos |
| `PUT` | `/api/admin/layers` | editar nombre/tipo/config/activo |
| `DELETE` | `/api/admin/layers?id=` | archivar (activo=false) |
| `POST` | `/api/admin/layers/upload?key=` | GeoJSON binario |
| `POST` | `/api/admin/layers/jobs` | encolar importación |
| `GET` | `/api/admin/layers/jobs?id=` | estado de jobs |
| `POST` | `/api/admin/layers/jobs/cancel` | cancelar job `queued` |
| `POST` | `/api/admin/taxonomy/publish` | publicar el snapshot existente |

## 5. Worker

`scripts/layer-worker.mjs`:

1. Reclama un job con `FOR UPDATE SKIP LOCKED`.
2. Para `import`, ejecuta:
   `node scripts/load-layer.mjs <file> --table <key> --layer-id <key>
    --dimension <dim> --display-name <name> --force --tiles --tiles-version <v>`.
3. Lee el manifest de tiles y actualiza
   `admin.layers.config.source = {type:"postgis", tiles:{...}, fallback:{...}}`.
4. Guarda resultado, heartbeat y estado.
5. `--once` para tests/cron; loop con `--poll`.

Imagen: reutiliza la imagen del API; volúmenes `./geojson` y `./tiles`.
Requiere `DATABASE_ADMIN_URL` para DDL y `DATABASE_URL` para la cola.

## 6. Criterios de aceptación

| # | Dado | Cuando | Entonces |
|---|---|---|---|
| CA-1 | GeoJSON válido | subo y encolo | job `succeeded`; tabla PostGIS y tiles generados |
| CA-2 | GeoJSON inválido o vacío | subo | 400; no queda archivo |
| CA-3 | archivo > 100 MB | subo | 413 |
| CA-4 | capa importada | abro `/api/admin/layers` | veo archivo, tabla, tiles y placements |
| CA-5 | worker caído | consulto | aviso sin heartbeat; la API sigue |
| CA-6 | job `queued` | cancelo | `cancelled` |
| CA-7 | capa publicada | abro el visor | tiles y fallback GeoJSON funcionan |
| CA-8 | migración | aplico dos veces | sin error |

## 7. Seguridad

- Clave `^[a-z][a-z0-9_]{1,60}$` para tabla/URL; sin path traversal.
- Validar JSON y geometrías antes de guardar.
- Límite de 100 MB y cuota de disco.
- Worker con `DATABASE_ADMIN_URL`; nunca en el frontend.
- Logs sin contenido de archivos.
- Snapshot anterior intacto si falla la importación o publicación.

## 8. Preguntas abiertas

| # | Pregunta | Default |
|---|---|---|
| R1 | ¿La importación reemplaza la tabla existente? | sí, `--force` con confirmación |
| R2 | ¿La versión de tiles se genera por fecha/hora? | `YYYYMMDDHHmm` |
| R3 | ¿La capa se asigna a dimensión en el mismo flujo? | sí, selector en el formulario |
