# Spec 48 — CRUD de configuración del chat

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 48 |
| **Estado de la spec** | EN EJECUCIÓN (implementado local; falta validación en VPS) |
| **Tamaño** | Mediano |
| **Duración estimada** | 8-10 h |
| **Dependencias** | 40-D.2 (config del chat en BD), 45 (panel operativo) |
| **Última revisión** | 2026-11-14 |

## 1. Objetivo

Que el operador pueda editar desde `/admin.html` toda la configuración del
chat que no sea código: prompts versionados, settings, mensajes estándar,
datos no disponibles y golden set. Las tools del chat quedan como inventario
de solo lectura.

## 2. Alcance

**Dentro**
- CRUD de prompts (`admin.prompt_templates`): crear versión, editar como
  versión nueva, activar una versión histórica (copiándola como nueva) y
  eliminar versiones inactivas.
- CRUD de settings (`admin.settings`) con tipos `string|number|boolean|json`,
  respetando `editable`.
- CRUD de mensajes (`admin.messages`).
- CRUD de datos no disponibles (`admin.unavailable_data`).
- CRUD del golden set (`admin.golden_cases`): level 1-3, tier 1-6, `expected`
  y `history` en JSON, activo/inactivo.
- Lectura del inventario de tools (`GET /api/admin/chat/tools`), con
  `editable:false`.
- Seed del golden desde el archivo (`npm run golden:seed`) y lectura del
  runner desde la BD con fallback al JSON.
- Tests de handlers, normalización/seed y fallback del runner.

**Ayuda en la UI**
- Banner al inicio de la vista con el resumen de cada bloque, la caché de 5
  min y la advertencia de correr el golden set antes de activar cambios.
- Botón de ayuda en cada sección (prompts, settings, mensajes, datos no
  disponibles, golden set y herramientas) con el detalle de qué hace, para qué
  sirve y qué no cambiar.
- Pistas junto a los campos críticos de los formularios.

**Fuera**
- Crear, borrar o reescribir tools desde el panel. Una tool es un archivo en
  `server/chat/tools/` + una entrada en el registro; además invoca RPCs
  tipadas. Editarla en runtime rompería CONTRACT §1.4, §6.2 y §6.3.
- Editar los prompts hardcodeados de fallback (`SYSTEM_PROMPT_BASE`,
  `CLASSIFIER_SYSTEM_PROMPT`): son la red de seguridad de INV-5.
- Editar el system prompt del clasificador para saltarse el golden set: el
  flujo obliga a correr el golden antes de activar (CONTRACT §2).
- Subir documentos RAG o cambiar embeddings desde esta vista (spec 45-A).
- Historial/rollback genérico de settings o mensajes: solo se conserva el
  valor actual y la auditoría.

## 3. Contrato de datos

`admin.golden_cases` (migración 049):

| Columna | Tipo | Uso |
|---|---|---|
| `id` | text PK | identificador estable del caso |
| `level` | integer 1-3 | nivel de profundidad de la evaluación |
| `tier` | integer 1-6 | tier de capacidad esperada |
| `intent_esperado` | text | intent del clasificador |
| `fuente_esperada` | text | `db`, `rag`, `clima`, etc. |
| `category` | text | categoría funcional |
| `question` | text not null | pregunta al chat |
| `expected` | jsonb | checks (`tools_any`, `geojson_required`, ...) |
| `notes` | text | contexto del caso |
| `history` | jsonb | historial de conversación, opcional |
| `activo` | boolean | el runner solo lee activos |
| `created_at`, `updated_at`, `updated_by` | auditoría | |

Migración 050 amplía el check de `tier` a 1-6 (el golden usa tier 4).
Grants: `woll_api` con SELECT/INSERT/UPDATE/DELETE; sin acceso para
`PUBLIC`/`anon`/`authenticated`.

Las tablas `admin.prompt_templates`, `admin.settings`, `admin.messages` y
`admin.unavailable_data` ya existían (migración 024); la 049 agrega los grants
de escritura para `woll_api`. `unavailable_data.verificado_en` se actualiza a
`CURRENT_DATE` en cada guardado manual.

