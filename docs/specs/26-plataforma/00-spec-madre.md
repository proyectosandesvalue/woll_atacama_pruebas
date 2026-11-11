# Spec madre 26 — Plataforma propia (PostgreSQL + Node + Nginx en VPS)

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 26 |
| **Estado de la spec** | APROBADA / EN EJECUCIÓN (2026-11-10; defaults aprobados; M1 resuelto con Supabase CLI + DBeaver) |
| **Tamaño** | Grande (> 15h) |
| **Duración estimada** | 42-46h |
| **Dependencias** | Sprint 23 (concurrencia/observabilidad) y Sprint 24 (infraestructura) |
| **Última revisión** | 2026-11-10 |

> **Qué es esta spec.** Fija lo que **no cambia** durante el sprint: objetivo,
> invariantes, decisiones, riesgos y el mapa de tramos. **No** diseña el detalle
> de cada tramo: cada tramo tiene su propia spec (`26-A-*.md`, `26-B-*.md`...),
> que se escribe al empezar ese tramo.
>
> **Decisión de origen:** ADR 005 (VPS propio para producción; Vercel + Supabase
> solo demo). La migración empieza con la imagen Docker de PostgreSQL
> (PostGIS + pgvector) y desde ese commit Vercel + Supabase quedan congelados.
>
> **Aprobada 2026-11-10.** Se arranca por 26-C (imagen PostgreSQL + migraciones).
> El dump de Supabase se obtiene con la CLI y la conexión DBeaver existente.

---

## 1. Objetivo y métricas de éxito

Ejecutar la plataforma completa en infraestructura propia: PostgreSQL/PostGIS/
pgvector, API Node persistente, Nginx con TLS y proxy persistente, con el mismo
Compose y la misma imagen en local, staging y producción. Al terminar, el visor,
el chat, las estaciones, el proxy de Copernicus y las ingestas funcionan sin
Vercel ni Supabase.

| Métrica | Línea base (2026-11-10) | Meta | Cómo se mide |
|---|---|---|---|
| Dependencia de Vercel/Supabase en producción | 100 % | 0 % | Variables y DNS del entorno final |
| Límite de ejecución del chat | ~10 s (Hobby) | Sin límite de Function; presupuesto propio de 20 s | Prueba de 20 concurrentes |
| Almacenamiento de la BD | ~913 MB (Supabase, en el límite) | Disco propio con < 50 % usado y backups | `df`, `pg_database_size` |
| Endpoints públicos en el VPS | 0 | 10/10 con paridad de contrato | Smoke de rutas |
| Cold start del backend | Sí (serverless) | 0 (proceso persistente) | `uptime` y logs |
| Restauración de respaldo | No probada | RPO ≤ 24 h, RTO ≤ 2 h, simulacro medido | 26-G |
| Corte y retorno | No existe | Corte < 15 min y retorno probado | 26-I |
| Concurrencia del chat | 20/20 200, p95 8,9 s | 20/20 200, p95 ≤ 8,9 s; 50 con think time sin 5xx | 26-H / load test |

## 2. Alcance

**Dentro del alcance**

- Imagen Docker de PostgreSQL 17 + PostGIS + pgvector y Compose local.
- Runner de migraciones portable y migración `000` de compatibilidad de roles.
- Driver `postgres` con `pg.Pool`, roles de mínimo privilegio y pruebas de
  integración.
- Servidor Node persistente con **todas** las rutas que hoy viven en `api/`:
  chat, proxy, ARClim y estaciones; `/healthz` y cierre ordenado.
- Nginx (o Caddy) con TLS, HTTP/2, compresión, estáticos, caché de proxy y
  `limit_req`.
- Proxy persistente de Copernicus/Worldview con caché en disco y conexiones
  reutilizadas.
- Migración de datos desde Supabase: dump, restore, conteos y catálogo.
- Migración de las ingestas programadas (GitHub Actions) a timers del VPS.
- Staging con la misma topología e imágenes que producción.
- Backups cifrados fuera del VPS, retención y simulacro de restauración.
- Endurecimiento del VPS y ajuste básico de PostgreSQL.
- Corte de DNS/TLS, pruebas de humo y procedimiento de retorno.

