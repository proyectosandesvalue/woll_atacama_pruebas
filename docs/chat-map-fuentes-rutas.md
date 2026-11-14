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
cierra en 18-D/18-E.

## 6. Golden set por ruta

Los casos viven en `server/chat/__evals__/golden.json` y en
`admin.golden_cases`. La columna `route` permite agrupar el acierto por ruta.
Los casos nuevos de RAG y mixtos quedan **inactivos** hasta que exista
`search_documents` (18-D); así no rompen el baseline actual.

| Ruta | Casos existentes | Casos nuevos | Estado |
|---|---|---|---|
| `tool` | 30 | — | activos |
| `abstencion` | 5 | 2 | activos + 2 pendientes |
| `fuera_de_alcance` | 3 | 1 | activos + 1 pendiente |
| `rag` | — | 3 | pendientes (18-D) |
| `mixta` | — | 2 | pendientes (18-D) |

Casos nuevos:

| ID | Ruta | Pregunta | Se activa |
|---|---|---|---|
| `doc-normativa-cauces` | `rag` | ¿Qué dice la normativa sobre la protección de cauces y zonas de inundación? | 18-D |
| `doc-metodologia-catastro` | `rag` | ¿Cuál es la metodología del catastro frutícola? | 18-D |
| `doc-plan-regulador-caldera` | `rag` | ¿Qué regula el plan regulador de Caldera sobre densidad y altura? | 18-D |
| `mix-desaladoras-normativa` | `mixta` | ¿Cuántas plantas desaladoras hay y qué normativa regula su instalación? | 18-D |
| `mix-derechos-ley` | `mixta` | ¿Qué comunas concentran más derechos de agua y qué dice la ley sobre su uso? | 18-D |
| `abstencion-informe-calidad-agua` | `abstencion` | ¿Qué dice el informe de calidad de agua 2025 sobre el río Copiapó? | 18-D |
| `abstencion-normativa-litio` | `abstencion` | ¿Qué dice la normativa sobre el uso de agua en la industria del litio? | 18-D |
| `fuera-alcance-capital-francia` | `fuera_de_alcance` | ¿Cuál es la capital de Francia? | 18-A (pendiente de verificar) |

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

1. **18-B:** corpus curado, metadata de vigencia y chunking por estructura.
2. **18-C:** retrieval híbrido (pgvector + `tsv`), filtros y reranking.
3. **18-D:** tool `search_documents`, citas y enrutamiento mixto.
4. **18-E:** evaluación de retrieval y respuesta, UX de fuentes y latencia.
