# Spec 46-C — `/api/taxonomy` y sidebar nativo con feature flag

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 46-C |
| **Estado de la spec** | CERRADA (local 2026-11-19; VPS pendiente) |
| **Tamaño** | Mediano |
| **Duración estimada** | 6-8 h |
| **Dependencias** | 46-A/46-B (tablas normalizadas y compilador), 14 (`/api/config`) |
| **Última revisión** | 2026-11-19 |

> **Qué es esta spec.** Agrega un endpoint que compila la taxonomía normalizada
> (`admin.dimensions/groups/subgroups/layers/placements`) al mismo shape de
> `allTemasConfig` y permite que el sidebar lo consuma con un feature flag. Si
> falla, cae a `/api/config` y luego al fallback local (INV-5).

---

## 1. Objetivo y contexto

46-A/46-B dejaron la taxonomía en tablas normalizadas y un compilador que
publica el snapshot. El sidebar sigue leyendo `/api/config` (snapshot). 46-C
cierra el circuito: el visor puede leer la taxonomía directamente desde las
tablas, sin esperar una publicación, y volver al snapshot si el endpoint falla.

Para no reescribir el sidebar, `/api/taxonomy` devuelve **el mismo shape** que
`/api/config` (`dimensiones`, `capas`, `cargaInicial`, `grupos`, `subgrupos`,
`estilo`). El “árbol normalizado” se compila en el servidor con
`compileConfigFromRows`; el frontend solo cambia la fuente.

## 2. Alcance

**Dentro**
- `GET /api/taxonomy` público, cacheable y con ETag.
- Feature flag de servidor `TAXONOMY_API_ENABLED=1`.
- Feature flag de cliente `?taxonomy=1` o `globalThis.WOLL_TAXONOMY_API = true`.
- Compilación en memoria desde las tablas normalizadas; sin schema nuevo.
- Fallback del loader: `/api/taxonomy` → `/api/config` → `allTemasConfig`.
- Tests de handler, flag, ETag y loader.
- Documentación de activación y rollback.

**Fuera**
- Cambiar la forma del sidebar o `dimensionBuilder`.
- Reemplazar `/api/config` o retirar el snapshot.
- Publicar automáticamente un snapshot al leer la taxonomía.
- Cache distribuida o Redis; se usa caché HTTP de 60 s.
- Edición de la taxonomía desde el visor.

## 3. Reglas del CONTRACT que aplican

| Regla | Implicancia |
|---|---|
| §1.3 (un recurso, un lugar) | Las tablas `admin.*` son la fuente; el endpoint compila, no duplica datos. |
| §1.7 (fallback, INV-5) | Si `/api/taxonomy` falla, se intenta `/api/config` y luego el fallback local. |
| §5.3 (API) | `GET /api/taxonomy` devuelve `{ config, checksum, source, generated_at, warnings? }`. |
| §5.4 (validación) | La config compilada se valida con `validarConfiguracionGlobal`; si tiene errores, 503. |
| §9.1 (tests) | Handler, flag, ETag y loader con `node:test`. |

## 4. Contrato de API

`GET /api/taxonomy`

- Si `TAXONOMY_API_ENABLED !== "1"`: `404 { error: "Taxonomía no habilitada." }`,
  `Cache-Control: no-store`.
- Si la BD falla o la config es inválida: `503 { error: "Taxonomía no disponible." }`,
  `Cache-Control: no-store`, `Retry-After: 30`.
- Si responde:
  ```json
  {
    "source": "taxonomy",
    "generated_at": "2026-11-19T21:00:00.000Z",
    "checksum": "sha256:…",
    "warnings": [],
    "config": { "agua": { "nombre": "...", "capas": [], "grupos": {}, "estilo": {} } }
  }
  ```
- `ETag: "taxonomy-<checksum>"`; si `If-None-Match` coincide, `304`.
- `Cache-Control: public, max-age=60`, `Vary: Accept-Encoding`.

### 4.1. Consultas

Mismas consultas que `scripts/taxonomy-compile.mjs` (`loadRows`), en el orden:

1. `admin.dimensions` activas.
2. `admin.groups` activos de dimensiones activas.
3. `admin.subgroups` activos.
4. `admin.layers` activas.
5. `admin.layer_placements` activos.
6. `admin.dimension_initial_items`.

Se compila con `compileConfigFromRows(rows)` y se valida. No se escribe nada.

### 4.2. Feature flags

| Lado | Flag | Efecto |
|---|---|---|
| Servidor | `TAXONOMY_API_ENABLED=1` | Habilita el endpoint; sin él, 404. |
| Cliente | `?taxonomy=1` en la URL | El loader intenta `/api/taxonomy` primero. |
| Cliente | `globalThis.WOLL_TAXONOMY_API = true` | Igual, útil para pruebas/consola. |

Si el cliente no activa el flag, sigue usando `/api/config` como hoy.

### 4.3. Loader

`js/config/loader.js`:

1. Si el flag de cliente está activo, intenta `/api/taxonomy`.
2. Si falla, intenta `/api/config`.
3. Si ambos fallan, usa `allTemasConfig` (INV-5).
4. `getTemasConfigMeta().source` puede ser `taxonomy`, `api` o `fallback`.

El timeout por intento sigue siendo 3 s. `initTemasConfig()` sigue siendo
idempotente.

