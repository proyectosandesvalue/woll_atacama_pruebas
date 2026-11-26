# Spec 26-G — Backups, retención y simulacro de restauración

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 26-G |
| **Estado de la spec** | CERRADA (script, cifrado, retención, copia externa y simulacro medido) |
| **Tamaño** | Mediano |
| **Duración estimada** | 4 h |
| **Dependencias** | 26-C (PostgreSQL en contenedor), 26-D (Nginx/Compose) |
| **Última revisión** | 2026-11-13 |

## 1. Objetivo y contexto

El VPS es la producción final: los datos de PostGIS, catálogo, admin, RAG e
ingestas no pueden depender de Supabase. El backup debe ser **diario**,
**cifrado**, verificable, con retención y copia fuera del VPS. Además hay que
probar una restauración real y medir el RTO.

**RPO:** ≤ 7 días (backup semanal, domingo 03:00 UTC).
**RTO medido:** 94 s para el dump v1 (69 MB, 90 tablas, 71 capas,
1.425.842 indicadores) en el stack local. El objetivo es ≤ 2 h en el VPS.

## 2. Alcance

**Dentro**
- `scripts/backup-postgres.sh`: `pg_dump --format=custom`, cifrado GPG,
  checksum, retención, copia externa, lock, alerta y chequeo de disco.
- `scripts/restore-drill.sh`: restaura en una base descartable, compara conteos
  y mide el RTO.
- `deploy/systemd/woll-backup.service` y `.timer` (domingo 03:00 UTC, `Persistent`).
- `.env.backup.example` con las variables (sin secretos).
- Documentación de restore manual y de la frecuencia.

**Fuera**
- Backups de archivos estáticos/GeoJSON/tiles (se regeneran desde PostGIS y el
  repo; los tiles no son críticos).
- PITR/WAL archiving (evaluar si el RPO de 24 h no alcanza).
- Copia a un proveedor concreto (se configura con `BACKUP_OFFSITE_CMD`).
- Cifrado de la copia externa por el proveedor: el archivo ya sale cifrado.

## 3. Diseño

### 3.1. Backup

```
scripts/backup-postgres.sh
  ├─ lock flock (evita solapamientos)
  ├─ chequeo de disco (BACKUP_MIN_FREE_MB)
  ├─ pg_dump -Fc -Z9 --no-owner --no-acl
  ├─ verificación pg_restore --list
  ├─ cifrado GPG (recipient o passphrase AES256)
  ├─ sha256 + copia externa (dir o comando)
  ├─ retención (días + mínimo)
  └─ alerta si falla (comando/webhook)
```

- Contenedor: `podman/docker exec -i <container> pg_dump ...` o `pg_dump` del
  host con `DATABASE_ADMIN_URL`.
- Nombre: `woll-YYYYMMDDTHHMMSSZ.dump[.gpg]`.
- Cifrado obligatorio en producción: sin `BACKUP_GPG_*` falla salvo
  `BACKUP_ALLOW_PLAIN=1` (solo desarrollo).
- Retención: conserva al menos `BACKUP_MIN_KEEP` (default 2) y borra los que
  superan `BACKUP_RETENTION_DAYS` (default 14).
- Lock en `/tmp/woll-backup.lock`; si ya corre, sale 0.

### 3.2. Timer

```ini
# woll-backup.timer
OnCalendar=Sun *-*-* 03:00:00 UTC
Persistent=true
RandomizedDelaySec=15m
```

Instalación:

```bash
sudo cp deploy/systemd/woll-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now woll-backup.timer
systemctl list-timers woll-backup.timer
```

`.env.backup` (600, fuera de git) define `BACKUP_DIR`, cifrado, offsite,
`BACKUP_PG_CONTAINER` y alerta. Ver `.env.backup.example`.

### 3.3. Restauración

