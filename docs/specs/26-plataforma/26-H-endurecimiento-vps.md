# Spec 26-H — Endurecimiento y puesta en marcha del VPS

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 26-H |
| **Estado de la spec** | EN EJECUCIÓN — hardening, Docker, stack y backups ✅; DNS/TLS y secretos de terceros pendientes |
| **Tamaño** | Mediano (6 h) |
| **Dependencias** | 26-A, 26-B, 26-C, 26-D, 26-E, 26-G |
| **Última revisión** | 2026-11-23 |

## 1. Objetivo

Dejar el VPS de producción operativo y seguro como primer entorno real de la
plataforma: acceso solo por llave, superficie expuesta mínima, Docker con la
imagen propia de PostgreSQL, stack Compose levantado, datos restaurados desde
Supabase y backups verificados con simulacro de restauración.

## 2. Inventario del servidor

| Dato | Valor |
|---|---|
| Proveedor | webhospedaje.cl (panel Virtualizor / WHMCS) |
| Hostname | `srv761087.webhospedaje.com` |
| IP pública | `136.243.227.86/29` (gateway `.81`) |
| Virtualización | KVM, firmware Red Hat |
| SO | Ubuntu 24.04.4 LTS, kernel 6.8 |
| CPU / RAM | 4 vCPU / 15 GiB + 3.9 GiB swap |
| Disco | 76.1 GB ext4 en `/` (68 GB libres al cierre) |
| Zona horaria | `America/Santiago` |
| Usuarios | `root` (solo llave) y `deploy` (operación, sudo sin password) |

## 3. Decisiones

1. **Acceso.** `deploy` es el usuario de operación con `sudo` sin password y la
   llave `~/.ssh/woll_vps` del equipo de desarrollo. `root` queda habilitado
   solo con llave (`prohibit-password`) como acceso de emergencia; la consola
   del panel es la última red.
2. **sshd.** Drop-in `00-woll-hardening.conf` para que gane al
   `50-cloud-init.conf` que la imagen trae con `PasswordAuthentication yes`
   (en sshd gana la primera aparición del parámetro). Además
   `/etc/cloud/cloud.cfg.d/99-woll-ssh.cfg` con `ssh_pwauth: false` para que
   cloud-init no lo reactive en el próximo boot.
3. **Firewall.** UFW con política `deny incoming` y solo 22/80/443. Postgres y
   la API no publican puertos: viven en la red interna de Compose.
4. **fail2ban.** Jail `sshd` con `maxretry=5`, `findtime=10m`, `bantime=1h`,
   backend `systemd`.
5. **Docker.** Repo oficial de Docker (no `docker.io` de Ubuntu), `live-restore`
   activo, rotación de logs `50m × 3` y `vm.swappiness=10`.
6. **Nginx.** Único servicio con puertos públicos. El MIME de GeoJSON se
   declara con `default_type application/geo+json` en su `location` (no con un
   bloque `types`, que reemplaza el mapa heredado de `mime.types` y deja
   html/css/js como `octet-stream`). Así el GeoJSON entra en `gzip_types`:
   2.78 MB → 1.02 MB en `acuiferos.geojson`.
   **Cambiar un archivo de configuración montado exige recrear el contenedor**
   (`docker compose up -d --force-recreate nginx`): el bind mount fija el inode
   y `nginx -s reload` seguiría leyendo el archivo viejo.
7. **Datos.** Dump custom de Supabase del 2026-11-11 restaurado con
   `scripts/restore-local.sh` (`000_compat_roles.sql` + `pg_restore --clean`).
   Baseline de migraciones hasta 035 y aplicación de 036-055. `check:rpcs`
   valida 51/51 RPCs.
8. **Configuración del visor.** Snapshot `v1` publicado desde `js/config`
   (9 dimensiones, 158 capas, 315 filas de capas). `/api/config` responde 200.
9. **Backups.** `woll-backup.timer` a las 03:00 UTC con `Persistent=true`;
   dump `pg_dump -Fc -Z9`, cifrado GPG AES256, checksum, retención 14 días con
   mínimo 3 y alerta por `logger`. Simulacro medido: **RTO 53 s** para 1.425.842
   indicadores y 71 capas.

## 4. Procedimiento aplicado

