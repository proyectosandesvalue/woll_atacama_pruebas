# Spec 14-15 — Configuración en BD y panel admin de solo lectura

| Campo | Valor |
|---|---|
| **Sprints (ROADMAP)** | 14 (config a `admin.*`) y 15 (panel de solo lectura) |
| **Estado de la spec** | EN EJECUCIÓN — 14 y 15 implementados y validados localmente; falta cierre formal en el VPS |
| **Tamaño** | Mediano (14 h) |
| **Duración estimada** | 14 (4-6 h) + 15 (6-8 h) |
| **Dependencias** | 07 (implícita: `/api/config`), 08 (`tiles/index.json`), 24-C (ADR 007, pendiente) |
| **Última revisión** | 2026-11-13 |

## 1. Objetivo y contexto

Hoy la estructura del visor (dimensiones, grupos, capas, alias, estilos,
popups) vive en `js/config/*.js`. El CONTRACT §7.1 dice que el visor no debe
leer esos archivos en runtime, pero todavía lo hace. Los datos del chat
(prompts, settings, mensajes y datos no disponibles) ya viven en `admin.*`
(migración 024) y se leen por RPCs `chat_*`.

Este tramo hace dos cosas:

1. **14:** publicar la configuración del visor como un **snapshot JSON
   versionado** en `admin.config_snapshots` + índice `admin.config_layers`, y
   servirlo por `GET /api/config`. El frontend lo consume con fallback al
   código (INV-5). La autoría sigue en `js/config/*.js`; la edición desde el
   panel llega en el Sprint 16. Ver ADR 024.
2. **15:** construir un **panel admin de solo lectura** para ver el snapshot
   activo, las capas indexadas, los prompts/settings/mensajes del chat y los
   datos no disponibles. Sin formularios de escritura. La autenticación y la
   auditoría se implementan desde el inicio (ADR 007).

## 2. Alcance

**Dentro**

- Migración `041_admin_config_snapshots.sql`: tabla de snapshots,
  checksum, versión, autor, una sola versión activa e índice
  `admin.config_layers`.
- `scripts/config-snapshot.mjs`: importa `allTemasConfig`, valida con
  `configValidator`, calcula SHA-256, hace `--dry-run`, `--publish` y
  `--check`; imprime resumen de dimensiones/capas.
- `GET /api/config`: devuelve el snapshot activo con `version`,
  `checksum`, `generatedAt`, `config`; `ETag`, `Cache-Control: public,
  max-age=300`; fallback 503 si la BD no responde.
- `js/config/loader.js`: `initTemasConfig()` + `getTemasConfig()`;
  fetch a `/api/config`, validación mínima y fallback a `allTemasConfig`.
- Adaptar `js/app.js`, `js/search/index.js` y `js/ui/themeUI.js` para usar el
  loader en vez de importar `allTemasConfig` directo.
- Panel `admin.html` + `css/admin.css` + `js/admin/*.js`:
  - login, logout y sesión;
  - vista “Configuración” con snapshot activo y árbol dimensión → grupo → capa;
  - vista “Chat” con prompts versionados (contenido y metadatos), settings,
    mensajes y datos no disponibles;
  - vista “Auditoría” con los últimos eventos (solo lectura);
  - `noindex`, sin enlaces desde el visor público.
- Endpoints de lectura `GET /api/admin/*` protegidos por sesión.
- Migración `042_admin_auth_audit.sql`: `admin.audit_log` y
  `admin.admin_users` (ADR 007).
- Tests de snapshot, loader, auth y endpoints.

**Fuera**

- Edición de capas, prompts o settings desde el panel (Sprint 16).
- Carga de GeoJSON/Shapefile, validación geométrica y `ogr2ogr` (Sprint 16).
- OIDC institucional si ADR 007 elige TOTP local; se deja la interfaz
  `authenticate()` para agregarlo después.
- Migrar el frontend a un framework o reescribir el sidebar.
- Cambiar la demo Vercel/Supabase: la demo sigue con el fallback local.

## 3. Reglas del CONTRACT que aplican

