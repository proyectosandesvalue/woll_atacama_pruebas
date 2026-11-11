# Plataforma Territorial Water Oriented Living Lab Atacama

> Plataforma WebGIS territorial para la Región de Atacama, Chile, potenciada con Inteligencia Artificial.

> **Infraestructura (2026-11-10):** **Vercel + Supabase son solo demo/staging.** El despliegue final será un **VPS propio** (Node persistente + PostgreSQL/PostGIS/pgvector + Nginx + proxy persistente). Supabase está en el límite de almacenamiento y Vercel Hobby no alcanza para producción. Ver ADR 005 y Sprint 26.

![Version](https://img.shields.io/badge/version-2.1-blue.svg)
![License](https://img.shields.io/badge/license-Proprietary-red.svg)

## Qué es

Aplicación web interactiva para visualizar y analizar datos geoespaciales estratégicos de la Región de Atacama. Integra mapas WebGL de alto rendimiento con un asistente de IA que permite hacer consultas territoriales en lenguaje natural.

### Características

- **Visualización geoespacial** con Leaflet y render WebGL de polígonos (`Leaflet.glify`).
- **Asistente IA** conectado a Supabase (PostGIS): consultas reales vía tool calling, con gráficos automáticos en las respuestas.
- **Router determinístico** (Sprint 40-C): clasificador unificado + pipelines declarativos + paquete de evidencia. El código decide qué tools ejecutar; el LLM interpreta la intención y redacta desde la evidencia.
- **Golden set** (Sprint 40-D.3): 38 casos de prueba con `tier`, `intent_esperado` y `fuente_esperada`. Se corre con `npm run eval:chat` o `node scripts/run-golden-set.mjs --all`.
- **Configuración en BD** (Sprint 40-D.2): prompts, settings, mensajes y datos no disponibles viven en `admin.*`. Editables desde el panel admin (Sprint 15).
- **Capas WMS** (IDE Chile, CIREN) además de ~70 capas GeoJSON locales.
- **9 dimensiones de análisis + capas base:** Agua, Clima, Agricultura, Minería, Otros, Planificación Territorial, Riesgos, Suelo, Energía, y Capas base.
- **Búsqueda global semántica** con índice en memoria.
- **Tabla de atributos** con filtros, búsqueda y exportación (GeoJSON / CSV).
- **Tema claro/oscuro** y diseño responsive.
- **Web Workers** para procesar GeoJSON pesado, con fallback al hilo principal.

## Documentación

Antes de tocar código, lee:

- [Contrato de diseño y desarrollo](docs/CONTRACT.md) — reglas que no se rompen.
- [Arquitectura](docs/ARCHITECTURE.md) — cómo está armado el sistema hoy.
- [Guía de desarrollo](docs/DEV_GUIDE.md) — setup, comandos, flujo de trabajo, troubleshooting.
- [Roadmap](docs/ROADMAP.md) — plan de sprints y bitácora.
- [Decisiones (ADRs)](docs/DECISIONS/) — por qué se tomaron las decisiones clave.
- [Changelog](docs/CHANGELOG.md) — historial de cambios.
- [AGENTS.md](AGENTS.md) — guía técnica para agentes de IA.

## Ambientes

Hay dos ambientes con infraestructura aislada (producción y pruebas). El desarrollo se hace en **pruebas** (`woll_atacama_pruebas`, [wollatacamapruebas.vercel.app](https://wollatacamapruebas.vercel.app)) y se promueve a producción manualmente. Detalle en [ADR 003](docs/DECISIONS/003-ambientes.md) y [ADR 004](docs/DECISIONS/004-promocion-manual.md).

## Requisitos

- Navegador moderno con soporte de ES Modules.
- Node.js 20.6 o superior (los scripts de `scripts/` usan `--env-file`).
- Servidor HTTP (no abrir `index.html` con `file://` por CORS).
- Cuenta de Supabase y API key de un proveedor LLM para el chat IA.
- **Vertex AI**: `gcloud auth application-default login` en local, o Service Account en producción.

## Inicio rápido

```bash
git clone git@github.com:proyectosandesvalue/woll_atacama_pruebas.git
cd woll_atacama_pruebas
cp .env.example .env.staging   # completa los valores
npm install                    # dependencias del backend + ESLint
```

Las variables de entorno están documentadas en `.env.example` (única lista vigente).

Para correr en local:

```bash
npx http-server -p 8099   # visor sin chat → http://localhost:8099
npm run dev               # visor + chat + proxy Copernicus → http://localhost:3000
```

`npm run dev` levanta `vercel dev` y el proxy persistente de Copernicus en `http://localhost:3001/api/proxy`. Si prefieres levantarlos por separado:

```bash
npx vercel dev            # terminal 1
npm run dev:proxy         # terminal 2
```

El frontend local detecta que está en `localhost` y usa el proxy de 3001 en vez de una Function de Vercel por cada tile. En producción sigue usando `/api/proxy` relativo.

El visor funciona sin API keys: mapa, sidebar y leyenda operan con los GeoJSON locales. El chat necesita el backend (`vercel dev` o Vercel desplegado) y Vertex AI autenticado.

### PostgreSQL local (Sprint 26)

El entorno de referencia desde 26-C es PostgreSQL propio en Docker/Podman:

```bash
cp .env.example .env.local   # completar POSTGRES_PASSWORD, DATABASE_* y WOLL_*_PASSWORD
npm run db:up                # docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
npm run migrate              # aplica db/migrations/000-037
npm run migrate:status       # pendientes / aplicadas / cambiadas
npm run db:down
```

La base queda en `127.0.0.1:5432` (solo loopback). En el VPS no se publica:
queda en la red interna de Compose (26-D). Mientras 26-A no esté implementado,
el visor y el chat siguen usando `vercel dev` + Supabase para la demo.

## Estructura del proyecto

```text
woll_atacama_pruebas/
├── index.html, help.html       # SPA y manual de ayuda
├── api/chat.js                 # Vercel Function (handler delgado)
├── server/
│   ├── handlers/chat.js        # pipeline completo (handleChat)
│   ├── chat/                   # orchestrator, router, capabilities, tools/
│   ├── llm/                    # driver Vertex AI (OpenAI-compatible)
│   └── db/                     # driver REST de Supabase
├── db/migrations/              # migraciones SQL numeradas (NNN_nombre.sql)
├── scripts/                    # catálogo, smoke tests, golden set, prompts
├── js/
│   ├── app.js, script.js       # bootstrap y UI shell
│   ├── config/                 # una dimensión por archivo + WMS, capas base, aliases
│   ├── store/appState.js       # única fuente de verdad
│   ├── ui/, sidebar/, search/  # features
│   ├── utils/                  # motores (layerUtils, glifyAdapter, wmsUtils, ...)
│   └── workers/                # Web Workers
├── css/                        # base, components, desktop, mobile
├── geojson/                    # capas estáticas (~71)
├── assets/                     # iconos e imágenes
├── docs/                       # CONTRACT, ARCHITECTURE, DEV_GUIDE, ROADMAP, CHANGELOG, DECISIONS/
└── vercel.json, package.json
```

El mapa completo de carpetas y responsabilidades está en `docs/ARCHITECTURE.md`.

## Mapa de archivos y responsabilidades

| Archivo / carpeta | Para qué sirve | Cuándo tocarlo |
|---|---|---|
| `index.html`, `help.html` | Entry point de la SPA y manual de ayuda | Cambios de shell, carga de scripts o UI global |
| `api/chat.js` | Vercel Function del chat (adapter delgado) | Cambios de CORS/método del endpoint, no de lógica |
| `api/proxy.js` | Proxy cerrado de servicios externos | Agregar un servicio o ajustar CORS/timeout |
| `api/arclim-geojson.js`, `api/stations-*.js`, `api/variable-*.js` | Endpoints de datos climáticos/estaciones | Cambios de contrato o consultas de esos datos |
| `server/handlers/chat.js` | Pipeline completo de `handleChat()` | Cambios de flujo del chat |
| `server/chat/` | Orquestador, router, clasificador, tools, filtros | Cambios de comportamiento del chat |
| `server/llm/` | Driver LLM OpenAI-compatible / Vertex AI | Cambiar proveedor, modelo o fallback |
| `server/db/` | Driver de BD (`supabase`/`postgres`) | Cambiar transporte o conexión |
| `server/proxy/` | Allowlist, validación, caché y rate limit del proxy | Agregar servicios externos o límites |
| `server/rag/`, `server/embeddings/` | Ingesta RAG, chunking y embeddings | Cambios del pipeline documental |
| `js/app.js` | Bootstrap del mapa y tema inicial | Cambios de arranque del visor |
| `js/script.js` | UI shell: sidebars, tabs, chat, GetFeatureInfo | Cambios de interacción global |
| `js/config/` | Una dimensión por archivo + WMS, capas base y aliases | Agregar/quitar capas o servicios |
| `js/config/copernicusLayer.js` | Ficha común de capas satelitales Copernicus | Nuevos índices o cambios de ficha |
| `scripts/dev-proxy.mjs`, `js/config/proxy.js` | Proxy persistente para desarrollo local (3001) | Cambios del entorno local |
| `js/store/appState.js` | Única fuente de verdad del visor | Nuevo estado global o ciclo de capas |
| `js/sidebar/` | Render de dimensiones, grupos, capas y leyenda | Cambios de sidebar o controles por capa |
| `js/utils/layerUtils.js`, `glifyAdapter.js`, `wmsUtils.js` | Carga y render de capas | Cambios de render, WMS o filtros |
| `js/utils/legendUtils.js`, `externalServices.js`, `wmsFeatureInfo.js`, `copernicusDateSelector.js` | Leyenda, proxy cliente, GetFeatureInfo y fechas | Cambios de leyenda o consumo de servicios |
| `js/utils/attributeTableUtils.js`, `popupUtils.js`, `styleUtils.js` | Tabla, popups y estilos | Cambios de atributos o presentación |
| `js/workers/` | Procesamiento de GeoJSON fuera del hilo principal | Capas pesadas o nuevos procesamientos |
| `db/migrations/` | Migraciones SQL numeradas e idempotentes | Todo cambio de schema |
| `db/roles/` | Ejemplos de roles de login (no migración) | Altas de usuarios en el VPS |
| `scripts/` | CLI, smoke tests, golden set, ingesta | Automatizaciones y tareas operativas |
| `rag/` | Manifiesto y PDFs del corpus RAG | Agregar documentos |
| `docs/` | CONTRACT, ARCHITECTURE, DEV_GUIDE, ROADMAP, CHANGELOG, DECISIONS, specs | Antes de cambios estructurales |
| `css/`, `geojson/`, `assets/` | Estilos, capas estáticas e iconos | Cambios visuales o de datos locales |
| `vercel.json` | Functions, rewrites y `excludeFiles` | Cambios de deploy o endpoints |
| `package.json`, `.env.example` | Scripts/dependencias y variables de entorno | Nuevas tareas o configuración |

Regla práctica: si el cambio es de **comportamiento del sistema**, primero se escribe/actualiza la spec o ADR; si es de **datos**, va en `db/migrations/` + config; si es de **presentación**, va en `js/`/`css/`.

## Skills para agentes

Las skills son instrucciones reutilizables que OpenCode carga **solo cuando la tarea coincide** con su descripción. No se cargan todas en cada prompt.

- Ubicaciones: `.opencode/skills/<id>/SKILL.md` (local, en `.gitignore`), `~/.config/opencode/skills/` (global) y `.agents/skills/` (compatibilidad; este repo no la usa).
- El modelo ve `name` y `description` del frontmatter; el cuerpo se carga con la tool `skill` o mencionando `@skill-id`.
- El `README` no activa skills. Los triggers reales viven en el `description` de cada `SKILL.md` y, para reglas del proyecto, en `AGENTS.md`.

Skills disponibles hoy:

**Autoinvocables** (aparecen en la lista del modelo y se cargan cuando la tarea coincide):

| Skill | Cuándo usarla |
|---|---|
| `spec-writer` | Crear o actualizar specs de sprint con la estructura del proyecto |
| `manual` | Redactar manuales técnicos del visor (arquitectura, setup, despliegue) |
| `frontend-design` | Crear o rediseñar UI, sidebar, paneles, leyendas y chat |
| `accessibility` | Auditoría WCAG, teclado, lectores de pantalla y contraste |
| `nodejs-backend-patterns` | Endpoints, proxy, handlers, middleware, auth y acceso a datos |
| `nodejs-best-practices` | Decisiones de arquitectura Node, async, seguridad y performance |
| `seo` | Metadatos, indexabilidad, sitemap y datos estructurados |
| `javascript-pro` | JS/ESM, async, Web Workers, memoria y APIs de navegador/Node |
| `postgres-pro` | PostGIS, pgvector, EXPLAIN, índices, extensiones, VACUUM |
| `debugging-wizard` | Bugs, crashes, fuga de memoria, loops y stack traces |
| `security-reviewer` | Auditoría de secretos, SSRF, RLS, dependencias y vulnerabilidades |
| `rag-architect` | Chunking, embeddings, pgvector, búsqueda híbrida y evaluación RAG |
| `code-reviewer` | Revisar diffs/PR: bugs, seguridad, performance y tests |
| `architecture-designer` | ADRs, decisiones de arquitectura y trade-offs (VPS/plataforma) |
| `test-master` | Tests unitarios/integración/E2E con `node:test`, flaky tests y cobertura |

**Explícitas** (`metadata.opencode/autoinvoke: false`; se invocan con `@skill-id` o pidiéndolas por nombre):

| Skill | Cuándo invocarla |
|---|---|
| `api-designer` | Diseño REST/OpenAPI para el Sprint 19 (APIs/CRUD) |
| `devops-engineer` | Sprint 26: Docker Compose, Nginx, TLS, CI/CD y despliegue en VPS |
| `monitoring-expert` | Sprint 26: logs estructurados, healthchecks y alertas del VPS |
| `secure-code-guardian` | Auth, validación de input, OWASP y hardening (Sprints 15/16/26-H) |
| `sql-pro` | SQL complejo, CTEs, window functions; para Postgres usar `postgres-pro` |
| `the-fool` | Pre-mortem, red team o stress-test de una decisión grande |

**Built-in**

| Skill | Cuándo usarla |
|---|---|
| `opencode` | Configurar OpenCode, agentes, skills, plugins o MCP |
| `report` | Reportar bugs o problemas de OpenCode |

Las explícitas no aparecen en la lista automática para no competir con las de uso diario. Si el agente empieza a elegir skills de más, mover alguna autoinvocable a explícita con `metadata.opencode/autoinvoke: false`.

Para agregar una skill:

1. Copiarla a `.opencode/skills/<id>/SKILL.md`.
2. Asegurar un `description` claro que empiece con “Úsala cuando…”.
3. Si vive fuera de las rutas estándar, agregarla al array `skills` de `opencode.json`.
4. Si es una regla del proyecto, agregar el trigger en `AGENTS.md`.
5. Recargar con `/reload` si no aparece.

No conviene instalar decenas de skills a la vez: la lista que ve el modelo crece y aumenta el riesgo de elegir la equivocada. Instalar solo las que se usan en el proyecto.

## Tecnologías

Leaflet 1.9.4, Leaflet.glify, Leaflet.markerCluster, WebGL Heatmap, Turf.js (solo `bbox`), DOMPurify, Chart.js; Vanilla JS ES Modules y CSS custom properties. **Demo/staging:** Vercel Functions + Supabase (PostGIS) + Vertex AI. **Producción final:** VPS con Node persistente y PostgreSQL/PostGIS/pgvector (ADR 005). Versiones y detalle en `docs/ARCHITECTURE.md` §3.

## Configuración básica

- **Agregar una capa GeoJSON o WMS:** ver `docs/DEV_GUIDE.md` §7 y `AGENTS.md`.
- **Agregar una tool al chat:** ver `docs/DEV_GUIDE.md` §8.
- **Cambiar un prompt del chat:** cargarlo en `admin.prompt_templates` con `scripts/migrate_prompts.mjs`. Ver `AGENTS.md` y `docs/CONTRACT.md` §2.
- **Correr el golden set:** `CHAT_ROUTER_ENABLED=1 CHAT_UNAVAILABLE_ENABLED=1 npm run eval:chat`.

**Importante:** los alias se normalizan con `.toLowerCase().trim()` al hacer lookup.

## Despliegue

> **Vercel es solo demo/staging.** El despliegue final es un VPS propio (Sprint 26, ADR 005); no optimizar límites de Hobby como producción.

**Demo/staging:** push a `main` → Vercel despliega automáticamente (~30 s). Las variables de entorno se configuran en Vercel → Settings → Environment Variables (lista en `.env.example`).

**Producción final:** VPS con Node persistente, PostgreSQL/PostGIS/pgvector, Nginx/Caddy y proxy persistente. La promoción y el corte se definen en el Sprint 26/ADR 005.

Variables de entorno relevantes (ver `.env.example` para la lista completa):

- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` (o las `GCP_*` de Workload Identity Federation)
- `ORCHESTRATOR_BUDGET_MS`, `ORCHESTRATOR_MAX_ITERATIONS`
- `CHAT_VERBOSE`, `CHAT_GEOJSON_ENABLED`
- `CHAT_ROUTER_ENABLED`, `CHAT_ROUTER_MIN_CONFIDENCE`
- `CHAT_UNAVAILABLE_ENABLED`

## Contribuir

Proyecto privado. Hoy trabaja un solo desarrollador, por lo que se commitea directo a `main`; las ramas y PRs se introducirán cuando se sume más gente (ver `docs/DEV_GUIDE.md` §4.3).

Convención de commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`.

```bash
npm run lint            # objetivo: 0 errores
npm test                # tests con node:test
npm run migrate         # migraciones al PostgreSQL local
npm run migrate:status  # estado de migraciones
npm run db:up / db:down # PostgreSQL local en Docker/Podman
```

## Dimensiones disponibles

| Dimensión | Archivo de config | Notas |
|---|---|---|
| Agricultura | `js/config/agricultura.js` | Capas productivas |
| Agua | `js/config/agua.js` | Hidrografía, APR, desaladoras |
| Clima | `js/config/clima.js` | Zonas climáticas (Köppen), estaciones, ARClim |
| Energía | `js/config/energia.js` | Generación, transmisión |
| Minería | `js/config/mineria.js` | Yacimientos, faenas |
| Planificación | `js/config/planificacion.js` | PRC, IPT |
| Otros | `js/config/otros.js` | Áreas protegidas, turismo (WMS) |
| Suelo | `js/config/suelo.js` | Geomorfología |
| Riesgos | `js/config/riesgos.js` | Sismos, volcanes, remociones |
| Capas base | `js/config/capasBase.js` | Cartografía base |

## Troubleshooting

Ver `docs/DEV_GUIDE.md` §9 (el visor no carga, el chat no responde, Vercel bloquea el deploy, `.env.staging` en `git status`, golden set falla con "no puedo responder").

## Licencia y equipo

Propiedad de Atacama Andes Value. Todos los derechos reservados 2026.

- **Desarrollador:** Diego Velásquez
- **Cliente:** Atacama Andes Value

Versión 2.1 (octubre 2026). Historial completo en `docs/CHANGELOG.md`.