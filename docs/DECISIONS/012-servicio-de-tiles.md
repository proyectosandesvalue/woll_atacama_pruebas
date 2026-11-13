# ADR 012 — Servicio de tiles vectoriales: pregenerado + Nginx

| Campo | Valor |
|---|---|
| Estado | Aceptada (revisable con la prueba de carga) |
| Fecha | 2026-11-13 |
| Origen | Sprint 08-0 / 08-A |
| Relacionado | ADR 005 (VPS), ADR 010 (Nginx), spec 08 |

## Contexto

El Sprint 08 reemplaza la descarga de GeoJSON completos por tiles del viewport.
El VPS objetivo es 4 vCPU / 8 GB / 80 GB y debe atender 20-50 usuarios. Las
capas del catálogo son casi todas estáticas o por edición (catastro 2024/2026,
incendios anuales, derechos 2025); solo los valores meteorológicos y algunos
indicadores cambian con frecuencia.

Opciones evaluadas:

| Opción | Runtime | Disco | Actualización | Operación |
|---|---|---|---|---|
| (a) MVT pregenerado `z/x/y.mvt` + Nginx | Casi nulo | Archivos pequeños | Regenerar versión | Simple; sin servicio nuevo |
| (b) PMTiles + Nginx | Casi nulo | Un archivo por capa | Regenerar archivo | Requiere lector Range; menor cantidad de archivos |
| (c) `ST_AsMVT` on-demand + caché | CPU de PostgreSQL por tile | Caché | Inmediata | Martin/pg_tileserv o ruta Node; más superficie |
| (d) Martin / pg_tileserv | Servicio extra | Caché | Inmediata | Contenedor y configuración adicionales |

## Decisión

1. **Pregenerado (a) por defecto** para capas estáticas y por edición.
   - `tiles/<layer_id>/<version>/<z>/<x>/<y>.mvt`.
   - Generación offline con `scripts/build-tiles.mjs`.
   - Nginx sirve `/tiles/` con `application/vnd.mapbox-vector-tile`, gzip y
     `Cache-Control: public, max-age=31536000, immutable`.
   - PostgreSQL no participa en runtime.
2. **On-demand (c) solo** para capas/valores dinámicos y filtros que cambian la
   geometría; se implementará cuando exista la primera capa de ese tipo.
3. **PMTiles (b) queda como alternativa** si el número de archivos o el `rsync`
   se vuelven un problema; no se adopta ahora.
4. **Martin/pg_tileserv (d) no se instala**: agrega un servicio y no es necesario
   para el volumen actual.
5. **Versionado inmutable:** actualizar datos publica una versión nueva; la
   anterior se conserva hasta la retención (`--prune`).
6. **Puntos ≤5.000:** GeoJSON + API de valores y cluster/heatmap en cliente. No
   se generan tiles de puntos por defecto (medición: 920 puntos → 8,2 MB de
   tiles vs 0,19 MB de GeoJSON gzip).
7. **Límite de 20.000 tiles por capa** con degradación automática del `maxzoom`
   (capas regionales bajan de z14 a z13).

## Evidencia

| Capa | Features | Tiles | Bytes | Tiempo | GeoJSON |
|---|---:|---:|---:|---:|---:|
| `borde_costero` | 382 | 2.887 | 7,80 MB | 98,7 s | 47,0 MB |
| `humedales` | 1.429 | 2.518 | 3,64 MB | 29,8 s | 24,1 MB |
| `hidrografia` | 734 | 7.232 | 11,98 MB | 42,6 s | 13,9 MB |
| `derechos_agua_2025` | 920 | 847 | 8,22 MB | 20,1 s | 3,7 MB (0,19 MB gzip) |

Generación local con PostgreSQL 17.11/PostGIS 3.7, 3 workers y simplificación por
zoom. La materialización de la geometría 3857 por zoom redujo el costo de ~40 a
~8-11 ms por tile.

## Consecuencias

**Positivas**
- El VPS no gasta CPU de PostgreSQL sirviendo mapas; Nginx entrega archivos.
- La caché es inmutable y no requiere purga: cambia la URL con la versión.
- El despliegue es portable (archivos + Nginx), sin servicios específicos de
  Vercel/Supabase.
- La reversión es cambiar `source.version` o volver a GeoJSON.

**Negativas**
- Hay que generar y transportar tiles en cada edición (offline, aceptable).
- Muchos archivos pequeños; el límite de tiles y la retención controlan el
  crecimiento.
- La generación de capas regionales a z14 tarda minutos y puede superar el
  límite; se degrada el zoom.

## Pendiente

- Prueba de carga de Nginx sirviendo tiles con 25/50 usuarios.
- Medir si PMTiles reduce lo suficiente el conteo de archivos como para
  justificar el cambio.
- Cliente de tiles en el visor y convivencia con glify (ADR 015).
