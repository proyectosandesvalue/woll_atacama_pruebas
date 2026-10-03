# ADR 004: Promoción manual de código entre pruebas y producción

## Estado
Aceptado — 2026-10-02

## Contexto

Los repos de pruebas y producción están aislados (ADR 001). El código se desarrolla en pruebas y, cuando está validado, se promueve a producción.

Se consideraron tres mecanismos:
1. **Script automático** que copia archivos entre repos.
2. **PR de repo a repo** (GitHub no lo soporta nativamente).
3. **Copia manual** de archivos.

## Decisión

**Copia manual** de archivos entre repos.

El proceso es:
1. Identificar qué archivos cambiaron respecto al último estado conocido de producción.
2. Copiarlos del repo de pruebas al repo de producción.
3. Commit y push al repo de producción.
4. Vercel de producción deploya automáticamente.
5. Verificar en producción.

## Cómo identificar qué copiar

```bash
cd <repo-pruebas>

# Diff contra el repo de prod
git diff main <ruta-repo-prod>/main --name-only

O comparar directorios con diff -r:

diff -rq <repo-pruebas>/js <repo-prod>/js

Cómo copiar

# Ejemplo: copiar un archivo
cp <repo-pruebas>/js/utils/foo.js <repo-prod>/js/utils/foo.js

# Ejemplo: copiar un directorio entero
cp -r <repo-pruebas>/server/chat/tools/* <repo-prod>/server/chat/tools/

Después:

cd <repo-prod>
git add <archivos>
git commit -m "release: <descripción de la feature>"
git push origin main

Consecuencias
Positivas:

Control total sobre qué se promueve y qué no.

El dev ve explícitamente cada archivo que cruza.

No hay automatización mágica que rompa.

Negativas:

Fricción (hay que hacerlo a mano).

Riesgo de olvidarse de copiar un archivo.

No hay "historial de promociones" automático.

Mitigación:

Antes de copiar, hacer un git diff entre repos para ver la lista completa.

Usar diff -r entre directorios para verificar que no queda nada afuera.

Escribir un CHANGELOG en el repo de prod por cada release.

(Futuro) Si la fricción se vuelve dolorosa, automatizar con un script en scripts/promote.sh.

Cuándo promover
Después de validar la feature en pruebas con el flujo completo.

Al final de un sprint, no durante.

Nunca un viernes a la tarde.

Alternativas rechazadas
Script automático: rechazado por ahora porque agrega complejidad y no hay volumen suficiente de cambios. Si el flujo se repite 5+ veces por semana, reconsiderar.

PR de repo a repo: rechazado porque GitHub no lo soporta directamente. Se puede simular con git remote add + git cherry-pick, pero es igual de manual y menos explícito.

Notas
Si en el futuro hay más de un dev, este ADR debería revisarse: probablemente convenga volver a un solo repo con ramas.


---

## Cómo crearlos

En tu terminal:

```bash
cd "/media/osx/Respaldo/Proyectos/2025 - Atacama Andes Value/woll_atacama_pruebas"
mkdir -p docs/DECISIONS

Después, creá cada archivo con el contenido que te pasé arriba. Podés usar nano, code, gedit, o el editor que prefieras:

nano docs/DECISIONS/001-dos-repos-separados.md
nano docs/DECISIONS/002-config-planos.md
nano docs/DECISIONS/003-ambientes.md
nano docs/DECISIONS/004-promocion-manual.md

Recordatorio: .md — Markdown.

Verificación
Cuando termines, verificá:

ls -la docs/
# Debe mostrar: CONTRACT.md, ARCHITECTURE.md, DECISIONS/

ls -la docs/DECISIONS/
# Debe mostrar: 001-dos-repos-separados.md, 002-config-planos.md,
#               003-ambientes.md, 004-promocion-manual.md