```bash
# 1. Acceso
ssh-copy-id -i ~/.ssh/woll_vps.pub root@136.243.227.86
ssh woll-vps            # deploy
ssh woll-root           # emergencia

# 2. Endurecimiento (resumen)
apt-get update && apt-get -y upgrade
adduser --disabled-password deploy && usermod -aG sudo deploy
# /etc/ssh/sshd_config.d/00-woll-hardening.conf + cloud-init ssh_pwauth false
ufw default deny incoming && ufw allow 22,80,443/tcp && ufw --force enable
systemctl enable --now fail2ban

# 3. Docker
# repo oficial + docker-ce, compose plugin, daemon.json con rotación
usermod -aG docker deploy

# 4. Código (mientras no hay deploy key)
git bundle create woll-main.bundle main && scp ... && git clone -b main

# 5. Stack
docker compose --env-file .env -f docker-compose.yml -f docker-compose.prod.yml build
docker compose ... up -d postgres
TARGET_DATABASE_URL=... scripts/restore-local.sh backups/woll-....dump
docker compose ... run --rm api node scripts/migrate.mjs --baseline --to 035
docker compose ... run --rm api node scripts/migrate.mjs
docker compose ... run --rm api node scripts/check-rpc-signatures.mjs
docker compose ... exec api node scripts/config-snapshot.mjs --publish

# 6. TLS provisorio (autofirmado hasta tener DNS)
# volumen woll_letsencrypt con live/woll/{fullchain,privkey}.pem
```

### 4.1. Release controlado (26-I)

`deploy/vps/release.sh` es el único camino para actualizar producción:

1. exige árbol limpio y `HEAD` ancestro de `origin/main`;
2. hace backup cifrado antes de migrar (aborta si falla);
3. reconstruye `api`, `rag-worker` y `layer-worker`;
4. aplica migraciones idempotentes;
5. levanta el stack y recrea Nginx si cambió su configuración montada;
6. termina con smoke de `/healthz` y `/api/config` (y del chat con
   `--with-chat`).

Los cambios se desarrollan y prueban en local; al VPS solo llega lo que ya
pasó lint, tests y, si toca el chat, el golden set. Los incidentes se resuelven
en el servidor y se documentan en `docs/CHANGELOG.md`.

## 5. Verificación

| Check | Resultado |
|---|---|
| Puertos públicos | solo 22, 80, 443 |
| `root` con password | `Permission denied (publickey)` |
| Rutas internas (`/docs`, `/server`, `/db`, `/.env`) | 404 / 403 |
| `/healthz` | 200, `db: up` |
| `/api/config` | 200 con snapshot v1 |
| `/api/admin/session` sin cookie | 401 |
| GeoJSON | 200 `application/geo+json`, `content-encoding: gzip` |
| Backup manual + systemd | 65 MB cifrados en ~30 s |
| Simulacro de restore | RTO 53 s, conteos coinciden |

## 6. Vertex AI y chat

- **Proveedor:** `LLM_PROVIDER=vertex-ai`, proyecto `woll-atacama-staging`,
  `GOOGLE_CLOUD_LOCATION=global`, `gemini-3.1-flash-lite` con fallback
  `gemini-2.5-flash-lite`.
- **Credenciales:** service account `woll-atacama@…` con rol **Vertex AI User**
  (`roles/aiplatform.user`). Dos claves separadas por entorno (PC y VPS); la
  del VPS vive en `/etc/woll/gcp-sa.json` (600, uid 1000) y se monta como
  secreto con `docker-compose.vertex.yml` en `/run/secrets/gcp-sa.json`.
- **Compose:** `deploy/vps/compose.sh` fija la cadena
  base + producción + Vertex. Recrear la API sin el overlay deja el chat sin
  credenciales, así que todo comando del VPS pasa por ese script.
- **Rondas de tools:** `ORCHESTRATOR_MAX_ITERATIONS=2` y
  `ORCHESTRATOR_BUDGET_MS=12000`. Con 1 ronda el orquestador nunca ofrece
  tools y el golden set cae a 17/20; con 2 rondas da **20/20**.
- **Respuestas vacías:** Gemini 3 devuelve `finish_reason="malformed_function_call"`
  con contenido vacío si recibe `tools` junto a `toolChoice="none"`. El driver
  omite `tools` en ese caso y el orquestador reintenta una vez si la respuesta
  vuelve vacía.
