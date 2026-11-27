# Chat — Mapa de fuentes y rutas (Sprint 18-A)

| Campo | Valor |
|---|---|
| **Sprint** | 18-A |
| **Estado** | Implementado (caso de Francia pendiente de verificar) |
| **Dependencias** | CONTRACT §6.7, ADR 025, Sprint 17 (ingesta RAG) |
| **Última revisión** | 2026-11-14 |

## 1. Objetivo

Definir, antes de implementar el retrieval, qué fuente debe usar el chat para
cada tipo de pregunta, qué evidencia debe entregar y qué casos del golden set
miden esa ruta. Sin este mapa, el RAG se conectaría sin criterio de aceptación
y el chat podría responder agregaciones con fragmentos de PDF o citar
documentos derogados.

## 2. Fuentes y contratos

| Fuente | Tipo | Qué aporta | Qué no aporta | Evidencia |
|---|---|---|---|---|
| RPC/PostGIS | `tool` | cifras, agregaciones, filtros, proximidad | contexto normativo | capa, consulta, fecha |
| Catálogo de capas | `tool` | qué existe y cómo se llama | datos | nombre de capa |
| Estaciones/ARClim | `tool` | clima observado y proyecciones | normativa | estación, variable, fecha |
| `rag.chunks` | `rag` | normativa, metodología, glosario | cálculos exactos | documento, página, sección |
| RPC + `rag.chunks` | `mixta` | dato exacto + contexto citado | — | ambas fuentes |
| `admin.unavailable_data` | `abstencion` | límite explícito | respuestas | motivo y fecha |
| `scope-filter` | `fuera_de_alcance` | rechazo claro | — | — |

## 3. Matriz pregunta → ruta

| Pregunta típica | Ruta | Fuente primaria | Respuesta esperada |
|---|---|---|---|
| ¿Cuántas lagunas hay por comuna? | `tool` | `aggregate_by_admin` | cifra + tabla/gráfico |
| ¿Dónde están las desaladoras? | `tool` | `get_layer_features` | mapa + listado |
| ¿Qué derechos están cerca del río? | `tool` | `count_near_layer` | conteo/agregación |
| ¿Cómo está el clima en Copiapó? | `tool` | estación/ARClim | serie/tabla |
| ¿Qué dice la normativa sobre cauces? | `rag` | `rag.chunks` | respuesta con cita |
| ¿Cuál es la metodología del catastro? | `rag` | `rag.chunks` | respuesta con cita |
| ¿Cuántas desaladoras hay y qué norma las regula? | `mixta` | RPC + `rag.chunks` | dato + cita |
| ¿Qué comuna concentra derechos y qué dice la ley? | `mixta` | RPC + `rag.chunks` | dato + cita |
| ¿Cuál es la producción de litio por comuna? | `abstencion` | `unavailable_data` | “no hay datos” con motivo |
| ¿Cuál es la capital de Francia? | `fuera_de_alcance` | `scope-filter` | rechazo claro |

## 4. Precedencia y abstención

1. **Datos actuales de la BD** mandan sobre una cifra citada en un documento.
2. **API oficial** (clima, ARClim) manda sobre una estimación documental.
3. **RAG** aporta contexto, normativa y metodología; no reemplaza una RPC.
4. **Conocimiento del LLM** no se usa para cifras ni para hechos del
   territorio. Si no hay evidencia, el chat se abstiene.

Si hay conflicto entre fuentes, la respuesta muestra ambas y explica cuál
tiene precedencia. Si no hay evidencia suficiente, responde que no la hay y
no completa con conocimiento general.

## 5. Contrato de evidencia

Cada respuesta debe poder declarar:

```json
{
  "sources": [
    { "type": "data", "id": "hidrografia", "as_of": "2026-11-14" },
    { "type": "document", "id": "normativa-cauces", "page": 12, "section": "Art. 5" }
  ],
  "route": "mixta",
  "abstained": false
}
```

El backend construye `sources` y `route`. El LLM no los inventa. En la fase
18-A el contrato se declara en el golden set; la implementación completa se
cierra en 18-D/18-E. El router determinístico no intercepta preguntas con
señales documentales (`metodología`, `método/sistema de riego`, `informe`,
`producción`, `rendimiento`, `infraestructura`, `evolución`, `mayor
superficie`, etc.): esas preguntas pasan al orquestador, que decide entre
tools y RAG.

## 6. Golden set por ruta

Los casos viven en `server/chat/__evals__/golden.json` y en
`admin.golden_cases`. La columna `route` permite agrupar el acierto por ruta.
Desde 18-D, los casos de catastro están activos; los de normativa, plan
regulador y leyes siguen inactivos porque todavía no existe ese corpus.

