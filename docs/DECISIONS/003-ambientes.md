# ADR 003: Dos ambientes (producción y pruebas) con infraestructura aislada

## Estado
Aceptado — 2026-10-02

## Contexto

El sistema necesita un lugar para:
- Desarrollar features nuevas sin romper producción.
- Validar cambios antes de que lleguen a usuarios reales.
- Probar migraciones de base de datos.
- Iterar rápido.

Se consideraron dos opciones:
1. **Un solo ambiente** (producción), con desarrollo local para validar.
2. **Dos ambientes** (producción + pruebas), cada uno con su infraestructura.

## Decisión

**Dos ambientes**:

| Ambiente | Repo | Vercel | Supabase | URL |
|---|---|---|---|---|
| **Producción** | repo privado (existente) | project prod | project prod | dominio real |
| **Pruebas** | `woll_atacama_pruebas` | `visor_atacama_pruebas` | `visor_atacama_pruebas` | `wollatacamapruebas.vercel.app` |

**Infraestructura completamente aislada**: no se comparte ni la BD ni las env vars ni los secretos entre ambientes.

**Local** (dev) usa las credenciales de **pruebas**, no de producción.

## Consecuencias

**Positivas**:
- Un bug en pruebas **no puede** afectar producción (ni accidentalmente).
- Las migraciones de BD se prueban en pruebas antes de aplicarse a producción.
- Los secretos de producción nunca están en la máquina del dev.
- El dev puede romper cosas libremente.

**Negativas**:
- Doble de infraestructura que mantener (2 Vercel + 2 Supabase).
- Configuración duplicada (env vars en ambos).
- Los datos de pruebas pueden divergir de producción si no se sincronizan.

**Mitigación**:
- Documentar el proceso de promoción a producción (ADR 004).
- Antes de promover, verificar que la base de datos de producción tiene el mismo schema que pruebas.

## Alternativas rechazadas

**Un solo ambiente**: rechazado porque implica que todo cambio va directo a producción. Un error = usuarios afectados. Es el modelo que queremos evitar.

**Dos Supabase en un mismo proyecto con schemas separados**: rechazado por riesgo de contaminación. Los schemas conviven en el mismo cluster; un `DROP SCHEMA` mal escrito los afecta a ambos. Mejor dos proyectos físicamente separados.

## Notas

- Si en el futuro el proyecto tiene más de un desarrollador, se puede agregar un tercer ambiente (QA) sobre otro Vercel + Supabase. El modelo de ambientes aislados lo permite sin refactor.
- Los costos actuales: Supabase free tier soporta 2 proyectos sin costo adicional.