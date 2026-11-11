# Spec 26-D — Compose, Nginx, TLS y proxy persistente

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 26-D |
| **Estado de la spec** | CERRADA (2026-11-11) |
| **Tamaño** | Mediano (6h) |
| **Dependencias** | 26-A (servidor Node), 26-C (imagen PostgreSQL) |
| **Última revisión** | 2026-11-11 |

## 1. Objetivo

Levantar el stack completo en Docker Compose —PostgreSQL, API Node, Nginx y
runner de ingestas— con Nginx como único servicio público, TLS, estáticos,
caché de `/api/proxy` y límites de requests. El mismo compose y las mismas
imágenes se usan en local, staging y producción.

## 2. Alcance

**Dentro**

- `docker/api/Dockerfile`: imagen Node 22 con `server/`, `scripts/` y `db/`, sin
  devDependencies, usuario `node`.
- `docker-compose.yml`: servicios `postgres`, `api`, `nginx` e `ingest`.
- `docker-compose.dev.yml`: puertos en loopback, Nginx HTTP en 8080, API en
  3000, PostgreSQL en 5432.
- `docker-compose.prod.yml`: Nginx en 80/443, TLS, certificados, certbot y
  perfiles.
- `deploy/nginx/woll.conf`, `woll.dev.conf`, `woll-locations.conf` y
  `woll-proxy.conf`.
- Estáticos servidos por Nginx desde el checkout; API solo `/api/*`,
  `/healthz` y `/readyz`.
- `limit_req` para chat y proxy; `proxy_cache` en disco para `/api/proxy`.
- Healthchecks de PostgreSQL, API y Nginx.
- Documentación del flujo TLS (emisión inicial y renovación).

**Fuera**

- Backups, hardening, tuning y monitoreo (26-G/H).
- CI/CD y artefactos versionados (Sprint 27).
- CSP y vendorización del frontend (Sprint 28).
- Ingestas programadas (26-J): el servicio `ingest` queda listo, pero los
  timers se agregan en 26-J.

## 3. Contrato del stack

| Servicio | Imagen | Puertos | Notas |
|---|---|---|---|
| `postgres` | `woll/postgres:17` | Ninguno | Volumen `pgdata`; healthcheck `pg_isready` |
| `api` | `woll/api:latest` | Ninguno en base; `127.0.0.1:3000` en dev | `pg.Pool`, `/healthz`, usuario `node`, rootfs read-only |
| `nginx` | `nginx:1.27-alpine` | `80/443` en prod; `127.0.0.1:8080` en dev | Único servicio público; sirve estáticos y proxya `/api/*` |
| `ingest` | `woll/api:latest` | Ninguno | Perfil `tools`; `entrypoint: node scripts/ingest-run.mjs` |
| `certbot` | `certbot/certbot` | Ninguno | Perfil `tls`; renovación por webroot |

**Red:** una red bridge `internal`; Postgres y API no publican puertos en
producción. Nginx es el borde.

**Volúmenes:** `pgdata`, `nginx_cache`, `letsencrypt`, `certbot_www`.

**Variables de contenedor:**

- `DATABASE_URL_DOCKER` (host `postgres`) para `api`/`ingest`.
- `ALLOWED_ORIGINS` con el dominio del VPS.
- `GEO_PROVIDER=none`, `TRUST_PROXY_HOPS=1` detrás de Nginx.
- Secretos de LLM, Copernicus y MeteoChile vía `env_file` (`.env` en prod,
  `.env.local` en dev).

### 3.1. Nginx

- Estáticos: `/`, `js/`, `css/`, `assets/`, `geojson/`.
- `index.html` y fallback SPA: `no-cache`; JS/CSS/assets: 7 días; GeoJSON: 1 día.
- Deniega `/docs`, `/db`, `/server`, `/scripts`, `/rag`, `/docker`, `/deploy`,
  `node_modules`, `data`, dotfiles y archivos de repo (`*.md`, `package*.json`,
  `vercel.json`, `docker-compose*.yml`).
- `/healthz` y `/readyz` → API.
- `/api/chat`: `limit_req zone=chat rate=120r/m burst=30`.
- `/api/proxy`: `limit_req zone=proxy rate=1200r/m burst=200`, caché en disco
  de 2 GB, `proxy_cache_valid 200 1h`, `proxy_cache_lock on` y
  `proxy_cache_use_stale`.
- `client_max_body_size 1m`, gzip, HTTP/2 en TLS.
- Headers: HSTS (solo TLS), `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`.
- `proxy_set_header Host/X-Real-IP/X-Forwarded-For/X-Forwarded-Proto`;
  `Connection ""` para keepalive.
- En producción, `upstream` usa `resolve` + DNS de Docker (`127.0.0.11`) para
  seguir al contenedor API si cambia de IP. En dev se resuelve al arrancar.

