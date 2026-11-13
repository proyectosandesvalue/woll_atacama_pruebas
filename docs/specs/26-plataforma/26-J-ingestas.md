# Spec 26-J — Ingestas programadas en el VPS

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 26-J |
| **Estado de la spec** | CERRADA (wrapper, timers systemd y mapping de los 4 cron) |
| **Tamaño** | Pequeño-mediano |
| **Duración estimada** | 3 h |
| **Dependencias** | 26-A (servidor Node), 26-D (Compose), 26-E (datos) |
| **Última revisión** | 2026-11-13 |

## 1. Objetivo y contexto

Hoy las ingestas corren en GitHub Actions y escriben en Supabase. En el VPS la
base es PostgreSQL propio y no se depende de GitHub/Vercel. Este tramo reemplaza
los 4 workflows por **timers systemd** que ejecutan el contenedor `ingest` con
`flock`, logs en journald y escrituras idempotentes (`ingest_upsert_value`).

## 2. Alcance

**Dentro**
- `scripts/run-ingest-timer.sh` con locks por fuente y modo dry-run.
- `deploy/systemd/woll-ingest@.service` y 4 timers.
- Mapping de los workflows actuales a comandos.
- Instalación, logs, verificación y reversión.

**Fuera**
- Borrar los workflows de GitHub (se desactivan al cortar a VPS; quedan como
  referencia).
- Nuevos adapters o endpoints de ingesta.
- Alertas externas de fallo (se pueden agregar con `OnFailure`).
- Backups (26-G).

## 3. Mapping

| Fuente | Frecuencia | Comando | Timer |
|---|---|---|---|
| Agromet | cada hora, :15 | `run-ingest-timer.sh agromet` (`--agromet`) | `woll-ingest-agromet.timer` |
| MeteoChile tiempo real | cada hora, :05 | `realtime` (2 endpoints) | `woll-ingest-realtime.timer` |
| RedMeteo | cada hora, :25 | `redmeteo` (`redmeteo:last-data`) | `woll-ingest-redmeteo.timer` |
| MeteoChile diaria | 03:00 UTC | `daily` (`meteochile:getEmaResumenDiario`) | `woll-ingest-daily.timer` |

`realtime` ejecuta:

```bash
node scripts/ingest-run.mjs --endpoint meteochile:getEmaResumenDiario
node scripts/ingest-run.mjs --endpoint meteochile:getDatosRecientesRedEma
```

## 4. Instalación

Prerrequisitos en el VPS:

- `.env` con `DATABASE_URL_DOCKER` (rol `woll_ingest`), claves de las fuentes y
  `GEO_PROVIDER` si aplica.
- Usuario `woll` con acceso a Docker/Compose y al checkout `/srv/woll`.
- Contenedor `postgres` healthy (el `ingest` depende de él).

```bash
sudo cp deploy/systemd/woll-ingest@.service /etc/systemd/system/
sudo cp deploy/systemd/woll-ingest-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now \
  woll-ingest-agromet.timer \
  woll-ingest-realtime.timer \
  woll-ingest-redmeteo.timer \
  woll-ingest-daily.timer
systemctl list-timers 'woll-ingest*'
```

Dry-run de un timer:

```bash
WOLL_INGEST_DRY_RUN=1 scripts/run-ingest-timer.sh daily
```

Logs:

```bash
journalctl -u 'woll-ingest@*' -f
journalctl -u woll-ingest@daily.service --since today
```

## 5. Idempotencia y duplicados

- Los adapters escriben con `ingest_upsert_value`; repetir una ingesta no
  duplica valores.
- El lock `/tmp/woll-ingest-<fuente>.lock` evita dos ejecuciones simultáneas de
  la misma fuente.
- Si el VPS estuvo apagado, `Persistent=true` ejecuta una vez al arrancar.
- Verificación: contar filas de `ingest.indicator_values` antes/después de una
  segunda ejecución; el conteo no debe crecer por duplicados (sí por períodos
  nuevos).

## 6. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | timers instalados | `systemctl list-timers` | los 4 aparecen con próxima ejecución | comando |
| CA-2 | una ingesta ya corriendo | se dispara otra | el lock la omite con exit 0 | log |
| CA-3 | una ingesta | termina | journald registra inicio/fin y código | `journalctl` |
| CA-4 | dos ejecuciones del mismo endpoint | se comparan conteos | no hay duplicados | SQL |
| CA-5 | VPS reiniciado | arranca systemd | `Persistent` recupera la corrida perdida | `journalctl` |
| CA-6 | fallo de red | corre la ingesta | exit != 0 y el timer reintenta en la próxima | `systemctl status` |
| CA-7 | dry-run | se ejecuta | imprime el comando sin llamar a la API/BD | script |

## 7. Seguridad

- El contenedor usa `DATABASE_URL_DOCKER` con el rol `woll_ingest`, no el
  superusuario.
- Las claves de fuentes viven en `.env` (600) y no en las unidades.
- `read_only: true` y `tmpfs: /tmp` del servicio `ingest`.
- Los logs no imprimen tokens; los adapters ya redactan.
- El usuario `woll` solo tiene acceso al grupo Docker/Compose.

## 8. Reversión

```bash
sudo systemctl disable --now woll-ingest-*.timer
```

Los workflows de GitHub siguen en el repo hasta el corte; se pueden reactivar
temporalmente si el VPS falla. Al cortar (26-I), se desactivan en GitHub.

## 9. Cierre

- Horas reales: 2.
- Pendiente: probar los 4 timers en el VPS real y definir alerta de fallo
  (`OnFailure` a un webhook/email).
