# Spec 17: Ingesta RAG (PDFs → chunks → embeddings)

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 17 |
| **Estado de la spec** | EN EJECUCIÓN (código y tests listos; falta aplicar la migración y validar con PDFs reales) |
| **Tamaño** | Mediano |
| **Duración estimada** | 10-11 h |
| **Dependencias** | Ninguna para la CLI. El panel del Sprint 15 solo consume el estado (`rag_list_documents` lógico). |
| **Última revisión** | 2026-11-05 |

> **Cambio respecto del borrador inicial.** El proyecto migra de Supabase a un VPS con PostgreSQL propio. La ingesta ya no usa RPCs ni wrappers `public.rag_*`: abre una conexión directa con `pg` y escribe en una única transacción. Esto elimina la necesidad de `NOTIFY pgrst`, de `SECURITY DEFINER` y de mantener una transacción abierta mientras se llama por HTTP al proveedor de embeddings.

---

## 1. Objetivo y contexto

Dejar en PostgreSQL un índice vectorial confiable, versionado y trazable de documentos PDF públicos, listo para que el Sprint 18 recupere fragmentos. No incluye recuperación, tool del chat ni citas.

## 2. Alcance

**Dentro del alcance**
- Schema `rag` (`documents`, `chunks`, `ingestion_runs`) con pgvector y `tsvector`.
- Roles `rag_writer` y `chat_ro`; RLS y grants de mínimo privilegio.
- Driver de embeddings compatible con OpenAI (`server/embeddings/`).
- Librería pura: extracción, normalización, chunking (testeada).
- CLI `scripts/ingest_docs.mjs` (manifiesto, `--dry-run`, `--force`, `--only`).
- Detección de PDFs sin texto (`needs_ocr`), compuerta de derechos y límites de tamaño/páginas.
- Lectura de estado para el panel del Sprint 15 (`chat_ro` sobre `rag.documents` / `rag.ingestion_runs`).

**Fuera del alcance**
- Recuperación, tool del chat, citas y prompt (Sprint 18).
- OCR de escaneados.
- Carga desde panel (Sprints 16/19).
- Crawling web y fuentes distintas de PDF.
- Documentos con datos personales o no públicos.

## 3. Reglas del CONTRACT que aplican

| Regla | Implicancia |
|---|---|
| §4.4 (imports) | `pg` solo en la CLI y en el futuro driver; `server/rag` no importa `pg`. |
| §4.5 (errores) | Errores de infra con log local; nunca contenido de documentos ni API keys. |
| §5.1 (migraciones) | Migración `036_rag_schema.sql`, idempotente, aplicada antes de usar la CLI. |
| §5.2 (RLS) | RLS en las tres tablas. `rag_writer` escribe; `chat_ro` solo lee lo `ready`. |
| §6.3 (cero SQL del LLM) | La ingesta no pasa por el LLM. |
| §6.6 (RAG) | Contenido de documentos = no confiable; procedencia obligatoria. |
| §9.1 (tests) | Librería pura y driver con tests `node:test`. |
| Regla de oro 3 | Claves de embeddings solo en variables de entorno. |

## 4. Contrato de datos

### 4.1. Manifiesto `rag/manifest.json`

```json
[
  {
    "file": "inbox/ley-glaciares.pdf",
    "slug": "ley-glaciares",
    "title": "Ley de protección de glaciares",
    "source_url": "https://www.bcn.cl/leychile/...",
    "publisher": "BCN",
    "license": "Dominio público / uso institucional",
    "language": "es",
    "published_at": "2024-03-01",
    "copyright_cleared": true,
    "tags": ["agua", "normativa"]
  }
]
```

- `copyright_cleared` debe ser exactamente `true`; si falta, el documento se rechaza **antes** de leer el PDF y de llamar al proveedor.
- `source_url` debe ser `https://`.
- `file` debe terminar en `.pdf` y vivir dentro de la carpeta del manifiesto (protección contra path traversal).
- Los PDFs viven en `rag/inbox/`, fuera de git. Solo se versiona el manifiesto.

### 4.2. Tablas (`rag`)

**`rag.documents`**

| Columna | Tipo | Nota |
|---|---|---|
| `document_id` | `uuid` PK | `gen_random_uuid()` |
| `slug` | `text` | identificador estable del documento |
| `version` | `int` | incrementa por re-ingesta |
| `title`, `source_url`, `publisher`, `license`, `language`, `published_at` | | procedencia |
| `sha256` | `char(64)` | hash del PDF; base de la idempotencia |
| `page_count` | `int` | |
| `trust_level` | `text` | `untrusted` por defecto; `reviewed` solo por revisión humana |
| `copyright_cleared` | `boolean` | compuerta |
| `status` | `text` | `ready`, `superseded`, `needs_ocr`, `failed` |
| `tags` | `text[]` | |

