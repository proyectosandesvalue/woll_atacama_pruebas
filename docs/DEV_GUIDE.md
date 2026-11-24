# DEV_GUIDE.md — Guía para desarrolladores

> Cómo trabajar en el proyecto desde cero: setup, comandos, flujo de trabajo, troubleshooting.
> Última revisión: 2026-10-23.

---

## 1. Antes de arrancar

Leé estos documentos **en orden**:

1. **`README.md`** — visión general del producto.
2. **`docs/CONTRACT.md`** — reglas que no se rompen.
3. **`docs/ARCHITECTURE.md`** — cómo está armado el sistema.
4. **`docs/DECISIONS/*.md`** — por qué se tomaron las decisiones clave.
5. **Este archivo** — cómo hacer las cosas.

---

## 2. Setup local

### 2.1. Requisitos

- **Node.js 18+** (`node --version`).
- **Git** con SSH configurado a GitHub.
- **Editor**: el que prefieras (VS Code recomendado).
- **Opcional**: QGIS para visualizar/modificar capas GeoJSON.

### 2.2. Clonar el repo

```bash
git clone git@github.com:proyectosandesvalue/woll_atacama_pruebas.git
cd woll_atacama_pruebas

2.3. Configurar identidad de git
Una sola vez en tu máquina:

bash
git config --global user.name "Tu Nombre"
git config --global user.email "tu-email@dominio.com"
Importante: el email debe ser el mismo que tienes registrado y verificado en GitHub. Si no, Vercel bloquea los deploys (ver ADR 001).

2.4. Crear .env.staging
Copia .env.example a .env.staging y completa los valores:

bash
cp .env.example .env.staging
Edita .env.staging con los valores reales:

SUPABASE_URL y SUPABASE_SERVICE_KEY de Supabase staging.

LLM_API_KEY del proveedor (Vertex, Groq, o el que uses).

GOOGLE_APPLICATION_CREDENTIALS_JSON (si usas Vertex AI en local).

.env.staging está en .gitignore. NUNCA se sube a GitHub.

2.5. Instalar dependencias
bash
npm install
Instala ESLint (dev) y las dependencias de runtime (`pg`, Vertex AI, `csv-parser`).

### 2.6. PostgreSQL local (Sprint 26)

Desde 26-C el entorno de referencia es Docker/Podman + PostgreSQL 17 con
PostGIS y pgvector. La demo Vercel + Supabase queda congelada.

1. Copia `.env.example` a `.env.local` y completa:
   - `POSTGRES_PASSWORD`
   - `DATABASE_URL` (rol `woll_api`)
   - `DATABASE_ADMIN_URL` (rol `postgres`, solo migraciones)
   - `WOLL_API_PASSWORD`, `WOLL_INGEST_PASSWORD`
2. Levanta la base:

```bash
npm run db:up
```

3. Aplica las migraciones (idempotente):

```bash
npm run migrate
npm run migrate:status
npm run check:rpcs
npm run audit:db
```

4. Habilita los roles de login (una vez por base):

```bash
./scripts/bootstrap-roles.sh
```

5. Para bajar la base:

```bash
npm run db:down
```

La base escucha solo en `127.0.0.1:5432` con `docker-compose.dev.yml`. En el VPS
no se publica: queda en la red interna de Compose. Si usas Podman sin Compose,
puedes levantar el contenedor equivalente con `podman run` o instalar
`podman-compose`.

### 2.7. Servidor Node (Sprint 26-A)

El servidor del VPS atiende solo `/api/*`, `/healthz` y `/readyz`; los estáticos
los sirve Nginx en 26-D.

```bash
npm run dev:api   # node --watch server/index.js con .env.local
npm start         # sin watch, para producción
```

- Puerto: `PORT` (default 3000). No lo levantes junto con `vercel dev`, que usa
  el mismo puerto.
- Health: `curl http://localhost:3000/healthz`.
- Rutas: `/api/chat`, `/api/proxy`, `/api/arclim-geojson`, `/api/stations-map`,
  `/api/station-details`, `/api/station-series`, `/api/station-available-dates`,
  `/api/variable-availability`, `/api/variable-available-dates` y
  `/api/historical-stations`.
- Cierre: `Ctrl+C` o `SIGTERM` cierran el HTTP y el pool de PostgreSQL.

### 2.8. Stack completo con Nginx (Sprint 26-D)

```bash
npm run stack:up     # PostgreSQL + API + Nginx
npm run stack:logs
npm run stack:down
```

- Visor: `http://localhost:8080` (Nginx).
- API directa: `http://localhost:3000`.
- Health: `http://localhost:8080/healthz` y `http://localhost:8080/nginx-health`.
- No corras `npm run dev:api` al mismo tiempo: ambos usan el puerto 3000.
- Si recreas solo el contenedor `api` en desarrollo, reinicia Nginx
  (`docker compose ... restart nginx`) para que resuelva la nueva IP.

**Producción (VPS):**

```bash
docker compose --env-file .env -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Antes del primer arranque hay que emitir el certificado:

```bash
docker run --rm -p 80:80 \
  -v woll_letsencrypt:/etc/letsencrypt \
  docker.io/certbot/certbot:latest certonly --standalone \
  -d "$DOMAIN" --cert-name woll \
  --email "$CERTBOT_EMAIL" --agree-tos --no-eff-email
```

El servicio `certbot` del perfil `tls` renueva por webroot; Nginx sirve
`/.well-known/acme-challenge/`. El certificado se monta en
`/etc/letsencrypt/live/woll/`.

### 2.9. LLM y embeddings en local (26-K)

El contenedor `api` no hereda las credenciales de Vercel. Si el chat falla con
`Variable de entorno requerida no configurada: LLM_BASE_URL`, faltan las
variables del proveedor en `.env.local`.

**Opción A — Gemini API key (recomendada para local).** No requiere ADC ni
Vertex. Usa el endpoint OpenAI-compatible de Google:

```bash
# .env.local
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
LLM_MODEL=gemini-3.1-flash-lite
LLM_API_KEY=TU_GEMINI_API_KEY
```

Para embeddings, el mismo endpoint:

```bash
EMBEDDINGS_PROVIDER=openai-compatible
EMBEDDINGS_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
EMBEDDINGS_MODEL=gemini-embedding-2
EMBEDDINGS_API_KEY=TU_GEMINI_API_KEY
EMBEDDINGS_DIM=1024
EMBEDDINGS_SEND_DIMENSIONS=1
RAG_DATABASE_URL=postgres://rag_ingest:...@127.0.0.1:5432/woll
```

**Opción B — Vertex AI (igual que producción).** En local se usa el mismo JSON
de service account montado como archivo, nunca inline:

```bash
# .env.local
LLM_PROVIDER=vertex-ai
GOOGLE_CLOUD_PROJECT=woll-atacama-staging
GOOGLE_CLOUD_LOCATION=global
LLM_MODEL=gemini-3.1-flash-lite
EMBEDDINGS_PROVIDER=vertex
EMBEDDINGS_MODEL=gemini-embedding-001
EMBEDDINGS_LOCATION=us-central1
EMBEDDINGS_TASK_TYPE=RETRIEVAL_DOCUMENT
EMBEDDINGS_DIM=1024
GCP_SA_FILE=/home/tu-usuario/.config/woll/gcp-sa.json
```

El stack local se levanta con el overlay de Vertex, igual que el VPS:

```bash
podman-compose -p woll_local --env-file .env.local \
  -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.vertex.yml \
  up -d --force-recreate api rag-worker
```

El overlay monta el JSON en `/run/secrets/gcp-sa.json` y define
`GOOGLE_APPLICATION_CREDENTIALS` para `api` y `rag-worker`. En el VPS aplica el
mismo overlay a través de `deploy/vps/compose.sh`.

Ojo: `GOOGLE_APPLICATION_CREDENTIALS=/ruta/del/host` en `.env.local` solo sirve
cuando corres Node directamente en el host (por ejemplo `npm run ingest`).
Dentro de un contenedor esa ruta no existe; usa `GCP_SA_FILE` y el overlay.

El módulo de embeddings soporta `vertex` (`gemini-embedding-001`, 1024 dims) y
`openai-compatible`. La dimensión está fijada por `rag.chunks.embedding
vector(1024)`: cambiarla exige migración y re-ingesta (ADR 022).

### 2.9.1. Vertex AI en el VPS (imagen + secreto)

La imagen no lleva credenciales. En el VPS se monta el JSON de service account
como secreto de solo lectura con el overlay `docker-compose.vertex.yml`:

```bash
# En el VPS
export GCP_SA_FILE=/etc/woll/gcp-sa.json
docker compose --env-file .env \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.vertex.yml up -d
```

El `.env` del VPS debe tener:

```bash
LLM_PROVIDER=vertex-ai
GOOGLE_CLOUD_PROJECT=woll-atacama-staging
GOOGLE_CLOUD_LOCATION=global
LLM_MODEL=gemini-3.1-flash-lite
```

El JSON debe ser legible por el usuario `node` del contenedor (UID 1000):

```bash
sudo install -m 0400 -o 1000 -g 1000 gcp-sa.json /etc/woll/gcp-sa.json
```

**WIF en el VPS:** la rama WIF actual usa `getVercelOidcToken()` y es exclusiva
de Vercel. Para WIF fuera de Vercel hace falta un proveedor de identidad
externo (GitHub/Keycloak/etc.) y un subject token; no se configura solo con
`GCP_PROJECT_NUMBER`. Si el VPS es una VM de GCE, se puede usar la service
account adjunta a la VM y ADC por metadata, sin JSON.

Para embeddings Vertex falta el driver `vertex-ai`; por ahora el RAG local usa
el endpoint OpenAI-compatible de Google AI Studio o un servidor de embeddings
compatible con OpenAI.

Si ya tienes un `.env` local con un proveedor OpenAI-compatible (por ejemplo
Gemini API), puedes cargarlo sin copiar claves:

```bash
podman-compose -p woll_local --env-file ~/.config/woll/compose.env \
  -f docker-compose.yml -f docker-compose.dev.yml \
  -f docker-compose.local-llm.yml up -d --force-recreate api
```

Si el chat responde `402 RESOURCE_EXHAUSTED` o `prepayment credits are
depleted`, la clave es válida pero el proyecto de Google AI Studio no tiene
créditos: carga billing en AI Studio o usa Vertex AI.

Después de editar `.env.local`, recrear el contenedor API (no alcanza con
`restart`, porque `env_file` se lee al crear):

```bash
podman-compose -p woll_local --env-file ~/.config/woll/compose.env \
  -f docker-compose.yml -f docker-compose.dev.yml \
  up -d --force-recreate api
```

Probar:

```bash
curl -X POST http://localhost:8090/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"text":"¿Cuántas capas hay?","history":[]}'
```

### 2.10. Migración de datos desde Supabase (Sprint 26-E)

La conexión directa a Supabase (DBeaver o `supabase db dump`) **no se guarda en
el repo**. Exporta `SOURCE_DATABASE_URL` solo en la sesión.

```bash
export SOURCE_DATABASE_URL='postgres://...'
SCHEMAS=public,chat,admin,ingest,rag npm run db:dump
# genera backups/woll-<timestamp>.dump + .sha256
```

Restore en una base destino vacía/staging:

```bash
export TARGET_DATABASE_URL='postgres://postgres:...@127.0.0.1:5432/woll'
npm run db:restore -- backups/woll-<timestamp>.dump
node scripts/migrate.mjs --baseline --to 035   # el dump ya trae 000-035
npm run migrate                                # 036 rag + 038 columnas + 039 RPCs + 040 overloads
```

RPCs heredadas y verificación:

```bash
export SOURCE_DATABASE_URL='postgres://...'
npm run db:extract-rpcs
npm run migrate
npm run check:rpcs
SOURCE_DATABASE_URL="$SOURCE_DATABASE_URL" \
TARGET_DATABASE_URL="$TARGET_DATABASE_URL" \
npm run db:verify
```

Carga de capas nuevas:

```bash
npm run layer:load -- geojson/foo.geojson --table foo --dimension agua \
  --display-name "Foo" [--force]
```

`backups/` está en `.gitignore`; los dumps no se versionan.

3. Comandos útiles
3.1. Desarrollo local
Opción A — servidor estático (más simple, sin backend):

bash
npx http-server -p 8099
Abre http://localhost:8099. El visor funciona, pero el chat no (el endpoint /api/chat no existe local).

Opción B — Vercel CLI (con backend):

bash
npx vercel dev
Abre http://localhost:3000. El chat funciona porque Vercel CLI levanta las Functions localmente.

Recomiendo Opción B si vas a tocar el chat. Para probar el servidor del VPS sin
el frontend, usa `npm run dev:api` (también en 3000).

La forma más simple es:

```bash
npm run dev
```

Levanta `vercel dev` y el proxy persistente de Copernicus en `http://localhost:3001/api/proxy`. Si quieres levantarlos por separado:

```bash
npx vercel dev     # terminal 1
npm run dev:proxy  # terminal 2
```

El frontend detecta que está en `localhost` y usa el proxy de 3001; en producción sigue usando `/api/proxy` relativo. Esto evita que `vercel dev` ejecute una Function por cada tile.

> **Vercel + Supabase son solo demo/staging.** El despliegue final es un VPS
> propio (ADR 005, Sprint 26). No optimizar límites de Hobby ni agregar
> infraestructura específica de Vercel que no sea portable.
>
> **Disparador de migración:** cuando arranque la imagen Docker de PostgreSQL
> (PostGIS + pgvector), el entorno local pasa a Docker Compose y Vercel +
> Supabase quedan congelados. Desde ese momento, todo se desarrolla y prueba
> primero en la imagen local, y luego se replica en el VPS.

3.2. Lint
bash
npm run lint
Si tienes errores, corrígelos antes de commitear.

3.3. Tests
bash
npm test
Tests con node:test. Los tests están en server/chat/__tests__/.

3.4. Poblar el catálogo del chat
Cuando agregues capas nuevas a Supabase, ejecuta:

bash
node --env-file=.env.staging scripts/build_catalog.mjs
Esto hace UPSERT de todas las capas declaradas en js/config/allTemasConfig.js en chat.chat_catalog.

3.5. Cargar los prompts del chat en la BD
Cuando cambies SYSTEM_PROMPT_BASE o CLASSIFIER_SYSTEM_PROMPT en el código, ejecuta:

bash
node --env-file=.env.staging scripts/migrate_prompts.mjs
Esto carga los 2 prompts en admin.prompt_templates (versionado, idempotente). Para editar la configuración del chat usa el panel admin (`/admin.html` → **Chat IA**); el script queda para el bootstrap inicial. Cada cambio de prompt crea una versión nueva.

3.6. Correr el golden set
bash
# Modo local (usa el handler local, verifica tools con trace)
node --env-file=.env.staging scripts/run-golden-set.mjs --all

# Modo remoto (usa Vercel; los checks de trace son warnings)
node scripts/run-golden-set.mjs --all --remote

# Un caso específico
node --env-file=.env.staging scripts/run-golden-set.mjs --id smoke-bloqueo-fecha

# Con router y unavailable activados
CHAT_ROUTER_ENABLED=1 CHAT_UNAVAILABLE_ENABLED=1 \
  node --env-file=.env.staging scripts/run-golden-set.mjs --all

# Forzar el archivo y no leer admin.golden_cases
node --env-file=.env.staging scripts/run-golden-set.mjs --all --from-json

# Probar también los casos inactivos (por ejemplo, los de RAG antes de 18-D)
node --env-file=.env.staging scripts/run-golden-set.mjs --all --include-inactive
El runner imprime en el header: modelo, flags, versiones de prompt y la fuente
del golden set (`admin.golden_cases` o `golden.json`). El resumen incluye el
acierto por ruta (`tool`, `rag`, `mixta`, `abstencion`, `fuera_de_alcance`).
Los casos inactivos no se ejecutan por defecto. Cada corrida es reproducible;
si la BD no responde, cae al archivo (INV-5).

### 3.6.1. Antes de tocar el chat

El chat es un orquestador de fuentes; la calidad se mide por ruta, no solo por
respuesta. Antes de cambiar prompts, tools, router, RAG o settings:

1. Identifica el tipo de pregunta y la ruta esperada en `CONTRACT.md` §6.7.
2. Si agregas o cambias una tool, agrega el caso al golden set con
   `tools_any` y documenta la tool en el prompt del orquestador.
3. Si tocas el RAG, mide primero el retrieval (Recall@5, MRR). No cambies el
   prompt hasta saber si el problema es el corpus, el chunking o el ranking.
4. Si tocas el enrutamiento, actualiza el mapa de fuentes y los casos mixtos.
5. Corre el golden set antes y después:
   `CHAT_ROUTER_ENABLED=1 CHAT_UNAVAILABLE_ENABLED=1 npm run eval:chat`.
6. Compara el acierto por tier y por ruta. Si baja, no actives el cambio.
7. Revisa la latencia con `CHAT_TIMING_ENABLED=1` y el baseline de
   `docs/chat-latency-baseline.md`.
8. Verifica la abstención: una pregunta sin evidencia debe decirlo, no
   inventar una respuesta.
9. Actualiza la spec, el CHANGELOG y, si cambia una decisión, el ADR.
10. Deja el golden set y la configuración versionados; no actives cambios
    manuales sin auditoría.

El detalle de las reglas está en `CONTRACT.md` §6.7 y el porqué en
`docs/DECISIONS/025-calidad-chat-orquestador-fuentes.md`.

3.7. Smoke tests
bash
# Test de conexión a la BD
node --env-file=.env.staging scripts/smoke-db.mjs

# Test end-to-end del orquestador
node --env-file=.env.staging scripts/smoke-orchestrator.mjs "¿cuántas plantas desaladoras hay?"

3.8. Agregar un indicador satelital de Copernicus

1. Crea la capa en la Configuration Utility de Copernicus y copia su ID
   (por ejemplo, `EVI`). Confirma las bandas del evalscript.
2. Agrega el servicio en `js/config/wms_services.js`:

```js
copernicus_evi: copernicus("EVI", "EVI (Sentinel-2)"),
```

3. Agrega la capa en la dimensión que corresponda con la ficha común:

```js
copernicus_evi: copernicusLayer({
  servicio: "copernicus_evi",
  nombre: "EVI (Sentinel-2)",
  title: "Índice de Vegetación Mejorado (EVI)",
  description: "…",
  range: { min: -1, max: 1, text: "…" },
  legend: { type: "gradient", min: -1, max: 1, unit: "EVI", labels: ["…", "…"], stops: [...] },
}),
```

4. Agrega la clave a `capas` y al grupo `satelite` de la dimensión.
5. Agrega la capa a `NUEVAS` en `server/config/copernicus-layers.test.js`.
6. Corre `npm run lint` y `npm test`.
7. Haz hard reload y verifica:
   - La capa aparece en “Satélite (Copernicus)”.
   - El calendario marca fechas (WFS) y permite navegar hasta 2017.
   - `GetMap` y `GetFeatureInfo` usan el `TIME` seleccionado.

Notas:
- Para composiciones sin valor numérico, usa `range` solo con `text`,
  `wmsLegend.type = "note"` y una nota que explique las bandas.
- Para leyendas clasificadas, `wmsLegend.type = "items"` con `{ color, label }`.
- El historial se controla con `wmsHistoryStart`; el valor por defecto es `2017-01-01`.

3.9. Medir latencia del chat

Con `CHAT_TIMING_ENABLED=1` el handler emite una línea JSON `chat.timing` por
request, con las etapas (`catalog`, `classifier`, `router`, orquestador L1/L2,
tools y finish). No escribe en la BD.

Corrida local de 20 casos:

```bash
CHAT_TIMING_ENABLED=1 \
  node --env-file=.env.staging scripts/run-golden-set.mjs --all --limit 20
```

En producción:

1. Activar `CHAT_TIMING_ENABLED=1` en Vercel y desplegar.
2. Correr el runner con `--remote`.
3. Traer los logs y filtrar las líneas `chat.timing`:

   ```bash
   npx vercel logs --json --deployment <url-del-deploy> --since 30m --limit 5000 \
     | grep chat.timing
   ```

4. Apagar el flag (`0`) y volver a desplegar.

El runner imprime p50/p95/mean por caso. La línea base está en
`docs/chat-latency-baseline.md`.

4. Flujo de trabajo
4.1. Antes de escribir código
Preguntate:

¿Este cambio afecta la estructura del sistema? → ADR + validar con el contrato.

¿Agrega un endpoint? → Escribir el contrato en docs/ primero.

¿Toca datos? → Escribir el schema primero.

¿Es solo un fix? → Verificar que no rompe nada existente.

4.2. Desarrollo
Actualiza main:

bash
git checkout main
git pull origin main
Haz el cambio. Commits atómicos con mensaje claro:

text
feat: descripción corta
fix: descripción corta
refactor: descripción corta
docs: descripción corta
chore: descripción corta
Lint + tests:

bash
npm run lint
npm test
Push:

bash
git push origin main
Vercel deploya automáticamente (~30s). Espera a que esté Ready.

Verifica en el navegador:

text
https://wollatacamapruebas.vercel.app
4.3. Cuándo crear rama
Hoy: como eres tú solo, haces commit directo a main. Simple.

Cuando sumes gente:

Ramas feature/<nombre> para cambios grandes.

PR a main con review.

Protección de main en GitHub.

No agregar esa ceremonia hasta que haga falta.

4.4. Promoción a producción
Ver docs/DECISIONS/004-promocion-manual.md.

Resumen:

Feature validada en pruebas.

Copiar archivos al repo de producción.

Commit + push.

Vercel prod deploya.

Verificar.

5. Estructura de carpetas — dónde va cada cosa
Si vas a tocar...	Mira esto
Backend del chat	server/chat/
Configuración de capas	js/config/
UI del visor	js/ui/
Utilidades del visor	js/utils/
Endpoint /api/chat	api/chat.js
Migraciones SQL	db/migrations/
Scripts Node	scripts/
Estilos	css/
Capas GeoJSON	geojson/
Documentación	docs/
Reglas:

Un archivo, una responsabilidad.

Si un archivo pasa las 300 líneas → dividir.

Si una función pasa las 50 líneas → dividir.

Comentarios solo cuando explican por qué, no qué.

6. Migraciones de base de datos
6.1. Crear una migración
bash
# El siguiente número disponible
ls db/migrations/ | tail -1
# Ejemplo: 024_admin_config.sql

# Crear el siguiente
touch db/migrations/026_mi_migracion.sql
Reglas:

Nombre: NNN_descripcion_corta.sql (3 dígitos, sin saltos).

Idempotente (IF NOT EXISTS, CREATE OR REPLACE).

Nunca borrar datos sin backup.

Nunca editar una migración ya aplicada. Si hace falta un cambio, crear una nueva.

Números reservados: la 021 y la 022 son del 40-A (filtros). La 024 y la 025 son del 40-D.2 (admin config y rollback). No renumerar.

6.2. Aplicar en Supabase
Abre el SQL Editor del proyecto Supabase correspondiente.

Pega el contenido.

Run.

Verifica que no haya errores.

6.3. Después de aplicar
Si la migración agrega/modifica RPCs:

sql
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
PostgREST tarda ~10s en recargar el schema. Si tu RPC no aparece inmediatamente, espera.

7. Agregar una capa nueva al visor
Coloca el .geojson en geojson/.

Agrega la config en js/config/<dimension>.js:

js
nueva_capa: {
  url: "nueva_capa.geojson",
  type: "point",
  nombrePersonalizado: "Nueva Capa",
  atributo: "campo_atributo",
  iconos: { valor: "icono.png" },
  popupCampos: ["campo1", "campo2"],
  alias: { campo1: "Nombre", campo2: "Descripción" },
}
Agrega el nombre en el array capas: de la dimensión.

Si la capa va dentro de un grupo, agregala al array del grupo.

Recarga el navegador. No hay build step.

Para que el chat la vea:

Subir la tabla física a Supabase (public.nueva_capa).

Re-correr scripts/build_catalog.mjs.

8. Agregar una tool al chat
Crear server/chat/tools/mi-tool.js:

js
export default {
  schema: {
    type: "function",
    function: {
      name: "mi_tool",
      description: "...",
      parameters: { /* JSON Schema */ },
    },
  },
  run: async (args) => {
    const db = await getDB();
    return db.rpc("mi_rpc", { /* args */ });
  },
};
Importar y registrar en server/chat/tools/index.js:

js
import miTool from "./mi-tool.js";
const ALL_TOOLS = [ ..., miTool ];
Si la tool necesita una RPC nueva: agregarla en db/migrations/NNN_mi_tool.sql y aplicarla en Supabase. Después del CREATE OR REPLACE FUNCTION, correr NOTIFY pgrst, 'reload schema'; (PostgREST tarda ~10s en recargar).

Documentar la tool en el SYSTEM_PROMPT del orquestador (server/chat/prompts.js → SYSTEM_PROMPT_BASE). El LLM solo puede elegir tools que estén en el prompt.

Probar con el golden set:

bash
node --env-file=.env.staging scripts/run-golden-set.mjs --id mi-caso-de-prueba
Agregar un caso al golden set (server/chat/__evals__/golden.json) con tools_any: ["mi_tool"] y reply_must_contain.

8.1. Parámetros de filtros: filters vs where
Las tools que aceptan filtros (query_layer, get_layer_features, aggregate_layer, aggregate_by_admin, aggregate_by_admin_and_column, count_near_layer, aggregate_near_layer) aceptan dos formas:

filters (objeto de igualdad, atajo para el LLM):

json
{
  "layer_id": "derechos_agua_2025",
  "filters": { "Tipo Derecho": "Consuntivo", "Cuenca": "Copiapó" }
}
where (arreglo de condiciones, para operadores más complejos):

json
{
  "layer_id": "derechos_agua_2025",
  "where": [
    { "field": "Comuna", "op": "in", "values": ["Vallenar", "Huasco"] },
    { "field": "Caudal Anual Promedio", "op": "gt", "value": "100" }
  ]
}
Operadores soportados en where (migración 021_fix_filters_robust.sql):

Operador	Semántica
match	Igualdad normalizada. Si no hay match exacto, cae a "contiene" (ILIKE).
eq	Solo igualdad normalizada.
in	Igualdad contra cualquiera de los valores del arreglo.
ilike	Contiene, normalizado.
gt, gte, lt, lte	Comparación numérica.
between	Entre dos valores (inclusive).
normalizeArgs (en tools/_helpers.js) convierte filters y where en un solo arreglo de condiciones. Cada clave de filters se convierte en { field: k, op: "match", value: v }.

Limitaciones conocidas:

where solo soporta AND entre condiciones (no OR).

Las columnas numéricas guardadas como texto (ej: Caudal Anual Promedio antes del Sprint 37-D) van a fallar con gt/lt hasta que se normalicen.

Los campos desconocidos devuelven error (no se ignoran silenciosamente).

9. Troubleshooting
El visor no carga
Abre consola del navegador (F12) → Console → busca errores.

Verifica que estás sirviendo con HTTP (no file://).

Confirma que /geojson/ es accesible.

El chat no responde
Verifica que las env vars están cargadas en Vercel.

Revisa Deployments → último → Functions → chat → logs.

Si dice "Variable de entorno requerida no configurada: X", agregala.

Si dice "Supabase RPC X falló (404)", alguna migración falta.

Si dice "LLM 401", la LLM_API_KEY está mal.

Si dice "invalid_rapt", ejecuta gcloud auth application-default login (Vertex AI).

Vercel bloquea el deploy
Error: "The deployment was blocked because the commit email X could not be matched to a GitHub account".

Causa: el email de git no está verificado en GitHub.

Fix:

Corrige git config user.email (debe ser el email verificado en GitHub).

Si el historial ya tiene commits con el email mal:

bash
git filter-branch --env-filter '...' -- --branches --tags
git push origin main --force
O reset limpio (ver docs/DECISIONS/001-dos-repos-separados.md).

.env.staging aparece en git status
Significa que el .gitignore no lo está filtrando. Corregir:

bash
grep -i env .gitignore
# Debe incluir .env.staging o un patrón que lo cubra

# Si no está, agregarlo
echo ".env.staging" >> .gitignore
git add .gitignore
git commit -m "chore: ignorar .env.staging"
El golden set falla con "no puedo responder"
Si los casos de Tier 3/4 fallan con "no puedo responder", es porque CHAT_UNAVAILABLE_ENABLED=0 (default). Ejecuta con:

bash
CHAT_UNAVAILABLE_ENABLED=1 node --env-file=.env.staging scripts/run-golden-set.mjs --all
10. Recursos
Contrato: docs/CONTRACT.md

Arquitectura: docs/ARCHITECTURE.md

Decisiones: docs/DECISIONS/*.md

Manual de usuario: help.html

Referencia externa:

Leaflet docs: https://leafletjs.com/reference.html

Supabase docs: https://supabase.com/docs

Vertex AI docs: https://cloud.google.com/vertex-ai/docs

PostGIS docs: https://postgis.net/documentation/

text

### 2.11. Tiles MVT pregenerados (Sprint 08)

Los tiles se generan **offline** desde PostGIS y se sirven como archivos; Nginx
no consulta la base. Se guardan en `tiles/<layer_id>/<version>/<z>/<x>/<y>.mvt`
(fuera de git y de la imagen de la API).

**Variables**

```bash
# En .env.local o en el entorno del comando
DATABASE_ADMIN_URL=postgres://postgres:CLAVE@127.0.0.1:5432/woll
```

`DATABASE_ADMIN_URL` necesita permiso de `CREATE TEMP TABLE` (el generador
materializa la geometría simplificada por zoom).

**Generar una capa y versión**

```bash
npm run tiles:build -- --layer borde_costero --version 2026 \
  --minzoom 0 --maxzoom 14 --workers 3
```

- `--maxzoom` se degrada solo si la capa supera 20.000 tiles (capas regionales
  bajan a z13). `--force` permite el zoom completo.
- `--publish` imprime el snippet `source.tiles` para la config de la capa.
- Una versión con `manifest.json` no se sobrescribe: usa otra `--version` o
  `--overwrite` solo en desarrollo.

**Publicar todas las capas nuevas o editadas**

```bash
npm run tiles:sync -- --changed
npm run tiles:sync -- --layer humedales --version 2026
npm run tiles:sync -- --index
```

`--changed` compara `chat.chat_catalog.updated_at` con `generated_at` del
manifest. Las capas de puntos se omiten por defecto (geometría GeoJSON + valores
por API); `--include-points` fuerza los tiles.

**Verificar y retener**

```bash
npm run tiles:check                 # manifests vs archivos y conteo en la BD
npm run tiles:sync -- --prune --keep 2
```

**Alta de una capa nueva con tiles**

```bash
npm run layer:load -- geojson/mi_capa.geojson \
  --table mi_capa --dimension agua --display-name "Mi capa" \
  --tiles --tiles-version 2026
```

Si la generación falla, la capa queda cargada; se reintenta con
`npm run tiles:sync -- --layer mi_capa --version 2026`.

**Servir en local**

El stack de desarrollo monta el repo en `/srv/woll`; la ruta `/tiles/` ya está
en `deploy/nginx/woll-locations.conf` con MIME MVT, gzip y caché inmutable:

```bash
npm run stack:up
curl -I http://localhost:8090/tiles/borde_costero/2026/10/308/596.mvt
```

**En el VPS**

El generador escribe en el checkout que Nginx monta en `/srv/woll`. Ejecútalo en el
host (Node 22) con `DATABASE_ADMIN_URL` apuntando a `127.0.0.1:5432`:

```bash
cd /srv/woll
DATABASE_ADMIN_URL=postgres://postgres:CLAVE@127.0.0.1:5432/woll \
  npm run tiles:sync -- --changed
```

No uses `docker compose run api ...` sin montar `tiles/`: la imagen no incluye
ese directorio y los tiles quedarían dentro del contenedor.

**Cliente en el visor (08-B)**

La capa `borde_costero` tiene un bloque `source` en
`js/config/planificacion.js` y se pinta con `leaflet.vectorgrid` desde
`/tiles/...`; no descarga el GeoJSON. La tabla, los filtros y el CSV usan
`GET /api/layer-features?layer_id=borde_costero`, que devuelve las propiedades
de PostGIS sin geometría. Si la API no responde, el visor cae al GeoJSON.

Para probar:

```bash
curl 'http://localhost:8090/api/layer-features?layer_id=borde_costero&limit=2'
# En el visor: activar la capa, abrir Opciones → Ver tabla (382 registros),
# filtrar ZONA_1 = ZP (11 registros, coincide con SQL) y descargar CSV.
```

**Cómo se maneja la config con tiles**

Las configs siguen siendo archivos JS (`js/config/<dimension>.js`). Una capa
migrada conserva su `url`, `type`, estilo, `popupCampos`, `alias`, `colores` y
leyenda; se le agrega un bloque `source`:

```js
source: {
  type: "postgis",
  idColumn: "fid",
  tiles: {
    mode: "static",              // o "on-demand"
    version: "20261005",         // versión inmutable publicada
    layerName: "humedales",      // nombre de la capa MVT
    urlTemplate: "/tiles/humedales/20261005/{z}/{x}/{y}.mvt",
    manifest: "/tiles/humedales/20261005/manifest.json",
    minZoom: 0,
    maxZoom: 14,
  },
  fallback: { type: "geojson", url: "humedales.geojson" },
}
```

- `url` y `fallback.url` siguen siendo el GeoJSON de respaldo.
- El loader resuelve en este orden: WMS → tiles (`source.tiles`) → GeoJSON.
- Si el manifest o el tile fallan, cae al GeoJSON.
- La versión activa es la del `version` de la config; `tiles/index.json` lista
  las versiones publicadas. Actualizar datos = nueva versión + cambiar
  `version` (o resolverla desde `/api/config` en el Sprint 07).
- `layerName` debe coincidir con el `tile_slug` del manifest.
- Las capas de puntos no llevan `source`; usan GeoJSON + API de valores.
- `comunas_poligonos` no está en la config del visor (se usa para análisis).
- `npm run tiles:build -- --layer X --version V --publish` imprime el snippet.
- La tabla y la descarga usan `/api/layer-features` y `/api/layer-export`
  cuando la capa es PostGIS; si la API no existe (Vercel), usan GeoJSON.

Para una capa nueva, copia el bloque `source` y verifica popup, zoom, tabla,
filtro y CSV con `npm run acceptance:08` como referencia.

**Exportación (08-E)**

Las capas con tiles descargan con `GET /api/layer-export` (GeoJSON o CSV) y el
mismo filtro de la tabla:

```bash
curl -G 'http://localhost:8090/api/layer-export' \
  --data-urlencode 'layer_id=borde_costero' \
  --data-urlencode 'format=csv' \
  --data-urlencode 'filter={"op":"and","conditions":[{"column":"ZONA_1","operator":"in","value":["ZP"]}]}'
```

En Vercel el endpoint no existe; el visor cae al GeoJSON estático o al CSV en
cliente. El CSV acepta `columns` y `labels` (arrays JSON) para replicar la
tabla.

**Carga y aceptación (30)**

```bash
npm run acceptance:08
npm run load:30 -- --concurrency 25,50 --duration 15
npm run load:30 -- --scenarios on-demand,on-demand-cold \
  --concurrency 5,10 --duration 10 --think-time 500
```

El runner Node mide p50/p95/p99, RPS, HTTP y errores. `--think-time` simula
usuarios reales y evita el rate limit por IP de on-demand (20 r/s). La tabla
`/api/layer-features` está cacheada 10 s en Nginx; una edición puede tardar ese
tiempo en reflejarse.

**Configuración en BD y panel admin (14-15)**

```bash
# Validar la config sin escribir
npm run config:snapshot -- --dry-run

# Publicar un snapshot nuevo y activarlo
npm run config:snapshot -- --publish --notes "capa nueva X"

# Verificar que el snapshot activo coincide con js/config
npm run config:snapshot -- --check

# Alta/rotación del usuario admin
npm run admin:user -- --username admin --password '...'
npm run admin:user -- --new-totp
```

- `/api/config` devuelve el snapshot activo; si falla, el visor usa
  `allTemasConfig` (INV-5). No editar el snapshot a mano: publicar con el CLI.
- `admin.config_layers` es un índice derivado para el panel; no es la fuente
  de verdad.
- El panel vive en `/admin.html` (noindex). Requiere `DB_DRIVER=postgres` y
  `ADMIN_SESSION_SECRET` (32+ caracteres). `ADMIN_TOTP_SECRET` es opcional y
  solo se usa en flujos sensibles.
- El login usa usuario y contraseña; el TOTP no se pide. Si se necesita
  reactivar, configurar `ADMIN_TOTP_REQUIRED=1` y `ADMIN_TOTP_SECRET`.
- La demo Vercel/Supabase no expone el panel: usa el fallback local.

**Configurar el proveedor de embeddings (local y producción)**

La configuración vive en el **entorno**, no en el panel: `.env.local` en local
y el `.env` del VPS en producción. No copies `.env.local` al servidor; usa un
archivo de producción con permisos 600 o variables del sistema.

Hay dos modos:

**Vertex AI (recomendado si el LLM usa Vertex):**

```env
LLM_PROVIDER=vertex-ai
GOOGLE_CLOUD_PROJECT=tu-proyecto
GOOGLE_CLOUD_LOCATION=us-central1
LLM_MODEL=gemini-3.1-flash-lite
EMBEDDINGS_PROVIDER=vertex
EMBEDDINGS_MODEL=gemini-embedding-001
EMBEDDINGS_DIM=1024
EMBEDDINGS_LOCATION=us-central1
EMBEDDINGS_TASK_TYPE=RETRIEVAL_DOCUMENT
```

- En local usa ADC: `gcloud auth application-default login`. El contenedor no
  hereda el ADC del host; pásale `GOOGLE_APPLICATION_CREDENTIALS_JSON` o monta
  el archivo y define `GOOGLE_APPLICATION_CREDENTIALS`.
- En el VPS usa una service account con `roles/aiplatform.user` y
  `GOOGLE_APPLICATION_CREDENTIALS_JSON` (o un archivo montado). La misma cuenta
  sirve para el LLM y los embeddings.
- Vertex no tiene una instancia local: el proyecto, la región y el modelo se
  configuran por entorno. Un solo proyecto con dos service accounts (dev/prod)
  es suficiente para empezar.
- `EMBEDDINGS_LOCATION` permite una región distinta para embeddings si el LLM
  usa `global`.

**OpenAI-compatible (autoalojado o API externa):**

```env
EMBEDDINGS_PROVIDER=openai-compatible
EMBEDDINGS_BASE_URL=http://127.0.0.1:8080/v1
EMBEDDINGS_MODEL=BAAI/bge-m3
EMBEDDINGS_API_KEY=
EMBEDDINGS_DIM=1024
EMBEDDINGS_SEND_DIMENSIONS=0
```

- La dimensión es fija: `rag.chunks.embedding vector(1024)`. Un modelo de 768
  u otra dimensión exige una migración nueva y reingesta total (ADR 022).
- Modelos compatibles: `BAAI/bge-m3` (1024, autoalojado),
  `gemini-embedding-2` con `dimensions=1024`, `text-embedding-3-small` con
  `dimensions=1024`. Evita modelos de 768 como `nomic-embed-text`.
- **Local y producción pueden ser distintos**, pero conviene mantener el mismo
  modelo y dimensión para que los vectores sean comparables. Usa una API key
  o service account separada por entorno; si cambias de modelo, reindexa el
  corpus.
- Hoy las usa el `rag-worker`; en 18-D el API también las necesitará para
  embeber la pregunta.
- Verifica sin ingerir nada:

```bash
npm run embeddings:check
```

El comando no imprime la API key ni el texto de prueba; valida modelo, URL o
proyecto/región, dimensión y latencia. En Docker Compose, las variables se
pasan al `api` y al `rag-worker` desde el `.env` con el que se levanta el
stack; recrea esos servicios después de cambiarlas.

**Ingesta RAG desde el panel (45-A)**

- Entrar a `/admin.html` → pestaña **RAG**.
- Subir el PDF, completar slug, título, URL https, licencia y declarar
  `copyright_cleared`; guardar metadatos.
- **Estimar** encola un `dry_run` (no escribe en `rag.*` ni llama al
  proveedor). **Ingestar** encola la ingesta real.
- El worker procesa `admin.rag_jobs`; sin worker los jobs quedan en cola:

```bash
npm run rag:worker            # loop local
npm run rag:worker -- --once  # una pasada (cron/tests)
```

- El worker necesita `DATABASE_URL` (cola), `RAG_DATABASE_URL` (escritura
  `rag.*`) y `EMBEDDINGS_*`. La imagen es `docker/rag-worker/Dockerfile` y
  comparte el volumen `./rag`.
- Nginx permite 30 MB solo en `/api/admin/rag/upload`; el API valida además
  firma `%PDF-` y 25 MB.
- El API nunca importa `pdfjs-dist`; la extracción ocurre en el worker.
- Revisar chunks desde la tabla de documentos. El contenido es
  `trust_level=untrusted` hasta revisión humana.
- Si un job queda `running` sin heartbeat por más de 10 min, se puede
  reintentar; no hay cancelación de jobs en ejecución.
- En Podman rootless, el compose de desarrollo usa `keep-id` y
  `label=disable` para que API y worker compartan `./rag`. En Docker/Linux
  normal no hace falta; en el VPS el volumen debe pertenecer al usuario del
  contenedor.

**Taxonomía normalizada (46)**

```bash
# Sembrar desde el snapshot activo (o --from-js)
npm run taxonomy:seed -- --dry-run
npm run taxonomy:seed
npm run taxonomy:seed -- --force

# Compilar y publicar el snapshot del visor
npm run taxonomy:compile -- --dry-run
npm run taxonomy:compile -- --publish --notes "cambio de grupos"
npm run taxonomy:compile -- --check
```

- El panel **Taxonomía** arma el sidebar de capas del geoportal:
  - **Dimensión:** tema principal.
  - **Grupo / subdimensión:** bloque dentro del tema.
  - **Subgrupo:** bloque anidado.
  - **Dimensión general:** nivel superior; una capa puede repetirse en grupos.
- Para ubicar una capa: seleccionar la dimensión → **Ubicar una capa en esta
  dimensión** → elegir capa y destino (general, grupo o subgrupo) → **Asignar
  capa**.
- Los cambios se guardan en la taxonomía, pero el sidebar no cambia hasta
  **Publicar snapshot**. Si la validación falla, el snapshot anterior sigue
  activo.
- Los formularios de alta están colapsados: usa **Agregar dimensión/grupo/
  subgrupo/capa** para abrirlos; se cierran al guardar o con **Cancelar**.
  En RAG, **Agregar documento** abre el formulario y la tabla usa todo el
  ancho cuando está cerrado.
- El seed es fiel al snapshot v1 (mismo checksum). Si se edita una capa común
  con estilos distintos por dimensión, se conserva la variante en
  `layer_placements.config`.
- El sidebar usa `/api/taxonomy` con `TAXONOMY_API_ENABLED=1` y
  `?taxonomy=1`/`WOLL_TAXONOMY_API`; si falla, cae a `/api/config` y luego a
  `allTemasConfig` (INV-5). Ver §2.11.2.

**Gestor de capas (47, GeoJSON y Shapefile)**

- `/admin.html` → **Capas**.
- **Agregar capa** crea los metadatos (clave, nombre, tipo, fuente y JSON de
  estilo/popup/alias).
- **Importar GeoJSON** sube el archivo, lo guarda en `geojson/uploads/`,
  encola la importación y, si se marca, genera tiles MVT.
- **Importar Shapefile (ZIP)** sigue el flujo de §2.11.1: ZIP privado, worker
  con GDAL, GeoJSON de respaldo y carga a PostGIS.
- El worker se ejecuta con:

```bash
npm run layer:worker
npm run layer:worker -- --once
```

- Requiere `DATABASE_URL` para la cola y `DATABASE_ADMIN_URL` para crear la
  tabla y los tiles. Volúmenes: `./geojson` y `./tiles`.
- Al terminar, `admin.layers.config.source.tiles` queda actualizado y el
  GeoJSON original sigue como fallback.
- Después hay que asignar la capa a dimensión/grupo/subgrupo en **Taxonomía**
  y publicar el snapshot.
- El borrado es lógico (`activo=false`); no elimina la tabla PostGIS ni los
  tiles.

**Gestor de APIs (45-B)**

- `/admin.html` → **APIs** lista las conexiones externas y muestra si faltan
  variables de entorno.
- **Probar** hace una petición controlada desde el servidor; no imprime
  secretos ni descarga el cuerpo completo.
- **Editar** permite cambiar nombre, timeout, rate limit y si está activa.
  La URL base y los secretos viven en el entorno/registro de código.
- **Archivar** desactiva la conexión para el backend sin borrar su definición
  de código; **Reactivar** la vuelve a habilitar. La tabla marca la conexión
  como `archivada`.
- **Nueva conexión** abre una guía con los pasos. Una conexión operativa
  requiere editar `server/admin/api-registry.js`, la allowlist de
  `server/proxy/services.js` si usa el proxy, agregar tests y deployar. El
  panel no acepta URLs arbitrarias.
- La tabla tiene scroll horizontal y la columna de acciones queda fija para
  que Probar, Editar y Archivar estén siempre visibles.
- Migración: `044_admin_api_connections.sql`.

**Demanda no satisfecha (50)**

- `/admin.html` → **Demanda**. Muestra las preguntas que el chat no pudo
  responder, agrupadas por fingerprint y con el número de ocurrencias.
- Filtros por estado, razón, prioridad, decisión y texto; orden por última
  aparición, ocurrencias, fecha o prioridad.
- El detalle permite cambiar estado, prioridad, decisión, sprint destino y
  notas. Las acciones rápidas resuelven, rechazan o archivan.
- **Descargar brief** genera un Markdown con la pregunta, el tipo, la ruta y
  una propuesta de tool/RPC, criterios de aceptación y caso de golden. El panel
  no crea tools: el brief se implementa en el sprint indicado (18, 19,
  40-D.3, 42 o 43).
- No se guardan datos personales: email, sesión e historial quedan fuera. La
  migración 053 limpia los registros existentes.
- Tabla: `admin.unanswered_questions`. RPCs: `chat_log_unanswered` (upsert),
  `admin_list_unanswered`, `admin_update_unanswered`, `admin_unanswered_stats`.
- Al cerrar una demanda, marcar `resolved` con `resolution_type` y
  `resolution_note`; el caso del golden set debe pasar.
- Revisión semanal; prioriza las preguntas con 2+ ocurrencias o las que
  bloquean un flujo completo.
- Migraciones: `053_unanswered_demand.sql`,
  `054_unanswered_resolution_fields.sql` y `055_unanswered_rls.sql`.
- Contenido de ayuda para la futura página del panel:
  `docs/help/demanda-no-satisfecha.md`. `help.html` sigue siendo el manual del
  visor público.

**Configuración del chat (48)**

- `/admin.html` → **Chat IA**.
- **Prompts versionados**: **Nueva versión** crea una versión y la activa;
  **Editar como nueva versión** parte de una versión existente. Las versiones
  históricas se pueden **Activar** (se copian como versión nueva) o
  **Eliminar**. La versión activa no se borra.
- **Settings**: edita `admin.settings` con tipo `string|number|boolean|json`.
  Los settings con `editable=false` se muestran en solo lectura.
- **Mensajes estándar**: `admin.messages` con fallback al texto hardcodeado.
- **Datos no disponibles**: CRUD de `admin.unavailable_data`; al guardar se
  actualiza `verificado_en`.
- **Golden set**: CRUD de `admin.golden_cases`. El campo `expected` es JSON
  (por ejemplo `{ "tools_any": ["query_layer"] }`); `level` va de 1 a 3 y
  `tier` de 1 a 6. La **ruta esperada** (`tool`, `rag`, `mixta`,
  `abstencion`, `fuera_de_alcance`) agrupa el acierto en el runner. Sembrar
  desde el archivo con:

```bash
npm run golden:seed            # aplica sobre admin.golden_cases
npm run golden:seed -- --dry-run
```

- **Herramientas del chat**: inventario de solo lectura. Una tool nueva se
  agrega con un archivo en `server/chat/tools/` y una línea en
  `server/chat/tools/index.js`; no se crea desde el panel (CONTRACT §6.2).
- Antes de activar un prompt o un cambio de router, correr el golden set y
  comparar el acierto por tier (CONTRACT §2).
- Migraciones: `049_admin_chat_config_crud.sql` y
  `050_golden_tier_range.sql`. No renumerar.

**Seguridad del frontend (28)**

- No agregar `<script>` ni `<link rel="stylesheet">` externos sin versión fija,
  `integrity="sha384-…"` y `crossorigin="anonymous"`. Recalcular el hash si
  cambia la versión.
- No usar handlers inline (`onclick`, `onchange`, etc.) ni `eval`/`new Function`:
  la CSP no los permite. Usar `addEventListener`.
- Escapar con `escapeHtml` todo dato de API o GeoJSON antes de `innerHTML`.
  Para valores numéricos que pueden ser `0`, usar `String(valor)`.
- La CSP vive en `deploy/nginx/woll.conf` y `deploy/nginx/woll.dev.conf`. Si
  aparece un dominio nuevo (tiles, WMS, proxy), agregarlo solo al `img-src`/
  `connect-src` correspondiente y probar el visor con la consola abierta.
- `npm audit --omit=dev --audit-level=high` corre en CI; no mergear con
  vulnerabilidades altas de producción.
- Tests: `node --test scripts/__tests__/security-frontend.test.js`.

**Reglas de versionado**

- Ediciones y años usan versión explícita: `2024`, `2026`, `2025`.
- Capas nuevas sin edición usan `YYYYMMDD` (fecha de `updated_at`).
- Actualizar datos = versión nueva; la anterior se conserva hasta `--prune`.
- La versión activa es la más reciente por `generated_at` en `tiles/index.json`.
- La caché no se purga: cambia la URL al cambiar la versión.

---

### 2.11.1. Importar Shapefile (ZIP) desde el panel (47-D)

El panel acepta un ZIP con un Shapefile. Requisitos:

- `.shp`, `.dbf`, `.shx` y `.prj` con el mismo nombre base; `.cpg` opcional.
- Máximo **200 MB** de ZIP y **1 GB** descomprimido; hasta 100 entradas.
- Sin paths absolutos, `..`, backslashes ni symlinks.
- Un solo `.shp` por ZIP.

Flujo:

1. **Capas → Importar capa**, elige la capa, la dimensión y el ZIP.
2. El ZIP queda privado en `geojson/private/<key>.zip` (Nginx responde 404).
3. El worker `layer-worker` lo descomprime, exige los componentes, genera
   `geojson/uploads/<key>.geojson` con `ogr2ogr` y carga a PostGIS con
   `load-layer --force --tiles`.
4. El panel muestra el job y, al terminar, `source.tiles` y el fallback.

La imagen del worker es `docker/layer-worker` (GDAL + `unzip`); la API no
incorpora GDAL. Si cambias el Dockerfile:

```bash
podman-compose -p woll_local --env-file .env.local \
  -f docker-compose.yml -f docker-compose.dev.yml build layer-worker
npm run stack:up
```

Para procesar un job manualmente:

```bash
npm run layer:worker -- --once
```

En Podman/SELinux, el compose de desarrollo usa `label=disable` para el worker;
no montes `geojson/` con `:Z` a mano o Nginx puede quedar sin permiso de
lectura. En Docker/VPS (sin SELinux) no aplica.

### 2.11.2. Activar la taxonomía nativa (46-C)

El sidebar puede leer las tablas normalizadas sin esperar a publicar un
snapshot. El endpoint devuelve el mismo shape de `allTemasConfig`.

1. Habilita el endpoint en el servidor:

   ```env
   TAXONOMY_API_ENABLED=1
   ```

2. Abre el visor con el flag de cliente:

   ```text
   https://tu-dominio/?taxonomy=1
   ```

   También puedes activarlo en consola con
   `globalThis.WOLL_TAXONOMY_API = true` antes de cargar la app.

3. Verifica el endpoint:

   ```bash
   curl -i https://tu-dominio/api/taxonomy
   ```

   Debe devolver `200`, `ETag` y un `config` con las dimensiones. Un segundo
   request con `If-None-Match` debe devolver `304`.

4. Fallback: si `/api/taxonomy` falla, el loader intenta `/api/config` y, si
   también falla, usa `allTemasConfig` (INV-5). El visor nunca se queda sin
   configuración.

5. Rollback: pon `TAXONOMY_API_ENABLED=0` y quita `?taxonomy=1`. No hace falta
   deploy del frontend; el sidebar vuelve a `/api/config`.

El endpoint compila `admin.dimensions/groups/subgroups/layers/placements` en
cada request (seis consultas) y cachea 60 s por HTTP. No publica snapshots ni
escribe en la BD. Ver `docs/specs/45-panel-admin-operaciones/46-C-taxonomy-api.md`.

### 2.12. Ráster precalculado (Sprint 49)

El servidor **no calcula** pendientes, sombras, orientación ni MCDA. El ráster
se produce offline en QGIS/GDAL/GRASS y se publica como:

```
data/raster/<layer>/<version>/source.tif      # COG privado (data/ está denegado)
raster/<layer>/<version>/<z>/<x>/<y>.webp     # tiles públicos
raster/<layer>/<version>/manifest.json
raster/index.json
```

Requiere **Podman o Docker** para ejecutar GDAL en un contenedor efímero; no se
instala GDAL en el host ni en la imagen de la API.

**Publicar**

```bash
npm run raster:publish -- \
  --file ./aptitud_jojoba.tif \
  --layer aptitud_jojoba \
  --version 2026-11 \
  --name "Aptitud para jojoba" \
  --license "Uso institucional; DEM Copernicus 30 m" \
  --producer "QGIS 3.40 / GDAL 3.9" \
  --method "Weighted overlay: pendiente 30%, orientación 20%, suelo 20%, clima 20%, restricciones 10%." \
  --minzoom 8 --maxzoom 13 \
  --stats-csv ./aptitud_jojoba_stats.csv
```

- El GeoTIFF debe estar en **EPSG:4326 o EPSG:3857**.
- `--dry-run` valida y estima tiles sin escribir.
- Una versión publicada no se sobrescribe; usa otra `--version` o `--force`.
  Si republicas con `--force` y cambian las estadísticas, vuelve a pasar
  `--stats-csv`.
- WebP se usa para RGB/RGBA; un ráster de 1 banda o paleta se publica como PNG
  automáticamente (GDAL 3.14 no genera WebP de 1 banda). `--format` permite
  forzar.
- Para clases o categóricos usa `--resampling near`; para variables continuas,
  el default `bilinear`.
- Si el ráster supera 20.000 tiles, baja un zoom y lo registra en el manifest.

**Estadísticas por comuna (opcional)**

El CSV se calcula en QGIS y debe traer:

```
admin_level,admin_code,admin_name,class_id,class_label,class_min,class_max,hectares,mean,min,max,p10,p90
```

`--stats-csv` carga `public.raster_stats` (migración `052`). Necesita
`DATABASE_ADMIN_URL` en el entorno:

```bash
DATABASE_ADMIN_URL=postgres://postgres:CLAVE@127.0.0.1:5432/woll \
  npm run raster:publish -- ... --stats-csv ./stats.csv
```

Sin CSV, la capa se publica igual y la ficha muestra “Sin estadísticas
publicadas”.

**Verificar y retener**

```bash
npm run raster:sync -- --check
npm run raster:sync -- --prune --keep 2 --dry-run
npm run raster:sync -- --prune --keep 2
```

`--check` verifica tiles, bytes y checksum contra el manifest. `--prune` borra
versiones de tiles; las fuentes COG se conservan salvo `--prune-sources`.

**Config del visor**

El comando imprime un snippet `source.raster`. Se copia a
`js/config/<dimension>.js`, se agrega la capa a `capas`/`grupos` y se publica el
snapshot:

```bash
npm run config:snapshot -- --publish
npm run config:snapshot -- --check
```

La capa se carga con `L.tileLayer`, muestra una **ficha metodológica** y no
ofrece tabla, filtros por atributo ni descarga. La leyenda sale del `legend` del
manifest; `rasterLegend` en la config es solo un fallback.

**Servir en local**

```bash
npm run stack:up
curl -I http://localhost:8090/raster/aptitud_jojoba/2026-11/8/77/149.webp
```

Nginx sirve `/raster/` con caché inmutable y `/raster/index.json` sin caché. La
fuente bajo `data/raster/` responde 404. Ver ADR 027 y
`docs/specs/49-publicador-raster.md`.

### 2.13. Actualizar un asset vendorizado (28-A)

El visor no usa CDN. Leaflet, markercluster, flatpickr, DOMPurify, Chart.js y
las tipografías se sirven desde el repositorio:

| Asset | Ruta |
|---|---|
| Leaflet 1.9.4 | `js/lib/leaflet/` (`leaflet.js`, `leaflet.css`, `images/`) |
| markercluster 1.5.3 | `js/lib/leaflet.markercluster/` |
| flatpickr 4.6.13 | `js/lib/flatpickr/` (`flatpickr.min.js`, `.css`, `es.js`) |
| DOMPurify 3.0.3 | `js/lib/dompurify/purify.min.js` |
| Chart.js 4.4.0 | `js/lib/chart.js/chart.umd.min.js` |
| Tipografías | `css/fonts.css` + `css/fonts/*.woff2` |

Pasos:

1. Descarga el archivo de la versión nueva y reemplaza el existente.
2. Si cambia la API o los nombres de archivo, ajusta `index.html`, `help.html`
   o `admin.html`. No agregues CDN ni `integrity`/`crossorigin` para assets
   locales.
3. Para tipografías, actualiza `css/fonts.css` y los `.woff2`; conserva la
   clase `.material-symbols-outlined` o los iconos dejan de renderizar.
4. Verifica en navegador el visor, la ayuda y el panel, y corre:

   ```bash
   node --test scripts/__tests__/security-frontend.test.js
   ```

   El test falla si aparece un recurso externo o si falta un asset local.

No edites archivos minificados a mano: reemplaza el archivo completo y deja la
versión anotada en la spec 28 o en el CHANGELOG.

### 2.14. Despliegue al VPS: local primero (26-I)

**Regla:** el VPS es producción. No se edita código, configuración ni archivos
allí; todo cambio se desarrolla y prueba en local, se hace commit y solo entonces
después se despliega con un release. La única excepción son los incidentes
(caída, disco lleno, certificado vencido), que se resuelven en el servidor y
se documentan en `docs/CHANGELOG.md` el mismo día.

**Flujo normal**

```bash
# 1. Local: pruebas antes de tocar producción
npm run lint
npm test
# si el cambio toca el chat, además:
CHAT_ROUTER_ENABLED=1 CHAT_UNAVAILABLE_ENABLED=1 \
  node --env-file=.env.staging scripts/run-golden-set.mjs --all --limit 20

# 2. Commit y push al repo de producción (remote `vps`)
git add -A && git commit -m "feat: ..."
git push vps main

# 3. Release en el VPS (backup -> build -> migrate -> up -> smoke)
ssh woll-vps 'cd /srv/woll && deploy/vps/release.sh --with-chat'
```

`deploy/vps/release.sh` aborta si el árbol del VPS tiene cambios locales o si
el historial divergió; hace backup antes de migrar, aplica migraciones
idempotentes, reconstruye `api`, `rag-worker` y `layer-worker`, recrea Nginx
cuando cambió su configuración y termina con smoke de `/healthz` y
`/api/config`.

**Reglas asociadas**

- Migraciones: archivo nuevo en `db/migrations/`, idempotente, probado en local.
  Nunca se edita una migración ya aplicada.
- Secretos: solo en `.env` / `.env.local` / `.env.backup`; nunca en el repo ni
  en imágenes.
- Rollback: `git revert` del commit en local + push + `release.sh`, o restaurar
  el backup previo que deja el release en `/var/backups/woll`.
- Los archivos de Nginx se montan por inodo: si se editan a mano en el VPS hay
  que recrear el contenedor (`deploy/vps/compose.sh up -d --force-recreate nginx`).
- No se suben PDFs, dumps ni tiles al repo; viajan por `scp` o por el panel.

**Postgres local con Podman** (el stack ya existe como proyecto `woll_local`):

```bash
podman start woll_local_postgres_1          # o el stack completo con podman-compose
podman exec woll_local_postgres_1 psql -U postgres -d woll -c "select count(*) from comunas_poligonos;"
```

La ingesta RAG real en local corre en el host contra `127.0.0.1:5432` con
`.env.local` (Node tiene `pdfjs-dist`); dentro del contenedor se usa la imagen
`rag-worker` reconstruida y el overlay de Vertex.

El archivo `~/.config/woll/compose.env` (permisos `600`, fuera del repo) es la
unión de `.env.local` con `POSTGRES_PASSWORD`, `DATABASE_URL_DOCKER` y
`RAG_DATABASE_URL_DOCKER`, que los compose exigen para interpolación. Se crea
una vez; si cambia `.env.local`, se regenera. Sin él, `podman-compose` falla
con `required variable POSTGRES_PASSWORD is missing a value`.

## Verificación después de reemplazar

```bash
cd ~/Proyectos/woll_atacama_pruebas

echo "=== 1. ¿Se eliminó el zzzz? ==="
grep -n "zzzzz" docs/DEV_GUIDE.md || echo "OK, no hay zzzz"

echo ""
echo "=== 2. ¿Se eliminó la duplicación de §8? ==="
grep -n "## 8. Agregar una tool" docs/DEV_GUIDE.md

echo ""
echo "=== 3. ¿Está documentado 'where'? ==="
grep -n "where" docs/DEV_GUIDE.md | head -5

echo ""
echo "=== 4. ¿Menciona migrate_prompts? ==="
grep -n "migrate_prompts" docs/DEV_GUIDE.md
Esperado:

grep zzzzz: OK, no hay.

grep "## 8": 1 sola línea (sin duplicación).

grep where: 5+ líneas.

grep migrate_prompts: 1+ líneas.

