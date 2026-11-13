# Spec 08-0 — Spike: tiles pregenerados, inventario y mediciones

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 08-0 |
| **Estado de la spec** | CERRADA (generación, cliente, carga preliminar y ADRs 012/013/015) |
| **Tamaño** | Mediano |
| **Duración estimada** | 4 h |
| **Dependencias** | Sprint 26 (PostgreSQL/PostGIS local), dump v1 restaurado |
| **Última revisión** | 2026-11-13 |

## 1. Objetivo y contexto

Medir con datos reales si el modelo de **MVT pregenerado + Nginx** es viable en
el VPS objetivo (4 vCPU / 8 GB / 80 GB) y fijar las decisiones M2 (servicio de
tiles), M1 (puntos) y M9 (filtros). El spike no publica capas en el visor: mide
generación, bytes, cantidad de archivos y tiempos.

La decisión inicial de la spec madre (revisión 2026-11-12) es pregenerar. Este
spike la valida o la corrige con números.

## 2. Alcance

**Dentro**
- Inventario de las 71 capas del catálogo: tabla física, tipo, SRID, features y peso.
- Prototipo de generación `ST_AsMVT` por zoom para capas poligonales, de línea y de puntos.
- Medición de tiempo, bytes, cantidad de tiles y tamaño por zoom.
- Estimación de disco para las capas y versiones.
- Prueba de `gzip` de Nginx sobre MVT.
- Decisión M2/M1/M9 documentada.

**Fuera**
- Integración en el visor (08-B) y endpoints de tabla/agregados (08-D/F).
- Prueba de carga con 25/50 usuarios (26-H/30).
- Benchmark de PMTiles (solo se decide si el disco/archivos lo justifican).

## 3. Inventario

| Dato | Valor |
|---|---|
| Capas en `chat.chat_catalog` | 71 |
| Tablas con geometría en `public` | 69 |
| Capas WMS sin tabla | 2 |
| Polígonos | 32 (+1 `MULTIPOLYGON` + 2 `GEOMETRY`) |
| Líneas | 9 |
| Puntos | 27 |
| SRID | 4326 en todas las capas del dump v1 |

Las capas más pesadas del dump: `borde_costero` (18 MB de tabla), `humedales`
(8,4 MB), `plan_regulador_intercomunal_costero_norte` (8,3 MB), `hidrografia`
(6,3 MB), `energia_potencial_fotovoltaico` (5,0 MB).

## 4. Mediciones de generación

Generación local con PostgreSQL 17.11 + PostGIS 3.7, `--workers 3`, z0–z14,
simplificación por zoom y candidatos calculados por cobertura real de features
(no por bbox de la capa).

| Capa | Tipo | Features | Tiles | Bytes | Tiempo | GeoJSON | gzip GeoJSON |
|---|---|---:|---:|---:|---:|---:|---:|
| `borde_costero` | polígono | 382 | 2.887 | 7,80 MB | 98,7 s | 47,0 MB | 15,3 MB |
| `humedales` | polígono | 1.429 | 2.518 | 3,64 MB | 29,8 s | 24,1 MB | 7,4 MB |
| `hidrografia` | línea | 734 | 7.232 | 11,98 MB | 42,6 s | 13,9 MB | 4,7 MB |
| `derechos_agua_2025` | punto | 920 | 847 | 8,22 MB | 20,1 s | 3,7 MB | 0,19 MB |
| `acuiferos` | polígono regional | — | 5.230 (z0–z13) | 7,44 MB | 20,2 s | — | — |

**Lecturas**

1. **Polígonos pesados:** el tile pregenerado reduce 83–85 % los bytes crudos y
   ~50 % respecto de gzip. Es el caso que justifica el modelo.
2. **Puntos:** los tiles pesan **más** que el GeoJSON comprimido (8,22 MB vs
   0,19 MB gzip para 920 puntos). Los puntos ≤5.000 se quedan en GeoJSON/API y
   cluster/heatmap en cliente (M1).
3. **Líneas:** el total de tiles es comparable al gzip, pero el cliente descarga
   solo los zooms que visita; se mantiene el modelo para líneas complejas.
4. **Capas regionales:** a z14 superan las 20.000 celdas. El generador baja a
   z13 automáticamente (4× menos archivos) salvo `--force`.
5. **Costo por tile:** ~8–11 ms con la geometría simplificada materializada. Sin
   esa optimización el mismo trabajo tardaba ~40 ms/tile (4–5× más).
6. **Generación offline:** una capa regional típica tarda 20–100 s; 71 capas
   caben en una ventana de mantenimiento.

