# Spec 06 — Respuesta geoespacial (GeoJSON en el mapa)

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 06 |
| **Estado de la spec** | APROBADA (2026-10-04) |
| **Tamaño** | Pequeño |
| **Duración estimada** | 5-7h (4-6h del ROADMAP + 1h por el comportamiento en móvil, P6) |
| **Dependencias** | Ninguna |
| **Última revisión** | 2026-10-04 |

> Elaborada a partir de ROADMAP (Sprint 06), CONTRACT §6-7, ARCHITECTURE y DEV_GUIDE. Lo que esos documentos no definen está en la sección 9 con un default propuesto.

---

## 1. Objetivo y contexto

Cuando una pregunta del chat se responde con elementos concretos de una capa (por ejemplo, "¿dónde están las plantas desaladoras de la provincia de Copiapó?"), el usuario recibe además esas entidades **resaltadas en el mapa**, con zoom a su extensión. Cierra el ciclo de la respuesta: texto + gráficos + mapa. Se hace ahora porque el contrato de respuesta ya incluye el campo `geojson` (CONTRACT §6.1) pero nada lo llena ni lo pinta.

## 2. Alcance

**Dentro del alcance**
- Backend: `query_layer` puede devolver las geometrías de las filas que devuelve.
- El orquestador adjunta el `geojson` a la respuesta sin enviarlo al LLM.
- Frontend: capa temporal de resultados, con estilo destacado, zoom automático y popups seguros.
- Botón "Quitar resultados del mapa" y limpieza automática (nueva pregunta, cerrar chat, limpiar conversación).
- Reglas del prompt sobre cuándo pedir geometría.

**Fuera de alcance**
- Pintar polígonos administrativos como resultado de `aggregate_by_admin*` (coropletas).
- Geometrías para `count_near_layer` / `aggregate_near_layer`.
- Persistir resultados entre sesiones o exportarlos (eso es Sprint 11).
- Streaming de la respuesta.
- Migrar capas a MVT o a otra fuente (Sprint 08).

## 3. Reglas del CONTRACT que aplican

| Regla | Qué implica aquí |
|---|---|
| §6.1 | `geojson` es opcional y `null` si no aplica; `reply` nunca vacío; el frontend tolera el campo ausente. Un cambio de contrato exige frontend y backend en el mismo commit. |
| §6.2 | La lógica de la tool vive en su archivo (`{ schema, run, normalizeArgs }`); el registro solo la lista. |
| §6.3 | El LLM no escribe SQL; el flag nuevo se normaliza defensivamente antes de tocar la BD. |
| §5.1 | La RPC nueva va en una migración numerada, idempotente, aplicada en Supabase **antes** del deploy. |
| §5.4 | Todo output de la BD se valida antes de llegar al usuario (forma de la FeatureCollection, tope de features). |
| §4.5 | Errores de infra: log detallado en servidor, mensaje genérico al usuario, nunca `err.message` crudo. |
| §7.2 | Todo HTML de popups pasa por `escapeHtml` + DOMPurify. |
| §7.4 | La referencia a la capa de resultados vive en `appState`, no en una variable global suelta. |
| §1.5 / §9 | Cada feature trae tests; lógica pura testeada con `node:test`. |

## 4. Contrato de datos

**4.1. Respuesta de `/api/chat`** (sin cambios de forma; ya definido en CONTRACT §6.1)

```json
{
  "reply": "string",
  "geojson": {
    "type": "FeatureCollection",
    "features": [
      { "type": "Feature", "geometry": { "type": "Point", "coordinates": [-70.3, -27.4] },
        "properties": { "nombre": "..." } }
    ]
  } | null
}
```

Restricciones: máximo **500 features**; coordenadas en EPSG:4326; precisión recortada (ver P3).

**4.2. Argumento nuevo de la tool `query_layer`**

| Arg | Tipo | Default | Normalización |
|---|---|---|---|
| `include_geometry` | boolean | `false` | Coacción a boolean; cualquier otro valor → `false`. |

**4.3. Migración (`008_...`, número confirmado)**