Restricciones: `UNIQUE(slug, version)` y un índice único parcial que garantiza **a lo sumo una versión `ready` por slug**.

**`rag.chunks`**

`chunk_id`, `document_id` (FK `ON DELETE CASCADE`), `ordinal`, `page_start`, `page_end`, `section`, `content`, `token_estimate`, `content_sha256`, `embedding vector(1024)`, `embedding_model`, `tsv` generado con `to_tsvector('spanish', content)`.

Índices: `UNIQUE(document_id, ordinal)`, GIN sobre `tsv`, HNSW (`vector_cosine_ops`, `m=16`, `ef_construction=64`).

**`rag.ingestion_runs`**

`run_id`, `document_id`, `slug`, `status` (`ready|skipped|needs_ocr|rejected|failed`), `started_at`, `finished_at`, `chunks_total`, `embedding_model`, `est_tokens`, `est_cost_usd`, `error_code`. **Sin contenido de documentos.**

### 4.3. Escritura atómica

1. Se lee y valida el PDF.
2. Se extrae, normaliza y chunkea.
3. Se calculan **todos** los embeddings fuera de la transacción.
4. Se abre `BEGIN` → lock asesor por slug → versión anterior a `superseded` → insertar documento → insertar chunks por lotes → borrar chunks viejos → `COMMIT`.

Si cualquier paso falla, la versión `ready` anterior queda intacta. No existen estados intermedios visibles para el chat.

### 4.4. Variables de entorno (solo CLI hasta el Sprint 18)

```
DATABASE_URL=postgres://rag_ingest:***@127.0.0.1:5432/woll
EMBEDDINGS_PROVIDER=openai-compatible
EMBEDDINGS_BASE_URL=http://127.0.0.1:8080/v1
EMBEDDINGS_MODEL=BAAI/bge-m3
EMBEDDINGS_API_KEY=
EMBEDDINGS_DIM=1024
EMBEDDINGS_SEND_DIMENSIONS=0
EMBEDDINGS_PRICE_PER_MTOK=0
RAG_EMBED_BATCH=32
RAG_CHUNK_TOKENS=450
RAG_CHUNK_OVERLAP=60
RAG_MAX_PDF_MB=25
RAG_MAX_PAGES=300
```

### 4.5. Chunking

- Consciente de párrafos, oraciones y encabezados legales (`Artículo`, `Título`, `Capítulo`, `Sección`, `Párrafo`).
- Objetivo 450 tokens (estimación `chars/4`), solape 60, máximo 1.5× el objetivo.
- Un cambio de sección cierra el chunk si ya alcanzó el mínimo y **nunca** se solapa entre secciones.
- Cada chunk guarda página inicial, página final y sección.
- Los embeddings se calculan con `título + sección + contenido`; en la BD se guarda solo el contenido.

## 5. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | un PDF con texto y manifiesto válido | se ejecuta la ingesta | `documents.status=ready` y chunks con embedding de 1024 dims y `embedding_model` | integración |
| CA-2 | el mismo PDF (mismo sha256) | se re-ejecuta | `skipped`: 0 llamadas al proveedor y 0 filas nuevas | test + manual |
| CA-3 | el PDF modificado | se re-ingesta | la versión nueva reemplaza a la anterior solo tras el `COMMIT`; la anterior pasa a `superseded` y sus chunks se borran | integración |
| CA-4 | un fallo de embeddings a mitad | ocurre | se registra `failed`, la versión anterior sigue `ready` y no quedan chunks huérfanos | integración con embedder simulado |
| CA-5 | un PDF escaneado (texto < umbral) | se ingesta | `status=needs_ocr`, 0 chunks, mensaje claro | test |
| CA-6 | un documento sin `copyright_cleared` | se ingesta | rechazado antes de leer el PDF y de llamar al proveedor | test |
| CA-7 | un PDF > `RAG_MAX_PDF_MB`, > `RAG_MAX_PAGES`, sin firma `%PDF-` o fuera de la carpeta | se ingesta | rechazado con causa | test |
| CA-8 | `--dry-run` | se ejecuta | informa chunks, tokens y costo estimados sin escribir ni llamar al proveedor | manual |
| CA-9 | rol `chat_ro` | consulta `rag.*` | solo ve documentos `ready` y sus chunks; no ve `ingestion_runs` con contenido | SQL |
| CA-10 | la migración | se aplica dos veces | sin error (CONTRACT §9.1) | manual |
| CA-11 | los logs de ingesta | se revisan | sin contenido de documentos ni API keys | manual |
| CA-12 | 3 PDFs reales | terminan | reporte: nº chunks, tamaño medio, % chunks vacíos < 1 %, ninguno > 1.5× el objetivo | script |

