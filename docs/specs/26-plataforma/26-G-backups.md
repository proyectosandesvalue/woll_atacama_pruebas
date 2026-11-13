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

**RPO:** ≤ 24 h (backup diario a las 03:00 UTC).
**RTO medido:** 94 s para el dump v1 (69 MB, 90 tablas, 71 capas,
1.425.842 indicadores) en el stack local. El objetivo es ≤ 2 h en el VPS.

## 2. Alcance

**Dentro**
- `scripts/backup-postgres.sh`: `pg_dump --format=custom`, cifrado GPG,
  checksum, retención, copia externa, lock, alerta y chequeo de disco.
- `scripts/restore-drill.sh`: restaura en una base descartable, compara conteos
  y mide el RTO.
- `deploy/systemd/woll-backup.service` y `.timer` (03:00 UTC, `Persistent`).
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
OnCalendar=*-*-* 03:00:00 UTC
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
| CA-9 | timer | se habilita | corre a las 03:00 UTC y `Persistent` recupera si el VPS estuvo apagado | `systemctl list-timers` |

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

## 8. Cierre

- Horas reales: 3.
- Medición local: dump 69 MB en 38 s; cifrado 65 MB; restore 94 s.
- Lecciones: el dump custom se restaura sin filtros en una base vacía; el
  `pg_restore -l` es una verificación barata antes de cifrar.
- Pendiente: configurar offsite real (rclone/S3) y alerta en el VPS; evaluar
  PITR si el RPO de 24 h no alcanza.
