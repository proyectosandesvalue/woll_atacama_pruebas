# Spec madre 08 — Migración a PostGIS (fuente principal)

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 08 |
| **Estado de la spec** | DRAFT (preguntas M1-M6 abiertas; M1 y M2 bloquean el spike) |
| **Tamaño** | Grande (> 15h) |
| **Duración estimada** | 42-50h (40-46h del ROADMAP + 4h de spike) |
| **Dependencias** | Sprint 07 (`/api/config` + snapshot) |
| **Última revisión** | 2026-10-04 |

> Elaborada a partir de ROADMAP (Sprint 08), CONTRACT, ARCHITECTURE, AGENTS.md y CHANGELOG. Esta spec fija el marco; el detalle de cada tramo se escribe al empezarlo (`08-A-*.md`, `08-B-*.md`...).
>
> **Dato a verificar antes de empezar:** el chat ya consulta tablas físicas en Supabase (`layer_id == nombre de tabla`). Puede que una parte de las ~70 capas ya esté en PostGIS. Eso cambia el tamaño del tramo C (ver M3).

---

## 1. Objetivo y métricas de éxito

PostGIS pasa a ser la fuente principal de las capas del visor, con el GeoJSON estático como respaldo por capa. El navegador deja de descargar archivos completos y recibe solo lo que necesita ver. Esto desbloquea los Sprint 11 (AOI), 12 y 16.

| Métrica | Línea base | Meta | Cómo se mide |
|---|---|---|---|
| Bytes transferidos al activar una capa mediana | **Por medir en el spike** | ≥ 70 % menos que el GeoJSON completo (a confirmar con la línea base) | DevTools → Network, 3 capas de referencia |
| Primera carga del visor en 4G | **Por medir** | < 3 s (CONTRACT §7.5) | Lighthouse con throttling 4G |
| Paridad de render | — | 100 % de las capas migradas idénticas a su versión GeoJSON | Prueba de paridad (CA-1) |
| Capas migradas sin intervención manual de reversa | — | 70 de 70 | Conteo por dimensión |

Las metas con **"por medir"** no se aprueban hasta tener la línea base (primera tarea del spike).

## 2. Alcance

**Dentro del alcance**
- Servir capas desde PostGIS (tiles vectoriales para polígonos y líneas; estrategia para puntos según M1).
- Modelo de doble fuente por capa, con fallback automático a GeoJSON.
- Migración de las ~70 capas, por dimensión.
- Estilos, popups y leyenda equivalentes a los actuales con la nueva fuente.
- Tabla de atributos, filtros y zoom a features funcionando sobre capas migradas.
- Exportación (GeoJSON / CSV) desde PostGIS.

**Fuera de alcance**
- Eliminar los archivos GeoJSON del repo (se evalúa en un sprint posterior, tras un período estable).
- Imágenes raster (Sprint 09) y vista 3D (Sprint 10).
- Cambiar de Leaflet a otra librería de mapas (Sprint 10).
- Panel admin y edición de capas (Sprints 15-16).
- Análisis por AOI (Sprint 11).

## 3. Invariantes

| # | Invariante | Cómo se comprueba en cada puerta |
|---|---|---|
| INV-1 | El visor en producción no cambia hasta la promoción explícita (CONTRACT §1.1, ADR 004) | Producción sin commits del sprint |
| INV-2 | Toda capa puede volver a GeoJSON cambiando solo su `source.type`, sin tocar código | Reversión probada en una capa por tramo |
| INV-3 | Si PostGIS no responde, la capa carga desde GeoJSON automáticamente | Prueba cortando el endpoint de tiles en staging |
| INV-4 | El chat IA sigue funcionando igual | Smoke del orquestador (`npm run smoke:chat`) |
| INV-5 | Las peculiaridades documentadas en AGENTS.md se mantienen: `dataFilter` antes del renderer, alias normalizados, glify solo para polígonos | Revisión del diff contra AGENTS.md |
| INV-6 | Sin secretos en el frontend; solo `service_role` desde el backend (CONTRACT §5.2) | Revisión del bundle estático |

