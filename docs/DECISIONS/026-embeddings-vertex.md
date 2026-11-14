# ADR 026 — Embeddings con Vertex AI

| Campo | Valor |
|---|---|
| Estado | Aceptada |
| Fecha | 2026-11-14 |
| Origen | Sprint 18-B / configuración del proveedor de embeddings |
| Relacionado | ADR 022 (embeddings y chunking), ADR 005 (VPS), spec 17, spec 18-B, CONTRACT §6.6 |

## Contexto

El RAG usa `rag.chunks.embedding vector(1024)` y el driver de embeddings solo
hablaba el protocolo OpenAI-compatible (`EMBEDDINGS_PROVIDER=openai-compatible`).
El LLM ya usa Vertex AI (`LLM_PROVIDER=vertex-ai`) y la facturación de Google
Cloud es postpago, así que el equipo quiere usar el mismo proveedor para los
embeddings y evitar una API key separada de AI Studio.

Vertex AI no es una instancia que se levante en local. Es un servicio
gestionado: lo que cambia por entorno es el proyecto, la región, el modelo y
las credenciales. El corpus local y el de producción viven en bases distintas;
los vectores no se comparten salvo que se migren y se reindexen.

## Decisión

1. **Proveedor:** `EMBEDDINGS_PROVIDER=vertex` (alias `vertex-ai`).
2. **Modelo:** `gemini-embedding-001` con `outputDimensionality=1024`.
   La dimensión sigue fijada por `rag.chunks.embedding vector(1024)`.
3. **Endpoint:** `:predict` de Vertex AI, con `instances[].content` y
   `parameters.outputDimensionality`. Para documentos se usa
   `task_type=RETRIEVAL_DOCUMENT`; en 18-D la consulta usará
   `RETRIEVAL_QUERY`.
4. **Proyecto:** uno solo para desarrollo y producción al inicio, con dos
   service accounts separadas. Si la facturación necesita aislarse, se separa
   en dos proyectos sin cambiar el código.
5. **Credenciales:**
   - Local: ADC (`gcloud auth application-default login`) o una service
     account de desarrollo con `GOOGLE_APPLICATION_CREDENTIALS_JSON`.
   - Producción: service account con `roles/aiplatform.user`, JSON en el
     `.env` del VPS o un archivo montado; nunca en el repositorio.
6. **Entornos:** `.env.local` en local y `.env` de producción en el VPS. No se
   copia `.env.local` al servidor. Cada entorno indexa su propio corpus.
7. **LLM:** sigue con el driver `vertex-ai` ya existente y comparte proyecto y
   credenciales con los embeddings. No se crea una instancia local.

## Consecuencias

**Positivas**
- Una sola consola, facturación y control de IAM para LLM y embeddings.
- `gemini-embedding-001` permite 1024 dimensiones sin cambiar el esquema.
- No hay que administrar una instancia de embeddings en el VPS.
- El mismo modelo en local y producción mantiene los vectores comparables.

**Negativas**
- Dependencia de Google Cloud y de la latencia de red.
- Costo por uso; hay que medir tokens y configurar presupuestos/alerta.
- Las credenciales deben estar disponibles en el API y en el `rag-worker`.
- Cambiar de modelo o dimensión exige reindexar el corpus.

**Riesgos y mitigación**
- **Cuota o región:** usar `us-central1` por defecto para embeddings y
  `EMBEDDINGS_LOCATION` si el LLM usa `global`.
- **IAM:** la service account solo necesita `roles/aiplatform.user`; no usar
  una cuenta personal en producción.
- **Fuga de credenciales:** `.env` fuera de git, permisos 600, rotación y
  auditoría. El `check-embeddings` nunca imprime la key.
- **Vectores mezclados:** no mezclar modelos en la misma base; si se migra el
  corpus, reindexar con el modelo de producción.

## Alternativas descartadas

- **OpenAI-compatible con API key externa:** agrega otro proveedor y otra
  factura; el equipo ya usa Vertex.
- **Google AI Studio con API key:** es rápido, pero separa la facturación y
  las credenciales del proyecto de Vertex.
- **bge-m3 autoalojado:** evita la dependencia externa, pero requiere descargar
  el modelo y administrar CPU/RAM en local y en el VPS.

## Pendiente

- Configurar el proyecto, las service accounts y el `.env.local`.
- Validar `npm run embeddings:check` con Vertex.
- Probar una ingesta real con un PDF con licencia.
- Definir el corpus inicial y la metadata de vigencia (18-B).
- Medir Recall@5 en 18-C y ajustar `task_type` y chunking.
