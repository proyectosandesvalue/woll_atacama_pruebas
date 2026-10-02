# Plataforma Territorial Water Oriented Living Lab Atacama

> Plataforma WebGIS territorial para la Región de Atacama, Chile, potenciada con Inteligencia Artificial.

![Version](https://img.shields.io/badge/version-2.0-blue.svg)
![License](https://img.shields.io/badge/license-Proprietary-red.svg)

---

## Qué es este proyecto?

La Plataforma Territorial Water Oriented Living Lab Atacama es una aplicación web interactiva para visualizar y analizar datos geoespaciales estratégicos de la Región de Atacama, Chile. Integra mapas WebGL de alto rendimiento con un asistente de IA context-aware que permite hacer consultas territoriales en lenguaje natural.

### Características principales

### Características principales

- **Visualización geoespacial** basada en Leaflet.js con renderizado WebGL (polígonos vía `Leaflet.glify`)
- **Asistente IA** conectado a Supabase (PostGIS): consultas reales a la BD vía tool-calling (Groq + Vercel Functions)
- **Gráficos automáticos** en las respuestas del chat (pie, barras, barras horizontales según cardinalidad)
- **Capas WMS** integradas (IDE Chile, CIREN) además de las capas GeoJSON locales
- **9 dimensiones de análisis** (Agua, Clima, Agricultura, Minería, Otros, Planificación Territorial, Riesgos, Suelo, Energía)
- **Búsqueda global semántica** con índice en memoria
- **Tema claro/oscuro** con tokens CSS intercambiables
- **Diseño responsive** para móviles y desktop con sidebars overlay
- **Web Workers** (`layerProcessor.worker.js`) para procesamiento GeoJSON fuera del hilo principal, con fallback al hilo principal si no están disponibles
- **Tabla de atributos** interactiva con filtros, búsqueda y export (GeoJSON / CSV)

## Demo

**Demo en vivo:** _(próximamente)_

---

## Requisitos Previos

- Navegador moderno (Chrome, Firefox, Safari, Edge) con soporte ES Modules
- Node.js >= 16.x (opcional — solo para `npm run lint`)
- Servidor HTTP estático (no abrir el `index.html` con `file://` por restricciones CORS)
- Cuenta de Supabase + API Key de un proveedor LLM (Groq) para el chat IA

---

## Inicio Rápido

### 1. Clona el repositorio

```bash
git clone https://github.com/atacama-andes-value/visor-atacama.git
cd visor-atacama

### 2. Configura las variables de entorno

El chat IA necesita Supabase + un proveedor LLM. Crea un archivo .env local
siguiendo .env.example:

# Base de datos
DB_DRIVER=supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# Proveedor LLM
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=openai/gpt-oss-120b
LLM_API_KEY=gsk_...
LLM_MAX_TOKENS=1024
LLM_TEMPERATURE=0.7

# Orquestador
ORCHESTRATOR_BUDGET_MS=8000
ORCHESTRATOR_MAX_ITERATIONS=1

El visor funciona sin la API Key: el sidebar de capas, el mapa y la
leyenda operan de forma totalmente local con los GeoJSON incluidos.
El chat IA necesita el backend desplegado (Vercel) o npx vercel dev.

3. Ejecuta localmente
Sin build step: cualquier servidor estático sirve el proyecto.

Opción A — con Python:

      python3 -m http.server 8099

Opción B — con Node:

      npx http-server -p 8099

Opción C — con vercel dev (necesario para el chat IA):

      npx vercel dev

4. Abre en tu navegador

      http://localhost:8099

Tecnologías
Frontend
Mapa: Leaflet.js 1.9.4

Render WebGL de polígonos: Leaflet.glify

Clustering de puntos: Leaflet.markercluster 1.5.3

Heatmap WebGL: webgl-heatmap (adaptado)

Geometría: Turf.js 6.5.0 (solo turf.bbox)

Sanitización: DOMPurify 3.0.3 (popups)

Gráficos del chat: Chart.js 4.4.0 (CDN)

UI: Vanilla JavaScript ES Modules, sin framework

Estilos: CSS3 con custom properties (tema claro/oscuro)

Tipografías: Montserrat + Open Sans (Google Fonts)

Iconos: Material Symbols Outlined

Procesamiento off-main-thread: Web Workers

Backend / API
Serverless: Vercel Functions (api/chat.js)

IA: Groq API (u otro proveedor OpenAI-compatible)

Base de datos: Supabase PostGIS (REST + RPCs)

Runtime: Node.js

Datos
Formato GeoJSON local: ~70 archivos en /geojson/ (on-demand)

Capas WMS externas: IDE Chile, CIREN (declaradas en js/config/wms_services.js)

Estructura del Proyecto
text
visor-atacama/
├── index.html                  # SPA entry point
├── help.html                   # Manual de ayuda
├── api/
│   └── chat.js                 # Vercel Function → orquestador
├── server/
│   ├── chat/
│   │   ├── orchestrator.js     # Ciclo tool-calling
│   │   ├── tools.js            # JSON-Schema de las 3 tools
│   │   └── runners.js          # Ejecutores + normalización de args
│   ├── llm/
│   │   ├── provider.js         # Factoría del driver LLM
│   │   ├── config.js
│   │   └── drivers/
│   │       └── openai-compatible.js
│   └── db/
│       ├── pool.js             # Factoría del driver BD
│       ├── config.js
│       └── drivers/
│           └── supabase.js
├── db/
│   └── migrations/
│       └── 001_chat_fase1.sql  # Esquema chat + RPCs
├── scripts/
│   ├── build_catalog.mjs       # Inventario de capas
│   ├── smoke-db.mjs
│   └── smoke-orchestrator.mjs
├── css/
│   ├── base.css                # Design tokens y reset
│   ├── components.css          # Componentes UI
│   ├── desktop.css             # Layout ≥ 769px
│   └── mobile.css              # Adaptaciones ≤ 768px
├── js/
│   ├── app.js                  # Bootstrap
│   ├── script.js               # initSidebarUI + initMobileUI
│   ├── config/                 # Configuración por dimensión
│   │   ├── agua.js
│   │   ├── agricultura.js│   │   ├── clima.js
│   │   ├── energia.js
│   │   ├── mineria.js
│   │   ├── otros.js
│   │   ├── planificacion.js
│   │   ├── riesgos.js
│   │   ├── suelo.js
│   │   ├── capasBase.js
│   │   ├── wms_services.js
│   │   ├── leyendaAliases.js
│   │   ├── allTemasConfig.js
│   │   └── constants.js
│   ├── store/
│   │   └── appState.js
│   ├── ui/                     # Handlers por feature
│   ├── utils/                  # Motores lógicos
│   │   ├── layerUtils.js       # cargarCapaIndividual, dataParaRender, WMS
│   │   ├── wmsUtils.js         # Resolución de servicios WMS
│   │   ├── glifyAdapter.js     # buildColorCallback con dataFilter
│   │   ├── attributeTableUtils.js
│   │   ├── chatAssistant.js    # Cliente de POST /api/chat
│   │   └── ...
│   ├── search/                 # Buscador global
│   ├── sidebar/                # Construcción del sidebar de capas
│   ├── workers/                # Web Workers
│   └── lib/
│       └── glify-browser.js
├── geojson/                    # ~70 archivos GeoJSON
├── assets/                     # Iconos e imágenes
├── vercel.json
├── AGENTS.md                   # Guía técnica interna
└── package.json                # Solo para lint

Arquitectura en una mirada
appState (js/store/appState.js) es la única fuente de verdad.

9 archivos de dimensión en js/config/ declaran cada capa.

Carga on-demand: una capa se descarga solo cuando el usuario la activa.

dataFilter se aplica antes del renderer: cargarCapaIndividual() crea dataParaRender filtrado para glify/heatmap/cluster/L.geoJson.

Web Worker procesa GeoJSON pesado fuera del hilo principal.

Asistente IA: el navegador ya no descarga 270 MB de GeoJSON en cada visita. La fase 1 consulta Supabase (PostGIS) en milisegundos vía tool-calling. Detalle en IMPLEMENTATION.md.

Para peculiaridades detalladas (alias, glify, dataFilter, WMS, etc.) consulta AGENTS.md.

Configuración Básica
Agregar una nueva capa GeoJSON
Coloca tu archivo .geojson en /geojson/.

Edita el archivo de dimensión correspondiente en /js/config/:

javascript
nueva_capa: {
  url: "mi_capa.geojson",
  type: "point",              // "point" | "line" | "polygon"
  renderer: "cluster",        // opcional
  alias: ["alias_1", "alias_2"],
  popupCampos: ["nombre", "descripcion"],
}
Recarga el navegador (no hay build step).

Agregar una nueva capa WMS
Declara el servicio en js/config/wms_services.js:

javascript
servicios: {
  mi_servicio: {
    url: "https://servidor/wms",
    layers: "capa:nombre",
    format: "image/png",
    transparent: true,
    version: "1.3.0",
    attribution: "Fuente",
    nombre: "Nombre visible",
  },
}
En el archivo de dimensión, agrega la capa con tipo: 'wms':

javascript
mi_capa_wms: {
  tipo: "wms",
  servicio: "mi_servicio",
  nombrePersonalizado: "Nombre visible",
  opacity: 0.8,
}
Recarga el navegador.

Importante: los alias deben normalizarse con .toLowerCase().trim() al hacer lookup (ver AGENTS.md).

Bitácora de implementación
El detalle de cada fase implementada vive en IMPLEMENTATION.md: archivos tocados, decisiones, configuración de variables de entorno, instrucciones de deploy, troubleshooting y fases futuras. Ese documento es la fuente de verdad para cambios grandes.

Despliegue en Vercel
Despliegue automático
Conecta el repositorio en vercel.com.

Configura variables de entorno (Settings → Environment Variables):

text
DB_DRIVER=supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=openai/gpt-oss-120b
LLM_API_KEY=gsk_...
LLM_MAX_TOKENS=1024
LLM_TEMPERATURE=0.7
ORCHESTRATOR_BUDGET_MS=8000
ORCHESTRATOR_MAX_ITERATIONS=1
Despliega:

Vercel detecta api/*.js como Serverless Functions.

vercel.json configura los rewrites y excluye geojson/** del bundle.

Despliegue manual
bash
npm install -g vercel
vercel --prod
Contribuir
Este es un proyecto privado del equipo de Atacama Andes Value. Si eres parte del equipo:

Crea una rama desde develop

Realiza tus cambios

Abre un Pull Request hacia develop

Convenciones de commits
text
feat: Nueva funcionalidad
fix: Corrección de bug
docs: Cambios en documentación
style: Cambios de formato
refactor: Refactorización
perf: Mejoras de rendimiento
test: Tests
Linting
bash
npm run lint   # ESLint sobre js/ — objetivo: 0 errors
No hay build step ni tests automatizados.

Dimensiones Disponibles
Dimensión	Archivo de config	Notas
Agricultura	js/config/agricultura.js	Capas productivas
Agua	js/config/agua.js	Hidrografía, APR, desaladoras
Clima	js/config/clima.js	Zonas climáticas (Köppen)
Energía	js/config/energia.js	Generación, transmisión
Minería	js/config/mineria.js	Yacimientos, faenas
Planificación	js/config/planificacion.js	PRC, IPT
Otros	js/config/otros.js	Áreas protegidas, turismo (WMS)
Suelo	js/config/suelo.js	Geomorfología
Riesgos	js/config/riesgos.js	Sismos, volcanes, remociones
Capas Base	js/config/capasBase.js	Cartografía base
Troubleshooting
El mapa no carga
Verifica la consola del navegador (F12).

Asegúrate de estar usando un servidor HTTP (http://...), nunca file://.

Confirma que /geojson/ esté accesible.

El chat IA no responde
Verifica que las variables SUPABASE_* y LLM_* estén configuradas.

Revisa los Runtime Logs de la Function en Vercel.

Si ves 501 Not Implemented localmente: usa npx vercel dev.

Las capas WMS no se ven
Verifica que el servicio en la config de la capa exista en wms_services.js.

Comprueba que el servidor WMS externo esté accesible.

Las capas no se filtran en el mapa
Verifica que cargarCapaIndividual() aplique dataFilter al dataParaRender antes de invocar el renderer.

Errores de CORS
Asegúrate de estar ejecutando un servidor HTTP, no abriendo el archivo con file://.

Licencia
Propiedad de Atacama Andes Value
Todos los derechos reservados 2026

Equipo
Desarrollador: Diego Velásquez
Cliente: Atacama Andes Value
Contacto: diegovelasquezf@gmail.com

### v2.0 (Septiembre 2026)
- Refactorización completa desde la base IFI Atacama original.
- Migración a Leaflet.glify para render WebGL de polígonos.
- Integración de Web Worker para GeoJSON pesado.
- Asistente IA conectado a Supabase (Groq + Vercel Functions).
- Tabla de atributos interactiva con filtros, búsqueda y export.
- Tema claro/oscuro unificado mediante custom properties.
- Sidebars con comportamiento coherente (overlay en móvil, grid en escritorio).
- Buscador global semántico en memoria.
- **Soporte WMS** para servicios externos (IDE Chile, CIREN).
- **Correcciones Sprint 1**: XSS en popups y etiquetas, WMS loader, síntesis del chat, timeout real en `fetch`.
- **Correcciones Sprint 2**: validación defensiva de args del LLM, tiempo de espera en RPCs, tabla de atributos que restaura el sidebar.
- **Sprint 3**: `.env.example` y `.gitignore` alineados con los defaults del código. Archivos de sesión/agente fuera del repo.
- **Sprint 4**: `api/**/*.js` en Vercel, `Worker` con fallback, sin `alert()` bloqueantes, `mapUtils` corregido.
- **Sprint 5**: tipos de chart (`pie`/`bar`/`horizontalBar`), botón "limpiar conversación", índice de búsqueda cancelable, sanitización de paths de iconos.

v1.x (basado en diegoxkaf/visor_woll_atacama)
Versión inicial para la Región de Atacama.

Versión: 2.0
Última Revisión: Septiembre 2026