**Fuera del alcance**

- Sprint 08 (capas desde PostGIS/MVT). Este sprint deja la base; la migración de
  capas va después.
- CI/CD, artefactos versionados y rollback por tag (Sprint 27).
- CSP, vendorización y auditoría de dependencias del frontend (Sprint 28).
- Autenticación de administradores y panel admin (Sprints 15-16; ADR 007).
- Alta disponibilidad, multi-nodo, Kubernetes o Redis. Se asume **un VPS y un
  proceso Node**; si se escala a varios workers, Redis se evalúa después.
- Object storage para PDFs del RAG; los PDFs siguen en `rag/inbox/` y el
  manifiesto en git.
- Reemplazar Leaflet, cambiar el diseño del visor o agregar features.

## 3. Estado actual y línea base

| Componente | Hoy | Consecuencia para el sprint |
|---|---|---|
| Hosting | Vercel Hobby (demo) | Se reemplaza por Nginx + Node en VPS |
| Base de datos | Supabase ~913 MB, PostgREST | Se reemplaza por PostgreSQL propio con `pg.Pool` |
| Driver | `DB_DRIVER=postgres` (`server/db/drivers/postgres.js`) con `pg.Pool`; Supabase queda como legacy | Implementado en 26-B; `check:rpcs` detecta 12 RPCs heredadas |
| Endpoints | 10 públicos; `api/*.js` delegan en handlers puros y `server/routes/` los monta en Node | Implementado en 26-A |
| Chat | `api/chat.js` → `handleChat()` | Ya es un handler puro; falta el adapter Node |
| Proxy | `api/proxy.js` → `handleProxy()` | Ya es un handler puro; falta caché de disco/Nginx |
| Ingestas | 4 workflows de GitHub Actions contra Supabase | Deben pasar a timers del VPS |
| Migraciones | `db/migrations/001-037`; `036` RAG no aplicada | Falta runner portable y `000_compat_roles.sql` |
| Dependencia `pg` | `pg@8.23.1` ya instalada | Se usa para el driver y el runner |
| Tests | 317 (316 pasan con BD de integración, 1 omitido) | Deben seguir pasando; se agregan tests de integración |

**Endpoints a migrar** (contrato actual, sin cambios de payload):

| Ruta | Método | Handler actual |
|---|---|---|
| `/api/chat` | POST | `server/handlers/chat.js` |
| `/api/proxy` | GET | `server/proxy/handler.js` |
| `/api/arclim-geojson` | GET | `api/arclim-geojson.js` |
| `/api/stations-map` | GET | `api/stations-map.js` |
| `/api/station-details` | GET | `api/station-details.js` |
| `/api/station-series` | GET | `api/station-series.js` |
| `/api/station-available-dates` | GET | `api/station-available-dates.js` |
| `/api/variable-availability` | GET | `api/variable-availability.js` |
| `/api/variable-available-dates` | GET | `api/variable-available-dates.js` |
| `/api/historical-stations` | GET | `api/historical-stations.js` |

`/api/config` (Sprint 07) queda reservado; no se implementa en este sprint.

## 4. Invariantes

| # | Invariante | Cómo se comprueba en cada puerta |
|---|---|---|
| INV-1 | El stack Vercel + Supabase sigue operativo hasta el corte | Smoke contra la URL de demo antes y después de cada tramo |
| INV-2 | El contrato de `/api/chat` no cambia | Golden set y tests del contrato de respuesta |
| INV-3 | No hay secretos en el frontend ni en las imágenes; la BD no se publica a internet | Revisión de `js/`, `docker compose config`, escaneo de puertos |
| INV-4 | Todos los tests existentes siguen pasando | `npm test` y `npm run lint` |
| INV-5 | Local, staging y producción usan la misma imagen y el mismo Compose | Tags/digests idénticos; `docker compose config` |
| INV-6 | Vercel + Supabase quedan congelados: no se agregan features ni optimizaciones | Diff del sprint no toca `vercel.json` ni el driver Supabase salvo compatibilidad |
| INV-7 | Los datos migrados mantienen conteos y claves | Conteo por tabla y `pg_dump`/`pg_restore` verificados |
| INV-8 | El visor funciona aunque la API Node esté caída: estáticos y GeoJSON se sirven igual | Prueba apagando `api` y recargando el visor |
| INV-9 | El corte es reversible hasta 7 días después | DNS con TTL bajo y Supabase intacto |
| INV-10 | Una sola fuente de configuración: `.env` fuera de git, permisos 600 | Revisión de `.gitignore`, permisos y `git log` |

