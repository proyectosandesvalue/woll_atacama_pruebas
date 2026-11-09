# rag/ — Corpus documental del RAG

Este directorio contiene **solo** el manifiesto. Los PDFs fuente no se
versionan (ver `.gitignore`).

```
rag/
├── manifest.json          ← qué se ingesta (versionado)
├── manifest.example.json  ← plantilla
├── inbox/                 ← PDFs (ignorados por git)
└── README.md
```

## Requisitos del host de ingesta

- Node.js 20.6+.
- `pg` (dependency) y `pdfjs-dist` (devDependency). El host de ingesta
  debe instalar también las devDependencies (`npm ci`, sin
  `--omit=dev`). `pdfjs-dist` no se usa en `api/`.
- PostgreSQL 14+ con pgvector >= 0.5.

## Flujo

1. Copiar los PDFs públicos a `rag/inbox/`.
2. Agregar una entrada por documento a `rag/manifest.json`
   (`manifest.example.json` sirve de plantilla).
3. Estimar sin escribir nada ni llamar al proveedor:

   ```bash
   npm run ingest:dry
   ```

4. Aplicar la migración `db/migrations/036_rag_schema.sql` en el VPS y
   crear el usuario de login (ver `db/roles/rag_roles.example.sql`).
5. Configurar `DATABASE_URL` y `EMBEDDINGS_*` en el entorno.
6. Ingestar:

   ```bash
   npm run ingest -- --only ley-glaciares
   npm run ingest
   ```

## Reglas del manifiesto

- `slug`: minúsculas, números y guiones (`^[a-z0-9][a-z0-9-]{1,80}$`).
- `file`: ruta relativa a este directorio, terminada en `.pdf`, sin salir
  de `rag/`.
- `source_url`: `https://`.
- `license`: obligatoria.
- `copyright_cleared`: debe ser exactamente `true`. Si falta, el documento
  se rechaza **antes** de leer el PDF y de llamar a cualquier proveedor.
- `published_at`: `YYYY-MM-DD` (opcional).
- `tags`: arreglo de strings (opcional).

## Operación

- Mismo PDF (mismo `sha256`) → `skipped`, sin llamadas al proveedor.- PDF modificado → versión nueva; la anterior pasa a `superseded` y sus
  chunks se borran en el mismo `COMMIT`.
- PDF escaneado (texto insuficiente) → `needs_ocr`, sin chunks.
- Fallo del proveedor → documento `failed` y la versión `ready` anterior
  queda intacta.
- Un chunk siempre es rastreable a documento, versión, página y sección.

## Calidad

Antes de dar por cerrada una ingesta, revisar 20 chunks al azar. El
reporte de la CLI incluye `chunks`, `avgTokens`, `maxTokens`,
`estTokens` y `estCostUsd`. Un chunk con más de 1.5× el objetivo o un
porcentaje alto de chunks vacíos indica un problema de extracción.
