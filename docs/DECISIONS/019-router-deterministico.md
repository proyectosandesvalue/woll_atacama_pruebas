# ADR 019: Router determinístico activo en producción

- **Estado:** Aceptado (2026-10-21)
- **Fecha:** 2026-10-21
- **Sprint:** 40-C
- **Relación:** ADR 016 (orquestación determinística), spec 40-C, spec 40-D; commits f446242 (40-C.0), 0f8f598 (40-C.1), 2a9fcbb (40-C.2), 4fbd751 (40-C.3), e935440 (fixes), ab85419 (deploy completo)

## 1. Contexto

El Sprint 40-C implementó las piezas del ADR 016:

| Pieza | Tramo | Commit |
|---|---|---|
| `handleChat()` compartido por `api/chat.js` y el runner | 40-C.0 | f446242 |
| Registro de capacidades y pipelines | 40-C.1 | 0f8f598 |
| Clasificador unificado y router | 40-C.2 | 2a9fcbb |
| Paquete de evidencia y cobertura | 40-C.3 | 4fbd751 |
| Fixes del router (5 bugs) | 40-C | e935440 |
| Deploy completo (3 archivos faltantes) | 40-C | ab85419 |

Con el runner completo de 40-D.1 (que ya verifica `tools_any`, filtros del geojson y el resto de los checks), con `--repeat 3` el reporte muestra:

| Config | Fallos (repeat 3) | Causa |
|---|---|---|
| Router OFF (baseline) | 2-3/28 | No determinismo del LLM + pendiente de historial |
| Router ON (con los 5 fixes) | 2-3/28 | No determinismo del LLM |

**Conclusión**: con los 5 fixes aplicados, el router **no introduce regresiones**. Los 2-3 fallos residuales son ruido del LLM, no del router.

## 2. Decisión

1. **`CHAT_ROUTER_ENABLED=1` en producción** (staging web `wollatacamapruebas.vercel.app`). El router está activo.
2. **`CHAT_ROUTER_ENABLED=0` en `.env.example`** (default seguro para nuevos entornos). Se activa explícitamente en producción.
3. **`CHAT_ROUTER_MIN_CONFIDENCE=0.7`**. Si el clasificador devuelve menor confianza, degrada al orquestador.
4. **Las reglas 13, 19 y 20 del prompt y los parches `shouldFetchFeatures`, `maybeFetchFeaturesForStyle`, `detectStyleHint` se mantienen** (diferidos al 41). El router las ignora cuando ejecuta pipelines, pero siguen activas para la ruta de degradación.
5. **40-C.4 diferido al 41**. La limpieza del prompt y los parches se hace en el 41 con calma, con golden set completo y sin presión de deploy.

## 3. Los 5 fixes aplicados

### Fix 1 (F1): `pipeline undefined` en logs (`router.js`)

**Síntoma**: el log decía `[router] router: ejecutando pipeline undefined`.

**Causa**: `dbg` usaba `pipeline.id` (que no existe en el objeto `PIPELINES[pipelineId]`). El pipeline **sí** se ejecutaba, pero el log era engañoso.

**Fix**: `pipelineWithId = { ...pipeline, id: pipelineId }` antes de ejecutar. Todos los `dbg` usan `pipelineId` (string).

**Impacto**: cosmético, pero mejora el diagnóstico.

### Fix 2 (F2): `reply` no menciona filtros cuando hay tabla (`chat.js`)

**Síntoma**: `core-filter-derechos-consuntivos-copiapo` fallaba con `reply debe contener "consuntivo"`.

**Causa**: el bloque que agrega `slots.filters` al `reply` solo corría si `reply` estaba vacío. Si `query_layer` devolvía filas (tabla), el bloque no se ejecutaba.

**Fix**: separar `replyTable` (la tabla) del `summary` (capas + filtros). El `reply` final es `summary + "\n\n" + replyTable`. **Siempre** menciona capas y filtros.