## 5. Decisiones arquitectónicas

| Decisión | ADR | Estado |
|---|---|---|
| PostgreSQL propio: instancia única, schemas, extensiones, roles, pool y migraciones | `006-postgres-propio.md` | Aceptado 2026-11-10 |
| Borde y entrega estática: Nginx + TLS + caché + `limit_req` | `010-borde-nginx.md` | Aceptado 2026-11-11 |
| Programación de ingestas: systemd timers sobre `docker compose run` | `011-ingestas-programadas.md` | Pendiente (se escribe en 26-J) |
| Autenticación de administradores | `007-auth-admin.md` | Fuera de este sprint (Sprint 15) |
| Entrega por artefactos versionados | `008-entrega-artefactos.md` | Sprint 27 |

**Decisiones de implementación de esta spec** (no requieren ADR propio):

- **Servidor HTTP:** `node:http` sin framework, con un router pequeño en
  `server/http/`. Menos dependencias y control explícito de timeouts, body
  limit, CORS y cierre ordenado.
- **Estáticos:** los sirve Nginx directamente desde el checkout; Node solo
  atiende `/api/*` y `/healthz`.
- **Un proceso API:** rate limit, caché de catálogo y semáforo LLM pasan a ser
  globales. No se agrega Redis en este sprint.
- **Migraciones:** runner propio con `pg` y tabla `public.schema_migrations`
  (versión, checksum, fecha). Sin dependencia nueva.
- **Roles:** `woll_api` (login, solo lectura/execute) y `woll_ingest` (login,
  escritura de ingestas). `anon`, `authenticated` y `service_role` se crean
  NOLOGIN solo por compatibilidad con las migraciones existentes. Las
  contraseñas se setean con un script desde `.env`, nunca en SQL versionado.

## 6. Topología objetivo

```text
Internet
   │  HTTPS 443
   ▼
┌─────────────────────────────────────────────────────────────┐
│ Nginx (contenedor)                                          │
│ - TLS/HTTP2, gzip, HSTS, security headers                   │
│ - Estáticos: index.html, js/, css/, assets/, geojson/       │
│ - /api/* → api:3000                                         │
│ - limit_req en /api/chat y /api/proxy                       │
│ - proxy_cache en disco para /api/proxy                      │
└───────────────┬─────────────────────────────────────────────┘
                │ red interna
                ▼
┌─────────────────────────────────────────────────────────────┐
│ API Node persistente (contenedor)                           │
│ - /api/chat, /api/proxy, /api/arclim-geojson, estaciones    │
│ - /healthz                                                  │
│ - rate limit, caché de catálogo, semáforo LLM globales      │
└───────────────┬─────────────────────────────────────────────┘
                │ pg.Pool (red interna, sin puerto público)
                ▼
┌─────────────────────────────────────────────────────────────┐
│ PostgreSQL 17 + PostGIS + pgvector (contenedor)             │
│ - schemas public, chat, admin, ingest, rag, extensions      │
│ - volumen pgdata                                            │
└─────────────────────────────────────────────────────────────┘

Timers systemd → docker compose run --rm ingest → PostgreSQL
Backups → pg_dump cifrado → almacenamiento externo
```

## 7. Contrato de datos y configuración

### 7.1. Variables de entorno

Se mantienen las variables actuales y se agregan las del entorno propio:

