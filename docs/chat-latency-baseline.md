# Línea base de latencia del chat — Sprint 25-B

| Campo | Valor |
|---|---|
| Fecha | 2026-11-09 (local) / 2026-11-10 UTC |
| Entorno | Producción: `https://wollatacamapruebas.vercel.app/api/chat` |
| Modelo | `gemini-3.1-flash-lite` |
| Muestra | 20 casos del golden set (`--all --limit 20`) |
| Instrumentación | `CHAT_TIMING_ENABLED=1` + logs de Vercel |
| Router | `CHAT_ROUTER_ENABLED=1` (15 requests por router, 4 por orquestador) |
| `CHAT_UNAVAILABLE_ENABLED` | 0 (la etapa `unavailable` midió 0 ms) |

## Objetivo

Medir la latencia real del chat antes de optimizar, separando el costo del
clasificador, el catálogo, el router, el orquestador (L1/L2), las tools y el
post-procesamiento. La instrumentación es la del Sprint 25-B
(`server/chat/timing.js`); no escribe en la BD.

## Resultado global

| Medición | n | p50 | p95 | Media | Máximo |
|---|---:|---:|---:|---:|---:|
| Extremo a extremo (runner) | 20 | 3.553 ms | 15.234 ms | 5.589 ms | 19.743 ms |
| Servidor (`total_ms`) | 20 | 2.672 ms | 12.527 ms | 4.599 ms | 19.389 ms |

- **19/20 PASS**. El único fallo fue `core-color-humedales-clasificacion`
  (el LLM no devolvió geojson/style_hint); es no determinismo del modelo, no
  de la instrumentación. Una corrida previa sin timing pasó 20/20.
- La diferencia entre extremo a extremo y servidor (~0,9 s en p50) es
  red, cold start y overhead de Vercel.
- El p95 usa el índice 18 de 20; el máximo observado se informa aparte.

## Desglose por etapa

| Etapa | n | p50 | p95 | Máximo | Nota |
|---|---:|---:|---:|---:|---|
| `catalog` (DB + retrieval) | 19 | 293 ms | 1.251 ms | 1.251 ms | Primera consulta a `chat_catalog` |
| `classifier` | 19 | 1.123 ms | 1.442 ms | 1.442 ms | Costo fijo en cada request |
| `unavailable` | 19 | 0 ms | 0 ms | 0 ms | Flag apagado |
| `router` | 19 | 1.054 ms | 6.001 ms | 6.001 ms | Incluye tools del pipeline |
| `orchestrator` | 4 | 3.698 ms | 17.473 ms | 17.473 ms | Solo 4 requests |
| `orchestrator.system_prompt` | 4 | 455 ms | 727 ms | 727 ms | Construcción/cache del prompt |
| `orchestrator.llm` L1 (suma) | 4 | 2.411 ms | 3.501 ms | 3.501 ms | Pasos de tool calling |
| `orchestrator.llm` L2 (suma) | 1 | 2.103 ms | 2.103 ms | 2.103 ms | Síntesis forzada |
| `orchestrator.tools` (bloque) | 5 | 1.534 ms | 6.001 ms | 6.001 ms | Tools del orquestador |
| `orchestrator.finish` | 4 | 461 ms | 1.441 ms | 1.441 ms | GeoJSON, evidencia y charts |

### Tools del orquestador

| Tool | n | p50 | p95 | Máximo |
|---|---:|---:|---:|---:|
| `get_layer_stats` | 3 | 336 ms | 368 ms | 368 ms |
| `aggregate_by_admin` | 2 | 727 ms | 1.534 ms | 1.534 ms |
| `count_near_layer` | 1 | 6.001 ms | 6.001 ms | 6.001 ms |
| `aggregate_near_layer` | 1 | 6.001 ms | 6.001 ms | 6.001 ms |

## Hallazgos

1. **El clasificador es el costo fijo más alto:** ~1,1 s en p50 y ~1,4 s en p95.
   Se paga en todas las consultas, incluso cuando el router responde.
2. **El catálogo cuesta ~0,3 s en p50**, con un p95 de 1,25 s en la primera
   consulta (DB + retrieval).
