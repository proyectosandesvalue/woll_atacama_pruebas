# docs/specs — Especificaciones por sprint

> Una spec define **qué** se construye y **cómo se sabrá que está terminado**, antes de escribir código. Es parte del repo: se versiona, se revisa en el diff y viaja junto al código que describe.

## Cómo se organizan

| Tamaño del sprint | Qué se escribe | Dónde |
|---|---|---|
| Pequeño (< 8h) y mediano (8-15h) | Una spec con la plantilla `_TEMPLATE-sprint.md` | `docs/specs/NN-nombre.md` |
| Grande (> 15h) | Spec madre (`_TEMPLATE-epic.md`) + una spec por tramo, escrita al empezar el tramo | `docs/specs/NN-nombre/00-spec-madre.md` y `NN-A-nombre.md`, `NN-B-nombre.md`... |
| Bloqueado por una decisión técnica | Primero un spike y su ADR; la spec después | `docs/DECISIONS/` y luego `docs/specs/` |

## Estados de una spec

`DRAFT` → `APROBADA` → `EN EJECUCIÓN` → `CERRADA`

- No se escribe código de una spec en `DRAFT`.
- Una spec no pasa a `APROBADA` con preguntas abiertas sin responder.
- Al cerrar, se completa la sección de cierre (horas reales y desvíos).

## Índice

| Spec | Sprint | Tamaño | Estado |
|---|---|---|---|
| [06-respuesta-geoespacial](06-respuesta-geoespacial.md) | 06 | Pequeño | APROBADA |
| [08-postgis-fuente-principal](08-postgis-fuente-principal/00-spec-madre.md) | 08 | Grande | APROBADA |
| [14-15-panel-admin](14-15-panel-admin.md) | 14-15 | Mediano | EN EJECUCIÓN |
| [17-ingesta-rag](17-ingesta-rag.md) | 17 | Mediano | EN EJECUCIÓN |
| [26-plataforma](26-plataforma/00-spec-madre.md) | 26 | Grande | EN EJECUCIÓN |
| [28-seguridad-frontend](28-seguridad-frontend.md) | 28 | Mediano | PARCIAL CERRADA (ZAP/capa base pendientes) |
| [30-aceptacion](30-aceptacion.md) | 30 | Grande | EN EJECUCIÓN |
| [31-observabilidad](31-observabilidad.md) | 31 | Mediano | PARCIAL (31-A/B/E ✅) |
| [32-marco-legal-privacidad](32-marco-legal-privacidad.md) | 32 | Mediano | DRAFT (A/B/C) |
| [44-indicadores-copernicus](44-indicadores-copernicus.md) | 44 | Mediano | CERRADA |
| [45-panel-admin-operaciones](45-panel-admin-operaciones/00-spec-madre.md) | 45-48 | Grande | EN EJECUCIÓN (47-C/VPS pendientes) |
| [49-publicador-raster](49-publicador-raster.md) | 49 | Mediano | CERRADA (local) |
| [50-demanda-no-satisfecha](50-demanda-no-satisfecha.md) | 50 | Mediano | CERRADA |
| 22-alineacion-documentacion | 22 | Pequeño | PARCIAL (A-F; ajustes) |

## Reglas

- Las specs no duplican el CONTRACT: lo enlazan por número de sección.
- Los cambios al comportamiento se hacen **primero en la spec** y después en el código.
- El ROADMAP dice *qué sprint sigue*; la spec dice *cómo se hace*. Cada fila del ROADMAP enlaza a su spec.
- Las specs viven en el repo de pruebas. `docs/` ya está excluido del bundle de Vercel (`excludeFiles`), por lo que no pesa en las Functions.
- Para redactar o actualizar una spec, cargar la skill `spec-writer` y usar `_TEMPLATE-sprint.md` (o `TEMPLATE-epic.md` si es grande).