```bash
# Base de datos propia
DB_DRIVER=postgres
DATABASE_URL=postgres://woll_api:CAMBIAR@postgres:5432/woll
DATABASE_ADMIN_URL=postgres://postgres:CAMBIAR@postgres:5432/woll
PGPOOL_MAX=10
PG_STATEMENT_TIMEOUT_MS=5000
PG_QUERY_TIMEOUT_MS=6000

# Entorno
NODE_ENV=production
PORT=3000
APP_ORIGIN=https://visor.example.cl
ALLOWED_ORIGINS=https://visor.example.cl,https://staging.visor.example.cl
TRUST_PROXY_HOPS=1
GEO_PROVIDER=none
LOG_LEVEL=info

# Chat
ORCHESTRATOR_BUDGET_MS=20000
LLM_MAX_CONCURRENCY=8
LLM_MAX_QUEUE=40
```

`SUPABASE_URL`, `SUPABASE_SERVICE_KEY` y `COPERNICUS_*` no se eliminan del
`.env.example` hasta cerrar la demo; en el VPS no se configuran las de Supabase.

### 7.2. Roles y permisos

| Rol | Login | Uso | Permisos |
|---|---|---|---|
| `woll_api` | Sí | API Node | `USAGE` en `public`, `chat`, `extensions`; `EXECUTE` en RPCs `chat.*`/`public.chat_*`; `SELECT` en tablas de capas cuando el Sprint 08 lo requiera |
| `woll_ingest` | Sí | Ingestas | `USAGE` en `ingest`; `EXECUTE` en RPCs de ingesta; escritura en `ingest.*` |
| `rag_ingest` | Sí | Ingesta RAG | `rag_writer` (definido en 036) |
| `anon`, `authenticated`, `service_role` | No | Compatibilidad con migraciones | Sin login; solo existen para que los `GRANT`/`REVOKE` de 001-037 no fallen |

El API **no** usa `service_role` ni un rol con `BYPASSRLS`. Las RPCs son
`SECURITY DEFINER` y se ejecutan con el owner; el API solo recibe `EXECUTE`.

`pg` no implementa cancelación por `AbortSignal`; el driver usa
`statement_timeout` y `query_timeout`. Las tools conservan su `withTimeout` y la
interfaz `opts.signal`, pero la cancelación efectiva la hace PostgreSQL. Los
tests no deben asumir corte inmediato.

### 7.3. Migraciones

- `db/migrations/000_compat_roles.sql`: crea schema `extensions`, PostGIS en
  `public` y `vector`/`unaccent` en `extensions`, roles de compatibilidad y roles de login
  NOLOGIN; fija `search_path` de la base y de los roles.
- `db/migrations/001-037`: se aplican sin editar. `036` RAG se aplica en el VPS
  (en Supabase no estaba aplicada).
- Migración nueva `038_platform_grants.sql` si hace falta reconciliar permisos
  de `woll_api`/`woll_ingest`; se decide en 26-B/C.
- Runner `scripts/migrate.mjs`: orden lexicográfico, transacción por archivo,
  checksum, `--status`, `--dry-run`, `--to`. Falla si una migración ya aplicada
  cambió.
- `npm run migrate` y `npm run migrate:status`.

### 7.4. Datos

- Dump desde Supabase de los schemas `public`, `chat`, `admin`, `ingest` y `rag`
  (si existe), sin owners ni ACL de Supabase.
- Restore sobre una base limpia con extensiones y roles ya creados.
- Verificación por tabla: conteo, `MAX(id)` de secuencias, integridad de
  geometrías (`ST_IsValid`), catálogo `chat.chat_catalog` y conteos por capa.
- RAG: se aplica 036 y se verifica `rag.documents`/`rag.chunks`; la ingesta de
  PDFs no forma parte del corte.
- Staging usa una copia de los datos; si se copian `admin.unanswered_questions`
  o auditoría del chat, se anonimizan o truncan.

### 7.5. Archivos y artefactos a crear

