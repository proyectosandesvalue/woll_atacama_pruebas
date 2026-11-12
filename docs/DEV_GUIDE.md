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
Importante: el email debe ser el mismo que tenés registrado y verificado en GitHub. Si no, Vercel bloquea los deploys (ver ADR 001).

2.4. Crear .env.staging
Copiá .env.example a .env.staging y completá los valores:

bash
cp .env.example .env.staging
Editá .env.staging con los valores reales:

SUPABASE_URL y SUPABASE_SERVICE_KEY de Supabase staging.

LLM_API_KEY del proveedor (Vertex, Groq, o el que uses).

GOOGLE_APPLICATION_CREDENTIALS_JSON (si usás Vertex AI en local).

.env.staging está en .gitignore. NUNCA se sube a GitHub.

2.5. Instalar dependencias
bash
npm install
Instala ESLint (dev) y las dependencias de runtime (`pg`, Vertex AI, `csv-parser`).

### 2.6. PostgreSQL local (Sprint 26)

Desde 26-C el entorno de referencia es Docker/Podman + PostgreSQL 17 con
PostGIS y pgvector. La demo Vercel + Supabase queda congelada.

1. Copiá `.env.example` a `.env.local` y completá:
   - `POSTGRES_PASSWORD`
   - `DATABASE_URL` (rol `woll_api`)
   - `DATABASE_ADMIN_URL` (rol `postgres`, solo migraciones)
   - `WOLL_API_PASSWORD`, `WOLL_INGEST_PASSWORD`
2. Levantá la base:

```bash
npm run db:up
```

3. Aplicá las migraciones (idempotente):

```bash
npm run migrate
npm run migrate:status
npm run check:rpcs
npm run audit:db
```

4. Habilitá los roles de login (una vez por base):

```bash
./scripts/bootstrap-roles.sh
```

5. Para bajar la base:

```bash
npm run db:down
```

La base escucha solo en `127.0.0.1:5432` con `docker-compose.dev.yml`. En el VPS
no se publica: queda en la red interna de Compose. Si usás Podman sin Compose,
podés levantar el contenedor equivalente con `podman run` o instalar
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
- Si recreás solo el contenedor `api` en desarrollo, reiniciá Nginx
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

**Opción B — Vertex AI (igual que Vercel).** Necesita credenciales dentro del
contenedor: `GOOGLE_APPLICATION_CREDENTIALS_JSON` en `.env.local` o un archivo
ADC montado. No alcanza con tener `gcloud` en el host.

```bash
LLM_PROVIDER=vertex-ai
GOOGLE_CLOUD_PROJECT=woll-atacama-staging
GOOGLE_CLOUD_LOCATION=global
LLM_MODEL=gemini-3.1-flash-lite
GOOGLE_APPLICATION_CREDENTIALS_JSON='{"type":"service_account",...}'
```

El módulo de embeddings actual solo soporta `openai-compatible`; para Vertex
habría que agregar un driver `vertex-ai`.

Después de editar `.env.local`, recrear el contenedor API (no alcanza con
`restart`, porque `env_file` se lee al crear):

```bash
podman-compose -p woll_local --env-file /tmp/woll-local.env \
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
el repo**. Exportá `SOURCE_DATABASE_URL` solo en la sesión.

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
Abrí http://localhost:8099. El visor funciona, pero el chat no (el endpoint /api/chat no existe local).

Opción B — Vercel CLI (con backend):

bash
npx vercel dev
Abrí http://localhost:3000. El chat funciona porque Vercel CLI levanta las Functions localmente.

Recomiendo Opción B si vas a tocar el chat. Para probar el servidor del VPS sin
el frontend, usá `npm run dev:api` (también en 3000).

La forma más simple es:

```bash
npm run dev
```

Levanta `vercel dev` y el proxy persistente de Copernicus en `http://localhost:3001/api/proxy`. Si querés levantarlos por separado:

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
Si tenés errores, corregilos antes de commitear.

3.3. Tests
bash
npm test
Tests con node:test. Los tests están en server/chat/__tests__/.

3.4. Poblar el catálogo del chat
Cuando agregues capas nuevas a Supabase, corré:

bash
node --env-file=.env.staging scripts/build_catalog.mjs
Esto hace UPSERT de todas las capas declaradas en js/config/allTemasConfig.js en chat.chat_catalog.

3.5. Cargar los prompts del chat en la BD
Cuando cambies SYSTEM_PROMPT_BASE o CLASSIFIER_SYSTEM_PROMPT en el código, corré:

bash
node --env-file=.env.staging scripts/migrate_prompts.mjs
Esto carga los 2 prompts en admin.prompt_templates (versionado, idempotente). No se puede editar un prompt sin pasar por este script o por el panel admin (Sprint 15).

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
El runner imprime en el header: modelo, flags, versiones de prompt. Cada corrida es reproducible.

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
Actualizá main:

bash
git checkout main
git pull origin main
Hacé el cambio. Commits atómicos con mensaje claro:

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
Vercel deploya automáticamente (~30s). Esperá a que esté Ready.

Verificá en el navegador:

text
https://wollatacamapruebas.vercel.app
4.3. Cuándo crear rama
Hoy: como sos vos solo, commiteás directo a main. Simple.

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
Si vas a tocar...	Mirá esto
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
Abrí el SQL Editor del proyecto Supabase correspondiente.

Pegá el contenido.

Run.

Verificá que no haya errores.

6.3. Después de aplicar
Si la migración agrega/modifica RPCs:

sql
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
PostgREST tarda ~10s en recargar el schema. Si tu RPC no aparece inmediatamente, esperá.

7. Agregar una capa nueva al visor
Colocá el .geojson en geojson/.

Agregá la config en js/config/<dimension>.js:

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
Agregá el nombre en el array capas: de la dimensión.

Si la capa va dentro de un grupo, agregala al array del grupo.

Recargá el navegador. No hay build step.

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
Abrí consola del navegador (F12) → Console → buscá errores.

Verificá que estás sirviendo con HTTP (no file://).

Confirma que /geojson/ es accesible.

El chat no responde
Verificá que las env vars están cargadas en Vercel.

Revisá Deployments → último → Functions → chat → logs.

Si dice "Variable de entorno requerida no configurada: X", agregala.

Si dice "Supabase RPC X falló (404)", alguna migración falta.

Si dice "LLM 401", la LLM_API_KEY está mal.

Si dice "invalid_rapt", corré gcloud auth application-default login (Vertex AI).

Vercel bloquea el deploy
Error: "The deployment was blocked because the commit email X could not be matched to a GitHub account".

Causa: el email de git no está verificado en GitHub.

Fix:

Corregí git config user.email (debe ser el email verificado en GitHub).

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
Si los casos de Tier 3/4 fallan con "no puedo responder", es porque CHAT_UNAVAILABLE_ENABLED=0 (default). Corré con:

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

---

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

