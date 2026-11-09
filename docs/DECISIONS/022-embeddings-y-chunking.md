# ADR 022: Embeddings y chunking para el RAG

- **Estado:** Aceptado (2026-11-05)
- **Fecha:** 2026-11-05
- **Sprint:** 17
- **Relación:** spec 17, ADR 006 (Postgres propio, pgvector), ADR 011 (aviso de privacidad), ADR 016 (jerarquía de verdad: BD estructurada > API oficial > RAG > LLM)

## 1. Contexto

El Sprint 17 necesita un índice vectorial de documentos públicos. La
decisión de dimensión y modelo de embeddings es **bloqueante**: la
dimensión se fija en el DDL (`vector(N)`) y cambiarla obliga a
re-embeber todo el corpus. Además, los vectores de modelos distintos no
son comparables entre sí.

Restricciones reales del proyecto:

- La base de datos pasa de Supabase a PostgreSQL propio en un VPS
  (Sprint 26). El espacio deja de ser un problema: 20 000 chunks ocupan
  ~100-150 MB con índice HNSW.
- El corpus inicial es pequeño (decenas o cientos de PDFs públicos en
  español jurídico/técnico), actualizado esporádicamente.
- El presupuesto de infraestructura es acotado; el LLM ya consume cuota.
- Los documentos son **contenido no confiable** (riesgo de inyección
  indirecta en el Sprint 18).

## 2. Decisión

### 2.1. Dimensión: `vector(1024)`

Compatible con:

- **BAAI/bge-m3** autoalojado (multilingüe, buen desempeño en español),
  servido con TEI o vLLM en el VPS.
- **OpenAI `text-embedding-3-small`** con `dimensions=1024`, para
  staging o arranque sin GPU.

1024 es el punto de equilibrio entre calidad y costo. 768 obliga a
recortar modelos; 1536+ multiplica el índice sin mejora clara para este
corpus.

### 2.2. Proveedor: driver abstracto, no un proveedor cableado

`server/embeddings/` replica el patrón de `server/llm/`:

```
embed(texts: string[]) → { vectors: number[][], model: string, dim: number }
```

- Única implementación hoy: `openai-compatible` (`POST /embeddings`).
  Sirve para OpenAI, Azure OpenAI, vLLM, TEI y Ollama en modo OpenAI.
- Cambiar de proveedor = cambiar `EMBEDDINGS_BASE_URL`, `EMBEDDINGS_MODEL`
  y `EMBEDDINGS_API_KEY`, sin tocar el pipeline.
- El modelo activo se guarda en `rag.chunks.embedding_model`.

### 2.3. Chunking

- Párrafo → oración → trozo duro, en ese orden.
- Objetivo **450 tokens**, solape **60**, máximo **675** (1.5×).
- Un cambio de sección (`Artículo`, `Título`, `Capítulo`, `Sección`,
  `Párrafo`) cierra el chunk si ya alcanzó el mínimo (135) y **nunca**
  se solapa entre secciones.
- Tokens estimados con `chars/4`. Es una aproximación deliberada: no se
  agrega el tokenizador del modelo como dependencia de runtime. El tope
  de 1.5× absorbe el error.
- El embedding incluye `título + sección + contenido`; el chunk guarda
  solo el contenido limpio.

### 2.4. Versionado y re-embeddings

- Cada chunk lleva `embedding_model`.
- Un documento sin cambios (mismo `sha256`) y con chunks del modelo
  activo se omite.
- Cambiar de modelo exige `--force` y re-ingesta. La versión nueva
  reemplaza a la anterior en un único `COMMIT`.
- No hay búsqueda multi-modelo: **un solo modelo activo** por índice.

### 2.5. Escritura directa, sin RPCs

La ingesta corre en una CLI Node con `pg` y escribe en una transacción
local. Los embeddings se calculan **antes** del `BEGIN`. En Supabase esto
habría requerido RPCs `begin/append/finalize` para esquivar PostgREST;
en el VPS no hacen falta. Los roles de mínimo privilegio sustituyen a
`service_role`:

- `rag_writer`: escribe documentos, chunks y corridas.
- `chat_ro`: lee solo `status='ready'`.

## 3. Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| `vector(768)` con `paraphrase-multilingual` | Menor calidad en español jurídico y menos margen para cambiar de modelo. |
| `vector(1536)` con `text-embedding-3-large` | Costo y tamaño de índice desproporcionados para el corpus; transferencia de documentos a un tercero. |
| Embeddings generados en Vercel | Añade latencia, costo y una dependencia de red en el camino crítico del chat; además el runtime de Vercel no debe parsear PDFs. |
| Chunking por longitud fija | Rompe artículos y oraciones; el solape queda sin contexto semántico. |
| Búsqueda solo léxica (`tsvector`) | No resuelve paráfrasis; se mantiene como señal híbrida en el Sprint 18. |
| Cola de workers (pg-boss, BullMQ) | Sobreingeniería para decenas de PDFs; una CLI idempotente es suficiente hasta el Sprint 19. |

## 4. Consecuencias

**Positivas**
- El índice es reproducible: mismo PDF + mismo modelo + mismo chunker =
  mismos chunks.
- La ingesta es atómica: el chat nunca ve una versión a medias.
- Cambiar de modelo es una operación explícita y auditable.
- El esquema ya trae `tsv` para búsqueda híbrida en el Sprint 18.

**Negativas / límites**
- `chars/4` no es el tokenizador real; el corte puede variar ±20 %.
- Las tablas de PDF se aplanan; se detectan con el reporte CA-12, no se
  reconstruyen.
- Sin OCR: los escaneados quedan `needs_ocr`.
- Un cambio de dimensión exige migración nueva y re-ingesta total.

## 5. Operación

- `rag/manifest.json` es la fuente de verdad de qué se ingesta.
- `npm run ingest:dry` estima chunks, tokens y costo sin tocar la BD.
- `npm run ingest -- --only <slug>` procesa un documento.
- `RAG_TEST_DATABASE_URL` habilita el test de integración CA-1..CA-4.
- La migración `036_rag_schema.sql` es idempotente y aditiva.

## 6. Pendientes que no bloquean

- Medir recuperación con el golden set extendido (documento y página
  esperados) en el Sprint 25-A.
- Evaluar OCR (`ocrmypdf`/Tesseract) y reranking solo si las métricas lo
  justifican.
- Pasar `untrusted` → `reviewed` con revisión humana cuando exista el
  panel de escritura (Sprint 16/19).