| Archivo | Propósito |
|---|---|
| `docker/postgres/Dockerfile` | PostgreSQL 17 + PostGIS + pgvector, versiones fijadas |
| `docker/api/Dockerfile` | Imagen Node 22 con `server/` y `scripts/`; usuario no root |
| `docker-compose.yml` | Servicios `postgres`, `api`, `nginx`, `ingest` (perfil tools), volúmenes y redes |
| `docker-compose.prod.yml` | Overrides de producción: sin puertos de Postgres, límites, restart |
| `deploy/nginx/woll.conf` | TLS, estáticos, caché, `limit_req`, proxy a `api:3000` |
| `deploy/systemd/woll-ingest-*.{service,timer}` | Ingestas programadas en el host |
| `scripts/migrate.mjs` | Runner de migraciones con checksum y `--status` |
| `scripts/bootstrap-roles.sh` | Setea passwords de `woll_api`/`woll_ingest` desde `.env` |
| `scripts/backup.sh` / `scripts/restore.sh` | Dump cifrado, retención y restauración |
| `server/index.js` y `server/http/` | Servidor HTTP, router, body limit, CORS, errores |
| `server/routes/*.js` | Rutas de chat, proxy, ARClim, estaciones y health |
| `server/db/drivers/postgres.js` | Driver `pg.Pool` |
| `server/db/rpc-signatures.js` | Firma/tipos/retorno de cada RPC usada |
| `db/migrations/000_compat_roles.sql` | Extensiones, roles y `search_path` |

## 8. Mapa de tramos

| Tramo | Nombre | Horas | Depende de | Reversión | Spec | Estado |
|---|---|---|---|---|---|---|
| 26-C | Imagen PostgreSQL/PostGIS/pgvector, `000_compat_roles.sql` y runner de migraciones | 5 | — | Borrar el volumen y volver a Supabase | `26-C-imagen-postgres.md` | ✅ done |
| 26-B | Driver `postgres` con `pg.Pool`, roles y pruebas de integración | 5 | 26-C | `DB_DRIVER=supabase` | `26-B-driver-postgres.md` | ✅ done |
| 26-A | Servidor Node, extracción de handlers de estaciones/ARClim, rutas de los 10 endpoints, `/healthz` y cierre ordenado | 6 | 26-B | Apagar Node y volver a Vercel | `26-A-servidor-node.md` | ✅ done |
| 26-D | Compose, Nginx/Caddy, TLS (certbot), estáticos, caché de proxy y `limit_req` | 6 | 26-A, 26-C | Volver al proxy/Function de demo | `26-D-compose-nginx.md` | ✅ done |
| 26-E | Dump/restore, `load-layer`, `build_catalog` y verificación de conteos | 5 | 26-C | Supabase sigue intacto | `26-E-datos.md` | ✅ done |
| 26-J | Ingestas programadas en el VPS (systemd timers) y retiro de los workflows de Supabase | 3 | 26-B, 26-E | Reactivar los workflows de GitHub Actions | `26-J-ingestas.md` | pendiente |
| 26-F | Staging idéntico a producción (misma imagen/Compose, datos y dominio) | 3 | 26-D, 26-E | Apagar staging | `26-F-staging.md` | siguiente |
| 26-G | Backups cifrados, retención, copia externa y simulacro de restauración | 4 | 26-C | Desactivar el timer de backup | `26-G-backups.md` | pendiente |
| 26-H | Endurecimiento del VPS, ajuste de PostgreSQL, monitoreo básico y rotación de secretos | 4 | 26-D, 26-F | Revertir reglas de firewall/SSH | `26-H-hardening.md` | pendiente |
| 26-I | Corte de DNS/TLS, smoke posterior y procedimiento de retorno | 3 | Todos | DNS de vuelta a Vercel | `26-I-corte.md` | pendiente |

**Total:** 44h (rango 42-46h).

**Orden de ejecución:** 26-C → 26-B → 26-A → 26-D/26-E en paralelo → 26-J →
26-F → 26-G/26-H → 26-I. La imagen de PostgreSQL (26-C) es el disparador: desde
ese commit no se agregan features a Vercel/Supabase.

