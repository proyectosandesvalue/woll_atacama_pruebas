# Spec 26-E — Datos: dump, restore, catálogo y verificación

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 26-E |
| **Estado de la spec** | CERRADA — dump real restaurado; `db:verify` contra el Supabase vivo queda como gate de staging |
| **Tamaño** | Mediano (5h) |
| **Dependencias** | 26-C (imagen/migraciones), 26-B (driver), 26-A (API) |
| **Última revisión** | 2026-11-11 |

## 1. Objetivo

Migrar los datos de Supabase al PostgreSQL propio sin perder filas, secuencias,
geometrías ni RPCs, y dejar herramientas repetibles para cargar capas nuevas
(GeoJSON/Shapefile) y reconstruir el catálogo del chat.

## 2. Alcance

**Dentro**

- `scripts/dump-supabase.sh`: dump custom de `public`, `chat`, `admin`,
  `ingest` (y `rag` si existe), sin owners ni ACL.
- `scripts/restore-local.sh`: bootstrap de `000_compat_roles.sql` + `pg_restore`
  en una base destino.
- `scripts/migrate.mjs --baseline`: marcar migraciones ya presentes en el dump
  sin re-ejecutarlas.
- `scripts/extract-legacy-rpcs.mjs`: extraer de Supabase las 12 RPCs heredadas y
  generar `db/migrations/039_legacy_rpcs.sql` (más `038_legacy_station_columns.sql`).
- `scripts/verify-migration.mjs`: comparar conteos, secuencias, geometrías,
  extensiones, roles y RPCs entre origen y destino.
- `scripts/load-layer.mjs`: GeoJSON → PostGIS y Shapefile → PostGIS vía
  `ogr2ogr`, con SRID, índice GIST, catálogo y stats.
- `scripts/build_catalog.mjs`: soporte `postgres` además de Supabase REST.
- Carga de `comunas_poligonos` y verificación del catálogo.

**Fuera**

- Backups continuos, cifrado y retención (26-G).
- Staging y corte (26-F/I).
- Ingestas programadas (26-J).
- Re-ingesta del corpus RAG (Sprint 18).

## 3. Procedimiento

### 3.1. Dump

```bash
export SOURCE_DATABASE_URL='postgres://...'   # conexión directa, no REST
SCHEMAS=public,chat,admin,ingest,rag npm run db:dump
```

Genera `backups/woll-<timestamp>.dump` + `.sha256`. Si no hay `pg_dump` local,
usa Podman con `postgres:17`. `rag` es opcional: si 036 no está aplicada en
Supabase, omitirlo.

### 3.2. Restore

```bash
export TARGET_DATABASE_URL='postgres://postgres:...@127.0.0.1:5432/woll'
npm run db:restore backups/woll-<timestamp>.dump
```

El script aplica `000_compat_roles.sql` antes del restore (PostGIS en `public`,
schema `extensions` para pgvector/unaccent, roles y `search_path`) y luego `pg_restore --clean --if-exists --no-owner
--no-privileges`. La base destino debe estar vacía o ser staging desechable.

### 3.3. Baseline y migraciones nuevas

El dump ya trae el schema/funciones de Supabase. Para no re-ejecutar 000-035:

```bash
node scripts/migrate.mjs --baseline --to 035
npm run migrate          # 036 rag + 038 columnas + 039 RPCs + 040 overloads
npm run check:rpcs
```

Si el dump ya trae `rag`, el baseline puede llegar a 037. Si no, 036 crea el
schema RAG. `038`/`039` se generan en el paso siguiente si faltan columnas/RPCs.

### 3.4. RPCs heredadas

```bash
export SOURCE_DATABASE_URL='postgres://...'
npm run db:extract-rpcs
git diff db/migrations/038_legacy_station_columns.sql db/migrations/039_legacy_rpcs.sql
npm run migrate
npm run check:rpcs
```

El extractor usa `pg_get_functiondef` y `pg_get_function_identity_arguments`;
no inventa definiciones. Si falta una RPC en el origen, aborta.

### 3.5. Verificación

```bash
SOURCE_DATABASE_URL='postgres://...' \
TARGET_DATABASE_URL='postgres://postgres:...@127.0.0.1:5432/woll' \
npm run db:verify
```

Compara:
- conteos por tabla de `public`, `chat`, `admin`, `ingest`, `rag`;
- `invalid` y `wrong_srid` por tabla con geometría;
- `last_value` de secuencias;
- extensiones `postgis`, `vector`, `unaccent`;
- roles `woll_api`/`woll_ingest` sin `BYPASSRLS` ni superuser;
- las 48 RPCs del registro.

