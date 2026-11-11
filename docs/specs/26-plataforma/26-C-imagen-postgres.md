# Spec 26-C — Imagen PostgreSQL, `000_compat_roles` y runner de migraciones

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 26-C |
| **Estado de la spec** | CERRADA (2026-11-10; validada con Podman 5.8 + podman-compose) |
| **Tamaño** | Mediano (5h) |
| **Dependencias** | Ninguna (es el disparador del Sprint 26); produce ADR 006 |
| **Última revisión** | 2026-11-10 |

> **Disparador:** este tramo crea la imagen Docker de PostgreSQL/PostGIS/pgvector.
> Desde su primer commit, Vercel + Supabase quedan congelados y todo el
> desarrollo se hace para Docker/VPS (ADR 005).

## 1. Objetivo

Tener una base PostgreSQL 17 reproducible en Docker, con PostGIS y pgvector, un
Compose mínimo para desarrollo, la migración `000_compat_roles.sql` y un runner
de migraciones portable que aplique `000-037` dos veces sobre una base vacía sin
errores.

## 2. Alcance

**Dentro**

- `docker/postgres/Dockerfile`: PostgreSQL 17 + PostGIS 3.7.0 + pgvector
  0.8.7, versiones fijadas con `ARG`.
- `docker-compose.yml` base con el servicio `postgres` y volumen `pgdata`.
- `docker-compose.dev.yml` con el puerto `127.0.0.1:5432` para desarrollo.
- `db/migrations/000_compat_roles.sql`: extensiones, roles y `search_path`.
- `scripts/migrate.mjs`: runner con checksum, `--status`, `--dry-run`, `--to`.
- `npm run migrate` y `npm run migrate:status`.
- Variables de PostgreSQL en `.env.example`.
- `RAG_DATABASE_URL` para separar el rol de ingesta RAG del rol del API.
- Prueba de `000-037` dos veces sobre una base vacía.

**Fuera**

- Servidor Node, driver `pg.Pool`, Nginx, backups y datos (tramos 26-A/B/D/E/G).
- Ajuste fino de PostgreSQL (26-H).
- Cambios de comportamiento a migraciones `001-037`. La corrección de
  compilación de `021` (variable `sql` sin declarar) se documenta aparte porque
  impedía reproducir la base desde cero.

## 3. Contrato

### 3.1. Imagen

```dockerfile
FROM postgres:17-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      postgresql-17-postgis-3 \
      postgresql-17-pgvector \
 && rm -rf /var/lib/apt/lists/*
```

- Tag local: `woll/postgres:17`.
- Versiones fijadas: `POSTGIS_VERSION=3.7.0+dfsg-1.pgdg12+1` y
  `PGVECTOR_VERSION=0.8.7-1.pgdg12+1`.
- El contenedor corre como el usuario `postgres` de la imagen oficial.
- `TZ=UTC`, `POSTGRES_DB=woll`, `POSTGRES_USER=postgres`.
- Las extensiones se crean por migración, no por `initdb`.

### 3.2. Compose

| Servicio | Imagen | Puertos | Volumen | Healthcheck |
|---|---|---|---|---|
| `postgres` | `woll/postgres:17` | Ninguno en base; `127.0.0.1:5432` en dev | `pgdata:/var/lib/postgresql/data` | `pg_isready` |

`docker-compose.yml` no publica el puerto; `docker-compose.dev.yml` lo agrega
solo en `127.0.0.1`. La red es interna (`internal`).

### 3.3. Migración 000

- Crea `extensions` si no existe.
- `postgis`, `vector` y `unaccent` en `extensions`.
- Roles NOLOGIN de compatibilidad: `anon`, `authenticated`, `service_role`.
- Roles NOLOGIN de login: `woll_api`, `woll_ingest` (el password se setea con
  `scripts/bootstrap-roles.sh` desde `.env`).
- `search_path = public, extensions` para la base y los roles.
- `USAGE` en `public`, `chat`, `admin`, `ingest`, `extensions`; `rag` se agrega
  en 036.
- `ALTER DEFAULT PRIVILEGES` para que las funciones creadas en 001-037 sean
  ejecutables por `woll_api` y las tablas de `ingest` por `woll_ingest`.
- `REVOKE CREATE ON SCHEMA public FROM PUBLIC`.

### 3.4. Runner

```bash
npm run migrate            # aplica pendientes
npm run migrate:status     # lista aplicadas/pendientes
node scripts/migrate.mjs --dry-run
node scripts/migrate.mjs --to 010
```

