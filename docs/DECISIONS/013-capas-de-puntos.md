# ADR 013 — Capas de puntos: GeoJSON + API, cluster/heatmap en cliente

| Campo | Valor |
|---|---|
| Estado | Aceptada |
| Fecha | 2026-11-13 |
| Origen | Sprint 08-0 / 08-F |
| Relacionado | ADR 012 (tiles), spec 08 |

## Contexto

Las capas de puntos (estaciones, derechos de agua, yacimientos, catastros) no
se benefician de los tiles MVT: cada punto repite sus atributos en todos los
zooms y el archivo GeoJSON comprimido pesa menos. Medición de 08-0: 920
derechos de agua → **8,22 MB de tiles** contra **0,19 MB de GeoJSON gzip**.

Además, los valores de estaciones y variables climáticas cambian por hora/día;
congelarlos en un tile sería incorrecto.

Las capas de puntos actuales van de 171 a 2.946 features (máximo
`catastro_variedades_frutales`). El umbral acordado es 5.000.

## Decisión

1. **Geometría estática en GeoJSON** para capas de puntos ≤5.000.
2. **Valores dinámicos por API** (`/api/stations-map`, series y detalles); los
   tiles no incluyen valores actuales.
3. **Cluster y heatmap en cliente** (`markerClusterGroup`, `WebGLHeatMap`)
   mientras la capa no supere 5.000 puntos.
4. **Agregación server-side** solo si una capa supera 5.000 puntos o los
   valores cambian con mucha frecuencia; se implementará con
   `/api/layers/:id/clusters` y `/api/layers/:id/heatmap` (08-F futuro).
5. No se generan tiles de puntos por defecto en `tiles:sync`.

## Consecuencias

**Positivas**
- Sin duplicar atributos en tiles; el GeoJSON se comprime bien.
- Los valores actuales no se congelan.
- Cluster/heatmap existentes siguen funcionando sin cambios.

**Negativas**
- Una capa de puntos muy grande (>5.000) cargaría todo el GeoJSON hasta que se
  implemente la agregación server-side.
- El heatmap depende de WebGL y del renderer del cliente.

## Validación

- Todas las capas de puntos del dump actual están por debajo de 5.000.
- `derechos_agua_2025` (920) y `yacimientos` (2.086) cargan y muestran tabla
  con el flujo GeoJSON existente.
- Los tiles de puntos no se publican (27 capas omitidas por `tiles:sync`).

## Pendiente

- Si una capa supera 5.000: endpoints de agregación y prueba de memoria/FPS.
- Accesibilidad del canvas de mapa y de los clusters (Sprint 28).
