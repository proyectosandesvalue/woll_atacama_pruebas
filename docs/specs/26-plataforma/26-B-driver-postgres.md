# Spec 26-B — Driver PostgreSQL con `pg.Pool` y registro de RPCs

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 26-B |
| **Estado de la spec** | CERRADA (2026-11-10) |
| **Tamaño** | Mediano (5h) |
| **Dependencias** | 26-C (imagen, migraciones, roles) |
| **Última revisión** | 2026-11-10 |

## 1. Objetivo

Reemplazar el driver REST de Supabase por un driver PostgreSQL nativo con
`pg.Pool`, sin cambiar la interfaz que consumen el orquestador, las tools y los
endpoints. El driver solo puede invocar RPCs de una lista cerrada, con
parámetros nombrados y casts explícitos; nunca acepta SQL del cliente ni del
LLM.

## 2. Alcance

**Dentro**

- `server/db/drivers/postgres.js` con `pg.Pool`, `rpc`, `query`, `ping` y
  `close`.
- `server/db/rpc-signatures.js` con las 47 RPCs usadas en `server/`, `scripts/`
  y `api/`.
- Registro del driver en `server/db/pool.js` (`DB_DRIVER=postgres`).
- `server/db/config.js` con `DATABASE_URL` y `PG_APPLICATION_NAME`.
- Timeouts: `PG_STATEMENT_TIMEOUT_MS`, `PG_QUERY_TIMEOUT_MS`, pool y conexión.
- `scripts/check-rpc-signatures.mjs` y `npm run check:rpcs`.
- Tests unitarios y de integración contra PostgreSQL en contenedor.

**Fuera**

- Servidor HTTP y rutas (26-A).
- Cambios a las RPCs existentes o creación de las que faltan (26-E).
- Nginx, backups y hardening (26-D/G/H).

## 3. Contrato del driver

```js
const db = await getDB();
await db.rpc("chat_query", { p_layer: "desaladoras", p_filters: {} });
```

- `rpc(name, params, opts)`:
  - Rechaza nombres no registrados.
  - Rechaza parámetros no declarados para esa RPC.
  - Omite parámetros `undefined`; conserva `null`.
  - Construye `SELECT public.<fn>(p_x => $1::tipo, ...) AS result`.
  - Devuelve el valor de la función (`jsonb`, texto, uuid, etc.) o `null`.
  - `opts.signal` se respeta antes de ejecutar; `pg` no cancela una query en
    vuelo por `AbortSignal`. El corte efectivo es `statement_timeout` +
    `query_timeout`.
- `query(text, params)` es interna (health, scripts, migraciones); no se expone
  al chat.
- `ping()` ejecuta `SELECT 1` para `/healthz`.
- `close()` cierra el pool en tests y cierre ordenado.
- Pool: `PGPOOL_MAX` (10), `PG_IDLE_TIMEOUT_MS` (30 s),
  `PG_CONNECTION_TIMEOUT_MS` (5 s), `statement_timeout` (5 s),
  `query_timeout` (6 s).
- Errores: `RPC <name> falló [CODE]: <message>`, sin SQL ni parámetros.

### 3.1. Registro de RPCs

El registro vive en `server/db/rpc-signatures.js`. Todas las funciones se
invocan en `public`; las de `chat.*` tienen wrapper público estable. Un test
recorre `server/`, `scripts/` y `api/` y falla si aparece un `.rpc("...")` sin
firma.

### 3.2. RPCs heredadas que no están en las migraciones

`npm run check:rpcs` contra una base creada solo con `000-037` reporta 12 RPCs
que existen en Supabase pero no están versionadas en `db/migrations/`:

- `admin_upsert_station`
- `chat_historical_climate`
- `chat_historical_stations`
- `chat_list_climate_stations`
- `chat_station_available_dates`
- `chat_station_details`
- `chat_station_series`
- `chat_station_weather`
- `chat_stations_map_data_at_date`
- `chat_variable_available_dates`
- `ingest_bulk_upsert_values`
- `ingest_update_run`

Estas funciones llegan con el dump de los schemas de Supabase en **26-E**. El
corte no se cierra hasta que `npm run check:rpcs` pase contra la base restaurada.
No se inventan versiones nuevas sin comparar con la definición real.

## 4. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | una RPC no registrada | se intenta ejecutar | se rechaza antes de tocar la BD | test unitario |
| CA-2 | un parámetro no declarado | se pasa a una RPC | se rechaza antes de tocar la BD | test unitario |
| CA-3 | una RPC con `jsonb` y `text[]` | se construye la llamada | los valores se preservan y los casts son correctos | test unitario |
| CA-4 | una base migrada | se ejecutan las RPCs de catálogo/config/ingestas | devuelven el tipo esperado sin error | test de integración |
| CA-5 | una base migrada | se hace `ping` y una query directa | responde | test de integración |
| CA-6 | un `AbortSignal` ya abortado | se llama a `rpc` | se rechaza antes de ejecutar | test unitario |
| CA-7 | una base restaurada de Supabase | se corre `npm run check:rpcs` | 47/47 RPCs presentes y con argumentos esperados | script + 26-E |

## 5. Tests

- `server/db/__tests__/rpc-signatures.test.js`: cobertura del registro contra el
  código, SQL/valores, RPC/parámetro desconocidos.
- `server/db/__tests__/postgres-driver.integration.test.js`: `ping`, query,
  catálogo, settings, prompt, inventario, estaciones y rechazos. Se salta si no
  existe `TEST_DATABASE_URL`.
- Ejecución real: 10/10 contra PostgreSQL del Compose con `000-037`.
- `npm run check:rpcs` queda como puerta de 26-E.

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| Una RPC heredada no llega en el dump | `check:rpcs` bloquea el corte; 26-E la revisa |
| Diferencia de tipos entre PostgREST y `pg` | Casts explícitos + tests de integración |
| `pg` no cancela por `AbortSignal` | `statement_timeout`/`query_timeout`; documentado |
| Pool mal dimensionado | `PGPOOL_MAX` configurable; 26-H mide 20/50 usuarios |
| Un parámetro nuevo rompe el registro | El test recorre el código y falla si falta la firma |

## 7. Reversión

`DB_DRIVER=supabase` vuelve al driver REST sin tocar el orquestador. El driver
nuevo no modifica datos ni schema.

## 8. Cierre

- **Estado:** CERRADA 2026-11-10.
- **Validación:** 10/10 tests de integración contra PostgreSQL del Compose;
  unitarios de registro/SQL; `check:rpcs` detectó las 12 RPCs heredadas.
- **Horas reales:** pendiente de registrar por el dev.
- **Desvíos:** el registro incluye 12 RPCs que no están en las migraciones; se
  resuelven con el dump de 26-E.
- **Lecciones:** el registro cerrado y el test que recorre el código evitan que
  una tool nueva llame a una RPC sin firma.