Ignora auditoría, preguntas no respondidas, runs de ingesta y
`spatial_ref_sys` por defecto; `--ignore schema.tabla` agrega excepciones.

### 3.6. Capas nuevas

```bash
npm run layer:load -- geojson/foo.geojson --table foo --dimension agua \
  --display-name "Foo" [--force] [--skip-stats]
```

- GeoJSON: crea `gid`, `geom geometry(GEOMETRY, 4326)`, columnas inferidas,
  índice GIST y filas en lotes de 500.
- Shapefile: requiere `ogr2ogr`; usa `PROMOTE_TO_MULTI`, `-t_srs EPSG:4326` y
  `SPATIAL_INDEX=GIST`.
- Registra `chat_catalog` y ejecuta `chat_refresh_stats` salvo `--skip-stats`.
- `comunas_poligonos` se carga con el mismo comando.

## 4. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | Supabase | se ejecuta `npm run db:dump` | hay dump + checksum en `backups/` | archivo |
| CA-2 | una base vacía | se restaura el dump | las tablas de los 5 schemas existen | `verify-migration` |
| CA-3 | el dump | se hace baseline 000-035 y se corre `migrate` | 036/038 aplican sin re-ejecutar lo existente | `schema_migrations` |
| CA-4 | origen y destino | se corre `db:verify` | conteos, geometrías y secuencias coinciden | script |
| CA-5 | el destino | se corre `check:rpcs` | 48/48 RPCs presentes | script |
| CA-6 | un GeoJSON | se carga con `layer:load` | tabla, GIST, catálogo y stats correctos | SQL + catálogo |
| CA-7 | un Shapefile | hay `ogr2ogr` | carga con SRID 4326 e índice GIST | manual |
| CA-8 | `comunas_poligonos` | se carga | tabla disponible para las RPCs de administración | SQL |
| CA-9 | `build_catalog` | `DB_DRIVER=postgres` y `--only` | actualiza atributos desde `information_schema` | script |
| CA-10 | el dump | no hay `SOURCE_DATABASE_URL` | el script falla con mensaje claro, sin tocar el destino | manual |

## 5. Tests y validación local

- Tests unitarios de `load-layer` (identificadores, tipos, placeholders).
- Dump/restore local: `pg_dump` de la base de prueba, `000` + `pg_restore`,
  conteos y `schema_migrations`.
- `migrate --baseline --to 035` + `migrate` sobre el restore.
- `build_catalog` PostgreSQL con una capa de prueba.
- `verify-migration` origen=destino: conteos/geometrías/secuencias OK; reporta
  las 12 RPCs heredadas ausentes en la base de prueba.
- `extract-legacy-rpcs` con funciones existentes: genera SQL válido con
  `REVOKE`/`GRANT`.

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| No hay conexión directa a Supabase | DBeaver/CLI + `SOURCE_DATABASE_URL`; el dump es el bloqueo actual |
| El dump referencia `public.geometry` | `restore-local.sh` aplica 000 antes del restore |
| `pg_restore` choca con `public`/roles existentes | `--clean --if-exists` + base vacía |
| Semillas duplicadas al re-ejecutar migraciones | `--baseline` evita re-ejecutar 000-035 |
| Las 12 RPCs no están versionadas | `extract-legacy-rpcs` genera 039; `check:rpcs` bloquea |
| Diferencias de PostGIS/versión (Supabase PG17.11) | Comparar `geometry_columns`, SRID e invalid; fijar imagen |
| Tablas grandes hacen lento el conteo | `statement_timeout` 120 s; ignorar auditoría |
| Shapefile sin GDAL | Error claro; usar `osgeo/gdal` o cargar GeoJSON |

## 7. Reversión

Supabase sigue intacto hasta el corte. Si el restore falla, se descarta la base
destino y se repite el dump. El baseline/038-039 solo toca la base nueva.

## 8. Cierre

- **Estado:** CERRADA. Dump real de Supabase restaurado en PostgreSQL 17.11;
  baseline 000-035, migraciones 036-040 y `check:rpcs` 48/48. El `db:verify`
  contra el Supabase vivo queda como gate de staging (26-F).
- **Validado localmente (PostgreSQL 17.11):** dump real de Supabase, restore con
  90 tablas/71 capas/1.425.842 valores, baseline 000-035, migraciones 036-040,
  `check:rpcs` 48/48, `load-layer` con GeoJSON y `build_catalog` PostgreSQL.
  `verify-migration` local: 86 tablas, 69 geometrías y 72 secuencias comparadas,
  extensiones/roles/RPCs OK.
- **Pendiente:** comparar el Supabase vivo contra el destino con `db:verify` al
  promover staging; el dump y el restore ya están verificados.
- **Horas reales:** pendiente de registrar por el dev.
