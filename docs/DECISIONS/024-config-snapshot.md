# ADR 024 — Configuración del visor como snapshot versionado

| Campo | Valor |
|---|---|
| Estado | Aceptada |
| Fecha | 2026-11-13 |
| Origen | Sprint 14 / decisión del dev |
| Relacionado | ADR 002 (planos), CONTRACT §7.1, spec 14-15 |

## Contexto

`js/config/*.js` sigue siendo la fuente de verdad del visor, pero el CONTRACT
§7.1 exige que el runtime no lea esos archivos y que la configuración se pueda
gobernar desde el panel admin. Migrar de golpe a tablas normalizadas
(dimensiones, grupos, capas, alias, estilos) implica un esquema grande y
frágil antes de tener el panel.

Opciones evaluadas:

1. Mantener todo en JS y solo leer desde el panel (no cumple §7.1).
2. Normalizar toda la config en tablas desde el Sprint 14.
3. Guardar la config completa como snapshot JSON versionado y derivar un
   índice plano de capas para el panel.

## Decisión

Se adopta la opción 3:

- `admin.config_snapshots` guarda el JSON completo de `allTemasConfig` con
  checksum SHA-256, autor, notas y una sola versión activa.
- `admin.config_layers` es un **índice derivado** del snapshot (dimensión,
  grupo, subgrupo, capa, tipo, fuente, tiles y config de la capa). No es la
  fuente de verdad; se reconstruye al publicar.
- `GET /api/config` devuelve el snapshot activo con ETag y caché de 5 min.
  Si la BD o la API fallan, el frontend usa `allTemasConfig` (INV-5).
- La autoría sigue en `js/config/*.js` hasta el Sprint 16. El CLI
  `npm run config:snapshot -- --publish` valida y publica.
- Las versiones son inmutables: un cambio crea una versión nueva y activa la
  nueva; la anterior queda para rollback.
- El Sprint 16 podrá editar `admin.config_layers` y publicar un snapshot
  generado desde la BD sin cambiar el contrato de `/api/config`.

## Consecuencias

**Positivas**
- Migración pequeña y reversible.
- El runtime deja de importar config JS.
- El panel lista capas con SQL simple.
- Rollback inmediato activando otra versión.

**Negativas**
- Hay dos representaciones (JSON + índice) que deben publicarse juntas.
- Si se edita `js/config` y no se republica, el visor no ve el cambio.
  Mitigación: `config:snapshot --check` en el runbook/CI con BD.
- El snapshot pesa cientos de KB; Nginx lo comprime y el ETag evita
  transferencias repetidas.

## Alternativas descartadas

- **Normalización total en 14:** más riesgo y horas; el panel de solo lectura
  no la necesita todavía.
- **Solo JS:** incumple el CONTRACT y bloquea el panel.
- **Snapshot sin índice:** el panel tendría que recorrer el JSON en cada
  búsqueda; el índice es barato y desacopla la UI.

## Pendiente

- Edición y publicación desde el panel (Sprint 16).
- Comparar snapshots (diff visual) en el panel.
- Evaluar compresión/particionado si el corpus de capas crece mucho.
