# Spec 26-A — Servidor Node persistente y paridad de endpoints

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 26-A |
| **Estado de la spec** | CERRADA (2026-11-11) |
| **Tamaño** | Mediano (6h) |
| **Dependencias** | 26-B (driver `pg.Pool`) |
| **Última revisión** | 2026-11-11 |

## 1. Objetivo

Tener un servidor Node persistente que reemplace a las Vercel Functions para
los **10 endpoints públicos** actuales, con el mismo contrato de respuesta,
CORS, límite de body, healthcheck y cierre ordenado. La lógica de estaciones y
ARClim se extrae a handlers puros para que Vercel (demo) y el VPS compartan el
mismo código.

## 2. Alcance

**Dentro**

- `server/index.js`: arranque, timeouts, señales y cierre del pool.
- `server/app.js`: router, CORS, body JSON, errores y respuestas.
- `server/http/`: router, body, response, errores y adapter Vercel.
- `server/routes/`: chat, proxy, ARClim, estaciones y health.
- `server/handlers/arclim.js` y `server/handlers/stations.js`.
- Refactor de `api/*.js` para delegar en los handlers (sin duplicar lógica).
- `/healthz` y `/readyz` con chequeo de BD.

**Fuera**

- Nginx, TLS y estáticos (26-D).
- Cambios a los contratos de chat o proxy.
- Migración de datos o RPCs heredadas (26-E).
- Ingestas programadas (26-J).

## 3. Contrato HTTP

| Ruta | Método | Handler |
|---|---|---|
| `/api/chat` | POST | `handleChat` |
| `/api/proxy` | GET | `handleProxy` |
| `/api/arclim-geojson` | GET | `handleArclimGeoJSON` |
| `/api/stations-map` | GET | `handleStationsMap` |
| `/api/station-details` | GET | `handleStationDetails` |
| `/api/station-series` | GET | `handleStationSeries` |
| `/api/station-available-dates` | GET | `handleStationAvailableDates` |
| `/api/variable-availability` | GET | `handleVariableAvailability` |
| `/api/variable-available-dates` | GET | `handleVariableAvailableDates` |
| `/api/historical-stations` | GET | `handleHistoricalStations` |
| `/healthz` | GET | ping de BD |
| `/readyz` | GET | alias de `/healthz` |

Reglas:

- `OPTIONS` responde 204 con CORS para el path existente.
- Método incorrecto: 405 JSON.
- Path desconocido: 404 JSON.
- Body JSON del chat: máximo 1 MB; `413` si excede, `400` si es inválido,
  `415` si el content-type no es JSON.
- Errores no controlados: 500 `{ error: "Error interno" }`, sin stack ni SQL.
- CORS por allowlist (`ALLOWED_ORIGINS`), no `*`.
- `/api/proxy` expone `Content-Length`, `Data-Present`, `Acquisition-Time` y
  `X-Proxy-Cache`.
- `/healthz` responde 200 con `{ ok, service, db: "up", uptime_s }` o 503 con
  `db: "down"`. No expone versiones ni secretos.
- `server.requestTimeout = 120 s`; el budget del chat y el timeout del proxy
  siguen mandando por debajo.

## 4. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | el servidor Node | se levanta con PostgreSQL | `/healthz` responde 200 y `db: "up"` | smoke real |
| CA-2 | los 10 endpoints | se prueban por HTTP | responden con el contrato actual | tests de app + smoke |
| CA-3 | una ruta desconocida | se llama | 404 JSON | test |
| CA-4 | un método incorrecto | se llama | 405 JSON | test |
| CA-5 | un preflight | se envía con `Origin` permitido | 204 con `Access-Control-Allow-Origin` | test |
| CA-6 | `/api/chat` | se envía `{}` | 400 antes del LLM | test + smoke |
| CA-7 | `/api/chat` | se envía JSON inválido | 400 | test |
| CA-8 | `/api/chat` | se envía un body > 1 MB | 413 | test |
| CA-9 | estaciones/ARClim | se inyecta un `getDB` falso | los handlers devuelven el contrato esperado | tests unitarios |
| CA-10 | el servidor | recibe SIGTERM | deja de aceptar requests, cierra el pool y termina | smoke real |
| CA-11 | la demo Vercel | se usan los adapters `api/*.js` | delegan en los mismos handlers | lint + revisión |

## 5. Tests

- `server/__tests__/http-utils.test.js`: router, body, content-type, límites.
- `server/__tests__/app.test.js`: 404/405/OPTIONS, health, chat inválido,
  estaciones, ARClim y proxy.
- `server/__tests__/stations-handlers.test.js`: rutas latest/date, defaults,
  fallbacks y parseo de enteros.
- `server/__tests__/arclim-handler.test.js`: filtro Atacama y error upstream.
- Smoke real: servidor en `:3100` contra PostgreSQL del Compose; `/healthz`,
  estaciones, ARClim, chat inválido y SIGTERM.

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| Divergencia entre Vercel y VPS | Ambos usan los mismos handlers puros |
| Body grande agota memoria | Límite 1 MB antes de parsear |
| Cierre con conexiones keep-alive colgadas | `closeIdleConnections` + force a 10 s |
| Healthcheck enmascara una BD caída | `/healthz` ejecuta `ping`/RPC real |
| Fuga de stack/SQL en errores | 500 genérico; logs solo server-side |

## 7. Reversión

Apagar el proceso Node y volver a las Vercel Functions. Los adapters `api/*.js`
siguen existiendo y el contrato no cambió.

## 8. Cierre

- **Estado:** CERRADA 2026-11-11.
- **Validación:** 310 tests (299 pasan sin BD, 11 omitidos; con BD, 309 pasan y
  1 omitido). Smoke real con PostgreSQL: `/healthz` 200, estaciones 200,
  ARClim 400 sin indicator, chat 400 con `{}`, proxy 400 con servicio inválido,
  SIGTERM con cierre ordenado.
- **Horas reales:** pendiente de registrar por el dev.
- **Desvíos:** `station-details` devuelve el fallback 200 porque la RPC heredada
  no existe en la base creada desde migraciones; se resuelve en 26-E.
- **Lecciones:** extraer handlers antes de montar el servidor evita duplicar la
  lógica entre Vercel y el VPS.