## 9. Criterios de aceptación del sprint completo

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | una base vacía | se aplica el runner dos veces | termina sin errores y las 71 capas cargan con el mismo conteo que Supabase | `npm run migrate` + script de conteos |
| CA-2 | staging | se compara con producción | misma topología, misma imagen y mismas versiones de Postgres/PostGIS/pgvector | `docker compose config` + `SELECT version()` |
| CA-3 | un backup del día anterior | se restaura en un entorno limpio | el sistema funciona y el tiempo de restauración queda registrado (RTO ≤ 2 h) | simulacro 26-G |
| CA-4 | un escaneo desde internet | se ejecuta contra el VPS | solo 80/443 responden; SSH restringido; Postgres y Node no están publicados | `nmap` + `ufw status` |
| CA-5 | el corte | se cambia el DNS | el chat responde sin el límite de 10 s y existe un retorno probado | smoke + ensayo de rollback |
| CA-6 | el VPS | se apaga el contenedor `api` | el visor y los GeoJSON siguen cargando; el chat muestra un error controlado | prueba manual (INV-8) |
| CA-7 | los 10 endpoints actuales | se prueban desde el dominio del VPS | devuelven el mismo contrato y datos que la demo | smoke de rutas |
| CA-8 | 20 requests concurrentes al chat | se ejecutan contra el VPS | 20/20 HTTP 200; p95 ≤ 8,9 s; sin 5xx | load test |
| CA-9 | 50 usuarios con think time | se ejecutan contra el VPS | sin 5xx; 429 solo por rate limit; latencia documentada | load test 26-H |
| CA-10 | una ráfaga de tiles de Copernicus | se repite contra `/api/proxy` | la caché de Nginx sirve una fracción y el `INSTANCE_ID` no aparece en el navegador | logs de caché + Network |
| CA-11 | los timers de ingesta | se ejecutan en el VPS | cargan datos sin variables de Supabase y sin GitHub Actions | `systemctl list-timers` + logs |
| CA-12 | el repositorio y las imágenes | se revisan | no contienen `.env`, claves ni `service_role`; `.env` del VPS tiene permisos 600 | `git grep` + `docker history` |
| CA-13 | un reinicio del VPS | se reinicia | Postgres, API y Nginx vuelven solos; `/healthz` responde 200 | `reboot` + healthcheck |
| CA-14 | el corte | pasan 7 días | Supabase/Vercel se pueden apagar sin afectar producción | monitoreo + checklist |

## 10. Puertas entre tramos

Un tramo no se cierra hasta cumplir todo:

- [ ] `npm test` y `npm run lint` limpios.
- [ ] INV-1 a INV-10 comprobados en lo que aplique.
- [ ] Verificado en Docker local y, cuando exista, en staging del VPS.
- [ ] Reversión probada al menos una vez.
- [ ] Migraciones y variables documentadas; `.env.example` actualizado.
- [ ] Docs y CHANGELOG actualizados; ARCHITECTURE si cambia algo estructural.
- [ ] Re-estimación del resto. Si un tramo tomó el doble, se detiene el sprint y
      se revisa esta spec.

## 11. Tests requeridos

| Nivel | Qué se prueba |
|---|---|
| Unitario (`node:test`) | Router HTTP, parseo de query/body, CORS/IP, `/healthz`, envelope de errores, driver `postgres` (mapeo de RPCs y tipos), runner de migraciones (checksum/orden); handlers de estaciones/ARClim |
| Integración (Docker) | Todas las RPCs usadas por el chat, las tools, las estaciones y las ingestas (48 nombres identificados en `server/`, `scripts/` y `api/`) contra PostgreSQL; endpoints de estaciones; migraciones 000-040 dos veces; `build_catalog` |
| Contrato | `/api/chat` con el golden set; los 10 endpoints comparados contra la demo |
| Carga | 20 y 50 usuarios concurrentes; ráfaga de tiles de Copernicus |
| Borde | `podman/docker compose config`, healthchecks, estáticos, denegaciones, caché de `/api/proxy`, `limit_req` y `nginx -t` con TLS |
| Seguridad | Escaneo de puertos, `docker compose config`, permisos de `.env`, ausencia de secretos |
| Operación | Reinicio del VPS, caída de `api`, restauración de backup, timers de ingesta |