## 4. Decisiones arquitectónicas

| Decisión | ADR | Estado |
|---|---|---|
| Cómo se sirven los tiles vectoriales (M2) | 005-servicio-de-tiles.md | **Pendiente: la resuelve el spike** |
| Cómo se cargan las capas de puntos (cluster y heatmap necesitan los datos) (M1) | 006-capas-de-puntos.md | **Pendiente: la resuelve el spike** |
| Modelo de doble fuente (`source`) | 007-doble-fuente.md | Propuesto (sección 6.1) |
| Librería cliente para tiles vectoriales y su convivencia con glify (M4) | 008-cliente-de-tiles.md | Pendiente |

Los números de ADR son tentativos; se ajustan a la secuencia real de `docs/DECISIONS/`.

## 5. Spike (fase 0, máximo 4h)

**Entregable:** ADR 005 y ADR 006 con una recomendación respaldada por mediciones, más la línea base de la sección 1.

| Tarea | Salida |
|---|---|
| Medir línea base: tamaño y tiempo de carga de 3 capas de referencia (una de puntos, una de líneas, una de polígonos pesados) | Tabla de bytes y tiempos |
| Inventario de las ~70 capas: ¿tabla física existe?, tipo de geometría, SRID, nº de features, peso, índice GIST | Planilla (alimenta M3 y el orden de los tramos) |
| Prototipo descartable de tile endpoint con 1 capa de polígonos | Latencia medida (frío y con caché) |
| Prueba de cliente de tiles dentro del visor, con una capa | Compatibilidad con glify, `dataFilter` y z-index |

| Pregunta | Opciones | Criterios de decisión |
|---|---|---|
| ¿Cómo se sirven los tiles? (M2) | **(a)** RPC `ST_AsMVT` expuesta por una Vercel Function con caché CDN · **(b)** servicio externo de tiles (pg_tileserv/Martin) · **(c)** tiles pregenerados a partir de PostGIS y servidos como estáticos | Latencia, límites de la Function (tiempo y tamaño de respuesta), límites del plan de Supabase y Vercel, costo, complejidad de operar |
| ¿Cómo se cargan los puntos? (M1) | **(a)** tiles vectoriales también para puntos · **(b)** GeoJSON desde RPC con filtro por bbox · **(c)** GeoJSON completo desde PostGIS | Cluster y heatmap necesitan todos los puntos en cliente; peso real de las capas de puntos |

## 6. Mapa de tramos

Tramos de máximo 8h. El tramo C del ROADMAP (16-24h) se parte por dimensión; cada dimensión es un tramo de 2-3h con su puerta.

| Tramo | Nombre | Horas | Depende de | Reversión | Spec | Estado |
|---|---|---|---|---|---|---|
| 08-0 | Spike: línea base, inventario y ADRs | 4 | Sprint 07 | Nada que revertir (descartable) | esta spec | pendiente |
| 08-A | Infraestructura de tiles | 8 | 08-0 | Apagar el endpoint; ninguna capa lo usa aún | pendiente | |
| 08-B | Piloto: 3 capas chicas con doble fuente | 4 | 08-A | Cambiar `source.type` de las 3 capas | pendiente | |
| 08-D | Estilos, popups, leyenda, tabla de atributos y filtros sobre la nueva fuente | 6 | 08-B | Igual que 08-B | pendiente | |
| 08-C1 … C9 | Migración por dimensión (agua, agricultura, clima, energía, minería, otros, planificación, riesgos, suelo) | 2-3 c/u (16-24 total) | 08-D | Por capa (`source.type`) | pendiente | |
| 08-E | Exportación desde PostGIS | 4 | 08-D | Quitar la opción de la UI | pendiente | |