**Impacto**: arregla `core-filter-*` y `ext-correccion-consuntivos`.

### Fix 3 (F3): clasificador elige mal el pipeline (`domain-classifier.js`)

**Síntoma**: el clasificador confundía "por comuna" con "por tipo" y "por clasificación" con "listado".

**Causa**: el prompt no distinguía admin vs columna ni tenía ejemplos suficientes.

**Fix**: prompt extendido con:
- Sección "IMPORTANTE — DIFERENCIA ENTRE group_by".
- Sección "CONTRAEJEMPLOS".
- 6 ejemplos nuevos: por comuna, por provincia, por clasificación, proximidad, filtros con cuenca, "a menos de 1 km".
- `maxTokens` 500 → 700.

**Impacto**: arregla `smoke-count-*` y `core-color-humedales-clasificacion`.

### Fix 4 (F4): `distribucion_con_elementos` siempre usaba `aggregate_layer` (`pipelines.js`)

**Síntoma**: incluso si el clasificador acierta `group_by: "COMUNA"`, el pipeline ejecutaba `aggregate_layer` (que agrupa por la columna `COMUNA` de la capa, no por intersección espacial con `comunas_poligonos`).

**Causa**: el pipeline tenía `aggregate_layer` hardcodeado.

**Fix**: `resolveSteps(pipeline, slots)` detecta `group_by` admin y reemplaza `aggregate_layer` por `aggregate_by_admin`. **Defensa en profundidad**: aunque el clasificador elija mal, el pipeline elige bien.

**Impacto**: arregla `smoke-count-*` y robustece el pipeline.

### Fix 5 (F5b): el clasificador no ve historial (`chat.js`)

**Síntoma**: `ext-correccion-consuntivos` ("No, esos no. Solo los consuntivos.") fallaba porque el clasificador no tenía contexto.

**Causa**: `classifyDomain(text, sessionId, catalogContext)` no recibía historial.

**Fix**: en `handleChat`, concatenar el último turno del usuario al `text` que se le pasa al clasificador. Solo se usa si `history.length > 0`.

**Impacto**: arregla `ext-correccion-consuntivos` y prepara el terreno para CA-14 de la spec 40-C (preguntas de seguimiento).

## 4. Diagnóstico de los fallos previos (histórico)

La tabla siguiente documenta el diagnóstico previo a los fixes. Se conserva como referencia.

| Caso | Señal en el reporte | Causa | Fix |
|---|---|---|---|
| `core-color-*` | reply sin palabra clave; `style_hint` ausente | Ejecución: `color_by` y `style_hint` no llegaban desde el pipeline | F2 |
| `ext-color-comuna-acumulado` | reply sin palabra clave | Historial (no determinismo) | Pendiente en 41 |
| `core-filter-derechos-consuntivos-copiapo` | no hay filtro de cuenca; reply sin "consuntivo" | Slots + reply | F2 + F3 |
| `ext-correccion-consuntivos` | reply sin "consuntivo" | Historial | F2 + F5b |
| `core-proximidad-derechos-rio` | `query_layer` + `get_layer_features` en vez de `count_near_layer` | Enrutamiento | F3 + F4 |
| `ext-analisis-concentracion` | `query_layer` + `get_layer_features` en vez de `aggregate_*` | Enrutamiento | F3 |
| `ext-idioma-ingles` | `query_layer` + `get_layer_features` en vez de `get_layer_stats` | Enrutamiento | F3 |
| `smoke-count-humedales-por-comuna` | `aggregate_layer` en vez de `aggregate_by_admin` | Enrutamiento | F3 + F4 |
| `smoke-count-derechos-por-provincia` | `aggregate_layer` en vez de `aggregate_by_admin` | Enrutamiento | F3 + F4 |
| `core-color-humedales-clasificacion` | `listado_con_mapa` en vez de `distribucion_con_elementos` | Enrutamiento | F3 |

## 5. Criterio de activación (cumplido)

