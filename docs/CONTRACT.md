# CONTRACT.md — Contrato de diseño y desarrollo

> **Este documento define las reglas que no se rompen.**
> Si algo del código contradice este contrato, hay que decidir cuál de los dos cambia.
> Última revisión: 2026-10-02.

---

## 1. Principios generales

**1.1. Estabilidad primero.** El visor en producción **nunca se rompe**. Toda feature nueva se desarrolla en el repo de pruebas, se valida, y después se promueve manualmente a producción.

**1.2. Configuración explícita.** Todo lo configurable vive en un único lugar. Si una opción se puede cambiar desde 2 sitios, uno está mal.

**1.3. Un recurso, un lugar.** Una capa, una dimensión, una tool, un documento: cada uno vive en un único sitio canónico. Sin duplicación.

**1.4. Código y datos separados.** El código define estructura. Los datos definen contenido. Nunca al revés.

**1.5. Todo lo que no se testea, se rompe.** Cada feature nueva trae al menos un test que valida su comportamiento.

**1.6. Documentar la decisión, no el código.** El código dice "cómo". Los ADRs dicen "por qué".

---

## 2. Los tres planos de configuración

| Plano | Qué contiene | Dónde vive | Quién lo cambia |
|---|---|---|---|
| **Estructura** | Dimensiones, capas, tools, integraciones (definición) | Código | Dev |
| **Datos** | Valores, colores, alias, textos, PDFs | BD (futuro: `admin.*`) | Operador (futuro: vía panel) |
| **Secretos e infra** | API keys, URLs, config Vercel | Env vars | Dev |

**Regla de oro**: si dudás de qué plano corresponde algo, preguntate "¿esto requiere cambiar código para que funcione?". Si sí → Plano 1. Si no → Plano 2. Si es un secreto → Plano 3.

**Estado actual**: los planos 1 y 2 viven ambos en código. La migración del plano 2 a BD se hará cuando exista el panel admin. Mientras tanto, el operador no existe: todo lo cambia el dev.

---

## 3. Estructura de carpetas (objetivo)
woll_atacama_pruebas/
├── api/ ← Vercel Functions (endpoints públicos)
│ └── chat.js
├── assets/ ← imágenes, íconos, logos
├── css/ ← estilos
├── db/
│ └── migrations/ ← migraciones SQL numeradas
├── docs/ ← este contrato y ADRs
│ └── DECISIONS/
├── geojson/ ← capas estáticas (se irán migrando a BD)
├── js/ ← frontend
│ ├── config/
│ ├── lib/
│ ├── search/
│ ├── sidebar/
│ ├── store/
│ ├── ui/
│ ├── utils/
│ └── workers/
├── scripts/ ← scripts Node (migraciones, smoke tests)
├── server/ ← backend modular
│ ├── chat/
│ │ ├── orchestrator.js
│ │ ├── runners.js
│ │ └── tools.js
│ ├── db/
│ │ ├── config.js
│ │ ├── pool.js
│ │ └── drivers/
│ └── llm/
│ ├── config.js
│ ├── provider.js
│ └── drivers/
├── index.html
├── help.html
├── package.json
├── vercel.json
└── README.md


**Migración**: la estructura se migra **por feature**, no de golpe. Cuando toque agregar `services/`, `packages/`, `apps/`, se hace en la feature que lo requiera.

---

## 4. Reglas de código

**4.1. Lenguaje**
- Backend y packages: JavaScript ESM con JSDoc.
- Frontend: JS ESM.
- Sin TypeScript por ahora.

**4.2. Naming**
- Variables y funciones: `camelCase`. En inglés para términos técnicos (`getLayer`, `parseQuery`). En español solo para términos de dominio sin traducción clara (`capa`, `dimension`).
- Constantes: `SCREAMING_SNAKE_CASE`.
- Archivos técnicos: `kebab-case.js` (ej. `layer-utils.js`).
- Clases y componentes: `PascalCase.js`.

**4.3. Estructura de archivos**
- Un archivo, una responsabilidad.
- Si un archivo pasa las 300 líneas → dividir.
- Si una función pasa las 50 líneas → dividir.
- Comentarios: solo cuando explican **por qué**, no **qué**.

**4.4. Imports**
- Orden: (1) externos, (2) internos del proyecto, (3) relativos.
- Sin imports circulares.
- Imports estáticos siempre que sea posible. `import()` dinámico solo por razón técnica (lazy loading, romper ciclos).

**4.5. Manejo de errores**
- Nunca `catch` vacío. Si capturás, logueás o manejás.
- Errores de infra (red, BD, LLM) → logs detallados en server. Respuesta genérica al usuario.
- **Nunca** devolver `err.message` crudo al cliente en producción.

