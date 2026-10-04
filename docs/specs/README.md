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
| [08-postgis-fuente-principal](08-postgis-fuente-principal/00-spec-madre.md) | 08 | Grande | DRAFT |
| 22-alineacion-documentacion | 22 | Pequeño | por escribir |

## Reglas

- Las specs no duplican el CONTRACT: lo enlazan por número de sección.
- Los cambios al comportamiento se hacen **primero en la spec** y después en el código.
- El ROADMAP dice *qué sprint sigue*; la spec dice *cómo se hace*. Cada fila del ROADMAP enlaza a su spec.
- Las specs viven en el repo de pruebas. `docs/` ya está excluido del bundle de Vercel (`excludeFiles`), por lo que no pesa en las Functions.