Función **nueva** (confirmado: `chat_query` devuelve solo atributos, sin `geom`, y no se modifica) que, para las mismas filas filtradas, devuelve además la geometría como GeoJSON (`ST_AsGeoJSON` con precisión limitada). Con wrapper `public.chat_*`, `REVOKE` a `PUBLIC/anon/authenticated`, `GRANT EXECUTE` a `service_role`, `NOTIFY pgrst`. Columna de geometría tomada del catálogo, nunca del argumento del LLM.

**4.4. Resultado interno del runner** (no llega al LLM)

```json
{ "rows": [ ... ], "geojson": { "type": "FeatureCollection", "features": [ ... ] },
  "total": 600, "shown": 500, "truncated": true }
```

El orquestador quita `geojson` antes de armar los mensajes para el LLM; el LLM ve `rows`, `total`, `shown` y `truncated`.

**4.5. `appState`**

`appState.chat.resultsLayer` (referencia a la capa Leaflet temporal o `null`).

**4.6. Variable de entorno nueva**

`CHAT_GEOJSON_ENABLED` (default `1`). En `0`, el backend nunca adjunta `geojson`. Se agrega a `.env.example`.

## 5. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | una pregunta que resuelve `query_layer` con `include_geometry: true` y 12 coincidencias | el usuario la envía | la respuesta trae `reply` no vacío y `geojson` con 12 features; el mapa las pinta resaltadas y hace zoom a su extensión | test + manual |
| CA-2 | una consulta con 600 coincidencias | el usuario la envía | `geojson` trae exactamente 500 features y el `reply` informa que se muestran 500 de 600 | test + manual |
| CA-3 | una pregunta que resuelve con agregaciones (`aggregate_*`) | el usuario la envía | `geojson` es `null` y el frontend se comporta como antes (gráficos sin cambios) | test |
| CA-4 | resultados ya pintados en el mapa | el usuario envía una nueva pregunta | la capa anterior se elimina antes de pintar la nueva; si la nueva no trae geojson, el mapa queda sin resultados | manual |
| CA-5 | resultados pintados | el usuario pulsa "Quitar resultados del mapa" | la capa se elimina, el botón desaparece y `appState.chat.resultsLayer` es `null` | manual |
| CA-6 | resultados pintados | el usuario cierra el chat con su botón de cerrar o pulsa "limpiar conversación" | la capa se elimina. El colapso automático del chat en móvil (CA-15) **no** cuenta como cerrar y no borra los resultados | manual |
| CA-7 | una feature con `properties` maliciosas (`<img src=x onerror=...>`) | el usuario abre su popup | el texto se muestra escapado y no se ejecuta script | manual |
| CA-8 | una respuesta sin el campo `geojson` o con `geojson: null` | el frontend la procesa | no hay error en consola ni elemento roto | test + manual |
| CA-9 | una conversación con resultados geoespaciales previos | se envía el historial (`history`) al backend | el historial contiene solo texto; nunca geometrías | test |
| CA-10 | el LLM recibe el resultado de la tool | el orquestador arma el mensaje de la síntesis | el mensaje no contiene el campo `geojson` ni coordenadas | test |
| CA-11 | el usuario activa/desactiva capas del visor con resultados pintados | cambia dimensiones o capas | la capa de resultados se mantiene visible y por encima de las demás | manual |
| CA-12 | la RPC supera el timeout (6 s) o falla | el usuario envía la pregunta | la respuesta llega con `reply` genérico y `geojson: null`; el detalle queda solo en logs | test |
| CA-13 | `CHAT_GEOJSON_ENABLED=0` | cualquier pregunta | `geojson` es siempre `null` | test |
| CA-14 | una capa de puntos, una de líneas y una de polígonos | se pintan como resultado | cada tipo se dibuja con estilo destacado coherente (borde grueso y color distinto del estilo normal) | manual |
| CA-15 | un viewport móvil con el chat abierto como overlay | llega una respuesta con `geojson` | el chat se colapsa, el mapa muestra los resultados con zoom, y aparecen sobre el mapa los botones "Volver al chat" y "Quitar resultados del mapa"; "Volver al chat" reabre el chat con la conversación intacta y los resultados siguen pintados | manual |

## 6. Plan por sub-sprint

Un commit por sub-sprint.

