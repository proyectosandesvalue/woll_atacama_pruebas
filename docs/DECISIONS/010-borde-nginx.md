# ADR 010 — Borde y entrega estática: Nginx + TLS + caché

| Campo | Valor |
|---|---|
| Estado | Aceptada |
| Fecha | 2026-11-11 |
| Origen | Sprint 26-D |
| Relacionado | ADR 005 (VPS), Sprint 26 |

## Contexto

El VPS necesita un borde que termine TLS, sirva los estáticos y GeoJSON, proxye
`/api/*` al proceso Node, cachee los tiles de `/api/proxy` y aplique un límite
de requests antes de llegar a la aplicación. Las opciones eran Nginx y Caddy.

Caddy simplifica TLS automático, pero `limit_req` y la caché de proxy requieren
módulos/plugins adicionales. Nginx 1.27 trae `limit_req`, `proxy_cache`,
HTTP/2, gzip y TLS sin extras, y es el estándar operativo del VPS.

## Decisión

1. **Nginx 1.27-alpine** como único servicio público.
   - `80` solo ACME, `/nginx-health` y redirect a HTTPS.
   - `443` con TLS 1.2/1.3, HTTP/2, HSTS y headers de seguridad.
2. **Estáticos desde el checkout** montado en `/srv/woll:ro`.
   - `index.html` y fallback SPA: `no-cache`.
   - JS/CSS/assets: 7 días; GeoJSON: 1 día.
   - Denegar `docs/`, `db/`, `server/`, `scripts/`, `rag/`, `docker/`, `deploy/`,
     `data/`, dotfiles y archivos de repositorio.
3. **Proxy a la API** `api:3000` con keepalive.
   - `proxy_set_header Host`, `X-Real-IP`, `X-Forwarded-For` y
     `X-Forwarded-Proto`.
   - En producción, `upstream` con `resolve` y DNS de Docker (`127.0.0.11`)
     para seguir el contenedor API si cambia de IP.
   - En desarrollo se resuelve al arrancar; si se recrea solo `api`, reiniciar
     Nginx.
4. **Caché de `/api/proxy`** en disco (`/var/cache/nginx/proxy`, 2 GB), con
   `proxy_cache_lock`, TTL de 1 h para 200 y stale para errores.
5. **Límites:** `/api/chat` 120 r/m con burst 30; `/api/proxy` 1200 r/m con
   burst 200. Son un guardián de borde por encima del rate limit de la app.
6. **TLS con certbot.**
   - Certificado `--cert-name woll` en `/etc/letsencrypt/live/woll/`.
   - Emisión inicial con `certbot certonly --standalone` antes de levantar
     Nginx, o con un Nginx bootstrap HTTP.
   - Renovación con el servicio `certbot` (perfil `tls`) por webroot; Nginx
     sirve `/.well-known/acme-challenge/`.
7. **Snippets fuera de `conf.d`** (`/etc/nginx/snippets/`) para que el include
   de `conf.d/*.conf` no cargue `location` en contexto `http`.
8. **Mounts `:ro,Z`** para compatibilidad con SELinux (Fedora/RHEL).

## Consecuencias

- Nginx es el único puerto público; API y PostgreSQL quedan en la red interna.
- Los estáticos y GeoJSON no pasan por Node.
- La caché de tiles reduce llamadas a Copernicus/WorldAPI y carga del proxy.
- El rate limit de borde protege el proceso Node de ráfagas.
- Operar TLS y certbot es responsabilidad del VPS; hay que monitorear la
  renovación.
- La configuración se duplica en dev (HTTP) y prod (TLS), pero comparte
  `woll-locations.conf` y `woll-proxy.conf`.

## Referencias

- `docs/specs/26-plataforma/26-D-compose-nginx.md`
- `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.prod.yml`
- `deploy/nginx/`
- `docs/DECISIONS/005-plataforma-hosting-vps.md`