Los tests de integración se saltan si no existe `DATABASE_URL_TEST`, igual que
el patrón actual de RAG (`RAG_TEST_DATABASE_URL`).

## 12. Seguridad y procedencia

- Secretos solo en `.env` del VPS (600) o en el gestor de secretos del proveedor;
  nunca en git, imágenes ni frontend.
- Postgres sin puerto publicado; solo accesible por la red interna de Compose.
- Rol de API sin `BYPASSRLS`; RPCs `SECURITY DEFINER` con `search_path` fijo.
- Nginx: TLS 1.2/1.3, HSTS, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `limit_req` y body limit.
- SSH solo con llave, sin root, `ufw` y `fail2ban`.
- `TRUST_PROXY_HOPS=1` y `GEO_PROVIDER=none` detrás de Nginx; no se confía en
  `X-Forwarded-For` del cliente.
- Logs sin tokens, sin preguntas completas del usuario y sin contenido RAG.
- Rotación de logs de Docker/Nginx y límite de tamaño.
- Los datos de capas y documentos RAG se tratan como no confiables al renderizar.

## 13. Riesgos

| Riesgo | Prob. | Impacto | Mitigación | Señal de alarma |
|---|---|---|---|---|
| El host directo de Supabase es IPv6 y la red no lo soporta | Media | Medio | Usar Session pooler en 5432 (no transaction pooler 6543) | `Network is unreachable` al conectar |
| Diferencias entre PostgREST y `pg` (tipos, `jsonb`, `null`, errores) | Alta | Alto | Driver con registro de firmas y tests de todas las RPCs usadas | Una tool devuelve forma distinta |
| RPCs heredadas que existen en Supabase pero no en las migraciones | Alta | Alto | `npm run check:rpcs` + dump de schemas en 26-E; no inventar definiciones | `check:rpcs` reporta faltantes |
| El restore choca con extensiones, roles o `search_path` | Media | Alto | `000_compat_roles.sql`, base limpia y restore de prueba | Error de extensión/rol en 26-E |
| El VPS se queda corto de CPU/RAM con 50 usuarios y tiles | Media | Alto | Dimensionar 8 vCPU/16 GB si se activa MVT; medir en 26-H | CPU > 80 % o p95 > 12 s |
| El corte de DNS/TLS falla o tarda | Media | Alto | TTL 300, ensayo con staging, rollback documentado | Certificado o DNS no propagan |
| Las ingestas duplican datos al migrar de GitHub Actions | Media | Medio | Desactivar workflows antes del corte; `flock` y ventana de mantenimiento | Conteos duplicados |
| Los backups no restauran | Media | Alto | Simulacro mensual y verificación `pg_restore --list` | Restore falla o excede RTO |
| Se filtran secretos en la imagen o el repo | Baja | Alto | `.dockerignore`, `git grep`, revisión de `docker history` | Clave en capas de imagen |
| Se sigue optimizando Vercel por inercia | Media | Medio | INV-6 y revisión de diff | Cambios en `vercel.json` o driver Supabase |

## 14. Decisiones aprobadas y preguntas abiertas

Los defaults de M2-M9 quedaron **aprobados el 2026-11-10**. M1 se resolvió: hay
Supabase CLI y una conexión DBeaver en la máquina local para obtener el dump.