### 06-A — Backend: `query_layer` devuelve geometrías (2h)
- **Archivos:** migración nueva en `db/migrations/`, archivo de la tool `query_layer` en `server/chat/tools/`, `_helpers.js` (si hace falta), `server/chat/orchestrator.js`, `.env.example`.
- **Tareas:** crear la RPC y su wrapper; agregar `include_geometry` al schema y a `normalizeArgs`; recorte a 500 features y metadatos `total/shown/truncated`; el orquestador junta el geojson de los resultados de tools por **forma** (igual que `buildChartsFromHistory`), lo adjunta a la respuesta y lo elimina de lo que ve el LLM; respeto de `CHAT_GEOJSON_ENABLED`.
- **Termina cuando:** CA-1 (lado backend), CA-2, CA-3, CA-9, CA-10, CA-12, CA-13.

### 06-B — Frontend: capa de resultados (3h)
- **Archivos:** `js/utils/chatMapUtils.js` (nuevo), `js/ui/chatUI.js`, `js/store/appState.js`, `css/components.css`, `index.html` (botón).
- **Tareas:** `chatMapUtils.js` con `showResults(geojson)`, `clearResults()` y estilos por tipo de geometría; pane propio con z-index por encima de las capas del visor; popups con `escapeHtml` + DOMPurify; `fitBounds` con `turf.bbox`; botón "Quitar resultados del mapa"; limpieza en nueva pregunta, cierre del chat y "limpiar conversación"; asegurar que el historial enviado al backend excluya geometrías.
- **Móvil (P6):** al recibir `geojson` en un viewport móvil, colapsar el chat (estado distinto de "cerrado") y mostrar botones flotantes "Volver al chat" y "Quitar resultados del mapa"; reabrir el chat oculta "Volver al chat". El colapso no dispara la limpieza de resultados.
- **Termina cuando:** CA-1 (lado frontend), CA-4, CA-5, CA-6, CA-7, CA-8, CA-11, CA-14, CA-15.

### 06-C — Reglas del prompt (1h)
- **Archivos:** `SYSTEM_PROMPT` del orquestador.
- **Tareas:** regla de cuándo pasar `include_geometry: true` (preguntas de ubicación o de "muéstrame/dónde", no de conteos ni distribuciones); regla de comunicar el recorte cuando `truncated` sea `true`; en modo `CHAT_VERBOSE=0` no mencionar el flag ni el `geojson`.
- **Termina cuando:** el set de preguntas de prueba de la sección 7 se comporta según lo esperado en `smoke-orchestrator`.

### 06-D — Verificación, docs y deploy (1h)
- **Tareas:** correr `npm run lint` y `npm test`; checklist de la sección 8; actualizar ROADMAP, CHANGELOG y ARCHITECTURE (§4.3 y §6); commit y push a `main`; verificar en staging.
- **Termina cuando:** todos los CA en verde y los docs actualizados.

## 7. Tests requeridos

**Automáticos (`node:test`)**
- `normalizeArgs` de `query_layer`: `include_geometry` con `true`, `"true"`, `1`, `null`, `undefined`, un objeto → solo `true` booleano produce `true`.
- Recorte a 500: 499, 500, 501 y 600 features; metadatos `total/shown/truncated` correctos.
- El orquestador elimina `geojson` del mensaje al LLM y lo adjunta a la respuesta (CA-9, CA-10).
- Construcción del geojson desde el historial de tools: sin resultados, un resultado, varios resultados (se fusionan respetando el tope de 500).
- Contrato: respuesta con `geojson: null`, con geojson válido y con tool que falla (CA-3, CA-8, CA-12).
- `CHAT_GEOJSON_ENABLED=0` fuerza `null` (CA-13).
- Migración aplicable dos veces sin error (CONTRACT §9.1).

**Preguntas de prueba para 06-C** (smoke del orquestador)
1. "¿Dónde están las plantas desaladoras?" → con geojson.
2. "Muéstrame las lagunas de la provincia de Copiapó." → con geojson.
3. "¿Cuántas desaladoras hay por comuna?" → sin geojson, con gráfico.
4. "¿Qué atributos tiene la capa de APR?" → sin geojson.

## 8. Verificación manual y criterios para promover

