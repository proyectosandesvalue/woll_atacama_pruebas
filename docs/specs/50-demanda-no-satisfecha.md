# Spec 50 — Demanda no satisfecha

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 50 |
| **Estado de la spec** | CERRADA |
| **Tamaño** | Mediano |
| **Duración estimada** | 12-16 h |
| **Dependencias** | 40-D.2 (config del chat) y 40-E (registro de preguntas). El número 49 está ocupado por el publicador de ráster. |
| **Última revisión** | 2026-11-19 |

## 1. Objetivo y contexto

Convertir `admin.unanswered_questions` —que ya existe y registra las preguntas
que el chat no pudo responder— en una cola de triage operativa desde el panel.
El objetivo es ver la demanda real, seleccionar las preguntas válidas y
preparar un brief para que el desarrollador implemente la tool, capa o
documento en un sprint posterior.

El panel **no crea tools ni código**. Solo clasifica, prioriza, documenta y
exporta el brief. La creación de la herramienta se hace en el sprint que
corresponda (18, 19, 40-D.3, 42 o 43).

## 2. Alcance

**Dentro**
- Vista propia **Demanda** en el panel, con badge de pendientes.
- Listado con pregunta, ocurrencias, razón, tipo de pregunta, estado,
  prioridad, decisión, sprint y última vez.
- Filtros por estado, razón, prioridad, decisión y texto; orden por ocurrencias,
  fecha o prioridad; paginación.
- Detalle con clasificación, ruta, notas, historial mínimo y acciones de
  triage.
- Estados: `pending`, `reviewing`, `accepted`, `planned`, `resolved`,
  `rejected`, `duplicate`, `archived`.
- Decisiones: `new_tool`, `new_layer`, `new_document`, `improve_prompt`,
  `unavailable`, `out_of_scope`, `wont_fix`, `duplicate`.
- Prioridad `alta`, `media`, `baja` y sprint destino.
- Brief descargable en Markdown, reutilizable como contexto para la IA.
- Deduplicación por fingerprint y contador de ocurrencias.
- Limpieza de datos personales: no se guardan email ni sesión; se limpia el
  historial existente.

**Fuera**
- Crear, editar o borrar tools desde el panel (CONTRACT §6.2).
- Crear RPCs, capas o documentos desde el panel.
- Editar la pregunta original.
- Borrado físico: se archiva.
- Adjuntar archivos al brief.
- Autenticación de usuarios finales o perfiles.
- Métricas en tiempo real; se calculan al cargar la vista.

## 3. Reglas del CONTRACT que aplican

| Regla | Implicancia |
|---|---|
| §1.3 Un recurso, un lugar | La demanda vive en `admin.unanswered_questions`; no se duplica en otra tabla. |
| §1.4 Código y datos separados | El panel gestiona datos de triage; la tool es código y se implementa en otro sprint. |
| §1.5 Todo lo que no se testea se rompe | Tests de fingerprint, handlers, migración y fallback. |
| §6.2 Tools | El panel no crea tools; solo genera un brief. |
| §6.7 Calidad del chat | La demanda alimenta rutas, evidencia y golden set; no reemplaza la evaluación. |
| §7.2 Rendering | La pregunta se muestra con `textContent`; nunca `innerHTML`. |
| §7.5 Idioma | Español neutro para Chile. |

## 4. Contrato de datos / API

### 4.1. Tabla `admin.unanswered_questions` (migraciones 053-055)

Se agregan columnas aditivas:

| Columna | Tipo | Uso |
|---|---|---|
| `fingerprint` | text | Hash de la pregunta normalizada; unique para deduplicar |
| `occurrences` | integer not null default 1 | Veces que se repitió |
| `first_seen_at`, `last_seen_at` | timestamptz | Primera y última aparición |
| `priority` | text | `alta`, `media`, `baja` |
| `decision` | text | Tipo de solución propuesta |
| `sprint_target` | text | Sprint donde se resolverá |
| `notes` | text | Notas de triage y brief |
| `reviewed_by`, `reviewed_at` | text, timestamptz | Última revisión |

Se limpian `user_email`, `session_id` y `context` para no conservar datos
personales ni historial. No se eliminan las columnas para no romper
compatibilidad; el panel no las muestra.

### 4.2. RPCs

| RPC | Uso |
|---|---|
| `chat_log_unanswered(...)` | Upsert por fingerprint; incrementa `occurrences`; ignora email/sesión/contexto |
| `admin_list_unanswered(...)` | Lista con filtros, orden, límite y offset; devuelve `{ items, total }` |
| `admin_update_unanswered(...)` | Actualiza estado, prioridad, decisión, sprint, notas y resolución |
| `admin_unanswered_stats()` | Totales por estado, razón, prioridad y decisión; top preguntas |