| Regla | Implicancia |
|---|---|
| §1.2 Configuración explícita | Un solo lugar canónico: el snapshot activo. El código no se edita a mano para cambiar datos. |
| §1.7 Fallback (INV-5) | Si `/api/config` o la BD fallan, el visor arranca con `allTemasConfig`. |
| §2 Planos | Estructura sigue en código hasta 16; datos y textos van a `admin.*`. |
| §7.1 Consumo de config | El visor deja de importar `js/config/*.js` en runtime; usa `/api/config` + fallback. |
| §7.2 Rendering | Todo texto del panel se inserta con `textContent` o `escapeHtml`. |
| §7.4 Estado | `appState` sigue siendo la única fuente de verdad; el loader solo resuelve la config inicial. |
| §9.1 Tests | Snapshot, loader, auth y endpoints con `node:test`; migraciones aplicables dos veces. |
| §12.4 Input/output | Login y endpoints validan entrada; respuestas de error genéricas + `errorId`. |

## 4. Contrato de datos / API

### 4.1. `admin.config_snapshots`

| Columna | Tipo | Regla |
|---|---|---|
| `version` | `bigint generated always as identity` | PK |
| `content` | `jsonb not null` | snapshot completo de `allTemasConfig` |
| `checksum` | `text not null` | SHA-256 del JSON canónico |
| `source` | `text not null` | `js`, `panel`, `import` |
| `notes` | `text` | motivo del cambio |
| `created_at` | `timestamptz not null default now()` | |
| `created_by` | `text` | usuario o `cli` |
| `active` | `boolean not null default false` | una sola fila activa |

Índice único parcial: `CREATE UNIQUE INDEX ... ON admin.config_snapshots ((active)) WHERE active;`

### 4.2. `GET /api/config`

```json
{
  "version": 1,
  "checksum": "sha256:…",
  "generatedAt": "2026-11-13T12:00:00Z",
  "config": { "agua": { "...": "..." } }
}
```

- Público, sin secretos.
- `ETag: "<checksum>"`; `If-None-Match` → `304`.
- `Cache-Control: public, max-age=300`.
- Sin snapshot/DB caída → `503` con `Retry-After: 30`; el loader usa el fallback.

### 4.3. Endpoints del panel (solo lectura)

| Método | Ruta | Devuelve |
|---|---|---|
| `POST` | `/api/admin/login` | cookie de sesión + `{user, expiresAt}` |
| `POST` | `/api/admin/logout` | limpia cookie |
| `GET` | `/api/admin/session` | `{user, expiresAt}` o 401 |
| `GET` | `/api/admin/config` | snapshot activo + resumen de capas |
| `GET` | `/api/admin/prompts` | prompts con versiones y metadatos |
| `GET` | `/api/admin/settings` | settings con tipo/descripción |
| `GET` | `/api/admin/messages` | mensajes estándar |
| `GET` | `/api/admin/unavailable` | inventario activo |
| `GET` | `/api/admin/audit?limit=50` | últimos eventos |

Todos menos login/logout exigen sesión. No hay `POST/PUT/PATCH/DELETE` de
configuración en este tramo.

### 4.4. Autenticación (ADR 007, pendiente)

Propuesta por defecto si no hay IdP institucional:

- **Usuario admin** en `admin.admin_users` (`username`, `password_hash`
  scrypt, `activo`, `last_login_at`). El secreto TOTP **no** se guarda en la
  BD: vive en `ADMIN_TOTP_SECRET`.
- **Factor 1:** password verificada con `crypto.scrypt` (sal única).
- **Factor 2:** TOTP de 6 dígitos, ventana ±1 paso.
- **Sesión:** cookie `woll_admin` `HttpOnly`, `Secure` en producción,
  `SameSite=Strict`, expiración 8 h, firmada con `ADMIN_SESSION_SECRET`.
- **CSRF:** token en `sessionStorage` + header `X-CSRF-Token` en POST.
- **Rate limit:** 5 intentos/minuto por IP+usuario; bloqueo 15 min tras 5
  fallos.
- **Secretos:** `ADMIN_SESSION_SECRET` y `ADMIN_TOTP_SECRET` solo en env;
  nunca en el repo ni en la BD en claro. El alta usa
  `npm run admin:user -- --username admin --password '…'`.
- **Auditoría:** cada login, logout, fallo y lectura sensible en
  `admin.audit_log` (`at`, `actor`, `action`, `target`, `ip_hash`, `result`).

Si ADR 007 elige OIDC institucional, se reemplaza el login local por el flujo
OIDC y se mantiene la misma sesión/cookie y auditoría.