## 5. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | `TAXONOMY_API_ENABLED=1` y tablas sembradas | pido `/api/taxonomy` | 200 con config, checksum y `source: "taxonomy"` | integración |
| CA-2 | flag de servidor apagado | pido `/api/taxonomy` | 404 y el cliente usa `/api/config` | test/manual |
| CA-3 | config normalizada inválida | pido `/api/taxonomy` | 503; no se sirve una config rota | test |
| CA-4 | misma respuesta | repito con `If-None-Match` | 304 | test |
| CA-5 | `?taxonomy=1` | `/api/taxonomy` falla | el loader intenta `/api/config` y usa esa config | test |
| CA-6 | ambos endpoints fallan | carga el visor | usa `allTemasConfig`; el visor funciona | test/manual |
| CA-7 | sin flag de cliente | carga el visor | sigue usando `/api/config`; no hay cambio visible | test |
| CA-8 | taxonomía editada en el panel | recargo con flag | el sidebar refleja el cambio sin publicar snapshot | manual |

## 6. Plan por sub-sprint

| Tramo | Contenido | Horas | Estado |
|---|---|---|---|
| 46-C.1 | Handler, consultas y compilación; flag de servidor | 2-3 | ✅ local |
| 46-C.2 | Ruta, ETag, caché y tests del handler | 1-2 | ✅ local |
| 46-C.3 | Loader con fallback y flag de cliente; tests | 1-2 | ✅ local |
| 46-C.4 | Documentación, activación y smoke | 1 | 🔶 local; falta VPS |

## 7. Tests requeridos (`node:test`)

- `server/handlers/__tests__/taxonomy.test.js`: flag apagado (404), flag
  encendido con filas mínimas (200), config inválida (503), ETag/304, error de
  BD (503).
- `scripts/__tests__/config-loader.test.js`: flag de cliente, éxito de
  `/api/taxonomy`, fallback a `/api/config`, fallback local.
- Manual: activar el flag en el VPS, recargar con `?taxonomy=1`, editar una
  dimensión en el panel y ver el cambio sin publicar snapshot.

## 8. Seguridad y procedencia

- El endpoint es público y de solo lectura; no expone `admin.*` ni secretos.
- No acepta parámetros de usuario; no hay SQL dinámico.
- La config se valida antes de servir; si falla, 503.
- El flag de servidor se controla por variable de entorno, no por query.
- Los logs no incluyen la config completa.

## 9. Preguntas abiertas

| # | Pregunta | Decisión |
|---|---|---|
| R1 | ¿`/api/taxonomy` devuelve un árbol nuevo o el shape de `allTemasConfig`? | **El shape actual**, para no reescribir el sidebar. |
| R2 | ¿Flag de servidor o de cliente? | **Ambos**: servidor habilita el endpoint; cliente decide intentarlo. |
| R3 | ¿Caché? | HTTP `max-age=60` + ETag; sin Redis. |
| R4 | ¿Reemplaza a `/api/config`? | **No**; `/api/config` sigue siendo el fallback estable. |

## 10. Riesgos, reversión y documentación

- **Config inválida en tablas:** se valida y se devuelve 503; el visor cae a
  `/api/config`.
- **Latencia de compilación:** seis consultas y un objeto; se cachea 60 s.
- **Divergencia snapshot/taxonomía:** el snapshot sigue publicándose; el flag
  permite comparar. Si hay diferencias, se investiga antes de activar.
- **Reversión:** apagar `TAXONOMY_API_ENABLED` y quitar `?taxonomy=1`; el visor
  vuelve a `/api/config` sin deploy.
- **Documentos:** esta spec, `00-spec-madre.md`, `ARCHITECTURE.md` §4.2,
  `DEV_GUIDE.md`, `ROADMAP.md`, `CHANGELOG.md`, `.env.example`,
  `docker-compose.yml`.

## 11. Puntos de integración

- **46-A/B:** tablas y `compileConfigFromRows`.
- **14:** `/api/config` y `js/config/loader.js`.
- **46-C:** sidebar sin cambios de forma.
- **Panel:** los cambios de taxonomía se reflejan al recargar con el flag.

## 12. Cierre

- **Horas reales:** sesión asistida que cubrió 46-C.1 a 46-C.4 (estimación
  original: 6-8 h).
- **Desvíos:** el endpoint devuelve el shape compilado de `allTemasConfig` en
  lugar de un árbol nuevo, para no reescribir `dimensionBuilder`. El flag de
  cliente se activa con `?taxonomy=1` o `WOLL_TAXONOMY_API`; el de servidor con
  `TAXONOMY_API_ENABLED=1`.
- **Lecciones:** la taxonomía local compila al mismo checksum que el snapshot
  v2 (`f85f8027…`), lo que confirma que el seed y el compilador son fieles. El
  fallback `/api/taxonomy` → `/api/config` → local funciona sin cambios en el
  sidebar.
- **Verificación local:** `GET /api/taxonomy` con PostgreSQL real devolvió 9
  dimensiones, checksum igual al snapshot activo y `304` con el ETag; tests del
  handler y del loader en verde.
- **Pendiente:** activar `TAXONOMY_API_ENABLED=1` en el VPS, probar
  `?taxonomy=1` y validar que una edición de taxonomía se refleje sin publicar
  snapshot.
