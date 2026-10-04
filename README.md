# Plataforma Territorial Water Oriented Living Lab Atacama

> Plataforma WebGIS territorial para la Región de Atacama, Chile, potenciada con Inteligencia Artificial.

![Version](https://img.shields.io/badge/version-2.0-blue.svg)
![License](https://img.shields.io/badge/license-Proprietary-red.svg)

## Qué es

Aplicación web interactiva para visualizar y analizar datos geoespaciales estratégicos de la Región de Atacama. Integra mapas WebGL de alto rendimiento con un asistente de IA que permite hacer consultas territoriales en lenguaje natural.

### Características

- **Visualización geoespacial** con Leaflet y render WebGL de polígonos (`Leaflet.glify`).
- **Asistente IA** conectado a Supabase (PostGIS): consultas reales vía tool calling, con gráficos automáticos en las respuestas.
- **Capas WMS** (IDE Chile, CIREN) además de ~70 capas GeoJSON locales.
- **9 dimensiones de análisis:** Agua, Clima, Agricultura, Minería, Otros, Planificación Territorial, Riesgos, Suelo y Energía.
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
- [Changelog](CHANGELOG.md) — historial de cambios.
- [AGENTS.md](AGENTS.md) — guía técnica para agentes de IA.

## Ambientes

Hay dos ambientes con infraestructura aislada (producción y pruebas). El desarrollo se hace en **pruebas** (`woll_atacama_pruebas`, [wollatacamapruebas.vercel.app](https://wollatacamapruebas.vercel.app)) y se promueve a producción manualmente. Detalle en [ADR 003](docs/DECISIONS/003-ambientes.md) y [ADR 004](docs/DECISIONS/004-promocion-manual.md).

## Requisitos

- Navegador moderno con soporte de ES Modules.
- Node.js 18 o superior.
- Servidor HTTP (no abrir `index.html` con `file://` por CORS).
- Cuenta de Supabase y API key de un proveedor LLM para el chat IA.

## Inicio rápido

```bash
git clone git@github.com:proyectosandesvalue/woll_atacama_pruebas.git
cd woll_atacama_pruebas
cp .env.example .env.staging   # completa los valores
npm install                    # solo instala ESLint
```

Las variables de entorno están documentadas en `.env.example` (única lista vigente).

Para correr en local:

```bash
npx http-server -p 8099   # visor sin chat → http://localhost:8099
npx vercel dev            # visor + chat IA → http://localhost:3000
```

El visor funciona sin API keys: mapa, sidebar y leyenda operan con los GeoJSON locales. El chat necesita el backend (`vercel dev` o Vercel desplegado).

## Estructura del proyecto

```text
woll_atacama_pruebas/
├── index.html, help.html       # SPA y manual de ayuda
├── api/chat.js                 # Vercel Function (handler delgado)
├── server/
│   ├── chat/                   # orchestrator, runners, tools/ (una por archivo), filtros
│   ├── llm/                    # driver LLM OpenAI-compatible
│   └── db/                     # driver REST de Supabase
├── db/migrations/              # migraciones SQL numeradas (NNN_nombre.sql)
├── scripts/                    # catálogo, smoke tests
├── js/
│   ├── app.js, script.js       # bootstrap y UI shell
│   ├── config/                 # una dimensión por archivo + WMS, capas base, aliases
│   ├── store/appState.js       # única fuente de verdad
│   ├── ui/, sidebar/, search/  # features
│   ├── utils/                  # motores (layerUtils, glifyAdapter, wmsUtils, ...)
│   └── workers/                # Web Workers
├── css/                        # base, components, desktop, mobile
├── geojson/                    # capas estáticas (~70)
├── assets/                     # iconos e imágenes
├── docs/                       # CONTRACT, ARCHITECTURE, DEV_GUIDE, ROADMAP, DECISIONS/
└── vercel.json, package.json
```

El mapa completo de carpetas y responsabilidades está en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Tecnologías

Leaflet 1.9.4, Leaflet.glify, Leaflet.markerCluster, WebGL Heatmap, Turf.js (solo `bbox`), DOMPurify, Chart.js; Vanilla JS ES Modules y CSS custom properties; Vercel Functions, Supabase (PostGIS) y un LLM OpenAI-compatible. Versiones y detalle en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §3.

## Configuración básica

- **Agregar una capa GeoJSON o WMS:** ver [`docs/DEV_GUIDE.md`](docs/DEV_GUIDE.md) §7 y [`AGENTS.md`](AGENTS.md).
- **Importante:** los alias se normalizan con `.toLowerCase().trim()` al hacer lookup.

## Despliegue

Push a `main` → Vercel despliega automáticamente (~30 s). Las variables de entorno se configuran en Vercel → Settings → Environment Variables (lista en `.env.example`). La promoción a producción sigue el [ADR 004](docs/DECISIONS/004-promocion-manual.md).

## Contribuir

Proyecto privado. Hoy trabaja un solo desarrollador, por lo que se commitea directo a `main`; las ramas y PRs se introducirán cuando se sume más gente (ver `docs/DEV_GUIDE.md` §4.3).

Convención de commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`.

```bash
npm run lint   # objetivo: 0 errores
npm test       # tests con node:test
```

## Dimensiones disponibles

| Dimensión | Archivo de config | Notas |
|---|---|---|
| Agricultura | `js/config/agricultura.js` | Capas productivas |
| Agua | `js/config/agua.js` | Hidrografía, APR, desaladoras |
| Clima | `js/config/clima.js` | Zonas climáticas (Köppen) |
| Energía | `js/config/energia.js` | Generación, transmisión |
| Minería | `js/config/mineria.js` | Yacimientos, faenas |
| Planificación | `js/config/planificacion.js` | PRC, IPT |
| Otros | `js/config/otros.js` | Áreas protegidas, turismo (WMS) |
| Suelo | `js/config/suelo.js` | Geomorfología |
| Riesgos | `js/config/riesgos.js` | Sismos, volcanes, remociones |
| Capas base | `js/config/capasBase.js` | Cartografía base |

## Troubleshooting

Ver [`docs/DEV_GUIDE.md`](docs/DEV_GUIDE.md) §9 (el visor no carga, el chat no responde, Vercel bloquea el deploy, `.env.staging` en `git status`).

## Licencia y equipo

Propiedad de Atacama Andes Value. Todos los derechos reservados 2026.

- **Desarrollador:** Diego Velásquez
- **Cliente:** Atacama Andes Value

**Versión 2.0** (septiembre 2026). Historial completo en [`CHANGELOG.md`](CHANGELOG.md).