## 5. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | `allTemasConfig` válido | ejecuto `config:snapshot --dry-run` | imprime dimensiones/capas y checksum, sin escribir | test + CLI |
| CA-2 | snapshot publicado | pido `/api/config` | devuelve la versión activa con ETag y cache 5 min | test de handler |
| CA-3 | snapshot sin cambios | repito con `If-None-Match` | responde 304 | test de handler |
| CA-4 | BD caída | arranca el visor | usa `allTemasConfig` y no rompe | test del loader |
| CA-5 | panel sin sesión | abro `/admin.html` | redirige a login; `/api/admin/*` responde 401 | test + manual |
| CA-6 | credenciales inválidas | 5 intentos | bloqueo temporal y evento en auditoría | test |
| CA-7 | sesión válida | abro Configuración | veo snapshot, dimensiones, grupos y capas sin editar | manual |
| CA-8 | sesión válida | abro Chat | veo prompts/settings/mensajes/unavailable | manual |
| CA-9 | sesión válida | abro Auditoría | veo los últimos eventos con actor y acción | manual |
| CA-10 | migraciones 041/042 | se aplican dos veces | no hay error | `npm run migrate` dos veces |
| CA-11 | panel | busco en el DOM | no hay `innerHTML` con datos sin escapar | revisión + test estático |
| CA-12 | build de CI | push | lint, tests y sintaxis pasan | GitHub Actions |

## 6. Plan por sub-sprint

| Tramo | Contenido | Horas | Estado |
|---|---|---|---|
| 14-A | Migración 041, `config-snapshot.mjs`, validación y CLI | 2 | ✅ |
| 14-B | `GET /api/config`, caché/ETag, tests de handler | 1.5 | ✅ |
| 14-C | `js/config/loader.js`, adaptar `app.js`/search/theme, fallback | 1.5 | ✅ |
| 15-A | ADR 007 + migración 042 (`admin_users`, `audit_log`), hash/TOTP | 2 | ✅ |
| 15-B | Endpoints de login/sesión/logout, CSRF, rate limit, auditoría | 2 | ✅ |
| 15-C | `admin.html` + login + layout + navegación | 1.5 | ✅ |
| 15-D | Vistas Configuración/Chat/Auditoría (solo lectura) | 2 | ✅ |
| 15-E | Tests, revisión de seguridad y documentación | 1.5 | ✅ |

## 7. Tests requeridos

- `scripts/__tests__/config-snapshot.test.js`: checksum estable, snapshot
  inválido rechazado, `--dry-run` no escribe.
- `server/__tests__/config-handler.test.js`: 200/304/503, ETag, forma del
  payload.
- `scripts/__tests__/config-loader.test.js`: usa API, cae a fallback si 503 o
  JSON inválido, no muta `appState`.
- `server/__tests__/admin-auth.test.js`: password + TOTP, cookie firmada,
  expiración, CSRF, rate limit, auditoría.
- `scripts/__tests__/admin-panel.test.js`: el HTML no tiene handlers inline ni
  `innerHTML` con datos; las vistas usan `textContent`.
- Migraciones 041/042 aplicadas dos veces en la BD local.

## 8. Seguridad y procedencia

- El panel **no** se enlaza desde el visor público y responde `X-Robots-Tag:
  noindex`.
- Cookies `HttpOnly`/`SameSite=Strict`; nunca tokens en `localStorage`.
- TOTP y password hash nunca se serializan al frontend.
- Los endpoints de lectura usan `Cache-Control: no-store`.
- La IP se guarda hasheada en auditoría, no en claro.
- Los prompts son contenido sensible: solo se muestran con sesión.
- El snapshot no incluye secretos: `PROXY_URL` es pública; `INSTANCE_ID` y
  `CLIENT_SECRET` viven en el servidor.
- Migraciones idempotentes; nunca editar 024/025.

## 9. Preguntas abiertas