3. **El p95 del router (6 s) lo explican las tools de proximidad:**
   `count_near_layer` y `aggregate_near_layer` llegan al timeout de RPC de 6 s.
   Coincide con el pendiente del roadmap de optimizar `count_near_layer`.
4. **El orquestador puede superar el budget de 8 s:** el p95 observado fue
   17,5 s porque el deadline se evalúa al inicio de cada paso, no durante una
   tool o una llamada al LLM. Las tools de 6 s son el principal contribuyente.
5. **`unavailable` está apagado** en producción; si se activa, agrega una
   consulta a la BD antes del router.
6. **L2 (síntesis) costó ~2,1 s** en el único caso que pasó por el orquestador
   y llegó a la respuesta final.

## Fix de proximidad (037)

La consulta original de `count_near_layer`/`aggregate_near_layer` castea ambos
lados a `geography`:

```sql
ST_DWithin(s.geom::geography, t.geom::geography, 1000)
```

Eso impide usar los GIST existentes sobre `geom`. El plan actual muestra
`Seq Scan on hidrografia` y `Join Filter: st_dwithin(...::geography...)`.

| Consulta | Antes (muestra 50) | Después (920) | Mejora |
|---|---:|---:|---:|
| `count_near_layer` | 9.541 ms | 580 ms | ~16× |
| `aggregate_near_layer` | 9.306 ms | 759 ms | ~12× |

La extrapolación de la muestra de 50 a los 920 derechos era ~175 s, lo que
explica el timeout del SQL Editor y las consultas huérfanas.

**Fix preparado** en `db/migrations/037_proximity_geography.sql`:

- Índice GIST funcional `((geom::geography))` en las tablas objetivo de
  proximidad (`hidrografia`, glaciares, humedales, lagunas, salares,
  `agua_superficial`).
- Funciones reescritas para proyectar `geom::geography AS geog` y comparar
  contra `t.geog`, de modo que el planner use el índice.
- `statement_timeout = 5s` en las funciones `chat.*` y `public.*`.
- `AbortSignal` en el driver Supabase para que el timeout del cliente aborte
  también la request HTTP.

**Verificación post-037 (aplicado en Supabase):**

- RPC directo vía PostgREST:
  - `chat_count_near_layer`: **1.799 ms** (incluye red/PostgREST; SQL 580 ms).
  - `chat_aggregate_near_layer`: **785 ms**.
- Caso remoto `core-proximidad-derechos-rio`: **11.211 ms**, 1/1 PASS
  (antes: 19.743 ms y riesgo de timeout).
- El resto del tiempo ya no es la DB: es clasificador + LLM L1/L2 +
  orquestación + red. La consulta de proximidad dejó de ser el cuello.

### Router de proximidad y caché

El clasificador no extraía `layer_id_targets` como array; el router no
matcheaba `proximidad_conteo` y caía al orquestador. Corregido el prompt y la
normalización:

- Caso `core-proximidad-derechos-rio`: **3.763 ms**, ruta `router`,
  pipeline `proximidad_conteo`.
- Etapas del request (router hit): catálogo 371 ms, clasificador 1.504 ms,
  router/tool 1.204 ms; total servidor ~3,1 s.
- Se agregó caché de `chat_catalog` (5 min) para no consultarlo en
  `handleChat`, `buildSystemPrompt` y `buildEvidence` del mismo request.

### Prueba de concurrencia (misma pregunta, producción)

| N | 200 | p50 | p95 | Máximo |
|---:|---:|---:|---:|---:|
| 10 | 10/10 | 5.146 ms | 5.450 ms | 5.450 ms |
| 20 | 20/20 | 9.147 ms | 10.028 ms | 10.235 ms |

Sin 429 ni 503. Es una **ráfaga** de 10/20 requests simultáneos, no el régimen
con think time; el SLO de 25 usuarios con 45-60 s es menos exigente. El
clasificador (~1,5 s) y la tool de proximidad (~1,2 s) son el costo dominante.

### Fast path de proximidad

Se agregó `server/chat/classifier-fast.js`: preguntas explícitas de proximidad
sin historial se clasifican sin llamar al LLM ni consultar el catálogo. El
router recibe los slots ya normalizados.