**Por qué D antes de C:** migrar 70 capas sin que estilos, popups, tabla y filtros funcionen sobre la nueva fuente multiplica el trabajo de corrección. El piloto (B) valida el camino de punta a punta con 3 capas; D lo completa; C lo escala. El orden del ROADMAP (A, B, C, D, E) se altera aquí a propósito.

**El orden de las dimensiones en C se decide con el inventario del spike**, empezando por las de menor riesgo (capas chicas, ya con tabla física).

### 6.1. Modelo de doble fuente (propuesta)

```json
{
  "source": {
    "type": "postgis" | "geojson" | "wms",
    "table": "public.lagunas_embalses",
    "geometry_column": "geom",
    "srid": 4326,
    "fallback": { "type": "geojson", "url": "lagunas_embalses.geojson" }
  }
}
```

La capa decide su fuente; el código no tiene "capas especiales". Mientras exista el fallback, volver atrás es cambiar un valor (INV-2). Al estar este modelo en `/api/config` (Sprint 07), el cambio de fuente no requiere deploy de frontend cuando la config pase a la BD (Sprint 14).

## 7. Criterios de aceptación del sprint completo

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | cualquier capa migrada | se activa en el visor | muestra la misma cantidad de features, el mismo estilo, los mismos popups y la misma leyenda que su versión GeoJSON | prueba de paridad por capa (manual + script de conteo) |
| CA-2 | una capa migrada | el endpoint de tiles falla o responde con timeout | la capa se carga desde su `fallback` GeoJSON y el usuario ve un aviso discreto, no un error | manual en staging cortando el endpoint |
| CA-3 | una capa migrada | se abre la tabla de atributos, se filtra por un atributo y se hace zoom a un feature | funciona igual que antes, con los mismos resultados | manual + comparación de conteos |
| CA-4 | una capa migrada con `dataFilter` activo | se renderiza | el filtro se respeta en el mapa (INV-5) | manual |
| CA-5 | una capa migrada | se exporta a GeoJSON o CSV | el archivo contiene todas las features filtradas, no solo las del viewport | comparación de conteos con la tabla |
| CA-6 | una capa migrada | se cambia su `source.type` a `geojson` | vuelve a cargar desde GeoJSON sin tocar código | manual (INV-2) |
| CA-7 | el visor en 4G | primera carga con una capa pesada activa | < 3 s hasta que el mapa es usable | Lighthouse |
| CA-8 | el chat IA | se hace una pregunta cualquiera | responde igual que antes (INV-4) | smoke del orquestador |
| CA-9 | las 9 dimensiones | terminan los tramos C1-C9 | 70 de 70 capas con `source.type: "postgis"` o con una excepción documentada y aprobada | inventario final |
| CA-10 | los puntos (M1) | se activan en modo cluster y heatmap | ambos modos funcionan igual que antes | manual |

## 8. Puertas entre tramos

Un tramo no se cierra hasta cumplir todo:

- [ ] `npm test` y `npm run lint` limpios.
- [ ] INV-1 a INV-6 comprobados.
- [ ] Verificado en staging, incluida la prueba de corte del endpoint (INV-3) en los tramos que lo afecten.
- [ ] Reversión probada al menos una vez (INV-2).
- [ ] Docs y CHANGELOG actualizados; ARCHITECTURE si cambia algo estructural.
- [ ] Re-estimación del resto. Si un tramo tomó el doble, se detiene el sprint y se revisa esta spec.

## 9. Riesgos

