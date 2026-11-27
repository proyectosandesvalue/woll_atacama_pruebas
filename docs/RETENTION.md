# Política de retención de datos operativos

| Campo | Valor |
|---|---|
| **Alcance** | Chat, demanda no satisfecha, auditoría administrativa, logs y backups |
| **Vigente desde** | 2026-11-21 |
| **Responsable** | Operación de la Plataforma WoLL Atacama |
| **Revisión** | Anual o ante cambios de proveedor, normativa o infraestructura |
| **Marco** | Ley 21.719 y normativa chilena aplicable |

> Este documento describe la retención **técnica** aplicada por la Plataforma.
> No reemplaza la revisión legal del Sprint 32-D ni la política de privacidad
> publicada en `privacidad.html`.

## 1. Principios

- **Minimización:** solo se conserva lo necesario para operar, asegurar y
  mejorar el servicio.
- **Sin conversaciones persistidas:** el chat no guarda el historial en la base
  de datos; el contexto vive en el navegador.
- **Sin datos personales en demanda:** `admin.unanswered_questions` no guarda
  correo, sesión ni historial desde la migración 053.
- **Plazos explícitos:** cada registro tiene un plazo y un mecanismo de borrado.
- **Trazabilidad:** la purga se ejecuta con un comando reproducible y deja
  conteos, no contenido.

## 2. Plazos y mecanismos

| Registro | Dónde vive | Plazo | Mecanismo |
|---|---|---|---|
| Conversación del chat | Navegador (memoria) | Hasta limpiar o cerrar | El usuario limpia la conversación; no se escribe en BD |
| Preguntas sin respuesta | `admin.unanswered_questions` | 365 días desde `last_seen_at` | `admin_purge_retention()` |
| Auditoría administrativa | `admin.audit_log` | 730 días desde `at` | `admin_purge_retention()` |
| Logs de API, Nginx y workers | Contenedores Docker | Rotación por tamaño: 10 MB × 5 archivos | `logging` de `docker-compose.yml` |
| Copias de seguridad | Disco del VPS + copia externa | 14 días | `scripts/backup-postgres.sh` (26-G) |
| Preferencia de tema | `localStorage` del navegador | Hasta borrar datos del sitio | Navegador; no se envía al servidor |

### 2.1. Preguntas sin respuesta

La tabla se deduplica por `fingerprint`, acumula `occurrences` y actualiza
`last_seen_at`. La purga elimina las filas cuya última ocurrencia supera el
plazo. No borra por `created_at` para no perder una pregunta que se repite con
el tiempo.

### 2.2. Auditoría administrativa

`admin.audit_log` registra acciones del panel (login, cambios de configuración,
capas, taxonomía, RAG, chat y demanda). La purga conserva 24 meses, suficiente
para investigar incidentes y cumplir controles internos.

### 2.3. Logs de contenedor

`docker-compose.yml` define `max-size: "10m"` y `max-file: "5"` para API,
Nginx, workers y PostgreSQL. La retención efectiva depende del volumen de
tráfico; con el tráfico actual equivale a varias semanas. No se envían logs a
un servicio externo de analítica.

### 2.4. Backups

Los backups se cifran, se verifican con checksum y se conservan 14 días por
defecto (`BACKUP_RETENTION_DAYS`). La copia externa usa el mismo plazo. El
procedimiento y el simulacro de restauración están en
`docs/specs/26-plataforma/26-G-backups.md`.

## 3. Ejecución de la purga

La migración `064_retention.sql` crea la RPC:

```sql
public.admin_purge_retention(
  p_unanswered_days int DEFAULT 365,
  p_audit_days int DEFAULT 730,
  p_dry_run boolean DEFAULT false
) RETURNS jsonb
```

Comandos:

```bash
# Ver cuántas filas se borrarían, sin borrar
npm run retention:run -- --dry-run

# Purga con los plazos por defecto
npm run retention:run

# Plazos explícitos
npm run retention:run -- --unanswered-days 365 --audit-days 730
```

Variables opcionales:

```env
RETENTION_UNANSWERED_DAYS=365
RETENTION_AUDIT_DAYS=730
RETENTION_DRY_RUN=1
```

El script requiere `DATABASE_ADMIN_URL` o `DATABASE_URL`. No imprime la URL ni
el contenido de las preguntas; solo el JSON de conteos:

```json
{
  "unanswered": 0,
  "audit": 0,
  "dry_run": true,
  "unanswered_days": 365,
  "audit_days": 730
}
```

### 3.1. Programación recomendada

Ejecutar una vez al día, fuera del horario de mayor uso. En el VPS se puede
usar un timer de systemd o cron:

```ini
# /etc/systemd/system/woll-retention.service
[Unit]
Description=Purga de retención WoLL
After=network.target

[Service]
Type=oneshot
WorkingDirectory=/opt/woll
EnvironmentFile=/opt/woll/.env
ExecStart=/usr/bin/npm run retention:run
```

```ini
# /etc/systemd/system/woll-retention.timer
[Unit]
Description=Timer diario de retención WoLL

[Timer]
OnCalendar=*-*-* 04:15:00 UTC
Persistent=true
RandomizedDelaySec=10m

[Install]
WantedBy=timers.target
```

Antes de activar el timer, correr `--dry-run` y revisar el resultado. La primera
ejecución en producción debe hacerse con conteos y ventana de mantenimiento.

## 4. Qué no se guarda

- Conversaciones completas del chat.
- Correo, sesión o historial en la cola de demanda.
- Claves de API, tokens o credenciales en logs.
- Contenido de documentos RAG en los logs de ingesta.
- Datos de analítica publicitaria o píxeles de seguimiento.

## 5. Derechos y solicitudes

Las solicitudes de acceso, rectificación, supresión u oposición se atienden por
el canal institucional publicado en la política de privacidad. Si la solicitud
afecta una fila concreta, la purga programada no es el mecanismo principal: se
identifica el registro y se elimina de forma controlada, dejando constancia en
la auditoría.

## 6. Referencias

- `privacidad.html` — política pública de privacidad.
- `docs/specs/32-marco-legal-privacidad.md` — spec del Sprint 32.
- `docs/specs/50-demanda-no-satisfecha.md` — diseño de la cola de demanda.
- `docs/specs/26-plataforma/26-G-backups.md` — backups y retención.
- `db/migrations/064_retention.sql` — RPC de purga.
- `scripts/retention.mjs` — comando operativo.