## 4. Endpoints

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/api/admin/chat/tools` | inventario read-only de tools |
| `POST` | `/api/admin/prompts` | crea versión nueva y la activa |
| `POST` | `/api/admin/prompts/activate` | copia una versión histórica como nueva |
| `DELETE` | `/api/admin/prompts?id=&version=` | borra una versión inactiva |
| `GET` | `/api/admin/prompts` | lista versiones (handler existente) |
| `PUT` | `/api/admin/settings` | upsert si `editable` |
| `DELETE` | `/api/admin/settings?key=` | borra si `editable` |
| `PUT` | `/api/admin/messages` | upsert |
| `DELETE` | `/api/admin/messages?key=` | borra |
| `PUT` | `/api/admin/unavailable` | upsert con arrays normalizados |
| `DELETE` | `/api/admin/unavailable?id=` | borra |
| `GET` | `/api/admin/golden` | lista todos los casos |
| `PUT` | `/api/admin/golden` | upsert de un caso |
| `DELETE` | `/api/admin/golden?id=` | borra un caso |

Todas las mutaciones exigen sesión, `X-CSRF-Token` y escriben
`admin.audit_log` (`chat.prompt.*`, `chat.setting.*`, `chat.message.*`,
`chat.unavailable.*`, `chat.golden.*`).

## 5. Reglas de prompts

- Una versión activa por `id`; al crear o activar, la anterior pasa a
  `activo=false`.
- Editar una versión no la muta: crea una nueva con el contenido editado.
- Activar una versión histórica copia su contenido y descripción a una versión
  nueva; no cambia el pasado.
- La versión activa no se puede borrar (409). Las históricas sí.
- El prompt se cachea 5 min en el proceso del API. Un cambio se refleja en
  ≤ 5 min o al reiniciar; el panel no invalida la caché.
- Antes de activar un cambio en producción: correr el golden set en staging y
  comparar el acierto por tier.

## 6. Criterios de aceptación

| # | Dado | Cuando | Entonces |
|---|---|---|---|
| CA-1 | prompt existente | guardo una edición | se crea v+1 activa; la anterior queda histórica |
| CA-2 | versión histórica | pulso Activar | se crea una versión nueva con ese contenido |
| CA-3 | versión activa | pulso Eliminar | 409; la UI no muestra el botón |
| CA-4 | setting editable | cambio el valor | se guarda y el chat lo lee en ≤ 5 min |
| CA-5 | setting `editable=false` | intento guardar/borrar | 409; la UI lo muestra en solo lectura |
| CA-6 | mensaje estándar | lo borro | el chat usa el fallback hardcodeado |
| CA-7 | dato no disponible | lo guardo | `verificado_en` queda en la fecha del día |
| CA-8 | golden con tier 4 | lo guardo | se persiste (migración 050) |
| CA-9 | golden sin BD | corro `run-golden-set` | usa `golden.json` y avisa la fuente |
| CA-10 | `--from-json` | corro el runner | ignora `admin.golden_cases` |
| CA-11 | tools | abro Chat IA | veo 13 tools, sin botones de edición |
| CA-12 | migraciones 049/050 | aplico dos veces | sin error |
| CA-13 | mutación sin CSRF | llamo al endpoint | 403 |
| CA-14 | cualquier mutación | reviso auditoría | queda actor, acción, objetivo y resultado |

## 7. Seguridad

- Sesión obligatoria y CSRF en POST/PUT/DELETE.
- Validación de claves (`^[a-z][a-z0-9._-]{1,80}$`) e ids
  (`^[a-z0-9][a-z0-9_-]{1,100}$`), longitudes y JSON.
- Límite de 250 KB para el body JSON; prompts hasta 200 KB.
- Sin secretos en la configuración del chat: las API keys viven en `.env`.
- El frontend usa `textContent` para prompts, settings, mensajes y golden; no
  hay `innerHTML` con datos de la BD.
- La auditoría no guarda el contenido de prompts ni mensajes, solo la clave y
  la versión.

## 8. Decisiones

| Tema | Decisión |
|---|---|
| Tools | Solo lectura. Son código y RPCs tipadas; el panel las inventaría, no las edita. |
| Golden set | En `admin.golden_cases`; el archivo queda como seed y fallback. |
| Prompts | Versionado inmutable; activar = copiar como versión nueva. |
| Settings | `editable` protege las claves críticas de infraestructura. |
| Borrado de mensajes/unavailable | Físico; el fallback del código cubre el hueco. |
| Caché de prompts | 5 min; no se invalida desde el panel en esta fase. |

## 9. Resultados (2026-11-14)

- Migraciones 049/050 aplicadas y reaplicables.
- `admin.golden_cases` con 38 casos sembrados desde `golden.json`.
- UI **Chat IA** validada en navegador: crear/editar/activar/eliminar prompt,
  editar setting/mensaje/unavailable y crear/editar/eliminar golden.
- `GET /api/admin/chat/tools`: 13 tools, `editable:false`.
- Tests: 459 tests, 447 pasan, 12 omitidos, 0 fallos; lint 0 errores.
- Ayuda contextual validada en navegador: banner, seis popovers y pistas de
  formulario; `scripts/__tests__/admin-help.test.js` cubre el enlace
  botón/popover.
- Datos de prueba eliminados al terminar.
- Pendiente: validar el flujo en el VPS y decidir si el golden por tier
  reemplaza el baseline del archivo.
