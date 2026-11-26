# Spec 30 — Aceptación y carga

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 30 |
| **Estado de la spec** | EN EJECUCIÓN (gate 08 y carga 25/50 local ✅; VPS y E2E pendientes) |
| **Tamaño** | Grande |
| **Duración estimada** | 16 h |
| **Dependencias** | 26 (stack), 27 (CI), 08 (tiles) |
| **Última revisión** | 2026-11-13 |

## 1. Objetivo

Tener pruebas repetibles de aceptación funcional y de carga para el visor y la
API, con umbrales medibles. El gate funcional del Sprint 08 ya existe
(`npm run acceptance:08`); este tramo agrega la carga 25/50 usuarios y documenta
el comportamiento de tiles estáticos, tabla y on-demand.

## 2. Alcance

**Dentro**
- `scripts/acceptance-sprint08.mjs` (13 checks funcionales).
- `scripts/load-test-sprint30.mjs` con escenarios static/table/filtered/
  on-demand/on-demand-cold/mixed.
- Medición local a 25 y 50 conexiones, percentiles p50/p95/p99, RPS, HTTP y
  errores.
- Optimizaciones necesarias para cumplir umbrales (serialización de propiedades
  y caché corta de tabla).
- Documentación de resultados y límites.

**Fuera**
- Prueba en el VPS real (requiere 26-F/H).
- k6/Artillery (el runner Node es suficiente y portable).
- E2E de navegador (Playwright) y accesibilidad de marcadores/canvas.
- Pruebas de chat/LLM bajo carga (dependen del proveedor).
- Chaos/failover.

## 3. Escenarios y umbrales

| Escenario | Qué mide | Umbral |
|---|---|---|
| `static` | tile MVT pregenerado por Nginx | p95 < 100 ms, 0 5xx |
| `table` | `/api/layer-features?limit=100` (cache 10 s) | p95 < 500 ms, 0 5xx |
| `filtered` | tabla con filtro `ZONA_1=ZP` | p95 < 500 ms |
| `mixed` | 50% static + 30% table + 20% filtered | p95 < 500 ms, 0 5xx |
| `on-demand` | tile on-demand cacheado | p95 < 1000 ms |
| `on-demand-cold` | on-demand con cache-buster (pega a PostGIS) | informativo |

Los 25/50 usuarios se simulan con conexiones concurrentes; el on-demand se
prueba aparte con `--think-time 500` porque Nginx limita **20 r/s por IP** y el
test completo sale desde `127.0.0.1`.

## 4. Comandos

```bash
# Funcional
npm run acceptance:08

# Carga 25 y 50 usuarios (static/table/mixed)
npm run load:30 -- --concurrency 25,50 --duration 15

# On-demand cacheado y frío con ritmo de usuario
npm run load:30 -- \
  --scenarios on-demand,on-demand-cold \
  --concurrency 5,10 --duration 10 --think-time 500
```

`npm run load:30` equivale a `node scripts/load-test-sprint30.mjs`.

## 5. Resultados locales (2026-11-13)

Stack local: PostgreSQL 17.11/PostGIS, API Node, Nginx; 16 GB RAM, sin límites
de CPU por contenedor.

| Escenario | Concurrencia | RPS | p50 | p95 | p99 | HTTP |
|---|---:|---:|---:|---:|---:|---|
| static | 25 | 1.368 | 16 ms | 31 ms | 44 ms | 200 |
| static | 50 | 1.446 | 32 ms | 55 ms | 75 ms | 200 |
| table | 25 | 894 | 24 ms | 51 ms | 78 ms | 200 |
| table | 50 | 896 | 51 ms | 94 ms | 131 ms | 200 |
| mixed | 25 | 1.051 | 20 ms | 41 ms | 72 ms | 200 |
| mixed | 50 | 1.294 | 36 ms | 61 ms | 81 ms | 200 |
| on-demand (cache) | 5 | 9,9 | 2 ms | 7 ms | 16 ms | 200 |
| on-demand (cache) | 10 | 19,8 | 2 ms | 10 ms | 17 ms | 200 |
| on-demand cold | 5 | 8,4 | 68 ms | 248 ms | 346 ms | 200 |
| on-demand cold | 10 | 16,2 | 84 ms | 200 ms | 483 ms | 200 |

- **0 errores 5xx / red** en todos los escenarios.
- `ab -n 2000 -c 50` sobre un tile estático: **6.502 req/s**, 7,7 ms (el runner
  Node es más conservador por el cliente).
- Sin `--think-time`, el on-demand devuelve 429 por el límite por IP; es el
  comportamiento esperado del rate limit, no un fallo del servidor.

### Hallazgos y fixes