**4.6. Async/await**
- Preferir `async/await` sobre `.then()`.
- `Promise.all` para paralelo independiente.
- `Promise.allSettled` cuando algunos pueden fallar sin invalidar el resto.
- Timeouts explícitos en cualquier llamada a servicio externo.

---

## 5. Reglas de datos

**5.1. Migraciones**
- Todo cambio de schema va en `db/migrations/NNN_nombre.sql`.
- Numeración consecutiva, sin saltos.
- Idempotentes (`IF NOT EXISTS`, `CREATE OR REPLACE`).
- Una migración nunca borra datos sin backup previo.
- Migración aplicada en Supabase **antes** del deploy del código que la usa.
- **Nunca** editar una migración ya aplicada. Se crea una nueva.

**5.2. RLS**
- Toda tabla expuesta por la API tiene RLS activo.
- `service_role` bypasea RLS. Todo lo demás NO.
- Escritura solo por `service_role` desde el backend, nunca desde el frontend.
- El frontend solo lee datos públicos (endpoint cacheado).

**5.3. Contratos de API**
- Todo endpoint devuelve `{ ok: boolean, data?: any, error?: string }`.
- Nunca devolver estructuras "raw" de la BD sin normalizar.
- Versionado: si un endpoint cambia de contrato, se versiona (`/api/v2/...`) o se mantienen ambos durante una transición.

**5.4. Validación**
- Todo input del usuario se valida antes de llegar a la BD.
- Todo output de la BD se valida antes de llegar al usuario.

---

## 6. Reglas del chat

**6.1. Contrato de respuesta**