| # | Pregunta | Decisión | Impacto si cambia | ¿Bloquea? |
|---|---|---|---|---|
| M1 | ¿Cómo se obtiene el dump de Supabase? | **Resuelta:** Supabase CLI + conexión DBeaver; se prueba un dump parcial en 26-E | Sin dump no hay migración de datos | no |
| M2 | ¿Qué VPS se contrata? | **Aprobado:** 4 vCPU, 8 GB RAM, 80 GB NVMe, Ubuntu 24.04 LTS; 8 vCPU/16 GB si se activa MVT | Cambia límites, tuning y costo | no (26-D/H) |
| M3 | ¿Dominio y DNS? | **Aprobado:** subdominio del cliente, TTL 300 desde 24 h antes del corte | Sin DNS no hay TLS ni corte | no (26-I) |
| M4 | ¿Destino de backups externos? | **Aprobado:** Restic a S3-compatible (Backblaze B2) o `rsync` a otro host | Cambia 26-G | no (26-G) |
| M5 | ¿Nginx o Caddy? | **Aprobado:** Nginx (limit_req y caché nativos; Caddy requiere plugin) | Cambia la config del borde | no (26-D) |
| M6 | ¿Cómo se programan las ingestas? | **Aprobado:** systemd timers en el host → `docker compose run --rm ingest` | Cambia 26-J | no (26-J) |
| M7 | ¿Versiones exactas? | **Aprobado:** PostgreSQL 17.11, PostGIS 3.7.0, pgvector 0.8.7, Node 22 LTS (versiones fijadas en la imagen) | Cambia la imagen y las pruebas | no (26-C) |
| M8 | ¿Se aplica el esquema RAG (036) en este sprint? | **Aprobado:** sí, esquema y pgvector; no se ingesta corpus nuevo | Si no, queda deuda para Sprint 18 | no |
| M9 | ¿Qué pasa con los 4 workflows de GitHub Actions? | **Aprobado:** se desactivan y se reemplazan por timers del VPS | Si se mantienen, escriben en Supabase y duplican | no (26-J) |

## 15. Reversión global y promoción

- **Reversión global:** mantener Vercel + Supabase intactos y con DNS de vuelta a
  Vercel. El retorno se prueba antes del corte y queda disponible 7 días.
- **Orden de promoción:** migraciones → variables de entorno → imágenes → API →
  Nginx → DNS. Cada paso con smoke propio.
- **Ventana de corte:** congelar ingestas, hacer un dump final, restaurar,
  verificar conteos, cambiar DNS y monitorear 72 h.
- **Datos escritos en el VPS durante el corte:** auditoría del chat, preguntas no
  respondidas e ingestas. Si hay rollback, se exportan y se reaplican en
  Supabase o se acepta la pérdida documentada.
- **Qué se retira y cuándo:** nada de Vercel/Supabase se elimina en 26-I; se
  apaga la demo después de 7 días estables (CA-14).

## 16. Documentos a actualizar

ROADMAP (tramos, horas y estado), CHANGELOG, ARCHITECTURE (§2 ambientes, §3
stack, §4 backend, §5 BD), DEV_GUIDE (Docker, migraciones, deploy, backups,
rollback), AGENTS.md (comandos y reglas del VPS), README (mapa de archivos y
despliegue), `.env.example`, ADRs 006/010/011 y
`docs/integrations/proxy-servicios-externos.md`.

## 17. Puntos de integración

- **Sprint 08 (PostGIS):** reutiliza la imagen, el runner, el driver y Nginx.
  Este sprint no migra capas a MVT.
- **Sprint 17/18 (RAG):** el esquema 036 y `pgvector` quedan listos; la ingesta
  de corpus sigue en `scripts/ingest_docs.mjs` con `DATABASE_URL`.
- **Sprint 27 (CI/CD):** reemplaza el checkout manual por artefactos/imágenes
  versionadas y agrega rollback por tag.
- **Sprint 28 (seguridad frontend):** CSP, vendorización y auditoría de
  dependencias se hacen sobre el Nginx de este sprint.
- **Sprints 15/16 (admin):** usan la misma base y el mismo runner; la auth es
  ADR 007 y no se implementa acá.
- **Chat IA:** mismas tools y RPCs; el único cambio es el transporte (Node en
  vez de Vercel Function) y el presupuesto de tiempo.

## 18. Cierre

- Fecha de cierre:
- Horas reales por tramo vs. estimadas:
- Desvíos y lecciones:
