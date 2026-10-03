# ADR 002: Tres planos de configuración (estructura / datos / secretos)

## Estado
Aceptado — 2026-10-02

## Contexto

El sistema tiene tres tipos de información configurable que, si se mezclan, producen confusión:

1. **Estructura**: qué dimensiones existen, qué capas hay, qué tools tiene el chat, qué integraciones externas existen. Esto **requiere código** para que el sistema sepa cómo renderizarlas.
2. **Datos**: valores específicos de cada recurso (colores, alias, textos, PDFs). No requieren código, son operables.
3. **Secretos e infraestructura**: API keys, URLs de BD, config de Vercel. Son información sensible.

Si todo se mete en el mismo lugar (por ejemplo, todo en código, o todo en base de datos), surgen problemas:
- **Todo en código**: cada cambio de color necesita un PR + deploy. La operación se vuelve lenta y el dev se convierte en cuello de botella.
- **Todo en BD**: los errores de config se vuelven silenciosos, no hay validación estructural, y se rompe el principio de "código define forma, datos llenan contenido".
- **Secretos en cualquier lado**: vulnerabilidad.

## Decisión

Definir **tres planos** con ubicación y responsables claros:

| Plano | Qué contiene | Dónde vive | Quién lo cambia |
|---|---|---|---|
| **Estructura** | Dimensions, capas, tools, integraciones (definición) | Código | Dev |
| **Datos** | Valores, colores, alias, textos, PDFs | BD (futuro: panel admin) | Operador (futuro) |
| **Secretos e infra** | API keys, URLs, config Vercel | Env vars | Dev |

**Regla de oro**: si el cambio **requiere escribir código** para que funcione, es Estructura. Si es solo un valor, es Datos. Si es sensible, es Secreto.

## Estado actual

- **Estructura**: en código (`js/config/*.js`, `server/chat/tools.js`).
- **Datos**: también en código hoy (`js/config/*.js` contiene colores, alias, textos). Se migrará a BD cuando exista el panel admin.
- **Secretos**: ya en env vars.

## Consecuencias

**Positivas**:
- Cada cambio va al lugar correcto sin ambigüedad.
- Los errores de Estructura se detectan con validación + tests.
- Los errores de Datos se detectan con validación en el panel (cuando exista).
- Los Secretos no se filtran.

**Negativas**:
- Hoy (sin panel admin) los planos 1 y 2 están mezclados en código. El operador no puede tocar Datos sin ayuda del dev.
- La migración del plano 2 a BD agrega complejidad (snapshot, regeneración, caché).

**Mitigación**:
- Documentar el plano 2 explícitamente en los archivos JS de config (comentario).
- Priorizar el panel admin en el roadmap (fase 5+).

## Alternativas rechazadas

**Todo en código**: rechazado porque escala mal. Cada cambio de color requeriría un PR + deploy.

**Todo en BD**: rechazado porque rompe la validación estructural, dificulta el debug y mete secretos en un lugar con RLS.

**Un solo plano (mezclar todo)**: rechazado por ser el origen del problema que este ADR resuelve.