```bash
# Simulacro: crea woll_restore_test, restaura y compara conteos.
BACKUP_FILE=/var/backups/woll/woll-....dump.gpg \
BACKUP_GPG_PASSPHRASE_FILE=/etc/woll/backup.pass \
RESTORE_CONTAINER=woll-postgres-1 \
RESTORE_EXPECT_CATALOG=71 \
RESTORE_EXPECT_LAYER=382 \
RESTORE_EXPECT_VALUES=1425842 \
  scripts/restore-drill.sh
```

- La base destino debe contener `restore` o `test`; el script se niega a usar
  otra.
- Al terminar borra la base salvo `RESTORE_KEEP=1`.
- Para una restauración real, detener API/Nginx, restaurar sobre la base de
  producción con `pg_restore --clean --if-exists` y volver a levantar; el
  procedimiento está en `docs/DEV_GUIDE.md` §2.10.

## 4. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | PostgreSQL local | se ejecuta el backup | dump custom válido, checksum y copia externa | script + `sha256sum -c` |
| CA-2 | un backup sin cifrado | no hay `BACKUP_GPG_*` ni `BACKUP_ALLOW_PLAIN` | falla con mensaje | test |
| CA-3 | passphrase GPG | se ejecuta el backup | archivo `.gpg` AES256 y checksum | `gpg --decrypt` |
| CA-4 | una copia externa | termina el backup | el archivo y su `.sha256` están en offsite y verifican | `sha256sum -c` |
| CA-5 | retención | hay más de `MIN_KEEP` backups viejos | borra solo los que superan los días | test |
| CA-6 | fallo de `pg_dump` | se ejecuta | exit != 0 y alerta (`BACKUP_ALERT_CMD`) | test |
| CA-7 | un backup | se corre el simulacro | crea `woll_restore_test`, restaura y compara conteos | script |
| CA-8 | backup v1 | simulacro local | RTO 94 s; 71/382/1.425.842 | medido |
| CA-9 | timer | se habilita | corre el domingo a las 03:00 UTC y `Persistent` recupera si el VPS estuvo apagado | `systemctl list-timers` |

## 5. Tests

- Local: backup plano y cifrado; checksum; offsite; retención; restore drill.
- El restore drill valida `chat.chat_catalog=71`, `public.borde_costero=382` e
  `ingest.indicator_values=1.425.842`.
- `npm test`/`npm run lint` no cubren scripts bash; se valida con `shellcheck` si
  está disponible y con la ejecución real.

## 6. Seguridad

- El dump y la passphrase nunca se commitean; `.env.backup` está en `.gitignore`.
- GPG AES256 o recipient; el offsite recibe solo el archivo cifrado.
- El script no imprime `DATABASE_ADMIN_URL` ni la passphrase.
- La base de simulacro se llama `woll_restore_test` y se borra al terminar.
- Permisos: `.env.backup` y passphrase 600, backup dir 700, usuario `woll`.

## 7. Riesgos y pendientes

| Riesgo | Mitigación |
|---|---|
| Disco lleno | `BACKUP_MIN_FREE_MB`, retención y offsite |
| Backup corrupto | `pg_restore --list`, checksum y simulacro |
| Copia externa no configurada | CA-4 falla en producción; el timer alerta |
| RPO 24 h insuficiente | evaluar WAL/PITR en 26-G.2 |
| El contenedor cambia de nombre | `BACKUP_PG_CONTAINER` en `.env.backup`; verificar en el deploy |

## 8. Despliegue en el VPS (2026-11-23)

- Unidad instalada como `User=deploy` (el VPS no tiene usuario `woll`) con
  `UMask=0077`; `BACKUP_DIR=/var/backups/woll`, passphrase en
  `/home/deploy/.woll-backup.pass` y `.env.backup` en `/srv/woll`.
- Timer activo: domingo 03:00 UTC con `RandomizedDelaySec=15m`; retención exacta de 2 copias (`BACKUP_KEEP_LAST=2`).
- Backups medidos: 71.999.982 B crudos → 68.172.013 B cifrados en ~31 s.
- Simulacro ejecutado contra `woll_restore_test`: **RTO 53 s**, 71 capas y
  1.425.842 indicadores. Se ejecutó sobre el backup de las 00:08 UTC.