### 4.3. Endpoints

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/api/admin/unanswered?status=&reason=&priority=&decision=&q=&limit=&offset=&sort=` | Listado paginado |
| `GET` | `/api/admin/unanswered/stats` | Métricas |
| `PUT` | `/api/admin/unanswered` | Triage de una pregunta |
| `GET` | `/api/admin/unanswered/brief?id=` | Brief Markdown descargable |

Todos exigen sesión; `PUT` exige CSRF y audita el cambio. Respuestas con
`Cache-Control: no-store`.

### 4.4. Brief

Markdown con pregunta, ocurrencias, razón, tipo de pregunta, ruta, notas,
propuesta de tool/RPC, criterios de aceptación y caso de golden set. No incluye
email, sesión ni historial.

## 5. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | una pregunta registrada | abro Demanda | aparece con razón, tipo, ocurrencias y estado | test + manual |
| CA-2 | la misma pregunta dos veces | se registra | una fila con `occurrences=2` | SQL + test |
| CA-3 | un caso pendiente | lo reviso y acepto | estado `accepted`, prioridad y decisión guardadas | test |
| CA-4 | un caso aceptado | lo planifico | estado `planned` y sprint destino | test |
| CA-5 | un caso resuelto | lo marco resuelto | `resolved_at/by` y nota de resolución | test |
| CA-6 | un caso descartado | lo rechazo o marco duplicado | no aparece como pendiente | test |
| CA-7 | un caso | descargo el brief | Markdown con la pregunta y sin datos personales | test |
| CA-8 | la tabla existente | aplico la migración dos veces | sin error | SQL |
| CA-9 | un usuario sin sesión | llamo a la API | 401 | test |
| CA-10 | un `PUT` sin CSRF | llamo a la API | 403 | test |
| CA-11 | una pregunta con HTML | la muestro | se renderiza como texto | manual |
| CA-12 | una pregunta existente con email/sesión | aplico la migración | email/sesión/contexto quedan null | SQL |

## 6. Plan por sub-sprint

| Tramo | Contenido | Horas | Estado |
|---|---|---|---|
| 50-A | Migración 053, fingerprint, dedupe, estados y RPCs | 4 | ✅ |
| 50-B | Handlers, rutas, brief y tests | 4 | ✅ |
| 50-C | Vista Demanda, tabla, filtros, detalle y acciones | 4 | ✅ |
| 50-D | Badge, brief descargable, documentación y cierre | 2-4 | ✅ |

## 7. Tests requeridos

- `server/chat/__tests__/unanswered-fingerprint.test.js`: normalización, misma
  pregunta con mayúsculas/espacios, pregunta distinta, caracteres de control.
- `server/handlers/__tests__/admin-unanswered.test.js`: 401, listado, filtros,
  actualización, CSRF, estados inválidos, brief y ausencia de datos personales.
- `scripts/__tests__/language-neutral.test.js`: textos del panel y docs.
- Migraciones 053-055 aplicadas; 054 reaplicada sin error y `npm run migrate`
  sin pendientes.
- `npm run check:rpcs` contra la BD local.

## 8. Seguridad y procedencia

- No se guardan email, IP, user-agent ni sesión. `session_id` existente se
  limpia y no se escribe.
- El `context` existente se limpia; no se guarda historial nuevo.
- La pregunta se limita a 1000 caracteres y se eliminan caracteres de control.
- El panel usa `textContent`; el brief se descarga como archivo, no se renderiza.
- Acceso solo con sesión admin y CSRF en mutaciones.
- Auditoría de cada cambio de triage.
- Retención: pendientes 180 días; resueltas 365 días. La purga se hará en un
  job posterior.

## 9. Preguntas abiertas

| # | Pregunta | Default | ¿Bloquea? |
|---|---|---|---|
| R1 | ¿Vista propia o dentro de Chat IA? | **Vista propia** (aprobado) | no |
| R2 | ¿Guardar datos personales? | **No** (aprobado) | no |
| R3 | ¿Brief descargable? | **Sí, Markdown** (aprobado) | no |
| R4 | ¿Crear tools desde el panel? | **No** (CONTRACT §6.2) | no |
| R5 | ¿Retención? | 180/365 días | no |

## 10. Riesgos, reversión y documentación

- **Ruido:** preguntas fuera de alcance o errores técnicos pueden llenar la
  cola. El registro ya excluye OUT y errores; el triage permite rechazar.
- **Duplicados:** el fingerprint agrupa mayúsculas/espacios; variantes
  semánticas se marcan como duplicadas manualmente.
- **PII:** se limpia lo existente y no se guarda nada nuevo.
- **Reversión:** la migración es aditiva; se puede desactivar la vista sin
  tocar los datos. Las RPCs nuevas mantienen las antiguas.
- **Documentación:** ROADMAP, CHANGELOG, DEV_GUIDE, AGENTS y README.

## 11. Puntos de integración

- **40-E:** el registro `maybeLogUnanswered` pasa el fingerprint y deja de
  enviar email/sesión/contexto.
- **18/19/40-D.3/42/43:** consumen los briefs y actualizan el estado a
  `resolved` cuando publican la tool, capa o documento.
- **45-D.2:** `admin.unavailable_data` sigue siendo el catálogo curado; una
  pregunta con decisión `unavailable` puede inspirar un registro allí.
- **Sprint 31:** métricas de demanda y retención.
- **Ayuda del panel:** `docs/help/demanda-no-satisfecha.md` deja el contenido
  listo para publicarlo en la futura página de ayuda del panel. `help.html`
  sigue siendo el manual del visor público.

## 12. Cierre

- **Horas reales:** ~8 h (50-A 3 h, 50-B 2 h, 50-C 2 h, 50-D 1 h).
- **Desvíos:** se agregó la migración 054 para exponer los campos de
  resolución en el listado y la 055 para una policy RLS SELECT de `woll_api`
  (el brief consulta la tabla directamente). La 053 consolidó 5 filas
  históricas en 4 por fingerprint (una tenía 2 ocurrencias).
- **Lecciones:** el fingerprint debe calcularse en el backend y en el backfill
  con la misma normalización; el listado debe devolver todos los campos que
  edita el detalle para no borrar la resolución al guardar.
- **Tests:** 491 tests, 479 pasan, 12 omitidos, 0 fallos; lint 0 errores;
  `check:rpcs` 51/51.