- [ ] CA-4 a CA-7, CA-11 y CA-14 probados en `wollatacamapruebas.vercel.app` con puntos, líneas y polígonos.
- [ ] Prueba en móvil real o emulado (CA-15).
- [ ] Sin errores en la consola del navegador ni en los logs de Vercel.
- [ ] Migración aplicada en Supabase de producción **antes** del código.
- [ ] `CHAT_GEOJSON_ENABLED` creada en Vercel de producción.
- [ ] Promoción siguiendo el ADR 004, y el release anotado en el CHANGELOG del repo de producción.

## 9. Preguntas (todas resueltas)

P2, P6 y P8 se resolvieron con respuestas explícitas; los defaults de P1, P3, P4, P5 y P7 fueron aceptados el 2026-10-04.

| # | Pregunta | Default propuesto | Impacto si cambia |
|---|---|---|---|
| P1 ✅ | ¿Qué tools devuelven geometría en esta versión? | Solo `query_layer` | Si se suman las de proximidad, hay que ampliar RPCs y tests |
| P2 ✅ | ¿`chat_query` ya devuelve la geometría? | **Resuelta:** no, devuelve solo atributos. Se crea una RPC nueva aditiva y la existente no se toca | — |
| P3 ✅ | ¿Precisión y simplificación de geometrías? | 5 decimales y sin simplificar; tope de tamaño de payload de ~1,5 MB (si se supera, se recortan features) | Polígonos complejos podrían exigir `ST_SimplifyPreserveTopology` |
| P4 ✅ | ¿Quién decide pedir geometría: el LLM con `include_geometry` o el backend por heurística? | El LLM con el flag, guiado por reglas del prompt | Con heurística en backend se pierde flexibilidad pero hay menos errores del LLM |
| P5 ✅ | ¿Cómo se informa el recorte (CA-2) sin cambiar el contrato? | El LLM lo dice en el `reply` a partir de `total/shown/truncated` | Si se quiere un indicador en la UI, hay que ampliar CONTRACT §6.1 (frontend y backend en el mismo commit) |
| P6 ✅ | En móvil el chat es un overlay que tapa el mapa. ¿Cómo se ve el resultado? | **Resuelta:** el chat se colapsa y aparece un botón flotante "Volver al chat" (CA-15, +1h en 06-B) | — |
| P7 ✅ | ¿El popup usa `popupCampos`/`alias` de la config de la capa o las `properties` crudas? | `popupCampos` y `alias` de la config cuando existan; si no, las primeras 5 propiedades | Si se usan crudas, hay que filtrar campos internos |
| P8 ✅ | ¿Número de la migración y rutas de los archivos de las tools? | **Resuelta:** migración 008 y rutas como figuran en la spec | — |

## 10. Riesgos, reversión y documentación

**Riesgos**

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Payload grande de polígonos supera límites de la Function o ralentiza el mapa | Media | Tope de 500 features, precisión de 5 decimales, tope de tamaño (P3) |
| El LLM pide geometría cuando no corresponde | Media | Reglas del prompt (06-C) + `CHAT_GEOJSON_ENABLED` como interruptor |
| Geometría inflando los tokens del LLM | Alta si no se separa | CA-9 y CA-10: el geojson viaja fuera del contexto del LLM |
| La capa de resultados queda debajo de capas glify (WebGL) | Media | Pane propio con z-index alto (CA-11) |
| Popups como vector de XSS | Baja | CA-7 y §7.2 del CONTRACT |
| Presupuesto de 8 s del orquestador | Baja | La geometría es una columna extra de la misma consulta, no una llamada nueva |

**Reversión**
- Backend: `CHAT_GEOJSON_ENABLED=0` desactiva la función sin deploy. La migración es aditiva: no requiere rollback.
- Frontend: tolera `geojson` ausente (CA-8), así que revertir el backend no rompe nada.
- Código: un commit por sub-sprint permite `git revert` individual.

**Documentos a actualizar al cerrar:** ROADMAP (estado del Sprint 06 y bitácora), CHANGELOG, ARCHITECTURE (§4.3 tools, §5.2 RPCs, §6 frontend), `.env.example`. No requiere ADR (no cambia la estructura) ni cambio del CONTRACT, salvo que P5 se resuelva ampliando el contrato.

## 11. Cierre

- Fecha de cierre:
- Horas reales vs. estimadas:
- Desvíos respecto de la spec y por qué: