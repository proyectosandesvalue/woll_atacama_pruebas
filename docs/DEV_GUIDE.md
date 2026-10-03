# DEV_GUIDE.md — Guía para desarrolladores

> Cómo trabajar en el proyecto desde cero: setup, comandos, flujo de trabajo, troubleshooting.
> Última revisión: 2026-10-02.

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

### 2.3. Configurar identidad de git
Una sola vez en tu máquina:

git config --global user.name "Tu Nombre"
git config --global user.email "tu-email@dominio.com"

Importante: el email debe ser el mismo que tenés registrado y verificado en GitHub. Si no, Vercel bloquea los deploys (ver ADR 001).

### 2.4. Crear .env.staging
Copiá .env.example a .env.staging y completá los valores:

cp .env.example .env.staging

Editá .env.staging con los valores reales:

SUPABASE_URL y SUPABASE_SERVICE_KEY de Supabase staging.

LLM_API_KEY de Groq (o el proveedor que uses).

.env.staging está en .gitignore. NUNCA se sube a GitHub.

### 2.5. Instalar dependencias

npm install

Solo instala ESLint (dev dependency). El runtime no tiene dependencias npm.

3. Comandos útiles
3.1. Desarrollo local
Opción A — servidor estático (más simple, sin backend):

npx http-server -p 8099

Abrí http://localhost:8099. El visor funciona, pero el chat no (el endpoint /api/chat no existe local).

Opción B — Vercel CLI (con backend):

npx vercel dev

Abrí http://localhost:3000. El chat funciona porque Vercel CLI levanta las Functions localmente.

Recomiendo Opción B si vas a tocar el chat.

3.2. Lint

npm run lint

Si tenés errores, corregilos antes de commitear.

3.3. Tests (cuando existan)

npm test

(A definir cuando agreguemos node:test.)

3.4. Poblar el catálogo del chat
Cuando agregues capas nuevas a Supabase, corré:

node --env-file=.env.staging scripts/build_catalog.mjs

Esto hace UPSERT de todas las capas declaradas en js/config/allTemasConfig.js en chat.chat_catalog.

3.5. Smoke tests

# Test de conexión a la BD
node --env-file=.env.staging scripts/smoke-db.mjs

# Test end-to-end del orquestador
node --env-file=.env.staging scripts/smoke-orchestrator.mjs "¿cuántas plantas desaladoras hay?"

4. Flujo de trabajo
4.1. Antes de escribir código
Preguntate:

¿Este cambio afecta la estructura del sistema? → ADR + validar con el contrato.

¿Agrega un endpoint? → Escribir el contrato en docs/ primero.

¿Toca datos? → Escribir el schema primero.

¿Es solo un fix? → Verificar que no rompe nada existente.

4.2. Desarrollo
1. Actualizá main:

git checkout main
git pull origin main

2. Hacé el cambio. Commits atómicos con mensaje claro:

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
# Ejemplo: 007_chat_upsert_layer.sql

# Crear el siguiente
touch db/migrations/008_mi_migracion.sql
Reglas:

Nombre: NNN_descripcion_corta.sql (3 dígitos, sin saltos).

Idempotente (IF NOT EXISTS, CREATE OR REPLACE).

Nunca borrar datos sin backup.

Nunca editar una migración ya aplicada. Si hace falta un cambio, crear una nueva.

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

Re-correr build_catalog.mjs.

8. Agregar una tool al chat
(Actualmente las tools viven en server/chat/tools.js — 3 archivos grandes. Refactor futuro: una tool por archivo.)

Mientras tanto:

Agregar el JSON-Schema en TOOL_DEFINITIONS (server/chat/tools.js).

Agregar el runner en TOOL_RUNNERS (server/chat/runners.js).

Si toca BD, agregar la RPC en una migración nueva.

Documentar la tool en el SYSTEM_PROMPT del orquestador.

Probar con smoke-orchestrator.mjs.

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
10. Recursos
Contrato: docs/CONTRACT.md

Arquitectura: docs/ARCHITECTURE.md

Decisiones: docs/DECISIONS/*.md

Manual de usuario: help.html

Referencia externa:

Leaflet docs : https://leafletjs.com/reference.html

Supabase docs: https://supabase.com/docs

Groq docs: https://console.groq.com/docs

PostGIS docs: https://postgis.net/documentation/