| Riesgo | Prob. | Impacto | Mitigación | Señal de alarma |
|---|---|---|---|---|
| Los límites del plan (tamaño de la BD, transferencia, tiempo de ejecución de las Functions) no alcanzan para 70 capas | Media | Alto | Medir en el spike; decidir M2 con esos límites | Latencia de tile > 1 s con caché fría; BD cerca del tope |
| Cluster y heatmap de puntos no funcionan con tiles | Alta | Alto | M1 resuelto en el spike; puntos por GeoJSON filtrado si hace falta | Prototipo de cluster con tiles falla en el spike |
| La tabla de atributos y el zoom a features dependen del GeoJSON completo en memoria | Alta | Alto | Tramo D dedicado; consultas por RPC para tabla y exportación | Tabla vacía o incompleta en el piloto |
| `dataFilter` y los filtros por leyenda no se aplican sobre tiles | Alta | Medio | Definir en D si el filtro viaja como parámetro al servidor o se aplica en cliente; documentarlo en AGENTS.md | CA-4 falla en el piloto |
| Glify (WebGL) y la librería de tiles compiten por z-index y contexto | Media | Medio | Prueba en el spike (M4); pane propio | Capas se tapan o parpadean en la prueba |
| Los datos de staging y producción divergen (capas, SRID, índices) | Media | Alto | Inventario por entorno; migraciones idempotentes aplicadas antes del código | Diferencias en el inventario de ambos |
| El sprint crece por "ya que estamos" (estilos nuevos, mejoras de UI) | Alta | Medio | Fuera de alcance explícito; solo se corrige paridad | Tramo supera 8h |
| Fricción de la promoción manual entre repos (ADR 004) con cambios que tocan casi todo el frontend | Alta | Medio | Promover por tramo, no al final; checklist de migraciones y env vars | Diff entre repos > 30 archivos |

## 10. Preguntas abiertas

| # | Pregunta | Default propuesto | Impacto si cambia | ¿Bloquea? |
|---|---|---|---|---|
| M1 | ¿Cómo se manejan las capas de puntos (cluster y heatmap)? | GeoJSON filtrado desde RPC (no tiles); tiles solo para polígonos y líneas | Si todo va por tiles, hay que reimplementar cluster y heatmap | **sí (spike)** |
| M2 | ¿Cómo se sirven los tiles? | Decidirlo con mediciones del spike; hipótesis inicial: (a) Function + RPC `ST_AsMVT` con caché | Cambia la infraestructura del tramo A | **sí (spike)** |
| M3 | ¿Cuántas de las ~70 capas ya tienen tabla física con geometría, SRID e índice GIST? | Las que se registraron en el catálogo del chat sí; el resto, por verificar | Si son pocas, el tramo C crece (carga de datos desde QGIS) | no (lo mide el spike) |
| M4 | ¿Qué librería cliente se usa para tiles vectoriales en Leaflet? | La más simple que conviva con glify; decidir con la prueba del spike | Si exige otra librería de mapas, el alcance toca el Sprint 10 | no (spike) |
| M5 | ¿Orden de las dimensiones en el tramo C? | De menor a mayor riesgo según el inventario | Solo reordena los tramos | no |
| M6 | ¿Los filtros de `dataFilter` y leyenda se aplican en cliente o en el servidor del tile? | En servidor como parámetro, si el spike confirma que escala; si no, en cliente | Afecta el diseño del tramo D y de AGENTS.md | no |

## 11. Reversión global y promoción

- **Reversión global:** cambiar `source.type` de todas las capas a `geojson` (un solo valor por capa; la config puede hacerlo en lote). El fallback GeoJSON permanece en el repo durante todo el sprint y después de él.
- **Promoción a producción:** por tramo, nunca al final (ADR 004). Orden: migraciones y carga de datos en Supabase de producción → variables de entorno → código. El checklist de cada promoción incluye verificar que el schema de producción coincide con staging (índices, SRID, grants).
- **No se retira en este sprint:** los GeoJSON del repo ni el código del loader GeoJSON.

## 12. Documentos a actualizar

ROADMAP (estado por tramo y re-estimaciones), CHANGELOG, ARCHITECTURE (§4 backend, §5 BD, §6 frontend, §7 caché), AGENTS.md (peculiaridades nuevas de los renderers y filtros), CONTRACT (si el modelo `source` agrega reglas), `.env.example`, ADRs 005-008.

## 13. Cierre

- Fecha de cierre:
- Horas reales por tramo vs. estimadas:
- Desvíos y lecciones: