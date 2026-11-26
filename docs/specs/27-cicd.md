# Spec 27 — CI/CD y entrega versionada

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 27 |
| **Estado de la spec** | EN EJECUCIÓN (CI de lint/tests/sintaxis/build; deploy y rollback pendientes) |
| **Tamaño** | Mediano |
| **Duración estimada** | 7-8 h |
| **Dependencias** | 26-D (Compose/Nginx), 26-G (backups) |
| **Última revisión** | 2026-11-13 |

## 1. Objetivo y contexto

El VPS se actualiza con `git pull` + `docker compose build/up`, sin un proceso
repetible que valide antes de tocar producción. Este tramo agrega integración
continua (lint, tests, sintaxis y build de la imagen de la API) y deja el camino
para entrega versionada y rollback por tag.

No se agrega despliegue automático todavía: el VPS no está conectado y el corte
es 26-I. El CI debe ser portable y no depender de Vercel/Supabase.

## 2. Alcance

**Dentro**
- `.github/workflows/ci.yml` en push a `main`, PR y manual.
- Node 22, `npm ci`, `npm run lint`, `npm test`.
- `node --check` de los `.mjs` y `bash -n` de los `.sh`.
- Build de `docker/api/Dockerfile`.
- Concurrencia por rama y cancelación de corridas viejas.

**Fuera**
- Deploy automático al VPS (requiere secretos/SSH y 26-I).
- Registro de imágenes (GHCR/Docker Hub) y tags.
- Migraciones automáticas en producción (se ejecutan con backup y ventana).
- Tests de integración con PostgreSQL en CI (hoy se omiten sin BD).

## 3. Workflow

```yaml
on: [push main, pull_request, workflow_dispatch]
jobs:
  test:
    - npm ci
    - npm run lint
    - npm test
    - node --check scripts/**/*.mjs
    - bash -n scripts/**/*.sh
  docker:
    needs: test
    - docker build -f docker/api/Dockerfile -t woll-api:ci .
```

- `concurrency` cancela corridas anteriores de la misma rama.
- Los tests que requieren BD se omiten solos (`TEST_DATABASE_URL` ausente).
- El build usa el `.dockerignore` actual (excluye `geojson/`, `tiles/`, `docs/`).

## 4. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | un push a `main` | corre el workflow | lint, tests, sintaxis y build verdes | GitHub Actions |
| CA-2 | un PR | se abre/actualiza | el workflow corre y bloquea si falla | GitHub Actions |
| CA-3 | un `.mjs` con error de sintaxis | se hace push | el job falla en `node --check` | workflow |
| CA-4 | un `.sh` con error | se hace push | el job falla en `bash -n` | workflow |
| CA-5 | un Dockerfile roto | se hace push | el job `docker` falla | workflow |
| CA-6 | dos pushes seguidos | corre el CI | el anterior se cancela | pestaña Actions |

## 5. Pendiente para cerrar 27

1. **Tag/release:** construir y publicar imágenes `woll/api:<tag>` (GHCR) y
   `woll/postgres:<tag>`.
2. **Deploy manual protegido:** job `workflow_dispatch` con environment
   `production`, SSH al VPS, `git fetch && git checkout <tag>`,
   `docker compose build/up`, healthcheck y rollback al tag anterior.
3. **Migraciones:** paso explícito con backup previo y `npm run migrate`.
4. **Tests de integración:** job con PostgreSQL/PostGIS en servicio y
   `TEST_DATABASE_URL`, aplicando migraciones 000-040.
5. **Secretos:** `SSH_HOST`, `SSH_USER`, `SSH_KEY`, `ENV_FILE`; nunca en logs.

## 6. Seguridad

- El workflow usa `GITHUB_TOKEN` con permisos mínimos (`contents: read`).
- No imprime secretos; el deploy futuro usará `environment` protegido.
- Las acciones están fijadas a `@v4`; evaluar SHA pinning en 28.
- El build no recibe secretos ni `.env`.

## 7. Reversión

Desactivar el workflow en GitHub o quitar `ci.yml`. No toca producción: solo
valida. El deploy/rollback se define en el cierre de 27.

## 8. Cierre

- Horas reales: 1 (CI base).
- Pendiente: artefactos, deploy y rollback; se harán cuando el VPS esté
  conectado (26-F/26-I).


## 9. Deploy manual implementado (2026-11-26)

- Workflow `.github/workflows/deploy.yml` con `workflow_dispatch`, entorno
  `production` y `concurrency: deploy-vps`.
- Se conecta por SSH con una llave dedicada; en el VPS está restringida con
  `command="/srv/woll/deploy/vps/release.sh --with-chat",restrict`, así que no
  abre shell ni permite otros comandos.
- Secretos requeridos: `SSH_HOST`, `SSH_USER`, `SSH_KEY`, `SSH_KNOWN_HOSTS`.
- El release corre backup, build, migraciones, `up`, smoke de rutas y chat.
- Pendiente: cargar los secretos, crear el environment con revisores y hacer
  la primera corrida desde GitHub. Rollback: `git revert` + ejecutar el mismo
  workflow.