### 3.2. TLS

- Certificado: `/etc/letsencrypt/live/woll/fullchain.pem` y `privkey.pem`.
- Emisión inicial con `certbot certonly --standalone -d $DOMAIN --cert-name woll`
  antes de levantar Nginx (o con un Nginx bootstrap HTTP).
- Renovación: servicio `certbot` (perfil `tls`) con `certbot renew --webroot`;
  Nginx sirve `/.well-known/acme-challenge/` desde `/var/www/certbot`.
- `woll.conf` redirige HTTP a HTTPS salvo ACME y `/nginx-health`.

## 4. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | el repo | se valida el compose dev y prod | `docker/podman compose config` termina sin errores | smoke |
| CA-2 | el stack dev | se levanta | PostgreSQL, API y Nginx quedan `healthy` | `ps`/healthchecks |
| CA-3 | Nginx | se pide `/nginx-health` | 200 sin tocar la API | curl |
| CA-4 | Nginx | se pide `/healthz` | 200 con la BD arriba | curl |
| CA-5 | Nginx | se pide `/` | 200 `text/html` | curl |
| CA-6 | Nginx | se pide `/api/stations-map` | 200 y proxya a la API | curl |
| CA-7 | Nginx | se pide `/api/chat` con `{}` | 400 de la API, no 502 | curl |
| CA-8 | Nginx | se piden `/docs/...` y `/.env.local` | 404 y 403 | curl |
| CA-9 | estáticos | se piden JS e index | JS con `max-age=604800`, index `no-cache` | `curl -I` |
| CA-10 | `/api/proxy` | se repite una imagen ya cacheada con la API detenida | Nginx responde 200 desde caché | curl + bytes |
| CA-11 | `/api/chat` | se envían 40 requests rápidas | hay 429 por `limit_req`, sin 5xx | curl + conteo |
| CA-12 | configuración TLS | se prueba con certificado autofirmado | `nginx -t` OK y HSTS en 443 | `nginx -t` + curl `-k` |
| CA-13 | producción | se revisa el compose | API y Postgres no publican puertos; solo Nginx 80/443 | `compose config` |
| CA-14 | imagen API | se inspecciona el contenedor | corre como `node`, rootfs read-only y `/tmp` escribible | `id` + touch |
| CA-15 | perfil `tools` | se ejecuta `ingest` | el servicio existe y usa la misma imagen | `compose config` |

## 5. Tests

- Validación de `docker-compose.yml` + dev/prod con `podman-compose config`.
- Build de `docker/api/Dockerfile`.
- Stack dev real: healthchecks, rutas, estáticos, denegaciones y headers.
- Caché de Nginx: llenar `/api/proxy`, detener API y repetir la misma URL.
- `limit_req`: 40 requests a `/api/chat`; contar 400/429.
- TLS: certificado autofirmado, `nginx -t`, `/nginx-health` por 443 y HSTS.
- `nginx -t` con los snippets montados en `/etc/nginx/snippets/`.

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| Nginx no re-resuelve la API tras recrear el contenedor | `resolve` + DNS de Docker en prod; reiniciar Nginx en dev si se recrea solo `api` |
| Certificado ausente impide arrancar Nginx | Emitir el certificado antes del `up` de producción; documentado |
| `proxy_cache` sirve respuestas equivocadas | Clave con método/host/URI; solo GET/HEAD; TTL acotado |
| `limit_req` muy agresivo para 20-50 usuarios | Rate/burst por encima del rate limit de la app; ajustar en 26-H |
| Bind mounts bloqueados por SELinux | `:ro,Z` en todos los mounts de Nginx |
| Secretos en el checkout servido por Nginx | Denegar dotfiles, docs, db, server, scripts y archivos de repo |

## 7. Reversión

Volver a Vercel + Supabase: apagar el stack (`docker compose down`) y mantener
el DNS apuntando a Vercel. Los adapters `api/*.js` siguen existiendo. Nginx no
modifica datos.

## 8. Cierre

- **Estado:** CERRADA 2026-11-11.
- **Validación:** compose dev/prod válido; stack dev con PostgreSQL, API y Nginx
  healthy; rutas y estáticos verificados; `/api/proxy` servido desde caché con
  la API detenida; 40 requests a `/api/chat` dieron 400/429; TLS con
  certificado autofirmado, `nginx -t` y HSTS; API como usuario `node`, rootfs
  read-only y `/tmp` tmpfs.
- **Desvíos:** Podman no soporta `resolver` + `resolve` con su DNS; el compose
  de desarrollo resuelve `api` al arrancar y documenta reiniciar Nginx si se
  recrea solo la API. Producción usa el DNS de Docker.
- **Lecciones:** los snippets de Nginx deben vivir fuera de `conf.d` para no
  cargarse dos veces; los bind mounts en Fedora necesitan `:Z`.