> **Nota CA-4.** El intento fallido se registra como un documento `failed` (sin chunks) y una fila en `ingestion_runs`. La versión `ready` vigente no se modifica. Si falla la propia escritura del registro, solo se pierde la traza, nunca el índice.

## 6. Plan por sub-sprint

| Tramo | Contenido | Estado |
|---|---|---|
| 17-0 | Cerrar ADR 022, confirmar nº de migración (036), excluir `rag/**` de Vercel y de git | ✅ |
| 17-A | Migración `036` (DDL, RLS, roles, grants) | ✅ (pendiente aplicar en VPS) |
| 17-B | `server/rag/{config,errors,extract,normalize,chunker}.js` + tests | ✅ |
| 17-C | `server/embeddings/{config,provider}.js` + tests | ✅ |
| 17-D | `scripts/ingest_docs.mjs`, manifiesto, `ingestion_runs`, dry-run | ✅ |
| 17-E | Ingesta de 3 PDFs reales + reporte CA-12 + docs | ⏳ pendiente de PDFs con licencia |

## 7. Tests requeridos (`node:test`)

- `normalize.test.js`: guiones de corte, saltos, controles, espacios, encabezados repetidos.
- `chunker.test.js`: límites, solape, páginas, secciones, palabra gigante, configuración inválida.
- `extract.test.js`: texto, varias páginas, exceso de páginas, PDF corrupto, PDF sin texto.
- `pipeline.test.js`: manifiesto, compuerta de derechos, `needs_ocr`, embedding input, validación de vectores.
- `provider.test.js`: lotes, orden por índice, 429/`Retry-After`, 400 sin reintento, dimensión, red, `dimensions`.
- `pipeline.postgres.test.js`: CA-1..CA-4 contra PostgreSQL real (se salta sin `RAG_TEST_DATABASE_URL`).

## 8. Seguridad y procedencia

- `trust_level='untrusted'` por defecto. El Sprint 18 debe delimitar estos fragmentos en el prompt y no obedecer instrucciones embebidas.
- Se eliminan caracteres de control y secuencias Unicode invisibles antes de indexar.
- Todo chunk es rastreable a `(documento, versión, página, sección)`.
- Solo documentos públicos; el manifiesto declara licencia, fuente y permiso.
- La compuerta de derechos se evalúa antes de cualquier llamada a un tercero.
- El rol de ingesta no puede leer tablas de otros schemas; el rol del chat no puede escribir.

## 9. Preguntas abiertas

| # | Pregunta | Default | ¿Bloquea? |
|---|---|---|---|
| R1 | ¿Proveedor de embeddings en staging? | API OpenAI-compatible, dim 1024 | sí (resuelto operativamente con `EMBEDDINGS_*`) |
| R2 | ¿Modelo en producción? | `bge-m3` autoalojado en el VPS | no |
| R3 | ¿Corpus inicial y quién certifica licencias? | 3-5 documentos normativos públicos (BCN, DGA) | sí (pendiente 17-E) |
| R4 | ¿Librería de PDF? | `pdfjs-dist` `legacy` como devDependency | no (resuelto) |

## 10. Riesgos, reversión y documentación

- **Calidad de extracción de tablas**: mitigación con reporte CA-12 y revisión humana de 20 chunks.
- **Costo**: `--dry-run` con estimación antes de llamar al proveedor.
- **Modelo cambiante**: `embedding_model` por chunk y `--force` para re-embeber.
- **PDFs escaneados**: `needs_ocr`; OCR queda para fase 3.
- **Reversión**: schema aditivo; `DROP SCHEMA rag CASCADE` no afecta al chat.
- **Documentos a actualizar**: este archivo, ADR 022, ROADMAP, CHANGELOG, ARCHITECTURE §4-5, CONTRACT §6.6, `.env.example`, `rag/README.md`.

## 11. Puntos de integración

- **Sprint 18**: consume `status='ready'`, `trust_level`, `tsv`, `embedding_model`. La pregunta se embebe en runtime; por eso `EMBEDDINGS_*` pasará a Vercel/servidor.
- **Sprint 26-B**: el driver `server/db/drivers/postgres.js` debe usar el mismo `search_path=public,extensions`.
- **Sprint 26-C**: `000_compat_roles.sql` debe crear `extensions` y `vector` antes de esta migración.
- **Sprint 29-A**: `rag/manifest.json` se suma al inventario de fuentes y licencias.
- **Sprint 32**: el proveedor de embeddings se declara en el aviso de privacidad (ADR 011).