| Ruta | Casos | Estado |
|---|---|---|
| `tool` | 42 | activos |
| `abstencion` | 6 | activos |
| `fuera_de_alcance` | 3 | activos |
| `rag` | 6 | activos (catastro, producción, rendimiento e infraestructura) |
| `mixta` | 2 | activos (catastro + capa) |

Casos documentales:

| ID | Ruta | Pregunta | Estado |
|---|---|---|---|
| `doc-metodologia-catastro` | `rag` | ¿Cuál es la metodología del catastro frutícola? | activo |
| `doc-catastro-evolucion` | `rag` | ¿Cómo cambió la superficie frutícola de Atacama entre 2018 y 2024? | activo |
| `doc-especies-superficie-2024` | `rag` | ¿Qué dice el informe 2024 sobre la superficie plantada por especie? | activo |
| `doc-infraestructura-2018` | `rag` | ¿Qué infraestructura frutícola se describe en el informe 2018? | activo |
| `doc-riego-2024` | `tool` | ¿Qué método de riego predomina en el catastro 2024? | activo (capa `met_riego`) |
| `tier4-kilos-jojoba` | `rag` | ¿Cuántos kilos de jojoba se producen al año? | activo (documento) |
| `tier4-rendimiento-palto` | `rag` | ¿Cuánto rinde una hectárea de palto? | activo (documento) |
| `mix-catastro-comunas` | `mixta` | ¿En qué comunas se concentran los registros de vid de mesa y qué metodología usa el catastro? | activo |
| `mix-catastro-evolucion` | `mixta` | ¿Cuántos registros de vid de mesa hay en la capa del catastro y cómo evolucionó la superficie entre 2018 y 2024? | activo |
| `abstencion-informe-calidad-agua` | `abstencion` | ¿Qué dice el informe de calidad de agua 2025 sobre el río Copiapó? | activo |
| `abstencion-normativa-litio` | `abstencion` | ¿Qué dice la normativa sobre el uso de agua en la industria del litio? | activo |
| `abstencion-exportacion-chirimoya-2025` | `abstencion` | ¿Cuántos kilos de chirimoya se exportaron a China en 2025? | activo |
| `doc-normativa-cauces` | `rag` | ¿Qué dice la normativa sobre la protección de cauces y zonas de inundación? | inactivo (sin corpus) |
| `doc-plan-regulador-caldera` | `rag` | ¿Qué regula el plan regulador de Caldera sobre densidad y altura? | inactivo (sin corpus) |
| `mix-desaladoras-normativa` | `mixta` | ¿Cuántas plantas desaladoras hay y qué normativa regula su instalación? | inactivo (sin corpus) |
| `mix-derechos-ley` | `mixta` | ¿Qué comunas concentran más derechos de agua y qué dice la ley sobre su uso? | inactivo (sin corpus) |

En 18-G se agregaron 11 casos de tools: `compare_layers`,
`rank_multicriteria`, `spatial_overlay`, `nearest_distance`,
`get_layer_metadata`, `get_historical_series`, `get_wms_layer_info`,
`get_wms_available_dates`, `get_wms_pixel`,
`get_wms_statistics` (falla elegante) y `query_layer` con `order_by`.
El golden activo total queda en 59 casos.

## 7. Criterios de aceptación de 18-A

| # | Dado | Cuando | Entonces |
|---|---|---|---|
| CA-1 | un caso del golden | lo guardo | tiene una ruta válida (`tool`, `rag`, `mixta`, `abstencion`, `fuera_de_alcance`) |
| CA-2 | el mapa de rutas | reviso el golden | cada ruta tiene al menos un caso, activo o pendiente |
| CA-3 | un caso `rag` o `mixto` | corro el runner | no se ejecuta mientras esté inactivo |
| CA-4 | el runner | termina una corrida | muestra el resumen por ruta |
| CA-5 | el panel Chat IA | edito un caso | puedo cambiar la ruta esperada |
| CA-6 | migración 051 | la aplico dos veces | sin error |
| CA-7 | un caso inactivo | uso `--include-inactive` | se ejecuta para probarlo antes de activarlo |

## 8. Fuera de 18-A

- Implementar `search_documents` y el retrieval híbrido (18-C/18-D).
- Ingerir documentos y definir el corpus inicial (18-B).
- Evaluar citas, fidelidad y abstención documental (18-E).
- Cambiar el enrutamiento en runtime: el clasificador ya existe; 18-A solo
  define las rutas y los casos.

## 9. Próximos pasos

1. **17-E/18-B:** cargar normativa, planes reguladores y leyes para activar
   los cuatro casos inactivos.
2. **18-E:** medir fidelidad de respuesta y latencia con el corpus ampliado;
   evaluar reranking si Recall@5 baja de 0,8.
3. **Mantenimiento:** revisar el umbral 0,62 y el top-5 cuando crezca el
   corpus o cambie el modelo de embeddings.