- Pendiente: copia externa (`BACKUP_OFFSITE_CMD`). Hoy el backup está en el
  mismo disco del VPS.

## 9. Cierre

- Horas reales: 3.
- Medición local: dump 69 MB en 38 s; cifrado 65 MB; restore 94 s.
- Lecciones: el dump custom se restaura sin filtros en una base vacía; el
  `pg_restore -l` es una verificación barata antes de cifrar.
- Pendiente: configurar offsite real (rclone/S3) y alerta en el VPS; evaluar
  PITR si el RPO de 24 h no alcanza.


## 10. Backup completo del VPS por SSH (2026-11-26)

El proveedor genera **una imagen completa mensual** desde Virtualizor; no se
lanza ni se descarga por SSH. Para el día a día existe un backup completo de
la aplicación, a demanda:

- Script `deploy/vps/full-backup.sh` (ejecutar con `sudo`).
- Incluye: dump `pg_dump -Fc`, `.env*`, `/etc/woll/gcp-sa.json`, configs de
  SSH/UFW/fail2ban/Docker/systemd/sysctl, certificados, uploads de capas,
  `rag/manifest.json` y llave de deploy.
- Excluye: código y GeoJSON base (GitHub), tiles y ráster (regenerables),
  imágenes Docker, logs.
- Empaqueta en `tar.gz` fuera del staging (para no incluirse a sí mismo),
  cifra con GPG (misma passphrase de backups), agrega SHA-256 y guarda en
  `/var/backups/woll/full/` con retención de 3 copias.
- Verificado: 68 MB crudos → 66 MB cifrados; 290 entradas; descarga por `scp`
  y checksum local correctos. La primera copia quedó en `~/backups/woll/` del
  equipo de desarrollo.
- Descarga: `scp woll-vps:/var/backups/woll/full/<archivo> .` y verificación
  local con `sha256sum` y `gpg --decrypt`.

Complementa, no reemplaza: GitHub cubre código, el dump local cubre datos
históricos, el backup semanal cubre RPO 7 días y el mensual del proveedor cubre
desastre total.


## 11. Cambio a backup semanal (2026-11-26)

- Timer: domingo 03:00 UTC (`OnCalendar=Sun *-*-* 03:00:00 UTC`), `Persistent`.
- Retención exacta: `BACKUP_KEEP_LAST=2` conserva solo las 2 copias más nuevas;
  `BACKUP_RETENTION_DAYS=14` queda como respaldo de la lógica.
- Al terminar un backup exitoso, `ExecStartPost=/srv/woll/deploy/vps/notify-backup.sh`
  envía un correo a todos los admins activos con nombre, tamaño e instrucciones
  de descarga (`scripts/notify-backup.mjs`). Si el correo falla, el backup no se
  marca como fallido.
- Verificado: corrida manual eliminó 9 copias antiguas, dejó 2 y envió el aviso.


### 10.1 Restauración

1. `gpg --decrypt woll-full-<fecha>.tar.gz.gpg > woll-full-<fecha>.tar.gz`.
2. Extraer en un directorio temporal.
3. Restaurar la base: `docker exec -i woll-postgres-1 pg_restore -U woll -d woll
   --clean --if-exists < db/woll.dump` (base vacía o de staging).
4. Copiar `etc/woll/env` a `/srv/woll/.env`, `etc/woll/env.backup` y
   `etc/woll/env.ops`; `etc/woll/gcp-sa.json` a `/etc/woll/`; `srv/rag` y
   `srv/geojson/uploads` a `/srv/woll/`; `home/deploy/.ssh` al usuario deploy;
   las unidades `etc/systemd/system/woll-*` a `/etc/systemd/system/`.
5. Restaurar los volúmenes de certificados desde `docker/` si se conservan.
6. `systemctl daemon-reload`, `docker compose up -d` y smoke de `/healthz`,
   `/api/config`, `/`, `/visor` y `/chat`.
7. La passphrase GPG no va dentro del archivo: debe estar en el gestor de
   contraseñas.