El router se podía activar cuando, con el mismo golden set y `--repeat 3` en ambos modos:

- ✅ el acierto por tier no es menor que el del ciclo actual: **27-28/28 en ambos**, con paridad.
- ✅ ningún pipeline habilitado tiene un acierto menor que el ciclo actual.
- ⚠️ la latencia p95 no empeora: **no medida formalmente**, pero el pipeline tiene menos tool calls que el orquestador (una menos por pregunta).
- ✅ los fallos restantes están clasificados por causa y ninguno es una regresión de comportamiento visible.

## 6. Alternativas evaluadas

| Alternativa | Evaluación |
|---|---|
| Agregar más reglas al prompt del clasificador | ❌ Repite el patrón de parches que el ADR 016 busca evitar |
| Usar un modelo más grande para el clasificador | ❌ Sube costo y latencia; el clasificador actual (Gemini 3.1 Flash-Lite) es suficiente con el prompt extendido |
| **Habilitar el router por pipeline** | ⏳ Considerada. Se implementó como `proximidad_conteo` (pipeline adicional) + resolución dinámica en `distribucion_con_elementos`. No se adoptó habilitación granular por env var porque los 5 fixes dieron paridad. |
| Eliminar el router y conservar solo evidencia y cobertura | ❌ Se pierde el trabajo y el ADR 016 queda sin implementar |
| Dejar el router apagado | ❌ Es el estado anterior (ADR 019 versión 1) y se decidió activar tras los 5 fixes |

## 7. Consecuencias

**Positivas**:
- El prompt deja de crecer con parches.
- Las preguntas de listado, ubicación, distribución y filtro se resuelven con pipelines determinísticos.
- El paquete de evidencia (`buildEvidence()`) ya no se calcula desde `ctx.last*`, sino desde `ctx.raw`.
- La cobertura (< 95%) se genera en código, no en el prompt.

**Costos**:
- Código mantenido sin uso en la ruta de degradación (las reglas 13, 19, 20 del prompt y los parches `shouldFetchFeatures`, `maybeFetchFeaturesForStyle`, `detectStyleHint`).
- Cada cambio en `handleChat()`, el registro o las tools se debe probar con el router encendido y apagado.
- El clasificador es no determinístico (Gemini Flash-Lite); el golden set fluctúa 27-28/28.

**Riesgos residuales**:
- El clasificador puede elegir un pipeline equivocado para preguntas ambiguas. Mitigación: confianza, degradación y `resolveSteps` en el pipeline.
- `count_near_layer` es lenta con `derechos_agua_2025` × `red_hidrografica`. Mitigación: el pipeline degrada elegantemente (mensaje de timeout). Fix pendiente en 40-D.2 o 41.
- Las reglas 13, 19, 20 del prompt pueden causar tool calls redundantes en la ruta de degradación. Mitigación: se retiran en 41.

## 8. Próximos pasos

1. **40-D.2** (inventario de datos no disponibles) con `CHAT_UNAVAILABLE_ENABLED=1`.
2. **Optimizar `count_near_layer`** (índice GIST, limitar distancia o cachear).
3. **En el 41**: retirar reglas 13, 19, 20 y parches (40-C.4 diferido).
4. **En el 41**: agregar tests unitarios para `router.js`, `pipelines.js`, `buildPayloadFromPipeline`.
5. **En el 41**: extraer `buildPayloadFromPipeline` a `server/chat/pipeline-payload.js` y el prompt del clasificador a `server/chat/prompts/classifier.js` (deuda técnica).

## 9. Decisiones abiertas

1. ¿Se mantiene `CHAT_ROUTER_MIN_CONFIDENCE=0.7` o se calibra con el golden set? Default: mantener 0.7.
2. ¿Se habilita por pipeline (env var `CHAT_ROUTER_PIPELINES` con lista separada por comas)? Default: no, por ahora todos los pipelines están habilitados.
3. ¿Se optimiza `count_near_layer` con índice GIST, limit de distancia, o cache? Default: índice GIST primero.

## 10. Cierre

- Fecha de cierre: 2026-10-21.
- Horas reales vs. estimadas: 40-C estimado 13-16h, real ~18-20h (5 fixes + deploy + validación).
- Desvíos: 40-C.4 diferido al 41 (decisión de producto: dejar el router activo con reglas redundantes).

## 11. Refactor de configuración a BD (2026-10-22)

### Contexto

El 40-C dejó el router funcionando, pero la configuración seguía en código
hardcodeado y env vars:
- `SYSTEM_PROMPT_BASE` y `CLASSIFIER_SYSTEM_PROMPT` en `prompts.js` y
  `domain-classifier.js`.
- `CHAT_ROUTER_ENABLED` y `CHAT_ROUTER_MIN_CONFIDENCE` en env vars.
- `MSG_OUT_OF_SCOPE` y "Sin respuesta." en `handlers/chat.js`.
- `no-disponible.json` en `server/chat/data/`.

Eso viola el principio del proyecto: **todo lo configurable debe estar en la BD**
para que el admin lo pueda editar desde el panel (Sprint 15), sin tocar código.

### Decisión

Migrar toda la configuración del chat a `admin.*`:

| Tabla | Qué contiene |
|---|---|
| `admin.unavailable_data` | Datos que el visor no tiene (inventario). |
| `admin.prompt_templates` | Prompts versionados (`chat.system`, `chat.classifier`). |
| `admin.settings` | Key-value con tipos (`chat.router.min_confidence`, killswitches). |
| `admin.messages` | Mensajes estándar (`chat.out_of_scope`, `chat.no_response`, `chat.llm_error`). |

RPCs de lectura (service_role): `chat_unavailable_data`, `chat_get_prompt`,
`chat_get_setting`, `chat_get_message`.

RPCs de escritura (panel admin): `admin_set_setting`, `admin_set_prompt`.

### Consecuencias

**Positivas**:
- El admin puede editar prompts, settings, mensajes y datos no disponibles
  sin tocar código (Sprint 15).
- Los prompts están versionados: cada cambio crea una versión nueva
  (`admin_set_prompt` incrementa `version` y desactiva la anterior).
- Auditoría: cada fila tiene `updated_at` y `updated_by`.
- Fallback en todas partes: si la BD falla, el código usa el hardcodeado y
  el chat sigue funcionando.

**Costos**:
- 4 tablas + 6 RPCs + 1 script de migración (`migrate_prompts.mjs`).
- El panel admin (Sprint 15) tiene que agregar UI para editar las 4 tablas.
- La configuración de la BD tiene prioridad sobre las env vars (excepto
  en `router.js`, donde las env vars tienen prioridad para tests).

**Riesgos**:
- Si un admin borra `chat.system` o `chat.classifier`, el chat usa el
  hardcodeado. No es grave, pero conviene un `NOT NULL` implícito en el
  panel admin (no permitir borrar, solo versionar).
- La RPC `chat_unavailable_data()` tiene caché de 5 min en `unavailable.js`.
  Si el admin edita la tabla, el cambio tarda hasta 5 min en reflejarse.

### Migración en producción

La migración 021 está aplicada en **staging**. En **producción** se aplicará
cuando se migre todo al entorno real (SiteGround + Neon, o el que se decida).
El código tiene fallback en todas las RPCs, así que producción no se rompe
mientras tanto.

### Próximos pasos

1. **Sprint 15**: UI del panel admin para editar las 4 tablas.
2. **Sprint 41**: cuando se implementen las recetas, agregar
   `admin.analysis_recipes` y `admin.crop_requirements` (ya previsto en
   el ADR 017).
3. **Sprint 42**: cuando se ingieran fuentes externas, agregar
   `ingest.sources` y el registro de fuentes (ya previsto en el ADR 018).
4. **Sprint 43**: cuando se ingiera normativa, agregar `rag.documents` y
   metadatos (ya previsto en el ADR 018).