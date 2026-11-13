# Spec 08-G — Ciclo de vida de capas nuevas y actualización de tiles

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 08-G |
| **Estado de la spec** | CERRADA (CLI, índice, verificación y retención; panel admin en Sprint 16) |
| **Tamaño** | Mediano |
| **Duración estimada** | 4 h |
| **Dependencias** | 08-A, `scripts/load-layer.mjs` (26-E) |
| **Última revisión** | 2026-11-13 |

## 1. Objetivo y contexto

Definir qué pasa cuando se **agrega una capa nueva** o se **edita una capa
existente**: cómo se generan sus tiles, cómo se publica una versión sin romper
la anterior, cómo se actualiza el índice y cómo se invalida la caché. El visor
no debe quedar apuntando a tiles viejos ni a versiones a medio generar.

La regla central es la misma de 08-A: **una versión publicada es inmutable**. Un
cambio de datos no sobrescribe `tiles/<layer>/<version>/`; publica una versión
nueva y la configuración (o el índice) apunta a ella.

## 2. Alcance

**Dentro**
- `scripts/tiles-sync.mjs`: publicación por lote, detección de cambios,
  índice, verificación y retención.
- `load-layer --tiles`: alta de capa + generación de tiles en un solo paso.
- Detección de capas nuevas y editadas contra `chat.chat_catalog.updated_at`.
- Versionado automático (`YYYYMMDD`) y explícito (`--version 2026`).
- Verificación (`--check`) y retención (`--prune`).
- Documentación del flujo manual y del flujo futuro desde el panel admin.

**Fuera**
- UI del panel admin (Sprint 16).
- Edición de geometría/atributos (Sprint 16).
- Programación por systemd/cron (Sprint 26-J).
- Invalidación selectiva de tiles por feature (no aplica: la versión es inmutable).
- Recarga en caliente del visor (Sprint 07/15).

## 3. Reglas del CONTRACT que aplican

| Regla | Implicancia |
|---|---|
| Una versión publicada no se sobrescribe | Publicar = nueva versión; `--force` es una excepción explícita |
| Reversión por capa | La versión anterior queda en disco y en el índice |
| Sin servicios específicos de Vercel | El ciclo corre como CLI en el VPS, portable a systemd |
| Migraciones idempotentes | No aplica: no hay cambios de schema en este tramo |
| Tests por feature | `tiles-sync` tiene tests de fechas, índice y verificación |

## 4. Contrato de datos y CLI

### 4.1. Flujo al agregar una capa

```
1. load-layer <archivo> --table <t> --dimension <d> --tiles
   ├─ crea la tabla en PostGIS (gid, geom, atributos, GIST)
   ├─ upsert en chat.chat_catalog
   ├─ chat_refresh_stats
   └─ tiles-sync --layer <layer_id> --version <YYYYMMDD>
        ├─ genera tiles/<layer>/<version>/...
        ├─ escribe manifest.json
        └─ regenera tiles/index.json
2. Revisar el manifest y el snippet de config (`tiles:build --publish`).
3. Apuntar la capa del visor a `source.tiles` (Sprint 08-B/07).
```

Si la generación de tiles falla, la capa queda cargada y el comando termina con
código 1; se reintenta con `npm run tiles:sync -- --layer <id> --version <v>`.

### 4.2. Flujo al editar una capa

```
1. Reemplazar los datos (load-layer --force o scripts propios).
2. chat.chat_catalog.updated_at cambia.
3. npm run tiles:sync -- --changed
   ├─ compara updated_at vs manifest.generated_at
   ├─ publica una versión nueva (YYYYMMDD o --version)
   └─ actualiza index.json
4. Cambiar la config a la versión nueva (o dejar que /api/config la resuelva).
```

La versión anterior sigue disponible por URL; no hay que purgar caché porque la
URL cambia. Nginx puede mantener `immutable` en todas las versiones.

### 4.3. Detección de cambios

| Situación | Acción |
|---|---|
| Capa sin directorio o sin manifest | Publicar versión inicial (`YYYYMMDD`) |
| `updated_at` > `manifest.generated_at` | Publicar versión nueva |
| `updated_at` ≤ `manifest.generated_at` | Omitir (al día) |
| `--layer` con `--version` ya publicada | Error, salvo `--force` |
| Capa de puntos | Omitir por defecto (GeoJSON + API) |

`--all` publica todas las capas habilitadas que no tengan tiles; `--changed`
hace lo mismo pero además republica las editadas. En ambos casos una capa al
día se omite.

### 4.4. Versiones

- Explícita: `--version 2024`, `--version 2026` para ediciones y años.
- Automática: `YYYYMMDD` de `updated_at`.
- Colisión: `YYYYMMDD-2`, `-3`… solo para versiones automáticas.
- La versión activa es la de `generated_at` más reciente.

### 4.5. Índice

`tiles/index.json`:

```json
{
  "generated_at": "2026-11-13T04:00:00.000Z",
  "layers": [
    {
      "layer_id": "borde_costero",
      "active_version": "2026",
      "versions": [
        {
          "version": "2026",
          "manifest": "/tiles/borde_costero/2026/manifest.json",
          "url_template": "/tiles/borde_costero/2026/{z}/{x}/{y}.mvt",
          "tiles": 2887,
          "bytes": 8180211,
          "checksum": "…",
          "minzoom": 0,
          "maxzoom": 14,
          "feature_count": 382,
          "generated_at": "2026-11-13T03:58:11.000Z"
        }
      ]
    }
  ]
}
```

### 4.6. Verificación y retención

- `--check`: recorre los `.mvt` de cada versión, recalcula tiles/bytes/checksum,
  compara con el manifest y con `SELECT count(*)` de la tabla física. Sale con
  código 1 si hay diferencias.
- `--prune --keep N`: conserva las N versiones más recientes por capa y borra el
  resto. Con `--dry-run` solo informa.
- Versiones sin manifest (corridas cortadas) no se listan ni se publican; se
  pueden borrar a mano sin afectar el índice.

### 4.7. Automatización futura (VPS)

```bash
# Timer diario en el host del VPS (Sprint 26-J), sobre el checkout que
# Nginx monta en /srv/woll. Requiere Node 22 en el host.
cd /srv/woll
DATABASE_ADMIN_URL=postgres://postgres:CLAVE@127.0.0.1:5432/woll \
  npm run tiles:sync -- --changed
DATABASE_ADMIN_URL=postgres://postgres:CLAVE@127.0.0.1:5432/woll \
  npm run tiles:sync -- --prune --keep 2
```

**No** correr el generador con `docker compose run api ...` sin montar el
directorio: la imagen no incluye `tiles/` y los archivos quedarían dentro del
contenedor. Si el host no tiene Node, hay que montar el checkout y usar el
`DATABASE_ADMIN_URL` interno (`postgres:5432`); el `tiles/` resultante debe
quedar en el bind mount de Nginx.

El comando es portable: no depende de Vercel, Supabase ni un servicio externo.
En el panel admin (Sprint 16), el alta/edición de una capa dispara el mismo
comando y muestra el manifest resultante.

## 5. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | una capa nueva cargada con `--tiles` | termina `load-layer` | existen tiles, manifest e índice | test/CLI |
| CA-2 | una capa editada | se ejecuta `--changed` | publica una versión nueva y conserva la anterior | test |
| CA-3 | una capa al día | se ejecuta `--changed` | no genera ni sobrescribe nada | test |
| CA-4 | una versión ya publicada | se pasa `--version` igual sin `--force` | falla con mensaje claro | test |
| CA-5 | una capa de puntos | se ejecuta `--changed` | se omite y lo informa | test |
| CA-6 | un tile alterado o borrado | se ejecuta `--check` | detecta la diferencia y sale con código 1 | manual/test |
| CA-7 | 3 versiones publicadas | se ejecuta `--prune --keep 2` | quedan las 2 más recientes | test |
| CA-8 | una versión antigua | se pide por Nginx | sigue respondiendo 200 con caché inmutable | manual |
| CA-9 | el índice | se publica una versión | `active_version` apunta a la nueva | inspección |
| CA-10 | PostgreSQL caído | se piden tiles publicados | el visor sigue funcionando | manual |