### 4.1. Línea base de navegador y accesibilidad

Lighthouse sobre el visor local (2026-11-13, sin emulación de dispositivo):

| Categoría | Score inicial | Score tras fixes |
|---|---:|---:|
| Accesibilidad | 0.85 | **0.97** |
| Buenas prácticas | 0.83 | 0.83 |
| SEO | 0.50 | **1.00** |

Se corrigieron encabezados de leyenda (h6 → h2), `aria-label` de los sliders de
opacidad, `alt` de iconos de leyenda, `meta description` y `robots.txt`. Quedan
`image-aspect-ratio` y `target-size` en los marcadores del mapa (Leaflet los
redimensiona/overlapan): se abordan en el Sprint 28. El canvas del mapa y los
clusters no son navegables por teclado; también queda para 28.

### 4.2. Prueba preliminar de Nginx

`ab -n 2000 -c 50` sobre un tile de `borde_costero` (1,5 KB) en el stack local:

| Métrica | Valor |
|---|---:|
| Requests/segundo | 6.502 |
| Tiempo medio por request | 7,7 ms (concurrente) |
| Fallos | 0 |

No reemplaza la prueba de carga del Sprint 30 (mezcla API + DB + chat), pero
confirma que servir tiles estáticos no es el cuello de botella.

## 5. Disco y cobertura (corrida completa)

Corrida `tiles:sync --changed` sobre el catálogo local (2026-11-13):

| Concepto | Valor |
|---|---:|
| Capas publicadas | 41 |
| Tiles generados | 88.152 |
| Bytes lógicos (suma de `.mvt`) | 146,6 MB |
| Disco real (bloques de 4 KB + directorios) | 393 MB |
| Capas degradadas a z13 por límite | 7 |
| Capas omitidas | 27 puntos, 2 WMS, 1 tabla vacía |

Las 7 capas que bajan de z14 a z13 son regionales: `acuiferos`,
`comunas_poligonos`, `cuencas_dga`, `energia_potencial_fotovoltaico`,
`limite_comunal_linea`, `unidades_geomorfologicas` y `zonas_climaticas`.

**Conclusión de disco:** el corpus completo ocupa **393 MB en disco** (146,6 MB
de contenido). Con dos versiones de las capas por edición se queda por debajo de
1 GB. El disco de 80 GB no es el límite; el límite es la cantidad de archivos
(88 mil) y el tiempo de generación.

`tiles:check` verificó las 41 versiones en 10 s: tiles, bytes, checksum y conteo
de features coinciden.

## 6. Decisiones

| # | Decisión | Evidencia |
|---|---|---|
| M2 | **MVT pregenerado** en `tiles/<layer>/<version>/<z>/<x>/<y>.mvt` + Nginx, con gzip y caché inmutable. PMTiles queda como alternativa si el conteo de archivos molesta; no es necesario hoy | Bytes, tiempos y disco medidos |
| M1 | Puntos: geometría estática en GeoJSON + valores por API; cluster/heatmap en cliente ≤5.000. No se generan tiles de puntos por defecto | 920 puntos → 8,22 MB de tiles vs 0,19 MB gzip |
| M9 | Filtros de tiles estáticos en cliente sobre `properties`; on-demand solo para filtros geométricos | No cambia la geometría del tile |
| — | Máximo de tiles por capa: 20.000, con degradación automática de `maxzoom` | Capas regionales a z14 |
| — | Una versión publicada es inmutable; actualizar = nueva versión | Manifest + checksum |

## 7. Pendiente para cerrar el spike

- [x] Línea base de navegador con Lighthouse (0.85 accesibilidad, 0.83 buenas prácticas, 0.50 SEO).
- [x] Prueba de cliente de tiles en el visor (`borde_costero`, `hidrografia`, `humedales`) y convivencia con el renderer SVG; ADR 015.
- [x] Cluster/heatmap cliente: máximo actual 2.946 puntos (`catastro_variedades_frutales`), por debajo del umbral 5.000; ADR 013.
- [x] Prueba preliminar de tiles estáticos con 50 conexiones (6.502 req/s, 0 fallos); falta la mezcla con API/DB del Sprint 30.
- [x] ADR 012/013/015 escritos.

## 8. Cierre

- Horas reales: 4 (generación, cliente, carga y accesibilidad).
- Desvíos: la primera versión del generador repetía `ST_Transform`/`ST_Simplify`
  por tile y tardaba 4–5× más; se corrigió dentro del spike.
- Lecciones: medir por cobertura real de features, no por bbox; los puntos no
  se benefician de MVT; el límite de tiles debe degradar el zoom, no abortar.
