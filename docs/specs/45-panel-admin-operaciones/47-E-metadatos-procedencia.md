# Spec 47-E — Editor de metadatos de procedencia de capas

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 47-E (extensión de 47) |
| **Estado de la spec** | CERRADA |
| **Tamaño** | Mediano |
| **Duración estimada** | 4-6 h |
| **Dependencias** | 47 (gestor de capas), 18-G (`chat_layers_metadata`) |
| **Última revisión** | 2026-11-27 |

## 1. Objetivo y contexto

`chat.chat_catalog` ya tiene las columnas de procedencia (`source`,
`source_url`, `data_updated_at`, `scale`, `license`, `method`, `coverage`,
`limitations`) desde la migración 071, pero las 71 capas están vacías. Por eso
`get_layer_metadata` responde “no declarado” y `buildEvidence()` enriquece las
citas con nulls.

Esta spec agrega una vista **Metadatos** en `/admin.html` para editar esos
campos por capa, con validación, auditoría y tests. No carga valores: deja el
panel listo para que el equipo complete la procedencia sin tocar SQL.

## 2. Alcance

**Dentro**
- `GET /api/admin/layer-metadata` y `PUT /api/admin/layer-metadata`.
- Vista `layer-meta` en el panel con búsqueda, tabla y formulario.
- Validación de URL https, fecha `YYYY-MM-DD`, largos y campos vacíos.
- Auditoría `layer.metadata.update`.
- Permisos para `woll_api` (grant + RLS) y uso del rol actual del API.
- Tests de handler y build/lint.

**Fuera**
- Carga masiva CSV/JSON.
- Editar `admin.layers`/taxonomía desde esta vista.
- Inventar o completar metadatos automáticamente.
- Subir documentos o cambiar la capa física.

## 3. Reglas del CONTRACT que aplican

| Regla | Implicancia |
|---|---|
| §6.7 (evidencia) | Los metadatos alimentan las citas de capa; no se inventan. |
| §7.2 (rendering) | La tabla y el formulario usan textContent/DOM, sin innerHTML. |
| §9.1 (tests) | Handler con tests; UI verificada manualmente. |
| §1.7 (INV-5) | Si la BD no responde, la vista muestra error; el chat sigue con nulls. |

## 4. Contrato de datos / API

### 4.1. `GET /api/admin/layer-metadata`

Requiere sesión. Devuelve:

```json
{
  "items": [
    {
      "layer_id": "glaciares",
      "display_name": "Glaciares",
      "dimension": "agua",
      "geometry_type": "polygon",
      "source": null,
      "source_url": null,
      "data_updated_at": null,
      "scale": null,
      "license": null,
      "method": null,
      "coverage": null,
      "limitations": null,
      "updated_at": "2026-11-27T..."
    }
  ],
  "editable": true
}
```

### 4.2. `PUT /api/admin/layer-metadata`

Requiere sesión + CSRF. Body:

```json
{
  "layer_id": "glaciares",
  "source": "DGA",
  "source_url": "https://...",
  "data_updated_at": "2025-07-15",
  "scale": "1:50.000",
  "license": "Uso institucional con atribución",
  "method": "Fotointerpretación Sentinel-2",
  "coverage": "Región de Atacama",
  "limitations": "No reemplaza un inventario de detalle."
}
```

Validaciones:

| Campo | Regla |
|---|---|
| `layer_id` | requerido, existe en `chat.chat_catalog` |
| `source` | ≤ 200 caracteres; vacío → null |
| `source_url` | `https://` o vacío → null; ≤ 500 |
| `data_updated_at` | `YYYY-MM-DD` válido o vacío → null |
| `scale` | ≤ 120 |
| `license` | ≤ 200 |
| `method` | ≤ 500 |
| `coverage` | ≤ 500 |
| `limitations` | ≤ 1000 |

Respuesta: `{ item }` actualizado. 404 si la capa no existe; 400 si falla la
validación; 503 si no es PostgreSQL.

### 4.3. Persistencia

```sql
UPDATE chat.chat_catalog
   SET source=$2, source_url=$3, data_updated_at=$4, scale=$5,
       license=$6, method=$7, coverage=$8, limitations=$9,
       updated_at=now()
 WHERE layer_id=$1
 RETURNING ...;
```

