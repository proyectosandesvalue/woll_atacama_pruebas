# Spec 18-G — Cierre de integración de las 24 tools

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 18-G (continuación de 18) |
| **Estado de la spec** | CERRADA |
| **Tamaño** | Mediano |
| **Duración estimada** | 6-8 h |
| **Dependencias** | 18-D/18-F, expansión de tools 24, migraciones 067-073 |
| **Última revisión** | 2026-11-27 |

## 1. Objetivo y contexto

El chat pasó de 14 a 24 tools: análisis multi-capa, rankings, overlay,
distancias, metadatos, series históricas y WMS/Copernicus. La expansión está
en código y tests unitarios, pero faltan tres cosas para considerarla cerrada:

1. **Evidencia**: `buildEvidence()` solo extraía `args.layer_id`; las tools
   multi-capa (`layer_ids`, `criteria`, `layer_id_source/targets`) y las
   series históricas no generaban citas.
2. **Compactación**: `get_historical_series` puede devolver 5.000 puntos y
   `compare_layers`/`rank_multicriteria`/`get_wms_available_dates` pueden
   inflar el prompt.
3. **Golden set**: los 48 casos activos no cubren las tools nuevas; no hay
   regresión end-to-end ni casos de falla.

## 2. Alcance

**Dentro**
- Extraer citas de capas desde todas las tools multi-capa.
- Agregar cita `climate` para `get_historical_series` y mostrarla en el chat.
- Compactar series, comparaciones, rankings y fechas WMS antes del LLM.
- Golden set con casos para las tools nuevas y para el ordenamiento de
  `query_layer` (migración 067).
- Casos de falla elegante: WMS sin credenciales, capa inexistente, timeout.
- Validación en VPS, migraciones 067-073, golden completo y docs.

**Fuera**
- Cambiar la lógica de negocio de las tools o sus RPCs.
- 37-D (`sup_frutal`/`superf_fru` a numérico).
- Nuevo corpus RAG o cambios de retrieval.
- Reranking o nuevas fuentes.

## 3. Reglas del CONTRACT que aplican

| Regla | Implicancia |
|---|---|
| §6.2 (tools de solo lectura) | Las tools nuevas leen; no escriben. |
| §6.7 (evidencia) | Toda tool que use una fuente debe dejar cita; el LLM no la inventa. |
| §6.7 (abstención) | Si una tool falla, el chat lo declara y no inventa. |
| §9.1 (tests) | Citas, compactación, golden y fallas con `node:test`. |
| INV-5 | Sin BD/servicio externo, el chat degrada y sigue. |

## 4. Contrato de datos / API

### 4.1. Citas

`buildEvidence()` extrae layer_ids de:

- `args.layer_id`
- `args.layer_ids` (compare_layers)
- `args.layer_id_source` + `args.layer_id_targets` (overlay, nearest)
- `args.criteria[].layer_id` (rank_multicriteria)

Para `get_historical_series` agrega:

```json
{
  "type": "climate",
  "station": "03414002",
  "indicator": "temp_media_diaria",
  "tool": "get_historical_series",
  "label": "Estación 03414002"
}
```

El frontend muestra `layer`, `climate` y `document` en el bloque **Fuentes**.

### 4.2. Compactación

| Tool | Salida | Límite al LLM |
|---|---|---|
| `get_historical_series` | 5.000 puntos | últimos 40 + stats |
| `compare_layers` | 2-4 capas × grupos | 40 filas por capa |
| `rank_multicriteria` | ranking + contribuciones | top 20; contribuciones solo top 5 |
| `get_wms_available_dates` | hasta 100 fechas | 30 + total |

### 4.3. Golden

Casos nuevos (nivel 2-3):

- `tool-compare-layers`
- `tool-rank-multicriteria`
- `tool-spatial-overlay`
- `tool-nearest-distance`
- `tool-layer-metadata`
- `tool-historical-series`
- `tool-wms-layer-info`
- `tool-wms-available-dates`
- `tool-wms-statistics-failure` (sin credenciales)
- `tool-query-order` (top-N con `order_by`)

## 5. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | `TOOL_DEFINITIONS` | se carga | hay 24 tools y `search_documents` | test |
| CA-2 | una tool multi-capa | se ejecuta | `citations` incluye todas las capas usadas | test |
| CA-3 | una serie de 5.000 puntos | se compacta | el LLM recibe ≤ 40 puntos + stats | test |
| CA-4 | compare/rank/WMS dates | se compactan | no superan los límites de la tabla | test |
| CA-5 | las tools nuevas | corren golden | tienen al menos un caso activo | runner |
| CA-6 | WMS statistics sin credenciales | se consulta | el chat declara la falla sin inventar | golden |
| CA-7 | el golden completo | se ejecuta | 48 casos previos + nuevos pasan | `eval:chat` |
| CA-8 | lint y tests | se ejecutan | 0 errores y 0 fallos | `npm test && npm run lint` |
| CA-9 | docs | se revisan | 24 tools y citas actualizadas | manual |

## 6. Plan por sub-sprint

| Tramo | Contenido | Horas | Estado |
|---|---|---|---|
| 18-G.1 | Citas multi-capa + climate + compactación + tests | 2 | ✅ |
| 18-G.2 | Golden de tools nuevas + query order | 2 | ✅ |
| 18-G.3 | Fallas WMS/capa inexistente y timeouts | 1 | ✅ |
| 18-G.4 | VPS, migraciones 067-073, golden completo y docs | 2 | ✅ |

## 7. Tests requeridos

- `server/chat/__tests__/evidence.test.js`: citas multi-capa, climate y
  compactación.
- `server/chat/tools/__tests__/`: tests existentes de las tools nuevas.
- Golden local en VPS con flags de router/unavailable.
- `eval:rag` para confirmar que el bloque documental no baja.

## 8. Seguridad y procedencia

- WMS/Copernicus usa el proxy server-side; no se exponen credenciales.
- Las tools no escriben en la BD.
- Si falta un servicio externo, se devuelve error controlado; el chat lo
  declara.
- No se registra contenido de documentos.

## 9. Preguntas abiertas

| # | Pregunta | Default | ¿Bloquea? |
|---|---|---|---|
| R1 | ¿El VPS tiene `COPERNICUS_CLIENT_ID/SECRET`? | No; `get_wms_statistics` falla elegante. | no |
| R2 | ¿El proxy Copernicus responde WFS/WMS? | `INSTANCE_ID`/`CLIENT_SECRET` están configurados. | no |
| R3 | ¿Se agrega cita `climate` a las tools de clima existentes? | Solo a `get_historical_series` en esta spec. | no |

## 10. Riesgos, reversión y documentación

- **Riesgo:** WMS externo lento o sin red; timeouts 12-25 s y falla declarada.
- **Riesgo:** series grandes; la compactación evita el blow-up del prompt.
- **Reversión:** las citas y compactación son aditivas; las tools no cambian
  su contrato de negocio.
- **Docs:** esta spec, ROADMAP, CHANGELOG, ARCHITECTURE, DEV_GUIDE y AGENTS.

## 11. Puntos de integración

- `server/chat/evidence.js`, `js/ui/chatUI.js`.
- `server/chat/tools/*` y `_helpers.js`.
- `server/chat/__evals__/golden.json`.
- Migraciones 067-073 y `server/db/rpc-signatures.js`.
- `server/copernicus/`, `server/chat/wms-catalog.js`.

## 12. Cierre

- **Horas reales:** ~7 h (estimado 6-8 h).
- **Resultados:**
  - `buildEvidence()` cita todas las capas de `compare_layers`,
    `rank_multicriteria`, `spatial_overlay` y `nearest_distance`, y agrega
    cita `climate` para `get_historical_series`.
  - `compact()` limita series a 40 puntos, comparaciones a 40 filas por capa,
    rankings a top 20 y fechas WMS a 30; `query_layer` trunca textos largos.
  - Golden: **59/59** activos (tool 42/42, RAG 6/6, mixta 2/2, abstención
    6/6, fuera 3/3). Rutas nuevas: compare, rank, overlay, nearest,
    metadata, series, WMS info/dates/pixel/statistics-failure y query order.
  - Latencia del golden: p50 3,3 s, p95 8,8 s (incluye WMS y geoprocesos).
  - `npm test`: 719 tests, 707 pasan, 12 omitidos, 0 fallan.
- **Desvíos:**
  - Las RPC `chat_spatial_overlay` y `chat_nearest_distance` fallaban con
    `SET is not allowed in a non-volatile function`; la migración 074 las
    recrea sin `SET statement_timeout`.
  - El `order_by` devolvía nulos primero; la migración 075 agrega
    `NULLS LAST`.
  - `spatial_overlay` con `within`/`intersects` sobre los 863 glaciares
    agota el timeout de 5 s del pool; el caso golden usa `area` sobre
    salares. Queda como optimización pendiente.
  - `get_wms_statistics` falla elegante porque el VPS no tiene
    `COPERNICUS_CLIENT_ID/SECRET`; el caso golden lo verifica.
- **Lecciones:** una tool nueva no está cerrada hasta que cita su fuente,
  compacta su salida y tiene un caso de falla; el router debe dejar pasar
  comparaciones, overlay, distancias y WMS al orquestador.