- **Limitación conocida:** en preguntas de conteo, el modelo acierta ~5 de 6
  veces; en el resto toma un número del volcado de `get_layer_stats` (p. ej.
  responde 874 en vez de 863 glaciares). Pendiente: recortar el payload de la
  tool para preguntas de conteo o subir el modelo de síntesis.

## 7. RAG con embeddings (18-B)

- **Proveedor:** `EMBEDDINGS_PROVIDER=vertex`, `gemini-embedding-001`,
  `EMBEDDINGS_LOCATION=us-central1`, `EMBEDDINGS_TASK_TYPE=RETRIEVAL_DOCUMENT`,
  `EMBEDDINGS_DIM=1024` (fijado por `rag.chunks.embedding vector(1024)`).
  Para consultas se usa `RETRIEVAL_QUERY` con el mismo modelo.
- **Credenciales:** las mismas de Vertex. `docker-compose.vertex.yml` monta el
  JSON también en `rag-worker`; el API y el worker comparten proyecto y rol.
- **Costos:** `EMBEDDINGS_PRICE_PER_MTOK=0.15` (estimación informativa).
- **Validación local:** `npm run ingest:dry` con un PDF de 6 páginas dio 10
  chunks y 3.815 tokens; `createEmbedder()` devolvió 2 vectores de 1024
  dimensiones en 2,7 s.
- **Validación en el VPS:** ingesta real del mismo documento (10 chunks, todos
  con embedding de 1024 dims, costo estimado USD 0,00057) y consulta de
  similitud coseno con `RETRIEVAL_QUERY` (top-3 con similitud 0,54).
- **Limpieza:** el documento de prueba se borró de `rag.*` y del manifiesto
  para no contaminar el corpus de producción.
- **Local sin Postgres:** en este equipo no hay Docker/Podman corriendo el
  stack, así que la prueba local es `--dry-run` + llamada real al embedder.
  La ingesta real se corre en el VPS o contra un Postgres local cuando exista.
- **Pendiente:** cargar el corpus real (PDFs con licencia y
  `copyright_cleared: true` en `rag/manifest.json`) y el retrieval del chat
  (Sprint 18-D), que hoy no está implementado.

## 8. Pendientes

- **DNS + TLS real:** registro A `visor.atacamawoll.cl → 136.243.227.86` en
  SiteGround y `certbot certonly --webroot --cert-name woll`. Reemplaza el
  certificado autofirmado y habilita `ALLOWED_ORIGINS` definitivo.
- **Copia externa de backups:** hoy el backup vive en el mismo disco
  (`/var/backups/woll`); definir `BACKUP_OFFSITE_CMD` (rclone/S3 o `rsync` al
  equipo de desarrollo).
- **Tiles MVT:** `tiles/` se genera con `npm run tiles:build` en el VPS; sin
  tiles el visor usa GeoJSON.
- **Tareas 26-J** (ingestas programadas) y **26-F/I** (staging y corte DNS).

## 9. Desvíos respecto de otras specs

- **26-G:** la unidad `woll-backup.service` usa `User=deploy` en vez de
  `User=woll` (el VPS no tiene usuario `woll`) y `BACKUP_DIR=/var/backups/woll`.
  Se agregó `UMask=0077`.
- **26-D:** se agregó el bloque `types` de Nginx para GeoJSON/MVT; sin él la
  compresión de GeoJSON no se aplicaba.


## 10. TLS real y renovación (2026-11-25)

- DNS `A visor.atacamawoll.cl → 136.243.227.86` en SiteGround (TTL 5 min).
- Certificado Let's Encrypt con `certbot certonly --webroot -w
  /var/www/certbot -d visor.atacamawoll.cl --cert-name woll`; vence el
  2027-02-23. Reemplaza el autofirmado de la puesta en marcha.
- `certbot renew --dry-run` exitoso; el contenedor `certbot` (profile `tls`)
  corre la renovación cada 12 h y Nginx recarga con los archivos del volumen
  `woll_letsencrypt`.
- `DOMAIN`, `CERTBOT_EMAIL` y `ALLOWED_ORIGINS=https://visor.atacamawoll.cl`
  en `.env`; API recreada.
- Verificado: `/` sirve Geodatos, `/visor` el visor, `/visor/` 301, HTTP 301 a
  HTTPS, HSTS y cadena Let's Encrypt válida.