| Escenario | N | 200 | p50 | p95 | Máximo |
|---|---:|---:|---:|---:|---:|
| Caso único (fast path) | 1 | 1/1 | 2.259 ms | 2.259 ms | 2.259 ms |
| Proximidad concurrente | 20 | 20/20 | 4.730 ms | 5.581 ms | 5.646 ms |
| Orquestador concurrente | 20 | 20/20 | 7.634 ms | 8.895 ms | 8.939 ms |
| Proximidad concurrente | 30 | 30/30 | 4.991 ms | 11.328 ms | 11.364 ms |

- La prueba de 30 coincide con el burst de IP (30); un burst mayor devuelve
  429 por diseño.
- La prueba de 20 del orquestador ejercita el semáforo LLM y la cola: 20/20
  respondieron 200, sin 503.
- El clasificador general (~1,5 s) sigue aplicando a preguntas que no matchean
  el fast path.

## Cómo reproducir

```bash
# 20 casos contra producción, con el runner midiendo extremo a extremo
CHAT_TIMING_ENABLED=1 \
  node --env-file=.env.staging scripts/run-golden-set.mjs --all --limit 20 --remote
```

Para el desglose por etapa en producción:

```bash
# Activar el flag en Vercel y desplegar; luego correr el golden set
npx vercel env add CHAT_TIMING_ENABLED production --value 1 --yes --no-sensitive
npx vercel --prod --yes

# Traer los logs y filtrar las líneas chat.timing
npx vercel logs --json --deployment <url-del-deploy> --since 30m --limit 5000 \
  | grep chat.timing
```

En local requiere credenciales de Vertex AI (ADC o service account):

```bash
CHAT_TIMING_ENABLED=1 \
  node --env-file=.env.staging scripts/run-golden-set.mjs --all --limit 20
```

El flag está apagado por defecto (`CHAT_TIMING_ENABLED=0`); no debe quedar
encendido en producción salvo durante una medición.

## Casos de la muestra

| Caso | Nivel | Status | Tiempo | Resultado |
|---|---:|---:|---:|---|
| `smoke-count-lagunas-por-comuna` | 1 | 200 | 3.553 ms | PASS |
| `smoke-list-glaciares` | 1 | 200 | 3.400 ms | PASS |
| `smoke-ubicacion-desaladoras` | 1 | 200 | 2.558 ms | PASS |
| `smoke-bloqueo-fecha` | 1 | 403 | 448 ms | PASS |
| `smoke-count-total-glaciares` | 1 | 200 | 6.703 ms | PASS |
| `smoke-count-humedales-por-comuna` | 1 | 200 | 8.416 ms | PASS |
| `smoke-count-derechos-por-provincia` | 1 | 200 | 3.426 ms | PASS |
| `smoke-list-yacimientos` | 1 | 200 | 2.700 ms | PASS |
| `smoke-list-humedales` | 1 | 200 | 8.249 ms | PASS |
| `smoke-muestra-volcanes` | 1 | 200 | 2.778 ms | PASS |
| `core-color-glaciares-tipo` | 2 | 200 | 3.486 ms | PASS |
| `core-color-derechos-tipo` | 2 | 200 | 3.435 ms | PASS |
| `core-color-humedales-clasificacion` | 2 | 200 | 7.459 ms | FAIL* |
| `core-compare-glaciares-humedales` | 2 | 200 | 15.234 ms | PASS |
| `core-compare-glaciares-derechos` | 2 | 200 | 5.426 ms | PASS |
| `core-filter-derechos-consuntivos-copiapo` | 2 | 200 | 3.404 ms | PASS |
| `core-proximidad-derechos-rio` | 2 | 200 | 19.743 ms | PASS |
| `core-ambiguedad-dame-glaciares` | 2 | 200 | 4.046 ms | PASS |
| `core-error-columna-inexistente` | 2 | 200 | 3.589 ms | PASS |
| `core-truncamiento-todos-derechos` | 2 | 200 | 3.730 ms | PASS |

\* Falla por ausencia de `geojson`/`style_hint` en la respuesta del LLM; no es
un problema de latencia. La corrida anterior del mismo conjunto pasó 20/20.
