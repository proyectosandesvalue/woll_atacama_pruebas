# Spec 31 — Observabilidad y operación

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 31 |
| **Estado de la spec** | EN EJECUCIÓN — 31-A, 31-B (base) y 31-E ✅; 31-C y 31-D pendientes |
| **Tamaño** | Mediano (7-8 h) |
| **Dependencias** | 26 (VPS operativo) |
| **Última revisión** | 2026-11-24 |

## 1. Objetivo

Que el VPS sea operable sin mirar la consola: requests trazables, salud de cada
servicio, alertas ante caída/disco/certificado/backup y capacidad de detectar
backlogs. Sin filtrar datos personales ni contenido de usuarios a los logs.

## 2. Alcance

**Dentro**

- **31-A. Logs de acceso JSON:** un registro por request con `request_id`,
  método, ruta (sin query), estado, duración, país e IP **hasheada**; sin
  cuerpos ni texto de consultas. `x-request-id` de entrada saneado.
- **31-B. Chequeo operativo:** `ops-check` valida API, Nginx, certificado TLS,
  disco, antigüedad del backup, heartbeats de workers y backlog de colas.
  Timer systemd cada 10 minutos y alerta opcional por webhook.
- **31-E. `/healthz` y `/readyz`:** ya existen; se agregan tests de liveness
  (proceso) y readiness (BD) y se documenta su contrato.

**Fuera (requiere decisión o servicio externo)**

- **31-C.** Reporte de errores del frontend (GlitchTip/Sentry) y analítica
  (Umami/Plausible): implica desplegar o contratar un servicio y definir
  retención. Se retoma cuando el cliente elija.
- **31-D.** Valoración “útil / no útil” del chat: requiere UX y tabla; se
  planifica aparte.
- Alertas de tasa de error del LLM: requiere leer logs o instrumentar el
  orquestador; se puede sumar a `ops-check` cuando haya métricas persistidas.

## 3. Diseño

### 3.1. Log de acceso (31-A)

`server/app.js` emite una línea JSON por request en `finish`:

```json
{"level":"info","event":"http.request","request_id":"...","method":"POST",
 "path":"/api/chat","status":200,"duration_ms":1234,
 "ip_hash":"a1b2c3d4e5f60718","country":"CL","ts":"2026-11-24T..."}
```

- `request_id`: `x-request-id` entrante solo si cumple
  `^[A-Za-z0-9._-]{8,128}$`; si no, se genera con `crypto.randomUUID()`.
- `ip_hash`: SHA-256 de `LOG_IP_SALT:ip`, truncado a 16 hex. Sin
  `LOG_IP_SALT` se usa una sal aleatoria por proceso (no correlaciona entre
  reinicios). La IP en claro deja de registrarse incluso con debug.
- `path`: solo `pathname`; nunca query string ni cuerpo.
- `LOG_REQUESTS=0` desactiva el log de acceso.

### 3.2. `ops-check` (31-B)

Corre en un contenedor de la misma imagen de la API (`--profile ops`), sin
socket de Docker y con `/var/backups/woll` montado en solo lectura:

| Check | Fuente | Umbral |
|---|---|---|
| API | `http://api:3000/healthz` | 200 y `db=up` |
| Nginx | `http://nginx/nginx-health` | 200 `ok` |
| Certificado | TLS a `nginx:443` | ≥ 14 días |
| Disco | `statfs(/var/backups/woll)` | < 80 % |
| Backup | archivo `*.dump.gpg` más nuevo | ≤ 26 h |
| Workers | `admin.worker_heartbeats` | ≤ 10 min |
| Backlog | jobs pendientes en `admin.rag_jobs` y `admin.layer_jobs` | ≤ 25 |

Salida JSON con `ok`, `alerts` y cada check. Si falla, exit 1 y, si existe
`OPS_ALERT_WEBHOOK`, POST con `{"text": "..."}` (sin URL en logs, timeout 5 s).
Timer `woll-ops-check.timer` cada 10 minutos.

## 4. Seguridad

- No se registran cuerpos, query strings, tokens ni IPs en claro.
- El hash usa sal secreta; sin sal configurada no es reversible ni
  correlacionable entre procesos.
- `ops-check` no monta el socket de Docker ni el filesystem raíz; solo el
  directorio de backups en lectura.
- El webhook es opcional y se lee de `.env.ops` (600). Si no está, solo log.
- `/healthz` y `/readyz` no exponen versiones de dependencias ni secretos.

## 5. Criterios de aceptación

- **CA-1** Todo request deja una línea con `request_id` y sin datos de usuario.
- **CA-2** Un fallo simulado (API caída, disco > 80 %, backup viejo, worker
  sin heartbeat, certificado por vencer) produce alerta en `ops-check`.
- **CA-3** `npm test` cubre saneo de `request_id`, hash de IP, formato de la
  línea y evaluación de umbrales.
- **CA-4** El chequeo corre cada 10 minutos en el VPS sin Node en el host.

## 6. Tests

- `server/__tests__/request-log.test.js`: id válido/ inválido, hash
  determinista, ruta sin query, cabecera `x-request-id`.
- `server/__tests__/health.test.js`: 200 con BD arriba; 503 con BD caída;
  `/readyz` alias.
- `server/ops/__tests__/checks.test.js`: umbrales de disco, backup, cert,
  workers y backlog; agregación y exit code.


## 7. Implementación (2026-11-24)

- **31-A:** `server/utils/request-context.js` (id saneado, hash de IP, línea
  JSON) y `server/app.js` (cabecera `x-request-id`, log en `finish`). Se
  eliminaron los logs de IP en claro del extractor de request.
- **31-B:** `server/ops/checks.js` (lógica pura e inyectable),
  `scripts/ops-check.mjs`, servicio Compose `ops-check` (profile `ops`, sin
  socket de Docker, backup montado `ro`) y `woll-ops-check.timer` cada 10 min.
- **31-E:** `/healthz` y `/readyz` ya existían; se agregaron tests de 200/503,
  alias y compatibilidad con el driver REST.
- **Validación en el VPS:** `ok=true` con certificado a 364 días, disco al
  15 %, backup de 3 min, heartbeats de `rag-worker` y `layer-worker` y colas en
  cero. Fallo simulado con `OPS_MAX_DISK_PCT=1`: `ok=false` con alerta de disco.
- **Tests:** 6 de `checks` + 5 de request-log + 4 de health; suite completa en
  verde.
- **Pendiente:** 31-C (GlitchTip/Sentry y analítica) y 31-D (valoración del
  chat) requieren decisión de servicio/UX. La tasa de error del LLM se puede
  sumar cuando existan métricas persistidas.


## 8. Correo operativo (2026-11-25)

- `ops-check` envía correo al owner al cambiar de estado (`failing`), con
  recordatorio cada 6 h y aviso de recuperación. Estado en
  `admin.notify_state` (migración 059).
- Fallos de backup e ingestas envían alerta con `deploy/vps/notify-alert.sh`
  (imagen de la API + SMTP).
- Destinatario: `OPS_ALERT_EMAIL` en `.env`.
- Verificado con umbral de disco simulado: alerta, no duplicado en la segunda
  corrida y recuperación al volver a `ok`; ingesta forzada a fallar envió aviso
  y terminó con código 1.