Migración `076_layer_metadata_admin.sql`: grants y policies para `woll_api`
(`SELECT`/`UPDATE`), idempotente. El API actual usa el rol de servicio, que ya
puede escribir; el grant deja el camino preparado para mínimo privilegio.

## 5. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | sesión válida | abro Metadatos | veo las 71 capas y “sin declarar” | UI/test |
| CA-2 | una capa | guardo fuente/licencia | se actualiza y se refleja al recargar | test/UI |
| CA-3 | `source_url` http | guardo | 400 y no se escribe | test |
| CA-4 | fecha inválida | guardo | 400 | test |
| CA-5 | capa inexistente | guardo | 404 | test |
| CA-6 | sin CSRF | guardo | 403 | test |
| CA-7 | guardado | reviso auditoría | acción `layer.metadata.update` | test/SQL |
| CA-8 | `get_layer_metadata` | consulta la capa editada | devuelve los valores | manual |
| CA-9 | búsqueda | escribo “glaciar” | filtra por capa/nombre | UI |
| CA-10 | lint/tests | ejecuto | 0 errores y 0 fallos | CI |

## 6. Plan por sub-sprint

| Tramo | Contenido | Horas | Estado |
|---|---|---|---|
| 47-E.1 | Handler, rutas, migración 076 y tests | 2 | ✅ |
| 47-E.2 | API client, vista, tabla, formulario y búsqueda | 2 | ✅ |
| 47-E.3 | Validación en VPS, docs y cierre | 1-2 | ✅ |

## 7. Tests requeridos

- `server/handlers/__tests__/admin-layer-metadata.test.js`: sesión, CSRF,
  validación, actualización, 404, auditoría.
- `js` UI: verificación manual (tabla, formulario, búsqueda, foco).
- `npm test` y `npm run lint`.

## 8. Seguridad y procedencia

- Solo sesión admin; CSRF; auditoría por capa.
- No se guardan secretos: los metadatos son públicos.
- `source_url` solo https; no se renderiza HTML.
- Si no hay dato, se muestra “sin declarar”; no se inventa licencia.

## 9. Preguntas abiertas

| # | Pregunta | Default | ¿Bloquea? |
|---|---|---|---|
| R1 | ¿Quién completa los 71 metadatos? | El equipo, desde la UI. | no |
| R2 | ¿Se agrega carga CSV? | No en esta spec. | no |
| R3 | ¿Se muestra en la ficha pública del visor? | No; solo chat/panel. | no |

## 10. Riesgos, reversión y documentación

- **Riesgo:** metadatos incorrectos; la UI muestra la fecha de actualización y
  la auditoría permite rastrear.
- **Reversión:** cada guardado es un `UPDATE`; se puede corregir desde la misma
  vista.
- **Docs:** ROADMAP, CHANGELOG, ARCHITECTURE, DEV_GUIDE.

## 11. Puntos de integración

- `server/handlers/admin-layer-metadata.js`, `server/routes/admin-layer-metadata.js`.
- `admin.html`, `js/admin/main.js`, `js/admin/api.js`.
- `chat.chat_catalog`, `chat_layers_metadata` y `buildEvidence()`.
- Migración `076_layer_metadata_admin.sql`.

## 12. Cierre

- **Horas reales:** ~4 h (estimado 4-6 h).
- **Resultados:**
  - `GET /api/admin/layer-metadata` devuelve 71 capas (200 con sesión;
    401 sin sesión).
  - `PUT` valida https/fecha/largos, actualiza `chat.chat_catalog` y audita
    `layer.metadata.update`.
  - Vista **Metadatos** en `/admin.html` con métricas, búsqueda, tabla y
    formulario; `admin.html` la sirve y el nav la expone.
  - Migración `076_layer_metadata_admin.sql` aplicada en el VPS (grants/policies
    para `woll_api`).
  - `npm test`: 732 tests, 720 pasan, 12 omitidos, 0 fallan.
- **Desvíos:**
  - La ruta se registra dentro de `adminLayerRoutes` para no tocar el
    `routes/index.js` compartido con el trabajo concurrente de WMS pixel.
  - Los 71 metadatos siguen vacíos: la UI está lista, pero la carga de
    fuente/licencia es trabajo de datos del equipo. No se inventaron valores.
- **Lecciones:** separar el editor de procedencia del editor de capas evita
  mezclar la ficha pública con el catálogo del chat; el chat ya consume los
  campos vía `chat_layers_metadata`.
