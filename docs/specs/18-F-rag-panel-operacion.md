# Spec 18-F — Operación RAG desde el panel

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 18-F (continuación de 18) |
| **Estado de la spec** | CERRADA |
| **Tamaño** | Mediano |
| **Duración estimada** | 6-8 h |
| **Dependencias** | 18-D (tool y citas), 45-A (panel RAG), 48 (settings/prompts) |
| **Última revisión** | 2026-11-27 |

## 1. Objetivo y contexto

El RAG ya responde y cita, pero el panel no controla todo su comportamiento:
`chat.documents.min_score` y `top_k` se ven en la UI pero no los lee la tool;
`chat.documents.enabled=false` quita las reglas del prompt pero no la tool; y
“Quitar” en RAG solo borra el manifiesto, no la versión indexada. Esta spec
convierte el panel en el plano de control real del RAG, sin tocar el corpus,
el chunker ni el SQL de retrieval.

## 2. Alcance

**Dentro**
- Cablear `chat.documents.enabled`, `chat.documents.min_score` y
  `chat.documents.top_k` en la tool y en el orquestador.
- Killswitch real: si RAG está desactivado, `search_documents` no se envía al
  LLM y la tool se defiende si se invoca igual.
- Acción **Despublicar** para marcar la versión `ready` como `superseded`,
  borrar sus chunks y sacarla del retrieval, conservando el documento y el
  historial.
- Cola `admin.rag_jobs` con acción `unpublish` y procesamiento en
  `rag-worker`.
- Acción en la tabla de documentos, confirmación, ayuda del panel y tests.
- Fallback INV-5: si la BD no responde, env/default siguen funcionando.

**Fuera**
- Cambiar chunking, embeddings, modelo o dimensión.
- Agregar corpus, OCR o reranking.
- Castear `sup_frutal`/`superf_fru` a numérico (37-D).
- Métricas de retrieval dentro del panel.
- Borrar físicamente `rag.documents` o el PDF del manifiesto.

## 3. Reglas del CONTRACT que aplican

| Regla | Implicancia |
|---|---|
| §6.2 (tools de solo lectura) | `search_documents` sigue sin escribir; el unpublish lo hace el worker. |
| §6.6 (RAG) | El contenido sigue `untrusted`; el unpublish no expone contenido. |
| §6.7 (orquestador) | El killswitch y los settings se aplican antes de la síntesis; la evidencia no cambia. |
| §9.1 (tests) | Settings, tool, filtrado de tools, unpublish y worker con tests. |
| INV-5 | Si la BD falla, se usan env/default; el chat no se rompe. |

## 4. Contrato de datos / API

### 4.1. Settings

| Clave | Tipo | Default | Consumidor |
|---|---|---|---|
| `chat.documents.enabled` | boolean | `true` | `getDocumentSettings`, prompt, orquestador y tool |
| `chat.documents.min_score` | number | `0.62` | `search_documents` |
| `chat.documents.top_k` | number | `5` | `search_documents` (tope 1-8) |

Precedencia: env (`CHAT_DOCUMENTS_ENABLED`, `RAG_MIN_SCORE`, `RAG_TOP_K`) >
BD > default. Caché de 5 min, con reset para tests.

### 4.2. Cola de unpublish

- `admin.rag_jobs.action` agrega `unpublish`.
- `rag.ingestion_runs.status` agrega `unpublished`.
- `POST /api/admin/rag/jobs` acepta `{ "slug": "...", "action": "unpublish" }`.
- No exige manifiesto ni embeddings: solo que el worker tenga
  `RAG_DATABASE_URL`.
- El worker:
  1. bloquea la versión `ready` del slug;
  2. borra sus chunks;
  3. marca el documento `superseded`;
  4. inserta una corrida `unpublished` con `chunks_total` borrados;
  5. responde `{ status: "unpublished", chunks_deleted }`.
- Si no hay versión `ready`, responde `sin_version_ready` y el job queda
  `skipped`.

### 4.3. UI

- En la tabla de documentos, si `doc.status === "ready"`, mostrar
  **Despublicar**.
- Confirmación: “¿Despublicar X? Se borran sus chunks del índice; el
  documento y el manifiesto se conservan. Para volver a publicarlo, ingesta
  de nuevo.”
- El botón **Quitar** del manifiesto sigue sin borrar el índice y su texto lo
  aclara.

## 5. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | `chat.documents.top_k=3` | el LLM pide 8 pasajes | la tool devuelve ≤ 3 | test |
| CA-2 | `chat.documents.min_score=0.7` | se consulta | el SQL recibe 0.7 | test |
| CA-3 | `chat.documents.enabled=false` | se arma el prompt | `search_documents` no está en `tools` y no se agregan reglas | test |
| CA-4 | la tool se invoca con RAG desactivado | se ejecuta | devuelve `deshabilitado`, sin embedder ni SQL | test |
| CA-5 | una versión `ready` | se despublica | `status=superseded`, chunks borrados y no aparece en retrieval | test/BD |
| CA-6 | un documento sin versión `ready` | se despublica | el job queda `skipped` | test |
| CA-7 | el worker está caído | se encola unpublish | el job queda en cola y el panel lo muestra | manual |
| CA-8 | se despublica | se revisa `rag.documents` | el documento y su procedencia se conservan | SQL |
| CA-9 | se despublica y luego se ingesta | se busca | vuelve como versión nueva `ready` | manual |
| CA-10 | golden set | se ejecuta | 48/48 sigue pasando | `eval:chat` |

