# ADR 005 — Plataforma y hosting: VPS propio para producción; Vercel + Supabase solo demo

| Campo | Valor |
|---|---|
| Estado | Aceptada |
| Fecha | 2026-11-10 |
| Origen | Sprint 24-C / Sprint 26 |
| Relacionado | ADR 006 (Postgres propio), ADR 007 (auth admin), Sprint 26 |

## Contexto

La plataforma se desarrolló y validó sobre **Vercel Hobby + Supabase** para
mostrar avances al cliente. Esa combinación ya no alcanza:

- **Supabase llegó a su límite de almacenamiento** (la base ronda los 913 MB;
  el plan actual no da margen para seguir creciendo).
- **Vercel Hobby no es una opción de producción**: no es comercial, el
  `maxDuration` real es menor que el configurado, hay cold starts y el estado
  en memoria (rate limit, caché, semáforo) es **por instancia**, no global.
- El proxy de tiles de Copernicus ejecuta una Function por tile; con 20-50
  usuarios y capas satelitales activas el esquema no escala.
- El destino final acordado con el cliente es un **VPS propio**, con Node
  persistente y PostgreSQL/PostGIS/pgvector.

Las optimizaciones recientes (caché de catálogo, rate limit IP+sessión,
semáforo LLM, fast path del clasificador, timing) son válidas para la demo y
**portables** al VPS, pero no convierten a Vercel/Supabase en la plataforma
final.

## Decisión

1. **Producción final:** VPS propio con:
   - API Node persistente (`server/index.js`, http o Fastify).
   - PostgreSQL + PostGIS + pgvector en el mismo VPS (o gestionado).
   - Nginx/Caddy con TLS, compresión, caché de estáticos/GeoJSON y
     `limit_req`.
   - Proxy persistente de servicios externos con caché en disco/Redis y
     reutilización de conexiones.
   - Backups, healthchecks, logs y monitoreo.
2. **Vercel + Supabase:** quedan como **demo/staging** para mostrar avances.
   - No se invierte en infraestructura específica de Vercel (Upstash/Redis,
     colas distribuidas, cron) salvo que sea portable al VPS.
   - No se siguen optimizando límites de Hobby como si fueran producción.
3. **Contrato y código:** se mantiene el contrato de `/api/chat` y la lógica
   de `server/handlers/chat.js`, `server/proxy/handler.js`, clasificador,
   tools y cachés.
   - El driver `supabase.js` (REST) se reemplaza en producción por
     `server/db/drivers/postgres.js` con `pg.Pool`.
   - Los adapters `api/*.js` de Vercel se reemplazan por rutas del servidor
     Node; se conservan para la demo.
4. **Migración:** Sprint 26. Incluye dump/restore de Supabase, migraciones
   `000-037`, esquema RAG, corte de DNS/TLS, pruebas de humo y retorno.
   Dimensionar disco tomando como base el dump actual (~913 MB), el
   crecimiento previsto y los backups.

## Herramientas a instalar en el VPS

Lista mínima; la versión exacta se cierra en la spec 26:

- Node.js 20/22 LTS + npm.
- PostgreSQL 16 + PostGIS + pgvector.
- Nginx o Caddy + TLS (Let's Encrypt/certbot).
- Docker + Docker Compose, o systemd para los procesos Node.
- `pg_dump`/`pg_restore`, `rsync`, `ufw`/`fail2ban`, `logrotate`.
- Opcional: Redis para caché/rate limit si se corre más de un worker.
- Backups fuera del VPS y prueba de restauración.

## Consecuencias

- En un proceso Node persistente, el rate limit, la caché de catálogo y el
  semáforo LLM son **globales**; no hace falta Redis si se corre una sola
  instancia. Si se escala a varios workers, se agrega Redis.
- El proxy de tiles deja de ser una Function por tile: caché compartida,
  conexiones reutilizadas y límite de concurrencia real.
- El límite de almacenamiento de Supabase desaparece; el tamaño pasa a ser
  disco del VPS y política de backups.
- `vercel.json`, el `maxDuration` de Hobby y el CDN de Vercel son
  **específicos de la demo**; no forman parte de la arquitectura final.
- La migración 037 (índice funcional, funciones con `geog`,
  `statement_timeout`) y el `AbortSignal` son portables y se conservan.

## Referencias

- `docs/ROADMAP.md` — Sprint 26.
- `docs/ARCHITECTURE.md` §2 y §3.
- `docs/specs/26-plataforma/00-spec-madre.md` (a escribir).
- ADR 006 (Postgres propio) y ADR 007 (auth admin), pendientes.