| # | Pregunta | Default | ¿Bloquea? |
|---|---|---|---|
| R1 | ¿ADR 007 usa TOTP local, OIDC institucional o ambos? | **TOTP local + interfaz para OIDC** (decidido 2026-11-13, ADR 007) | no (resuelto) |
| R2 | ¿El snapshot reemplaza toda la config o solo nombres/alias/colores? | **snapshot completo + `admin.config_layers`** (decidido 2026-11-13, ADR 024) | no (resuelto) |
| R3 | ¿El panel vive en `/admin.html` del mismo sitio o en un subdominio aparte? | `/admin.html` con noindex | no |
| R4 | ¿El panel debe funcionar en la demo Vercel o solo en VPS/local? | solo VPS/local; demo usa fallback | no |
| R5 | ¿La autoría de la config sigue en JS hasta el Sprint 16? | sí; 16 agrega edición | no |
| R6 | ¿Retención de auditoría? | 12 meses | no |
| R7 | ¿Quién es el usuario admin inicial y cómo recibe el secreto TOTP? | bootstrap por env + enrolamiento en primer login | no |

R1 y R2 quedaron resueltas el 2026-11-13. R3-R7 tienen default y no bloquean
el cierre local; la validación en el VPS queda para el Sprint 26.

## 10. Riesgos, reversión y documentación

**Riesgos**
- **Snapshot desactualizado:** si alguien edita `js/config` y no republica,
  el visor sigue con la versión anterior. Mitigación: `config:snapshot
  --check` en CI compara checksum y falla.
- **Doble fuente:** durante la transición conviven JS y BD. Mitigación:
  `/api/config` es la única lectura; el fallback solo se usa si la API falla.
- **Auth casera:** TOTP local es más simple que OIDC pero exige disciplina de
  secretos. Mitigación: scrypt, rate limit, bloqueo y auditoría.
- **Panel expuesto:** `noindex` no es seguridad. Mitigación: auth obligatoria,
  firewall/Nginx y rate limit.
- **Snapshots grandes:** la config completa puede pesar cientos de KB.
  Mitigación: gzip de Nginx, ETag y cache 5 min.

**Reversión**
- `/api/config`: quitar la ruta y volver al import estático de
  `allTemasConfig` (el fallback ya existe).
- Snapshot: desactivar la versión y activar la anterior con SQL
  (`UPDATE admin.config_snapshots SET active = ...`).
- Panel: retirar `admin.html` y las rutas `/api/admin/*`; no afecta al visor.

**Documentación**
- Actualizar `docs/CONTRACT.md` §2 y §7.1 cuando el visor lea `/api/config`.
- `docs/ARCHITECTURE.md`: nueva sección de config en BD y panel.
- `docs/ROADMAP.md` y `docs/CHANGELOG.md` al cerrar.
- ADR 007 (auth admin) y ADR 024 (snapshot de config) si se aprueba R2.

## 11. Puntos de integración

- **Sprint 07:** `/api/config` es la implementación de este tramo; el
  snapshot reemplaza la generación en memoria.
- **Sprint 08:** `tiles/index.json` y los `source.tiles` deben seguir
  resolviéndose con la versión publicada.
- **Sprint 16:** agrega edición de capas y publicación de snapshots desde el
  panel; reutiliza auth, auditoría y `/api/config`.
- **Sprint 17:** el panel muestra el estado de ingesta RAG (solo lectura) en
  una vista futura.
- **Sprint 26:** el panel y `/api/config` corren en el VPS; Nginx aplica
  noindex y cache.
- **Sprint 28:** el panel cumple CSP, escape de datos y cookies seguras.

## 12. Resultados (2026-11-13)

- `041` y `042` aplicadas y reaplicadas dos veces sin error en PostgreSQL local.
- Snapshot v1: **9 dimensiones, 158 capas maestras, 315 filas** de índice.
- `GET /api/config`: 200 con ETag, 304 con `If-None-Match`, 503 con
  `Retry-After` si no hay snapshot.
- Visor: carga `/api/config` y mantiene mapa, sidebar y estaciones; el
  fallback está cubierto por tests.
- Panel: login TOTP, config, chat (prompts/settings/messages/unavailable) y
  auditoría validados en navegador; sin violaciones CSP.
- Tests: **383 tests, 371 pasan, 12 omitidos, 0 fallos**; lint 0 errores.
- Prompts locales sembrados con `scripts/migrate_prompts.mjs` (2 prompts).

## 13. Cierre

- Horas reales: 7,5 (14: 3 h; 15: 4,5 h).
- Desvíos: el panel se implementó sin framework y con DOM API para cumplir
  CSP; la validación en VPS queda pendiente.
- Lecciones: el snapshot + índice desacopla el panel de la estructura JS; el
  TOTP local evita bloquear el Sprint 16 por el IdP institucional.