- Tabla `public.schema_migrations(version text primary key, checksum text,
  applied_at timestamptz, execution_ms integer)`.
- Orden lexicográfico de `db/migrations/*.sql`.
- Una transacción por archivo; `statement_timeout = 0` y `lock_timeout = 10s`.
- Si una migración aplicada cambió su checksum, aborta.
- Conexión: `DATABASE_ADMIN_URL` (preferida) o `DATABASE_URL`.
- No imprime secretos ni el contenido de las migraciones.

### 3.5. Variables nuevas

```bash
POSTGRES_DB=woll
POSTGRES_USER=postgres
POSTGRES_PASSWORD=CAMBIAR
POSTGRES_PORT=5432
DATABASE_URL=postgres://woll_api:CAMBIAR@127.0.0.1:5432/woll
DATABASE_ADMIN_URL=postgres://postgres:CAMBIAR@127.0.0.1:5432/woll
RAG_DATABASE_URL=postgres://rag_ingest:CAMBIAR@127.0.0.1:5432/woll
```

`scripts/ingest_docs.mjs` prefiere `RAG_DATABASE_URL` y cae a `DATABASE_URL` por
compatibilidad.

## 4. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | el repo | se construye la imagen | `postgis`, `vector` y `unaccent` están disponibles | `podman/docker build` + `CREATE EXTENSION` |
| CA-2 | el Compose | se levanta en dev | Postgres queda `healthy` y acepta conexiones en `127.0.0.1` | `docker compose up -d` + `pg_isready` |
| CA-3 | una base vacía | se corre `npm run migrate` dos veces | la segunda no aplica nada y no hay errores | salida del runner + `schema_migrations` |
| CA-4 | una migración aplicada | se cambia su contenido | el runner aborta por checksum | prueba unitaria |
| CA-5 | una base migrada | se consultan los roles | `woll_api` y `woll_ingest` existen NOLOGIN y sin `BYPASSRLS` | `\du` / `pg_roles` |
| CA-6 | la base migrada | `woll_api` ejecuta una RPC de prueba | tiene `EXECUTE` sin ser superusuario | `SET ROLE woll_api; SELECT ...` |
| CA-7 | el repo | se busca `POSTGRES_PASSWORD` o claves | solo aparece en `.env.example` como placeholder | `git grep` |
| CA-8 | `--status` | se corre antes y después de migrar | muestra pendientes y luego aplicadas | manual |

## 5. Tests

- `server/db/__tests__/migrate.test.js`: parseo de args, orden de archivos,
  checksum, detección de migración modificada.
- Integración manual/CI: `000-037` dos veces sobre una base vacía; extensiones y
  roles.
- Lint y tests existentes.

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| El paquete `postgresql-17-pgvector` no está en el repo de la imagen | Verificar en el build; si falta, compilar pgvector en la imagen |
| Migraciones 001-037 asumen objetos de Supabase | Probar en base vacía; agregar `000` y, si falta, una migración nueva (no editar las existentes) |
| `CREATE EXTENSION` requiere superusuario | El runner usa `DATABASE_ADMIN_URL`; el API no |
| Docker no está instalado en el entorno local | Validar con Podman 5.8 (compatible) y dejar el Compose para Docker |

## 7. Reversión

- Borrar el volumen `pgdata` y volver a Supabase (`DB_DRIVER=supabase`).
- La migración `000` es idempotente; no borra datos.
- No se toca ninguna migración existente.

## 8. Cierre

- **Estado:** CERRADA 2026-11-10.
- **Validación:** imagen construida con Podman 5.8; actualizada a PostgreSQL 17.11 en 26-E y revalidada (000-037 y tests); Compose levantado con
  `podman-compose`; `000-037` aplicadas dos veces (34 migraciones), extensiones
  `postgis`/`vector`/`unaccent`, roles `woll_api`/`woll_ingest` sin login ni
  `BYPASSRLS`, y login de ambos roles probado. Docker Compose no está instalado
  en este entorno; el archivo es estándar y queda para el VPS.
- **Horas reales:** pendiente de registrar por el dev.
- **Desvíos:** la migración `021` no compilaba en una base nueva (variable `sql`
  sin declarar). Se corrigió con aprobación explícita; no afecta Supabase.
- **Lecciones:** el runner con checksum detectó correctamente una migración
  modificada. La reproducibilidad desde cero vale la pena antes de migrar datos.