```json
{
  "reply": "string",
  "notice": "string | null",
  "chart": { ... } | null,
  "charts": [ ... ],
  "geojson": { "type": "FeatureCollection", "features": [...] } | null,
  "citations": [ ... ]
}

Reglas:

- reply siempre presente (nunca vacío).
- chart, geojson, citations opcionales. null si no aplican.
- El frontend tolera todos los campos ausentes.
- Cualquier cambio al contrato requiere actualizar frontend y backend en el mismo commit.
**Reglas del campo `notice`**:
- Es un aviso determinístico generado por el **backend**, no por el LLM.
- Uso actual: informar truncado de resultados geoespaciales
  ("Mostrando 500 de 600 resultados en el mapa.").
- El frontend lo renderiza destacado, debajo del `reply`.
- Si no hay aviso, es `null`.

6.2. Tools

- Una tool = un archivo en server/chat/tools/ .
- Cada archivo exporta { schema, run }.
- El registro (`tools/index.js`) solo lista archivos, no define lógica.
- Agregar una tool = 1 archivo nuevo + 1 línea en el registro.

**Tools actuales (9)**: `get_layer_stats`, `get_layer_schema`, `query_layer`, `aggregate_layer`, `aggregate_by_admin`, `aggregate_by_admin_and_column`, `count_near_layer`, `aggregate_near_layer`, `get_layer_features`.

**Reglas del contrato de gráficos**:
- `charts` (plural) es el campo canónico. Contiene 0, 1 o varios gráficos.
- `chart` (singular) se mantiene **solo por compatibilidad** durante la transición.
  - Si hay 1 chart: `chart` = ese chart, `charts` = `[ese chart]`.
  - Si hay 0 o 2+: `chart` = `null`, `charts` = lista completa.
- El frontend debe usar `charts` si está presente y no vacío, sino `chart`.
- Cuando se estabilice la migración, `chart` se eliminará.

### 6.2.1. Gráficos

- Agregaciones simples (`aggregate_layer`, `aggregate_by_admin`,
  `aggregate_near_layer`) → el frontend dibuja 1 chart.
- Doble agrupación (`aggregate_by_admin_and_column`) → NO se dibuja chart.
  El LLM presenta tabla markdown en el `reply`.
- Máximo 3 charts totales por respuesta.
- Máximo 2 charts por `get_layer_schema`.
- Filtro de relevancia: se descartan columnas con IDs, nombres o valores
  concentrados (>90% en un solo valor).

6.3. Cero SQL generado por el LLM

El LLM nunca escribe SQL.

Todas las tools invocan RPCs tipadas en Supabase.

Los args del LLM se normalizan defensivamente antes de tocar la BD.

### 6.4 — Regla de cobertura de datos

Cuando una respuesta del chat dependa de una columna con cobertura incompleta,
la respuesta debe declarar explícitamente:

- El total de filas consideradas.
- Cuántas tienen el dato informado.
- Cuántas no lo tienen ("Sin información", NULL, etc.).

Ejemplo:
> "De los 920 derechos de agua, 375 tienen uso declarado.
> De esos 375: 240 para riego, 66 otros usos, 33 minería, 31 consumo humano, 5 industrial.
> Los 545 restantes no tienen uso informado en la fuente."

Esta regla aplica cuando la cobertura es < 95%. Evita que el LLM responda
como si los 920 tuvieran uso declarado.

### 6.5 — Regla de cobertura de datos

Cuando una respuesta del chat dependa de una columna con cobertura < 95%,
la respuesta debe declarar explícitamente:

- El total de filas consideradas.
- Cuántas tienen el dato informado.
- Cuántas no lo tienen.

Ejemplo:
> "De los 920 derechos de agua, 375 tienen uso declarado: 240 riego,
> 66 otros usos, 33 minería, 31 consumo humano, 5 industrial.
> Los 545 restantes no tienen uso informado en la fuente."

Esta regla aplica a: `derechos_agua_2025.Uso del Agua` (41% cobertura),
y cualquier otra columna con cobertura < 95% detectada en Sprint 37.

7. Reglas del frontend
7.1. Consumo de configuración

El visor no lee archivos JS de config en runtime. (Estado actual: sí los lee; se migrará a /api/config.)

Los archivos js/config/*.js son la fuente de verdad hoy. Se migrarán a BD cuando exista el panel admin.

7.2. Rendering

Todo HTML generado desde datos pasa por escapeHtml + DOMPurify.

Nunca innerHTML con datos sin sanitizar.

Texto plano: textContent.

HTML estructurado: document.createElement + appendChild.

7.3. Estilos

No más !important. Si necesitás uno, hay un problema de cascada que hay que resolver.

Variables CSS para todo lo que sea tema (colores, spacing, tipografía).

Un archivo CSS por dominio.

7.4. Estado

appState es la única fuente de verdad del visor.

Nunca estado global mutable fuera de appState.

7.5. Performance

Lazy loading de capas.

Lazy loading de módulos pesados.

No bloquear el hilo principal (usar Workers).

Objetivo: primera carga < 3s en 4G.

8. Reglas de la promoción a producción
8.1. Los repos están aislados

woll_atacama_pruebas (laboratorio) y repo de producción son independientes.

No hay sincronización automática.

8.2. Promoción manual

Cuando una feature está validada en pruebas, se copia al repo de prod.

El proceso está documentado en docs/DECISIONS/004-promocion-manual.md.

8.3. Criterios para promover

✅ Probado en staging con el flujo completo.

✅ Sin errores en la consola del navegador.

✅ Sin errores en los logs de Vercel.

✅ Commits atómicos con mensajes claros.

✅ Documentación actualizada.

9. Testing

### 9.1. Qué testear (mínimo)

- Lógica pura: `normalizeArgs`, `escapeHtml`, `buildChartsFromHistory`, `transformCoordinates`.
- Contratos de API: `/api/chat` devuelve `{reply, chart, charts, geojson}`.
- Migraciones: cada migración se puede aplicar 2 veces sin error.

9.2. Qué NO testear (por ahora)

UI visual.

Integración con LLM real (usar mocks).

Performance.

9.3. Cómo correr tests

npm test corre todo.

(A definir cuando agreguemos node:test.)

10. Documentación
10.1. Docs vivas

docs/CONTRACT.md — este archivo.

docs/ARCHITECTURE.md — arquitectura actual.

docs/DECISIONS/NNN-*.md — ADRs.

docs/DEV_GUIDE.md — cómo trabajar en el proyecto.

10.2. Comentarios

El código se autodocumenta con nombres claros.

Los comentarios explican por qué, no qué.

Un comentario obsoleto es peor que no tener comentario.

11. Proceso de cambio
11.1. Antes de escribir código

Escribir un ADR si el cambio es estructural.

Escribir el contrato de API si agrega endpoint.

Escribir el schema si toca datos.

11.2. Durante el desarrollo

Commits atómicos con mensaje claro (feat:, fix:, refactor:, docs:).

Tests que cubren el comportamiento.

Documentación actualizada.

11.3. Antes del push

El lint pasa (cuando lo configuremos).

Los tests pasan.

Revisión de uno mismo (leer el diff en GitHub).

11.4. Promoción a producción

Copiar archivos al repo de prod.

Commit con mensaje release: <feature>.

Verificar en prod que funciona.

12. Las 10 reglas de oro
1. El visor en prod nunca se rompe. Pruebas antes de prod.

2. Código define estructura, datos definen contenido. No mezclar.

3. Secretos nunca en código ni en BD. Env vars siempre.

4. Todo input se valida. Todo output se sanitiza.

5. Un recurso, un lugar. Sin duplicación.

6. Toda feature nueva trae tests.

7. Todo cambio estructural trae un ADR.

8. Nunca editar una migración ya aplicada.

9. Si dudás, preguntá. Mejor 5 minutos de aclaración que 5 horas de refactor.

10. Documentar la decisión, no el código.