1. **Tabla lenta al inicio:** el handler construía `to_jsonb(t) - geom`, que
   serializa la geometría y luego la descarta. Se reemplazó por
   `jsonb_build_object` solo con columnas no-geométricas. La tabla pasó de
   ~44 rps/p95 987 ms (25 c) a ~64 rps/p95 <500 ms antes de cachear.
2. **Caché corta de tabla:** Nginx cachea `/api/layer-features` 10 s por URL
   (incluye filtro, búsqueda, orden y `Origin`). Con cache: 894 rps y p95 94 ms
   a 50 conexiones. La API mantiene `no-store`; Nginx lo ignora solo en esta
   ruta de solo lectura.
3. **On-demand frío:** 200-248 ms p95 con `ST_AsMVT` por tile; el cacheado baja
   a 7-10 ms. Es el costo esperado para valores dinámicos.

## 6. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | gate 08 | se ejecuta | 13/13 PASS | `npm run acceptance:08` |
| CA-2 | 25 usuarios | static/table/mixed | p95 static <100 ms, table <500 ms; 0 5xx | load:30 |
| CA-3 | 50 usuarios | static/table/mixed | igual que CA-2 | load:30 |
| CA-4 | on-demand cacheado | 5/10 usuarios con think time | p95 <1000 ms | load:30 |
| CA-5 | on-demand cold | 5/10 | mide p95/p99 y no hay 5xx | load:30 |
| CA-6 | tabla cacheada | se repite la misma URL | `X-Cache-Status: HIT` en <10 s | curl/Network |
| CA-7 | API caída | se pide tabla | el visor cae a GeoJSON | manual |
| CA-8 | VPS 4/8 | 25/50 usuarios | mismos umbrales o upgrade | pendiente 26-F |

## 7. Riesgos y pendientes

- **Caché de tabla 10 s:** una edición/ingesta puede verse hasta 10 s después.
  Aceptable para lectura; si no, invalidar por versión/ETag.
- **Rate limit por IP:** usuarios detrás de un NAT compartido podrían recibir
  429 en on-demand; monitorear y ajustar la zona `tiles`.
- **Cliente de carga en la misma máquina:** compite por CPU; los números del
  VPS pueden ser distintos (mejores o peores). Repetir en 26-F.
- **Pendiente:** E2E de navegador, accesibilidad de marcadores/canvas, carga del
  chat/LLM y prueba de 8/16 vCPU.

## 8. Reversión

El test no modifica datos. Para revertir las optimizaciones: quitar la location
de cache de `/api/layer-features` y volver a `to_jsonb(t) - geom` (no
recomendado). El gate y el runner son scripts independientes.

## 9. Cierre

- Horas reales: 3.
- 8/8 escenarios de carga dentro de umbral; gate 13/13.
- Lecciones: el costo de serializar geometría en la tabla era el cuello; el
  cache corto de Nginx es suficiente para 50 usuarios en este corpus.


## 8. Aceptación en el VPS (2026-11-26)

### Funcional

`node scripts/acceptance-vps.mjs --base https://visor.atacamawoll.cl --with-chat`
→ **14/14 PASS**:

- `/` portada Geodatos, `/visor`, `/chat`, `/chat/` y `/visor/` con 301,
  `/api/config`, `/healthz`, `/admin.html`, sesión admin 401, feedback admin
  401, GeoJSON `geo+json` con gzip, assets, feedback inválido 400 y chat real
  con `response_id`.

### Carga

Ejecutada **desde el VPS** (loopback a Nginx) para no medir el enlace del
equipo de desarrollo:

| Escenario | Concurrencia | RPS | p50 | p95 | p99 | HTTP |
|---|---:|---:|---:|---:|---:|---|
| table | 25 | 2.039 | 12 ms | 20 ms | 26 ms | 200 |
| table | 50 | 1.953 | 24 ms | 31 ms | 52 ms | 200 |
| filtered | 25 | 4.017 | 6 ms | 8 ms | 12 ms | 200 |
| filtered | 50 | 4.109 | 13 ms | 15 ms | 22 ms | 200 |

- 4/4 dentro de umbral, 0 errores.
- Una corrida desde el PC contra el dominio dio p95 de 10-36 s por el enlace
  de subida (4,7 MB en 34 respuestas); no representa al servidor.
- `static` y `mixed` no se pueden medir todavía: los MVT no están generados
  en el VPS (`/tiles/.../manifest.json` → 404). El visor cae a GeoJSON.

### Navegador

- `/chat` validado en Chromium: sin errores de JS; consulta de humedales abre
  el mapa a la izquierda (1 capa, 500), chat a la derecha y leyenda.
- Errores de consola esperados: manifiestos de tiles 404 mientras no se
  generen los MVT.