## 6. Plan por sub-sprint

| Tramo | Contenido | Horas | Estado |
|---|---|---|---|
| 18-F.1 | `server/rag/settings.js`, tool, orquestador y tests | 2 | ✅ |
| 18-F.2 | Migración 066, `unpublishDocument`, worker y tests | 2 | ✅ |
| 18-F.3 | Handler/acción del panel, ayuda y docs | 1 | ✅ |
| 18-F.4 | Validación en VPS, golden y cierre | 2 | ✅ |

## 7. Tests requeridos

- `server/rag/__tests__/settings.test.js`: defaults, BD, env, caché, reset,
  valores fuera de rango.
- `server/chat/tools/__tests__/search-documents.test.js`: top_k, min_score,
  deshabilitado, sin embedder.
- `server/chat/__tests__/tools.test.js`: `getToolDefinitions` con y sin RAG.
- `server/rag/__tests__/unpublish.test.js`: transacción, borrado de chunks,
  `superseded`, sin versión ready.
- `server/handlers/__tests__/admin-rag.test.js`: encolar unpublish sin
  manifiesto ni embeddings; acción inválida.
- `scripts/rag-worker.mjs`: prueba unitaria del mapeo de estado del job.
- Golden set completo en el VPS.

## 8. Seguridad y procedencia

- El endpoint exige sesión, CSRF y auditoría.
- El worker escribe `rag.*`; el API solo encola.
- No se registra contenido de documentos.
- Unpublish no borra `rag.documents` ni el PDF: se conserva la procedencia y
  se puede reingestar.
- La versión anterior no se toca si el worker falla antes del COMMIT.

## 9. Preguntas abiertas

| # | Pregunta | Default | ¿Bloquea? |
|---|---|---|---|
| R1 | ¿Despublicar borra el PDF? | No; solo el índice. El manifiesto se quita aparte. | no |
| R2 | ¿Se puede despublicar un slug sin manifiesto? | Sí; el job solo necesita `rag.documents`. | no |
| R3 | ¿Se audita el unpublish? | Sí, en `admin.rag_jobs` y en la corrida `unpublished`. | no |

## 10. Riesgos, reversión y documentación

- **Riesgo:** despublicar deja el documento en `superseded`; para volver hay
  que reingestar (nueva versión). Se documenta en el panel.
- **Riesgo:** si el worker está caído, el job queda en cola; el panel lo
  muestra.
- **Reversión:** reingestar el mismo PDF crea una versión nueva `ready`.
- **Docs:** esta spec, ROADMAP, CHANGELOG, ARCHITECTURE, DEV_GUIDE y AGENTS.

## 11. Puntos de integración

- `server/rag/settings.js` (nuevo), `server/chat/tools/search-documents.js`,
  `server/chat/orchestrator.js`, `server/chat/tools/index.js`.
- `server/rag/pipeline.js` o `unpublish.js` (nuevo),
  `scripts/rag-worker.mjs`.
- `server/handlers/admin-rag.js`, `server/routes/admin-rag.js`.
- `js/admin/main.js`, `admin.html`, `js/admin/api.js`.
- Migración `066_rag_unpublish.sql`.

## 12. Cierre

- **Horas reales:** ~6 h (estimado 6-8 h).
- **Resultados:**
  - `chat.documents.enabled`, `min_score` y `top_k` se leen desde
    `admin.settings` con prioridad de env y caché de 5 min.
  - Con `min_score=0.70` y `top_k=3`, la tool devolvió exactamente 3 pasajes
    con score ≥ 0,70. Con `enabled=false`, el orquestador ofreció 13 tools
    (sin `search_documents`) y la tool devolvió `deshabilitado`.
  - La migración 066 se aplicó; un job `unpublish` de un slug sin versión
    `ready` quedó `skipped` (`sin_version_ready`) y los 2 documentos reales
    siguieron `ready`.
  - `npm run eval:rag`: Recall@5 1,0 y MRR 0,778.
  - Golden set: 48/48, con RAG 6/6, mixta 2/2, abstención 6/6 y tool 31/31.
- **Desvíos:**
  - El unpublish se implementó como job del worker (no escritura directa
    desde el API), para respetar el rol de escritura de `rag.*`.
  - Se agregó la corrida `unpublished` a `rag.ingestion_runs` para conservar
    la traza.
  - Se reformuló una frase de `docs/banco-preguntas-analisis-profundo.md`
    que el test de lenguaje neutro marcaba como regionalismo.
- **Lecciones:** el panel debe leer los settings con la misma prioridad que
  el resto del chat; un killswitch tiene que quitar la tool del prompt, no
  solo sus reglas; despublicar es una operación del worker, no del API.
