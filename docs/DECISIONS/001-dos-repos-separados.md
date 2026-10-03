# ADR 001: Dos repositorios separados (producción y pruebas)

## Estado
Aceptado — 2026-10-02

## Contexto

El proyecto tiene un visor en producción con usuarios reales y, por otro lado, necesidad de iterar rápido en nuevas features sin arriesgar el sistema en vivo. Se evaluaron tres alternativas:

1. **Un solo repo con dos ramas** (`main` = prod, `dev` = staging).
2. **Dos repos separados** (prod + pruebas), cada uno con su Vercel y Supabase.
3. **Un solo repo con dos Vercel projects** apuntando a ramas distintas.

## Decisión

**Dos repositorios separados**, cada uno con su propio Vercel y Supabase:
- Repo de **producción**: el que ya está vivo, no se toca desde acá.
- Repo **`woll_atacama_pruebas`**: laboratorio. Ahí se desarrolla.

La **promoción de código entre repos es manual**, copiando archivos del repo de pruebas al repo de producción cuando una feature está validada.

## Consecuencias

**Positivas**:
- Aislamiento total: un error en pruebas no puede afectar producción (ni por accidente).
- Cada ambiente tiene su propia base de datos, Vercel, y config.
- El dev puede experimentar sin miedo en pruebas.
- Los secretos de producción no están expuestos al repo de pruebas.

**Negativas**:
- La promoción de código es manual (fricción).
- Los repos pueden divergir con el tiempo.
- No hay un historial unificado entre los dos.
- Duplicar trabajo (bump de versiones, actualizaciones de dependencias).

**Mitigación**:
- Documentar claramente el proceso de promoción (`docs/DECISIONS/004-promocion-manual.md`).
- Mantener los dos repos lo más similares posible en estructura.
- Promover pronto y seguido, no acumular features.

## Alternativas rechazadas

**Un solo repo con ramas**: rechazado porque en la práctica termina mezclando código entre ambientes, y la tentación de "hotfixear en prod" rompe el aislamiento. Además, la persona trabajando hoy es una sola; la complejidad de ramas no aporta.

**Un solo repo con dos Vercel projects**: rechazado por el mismo motivo. Dos Vercel projects sobre un mismo repo no son verdaderos ambientes si comparten la base de datos.