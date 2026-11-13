# ADR 016 — Conservar los GeoJSON como respaldo y para análisis

| Campo | Valor |
|---|---|
| Estado | Aceptada |
| Fecha | 2026-11-13 |
| Origen | Sprint 08-C / decisión del dev |
| Relacionado | ADR 012 (tiles), ADR 013 (puntos), spec 08-C |

## Contexto

El repositorio tiene **71 GeoJSON (269 MB)**. 40 capas no-punto ya se sirven
desde tiles y 27 capas de puntos siguen usando GeoJSON + API. Además hay
archivos que no son capas visuales pero sostienen análisis:

- `comunas_poligonos.geojson`: se usa para análisis geoespaciales, selección de
  atributos por ubicación y estadísticas comunales. **No es una capa del menú**
  y no debe borrarse.
- `estaciones_metereologicas_atacama.geojson`: se creó para cargar estaciones,
  pero terminaron cargándose por API/otro flujo. Se conserva como respaldo.
- `macrozonificacion_borde_costero.geojson`: la capa se dividió en zonas
  norte/sur para poder subirla a GitHub por tamaño; se conservan ambas partes.

Eliminar los GeoJSON rompería el fallback de las capas con tiles, las capas de
puntos, los análisis comunales y la reversión por capa (INV-2/INV-3).

## Decisión

1. **No se eliminan los GeoJSON** durante el Sprint 08 ni en el corte al VPS.
2. Se mantienen como:
   - fallback de las capas con `source.tiles`;
   - fuente de las capas de puntos;
   - insumo de análisis (`comunas_poligonos`);
   - respaldo/reversión por capa.
3. Los archivos especiales se conservan explícitamente:
   - `comunas_poligonos.geojson` (análisis/estadísticas);
   - `estaciones_metereologicas_atacama.geojson` (respaldo histórico);
   - `macrozonificacion_borde_costero.geojson` (respaldo de la capa dividida).
4. La eliminación se evalúa **después** de:
   - VPS en producción con tiles y API verificados;
   - backups/restauración probados (26-G);
   - decisión explícita sobre fallback y capas de puntos;
   - baja de la demo Vercel.
5. Si el tamaño del repo vuelve a ser un problema, evaluar Git LFS o almacenar
   los GeoJSON fuera del repo, pero manteniéndolos accesibles para el fallback.

## Consecuencias

**Positivas**
- Reversión y fallback siguen funcionando.
- Los análisis comunales no dependen de una capa visual.
- No se pierden archivos históricos.

**Negativas**
- El repo pesa ~269 MB y el deploy estático los incluye.
- Hay que mantener la paridad cuando cambie un GeoJSON (o aceptar que el
  fallback puede estar desactualizado).

## Pendiente

- Documentar en el catálogo qué capas usan cada GeoJSON (Sprint 29).
- Evaluar LFS/objeto storage si el repo crece.
- Repetir la auditoría de huérfanos antes de cualquier borrado futuro.
