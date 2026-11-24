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
6. **Nginx.** Único servicio con puertos públicos. GeoJSON y MVT se sirven con
   su MIME correcto (`types`) para que entren en `gzip_types`; sin eso, cada
   `.geojson` salía como `application/octet-stream` sin comprimir (2.78 MB vs
   1.02 MB comprimido en `acuiferos.geojson`).
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

## 6. Pendientes

- **DNS + TLS real:** registro A `visor.atacamawoll.cl → 136.243.227.86` en
  SiteGround y `certbot certonly --webroot --cert-name woll`. Reemplaza el
  certificado autofirmado y habilita `ALLOWED_ORIGINS` definitivo.
- **Deploy key:** clave `vps-woll-deploy` en el repo
  `proyectosandesvalue/woll_atacama_vps` (solo lectura) para `git fetch`.
- **Secretos de terceros:** `LLM_*` (Vertex u OpenAI-compatible) y
  `INSTANCE_ID`/`CLIENT_ID`/`CLIENT_SECRET` del proxy de Copernicus.
- **Copia externa de backups:** hoy el backup vive en el mismo disco
  (`/var/backups/woll`); definir `BACKUP_OFFSITE_CMD` (rclone/S3 o `rsync` al
  equipo de desarrollo).
- **Tiles MVT:** `tiles/` se genera con `npm run tiles:build` en el VPS; sin
  tiles el visor usa GeoJSON.
- **Tareas 26-J** (ingestas programadas) y **26-F/I** (staging y corte DNS).

## 7. Desvíos respecto de otras specs

- **26-G:** la unidad `woll-backup.service` usa `User=deploy` en vez de
  `User=woll` (el VPS no tiene usuario `woll`) y `BACKUP_DIR=/var/backups/woll`.
  Se agregó `UMask=0077`.
- **26-D:** se agregó el bloque `types` de Nginx para GeoJSON/MVT; sin él la
  compresión de GeoJSON no se aplicaba.
