# ADR 006 — PostgreSQL propio: instancia única, extensiones y roles de mínimo privilegio

| Campo | Valor |
|---|---|
| Estado | Aceptada |
| Fecha | 2026-11-10 |
| Origen | Sprint 26-C |
| Relacionado | ADR 005 (VPS), Sprint 26, Sprint 08 |

## Contexto

La plataforma usa Supabase (PostgreSQL + PostGIS + PostgREST) para la demo.
Supabase llegó a su límite de almacenamiento y Vercel Hobby no es una opción de
producción (ADR 005). El VPS propio necesita una base reproducible, con las
mismas extensiones, los mismos schemas y un modelo de permisos que no dependa de
`service_role` ni de la API REST de Supabase.

El chat ya usa RPCs tipadas y el LLM nunca escribe SQL. La migración 037 agregó
índices funcionales `((geom::geography))` y `statement_timeout`. El esquema RAG
(036) usa `pgvector` con `vector(1024)` y aún no estaba aplicado en Supabase.

## Decisión

1. **Una instancia PostgreSQL 17** en Docker, con **PostGIS 3.7.0** y
   **pgvector 0.8.7**, versiones fijadas en `docker/postgres/Dockerfile`.
   - La misma imagen se usa en local, staging y producción.
   - PostGIS se crea en `public` (igual que Supabase, para resolver
     `public.geometry`); `pgvector` y `unaccent` se crean en `extensions`. Las
     extensiones se crean por migración, no en `initdb`.
2. **Schemas:** `public` (capas y wrappers), `chat` (catálogo, auditoría, RPCs),
   `admin` (configuración), `ingest` (fuentes/valores/estaciones), `rag`
   (documentos/chunks) y `extensions`.
3. **Roles:**
   - `woll_api`: LOGIN, sin superusuario ni `BYPASSRLS`; `EXECUTE` en las RPCs y
     `SELECT` en las tablas de capas cuando el Sprint 08 lo requiera.
   - `woll_ingest`: LOGIN, sin `BYPASSRLS`; escritura en `ingest.*` y `EXECUTE`
     en las RPCs de ingesta.
   - `rag_ingest`: LOGIN, miembro de `rag_writer` (036).
   - `anon`, `authenticated` y `service_role`: NOLOGIN, solo para compatibilidad
     con los `GRANT`/`REVOKE` de las migraciones 001-037.
   - Los passwords se setean desde `.env` con
     `scripts/bootstrap-roles.sh`; nunca viven en SQL versionado.
4. **Acceso desde el backend:** `pg.Pool` con `statement_timeout`,
   `query_timeout`, `application_name` y un registro de firmas de RPC
   (`server/db/rpc-signatures.js`, Sprint 26-B). El LLM sigue invocando solo
   RPCs tipadas; no hay SQL generado por el modelo.
5. **Migraciones:** `db/migrations/NNN_*.sql` idempotentes, con
   `public.schema_migrations` (versión, checksum, fecha, duración) y runner
   `scripts/migrate.mjs`. `000_compat_roles.sql` crea extensiones, roles y
   `search_path`. Una migración aplicada con checksum distinto aborta el runner.
6. **Datos:** dump/restore desde Supabase de los schemas de aplicación; la
   verificación es por conteos, secuencias e integridad de geometrías (26-E).
7. **Operación:** backups cifrados fuera del VPS, retención y simulacro de
   restauración (26-G); Postgres no publica puertos fuera de la red de Compose
   (26-D).

## Consecuencias

- Desaparecen el límite de almacenamiento de Supabase y la dependencia de
  PostgREST; el acceso es TCP con pool persistente.
- El modelo de permisos es más estricto: el API no usa `service_role` ni
  `BYPASSRLS`. Las RPCs `SECURITY DEFINER` siguen siendo la frontera.
- Las migraciones son reproducibles desde cero; la corrección de `021` fue
  necesaria para lograrlo.
- Hay que operar Postgres: backups, tuning, actualizaciones y restauración.
- `pg` no cancela por `AbortSignal`; el corte efectivo lo hacen
  `statement_timeout` y `query_timeout`.
- La imagen fija versiones de PostGIS/pgvector; actualizarlas es un cambio
  deliberado, no un efecto de rebuild.

## Referencias

- `docs/DECISIONS/005-plataforma-hosting-vps.md`
- `docs/specs/26-plataforma/00-spec-madre.md`
- `docs/specs/26-plataforma/26-C-imagen-postgres.md`
- `db/migrations/000_compat_roles.sql`
- `scripts/migrate.mjs`