**Verificación local 2026-11-13.** Con una capa temporal (`test_camaras_frio`,
65 tiles) se probó el ciclo completo: `load-layer --tiles` → manifest → índice;
republicar la misma versión falla con código 1; borrar un tile hace que
`--check` detecte tiles/bytes/checksum y salga con código 1; `--prune --keep 1`
borra solo la versión vieja. La capa de prueba se eliminó después.

## 6. Plan por sub-tramo

| Sub-tramo | Contenido | Horas | Estado |
|---|---|---|---|
| 08-G.1 | `tiles-sync`: versiones, detección de cambios, índice | 2 | ✅ |
| 08-G.2 | `--check`, `--prune`, `load-layer --tiles` | 1 | ✅ |
| 08-G.3 | Tests y documentación del ciclo | 1 | ✅ |
| 08-G.4 | Integración con panel admin (Sprint 16) | — | ⏳ |

## 7. Tests requeridos

- **Unitarios:** `dateVersion`, validación de args, detección de versión libre,
  formato del índice y del manifest.
- **Integración (opt-in):** publicar dos versiones de una capa de prueba,
  verificar que la anterior sigue en disco, ejecutar `--check` y `--prune`.
- **Manual:** `load-layer --tiles` sobre un GeoJSON pequeño; pedir la versión
  anterior por Nginx después de publicar la nueva.

## 8. Seguridad y procedencia

- El comando corre con `DATABASE_ADMIN_URL` solo en el servidor/CI; nunca en el
  navegador.
- `--prune` solo borra directorios bajo `tiles/<layer>/<version>` con manifest
  válido; no sigue symlinks ni acepta paths externos.
- Los manifests y el índice son archivos estáticos; no ejecutan código.
- Los datos de origen no se modifican: la regeneración es de solo lectura sobre
  PostGIS.

## 9. Preguntas abiertas

| # | Pregunta | Default | ¿Bloquea? |
|---|---|---|---|
| G1 | ¿La versión activa se resuelve por índice o por config? | Config por capa (Sprint 08-B); el índice queda para `/api/config` y el panel | no |
| G2 | ¿Retención por cantidad o por antigüedad? | Cantidad (`--keep 2`); se puede sumar antigüedad si el disco crece | no |
| G3 | ¿Quién aprueba la publicación en producción? | El dev, con `--changed` y revisión del manifest | no |
| G4 | ¿Se regenera todo con `--force` tras un cambio de estilo? | No: el estilo no vive en el tile; solo cambian datos | no |

## 10. Riesgos, reversión y documentación

- **Riesgo:** publicar tiles de una tabla a medio cargar. **Mitigación:** el
  `load-layer` genera después del commit y del refresh de stats.
- **Riesgo:** índice y config desincronizados. **Mitigación:** el índice es
  derivado y `--check` valida; la config se cambia en el mismo commit.
- **Reversión:** cambiar la config a la versión anterior; los tiles viejos no se
  borran hasta `--prune`.
- **Docs:** `docs/DEV_GUIDE.md` (flujo de alta/edición), `docs/ARCHITECTURE.md`
  (§7), `docs/ROADMAP.md`, `docs/CHANGELOG.md`.

## 11. Puntos de integración

- **08-A:** reutiliza `buildTiles` y el contrato de manifest.
- **08-B:** la config de la capa apunta a la versión activa.
- **Sprint 07:** `/api/config` puede leer `tiles/index.json`.
- **Sprint 15/16:** el panel admin dispara `tiles:sync` y muestra el manifest.
- **26-J:** timer de publicación y retención.

## 12. Cierre

- Horas reales: 3,5 de 4. La integración con el panel admin corresponde al Sprint 16; el CLI y el contrato están cerrados.
- Desvíos: se agregó el maxzoom adaptativo y `load-layer --tiles` dentro del
  mismo tramo.
- Lecciones: el versionado por fecha funciona para capas nuevas, pero las
  ediciones de negocio (catastro 2024/2026, incendios por año) deben pasar
  `--version` explícita.
