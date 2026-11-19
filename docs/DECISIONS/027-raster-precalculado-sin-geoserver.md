# ADR 027 — Ráster precalculado: publicar, no calcular; sin GeoServer

| Campo | Valor |
|---|---|
| Estado | Aceptada |
| Fecha | 2026-11-19 |
| Origen | Consulta de arquitectura sobre GeoServer y el VPS R3 |
| Relacionado | ADR 005 (VPS), ADR 010 (Nginx), ADR 012 (tiles), ADR 015 (cliente de tiles), ADR 016 (GeoJSON), ADR 017 (MCDA, reservado), Sprint 49, Sprint 41 |

## Contexto

El destino de producción es un VPS propio (ADR 005). El plan evaluado es un
**VPS Linux R3: 4 vCPU, 16 GB de RAM, 100 GB SSD NVMe y Ubuntu 24.04**. El
pipeline vectorial actual ya está diseñado para ese entorno:

- ~40 capas no-punto se sirven como MVT pregenerado (`tiles/`, 88.152 archivos,
  393 MB) y Nginx las entrega como archivos inmutables; PostgreSQL no participa
  en runtime (ADR 012/015).
- La tabla, búsqueda, filtros, CSV y el chat usan la API y las RPCs tipadas, no
  los tiles.
- La prueba de carga local del Sprint 30 midió static p95 **55 ms**, table p95
  **94 ms** y mixed p95 **61 ms** a 50 conexiones. El cuello de botella real es
  el chat/LLM (p95 ~15 s), no las capas.

Se evaluó **GeoServer** como motor de capas conectado a PostGIS. GeoServer sí
aporta interoperabilidad OGC (WMS, WFS, WMTS, WCS), estilos SLD, tiendas ráster
e ImageMosaic, GeoWebCache y publicación por REST. Pero también agrega un JVM,
un catálogo de capas paralelo, un data dir que respaldar, una superficie de
ataque nueva y un ciclo de parches propio.

El motivo concreto para evaluarlo fue el **análisis complejo**: modelos de
probabilidad de incendio, pendiente, orientación y aptitud de cultivo. Ahí está
la confusión central: **GeoServer no calcula**. Publica capas; no hace álgebra
de ráster ni análisis multicriterio. La pendiente y la orientación se derivan de
un DEM con GDAL/GRASS/QGIS; el modelo de incendio o de aptitud se corre offline.
El servidor de mapas solo puede mostrar el resultado.

El caso de las cotas cada 10 m para toda la región (11 GB en vector) confirma
que el problema es de representación, no de servidor: vectorizar un campo
continuo duplica la información del DEM. Un DEM de Atacama a 30 m ronda los 83
millones de píxeles; en Int16 son ~167 MB sin comprimir y un COG comprimido
puede quedar en 100-300 MB. Pendiente y orientación son dos rásteres más del
mismo orden. Diez derivados caben en 1-3 GB. Las cotas vectoriales de 11 GB son
la opción cara.

El análisis multicriterio (aptitud para un cultivo, con criterios y pesos) queda
en el **Sprint 41 — Recetas de análisis**, que ya está previsto en el roadmap y
referencia el ADR 017. Cada escenario de pesos produce un ráster versionado; la
plataforma lo publica y lo explica, no lo recalcula en cada request.

## Decisión

1. **No adoptar GeoServer** como motor de capas del visor. Tampoco WMS/WCS/WMTS
   propios, ni un JVM en el stack base.
2. **El ráster se produce offline** en QGIS/GDAL/GRASS en el equipo del
   analista. El servidor no calcula pendientes, sombras, orientación ni modelos
   de aptitud, y no crea capas ráster nuevas a partir de otras.
3. **El servidor publica el resultado** con un contrato versionado e inmutable:
   - COG/GeoTIFF fuente en `data/raster/<layer>/<version>/` (privado, `data/`
     ya está denegado por Nginx y en `.gitignore`).
   - Tiles WebP/PNG pregenerados en `raster/<layer>/<version>/<z>/<x>/<y>.<ext>`.
   - `manifest.json` por versión y `raster/index.json` global.
   - La config del visor apunta a `source.type: "raster"` y a la versión activa;
     se publica con el snapshot de configuración existente (`GET /api/config`).
4. **Las estadísticas por comuna/provincia/región se calculan en QGIS** y se
   importan como CSV; el servidor solo las carga y las lee. No hay cálculo de
   estadísticas zonales en runtime. Si más adelante se automatiza, será un job
   batch fuera del request y con su propia decisión. El chat las consultará por
   RPCs tipadas cuando el Sprint 41 lo requiera.
5. **El análisis multicriterio vive en el Sprint 41 (ADR 017)**: criterios,
   pesos, restricciones y validación experta. Cada escenario es una versión
   nueva del ráster con su ficha metodológica. No hay cálculo interactivo de
   pesos en el servidor.
6. **GeoServer solo se reconsidera con un disparador explícito** y, si aparece,
   se implementa como **sidecar** para ese caso, nunca como reemplazo del
   pipeline del visor (ver “Disparadores para revisar”).

## Alternativas evaluadas

| Alternativa | Por qué no se adopta ahora |
|---|---|
| **GeoServer** | Resuelve publicación OGC e interoperabilidad, no análisis. Agrega JVM, catálogo paralelo, data dir, CVEs (por ejemplo CVE-2024-36401, RCE crítico) y acopla el mapa al runtime Java + PostgreSQL. Además, WFS expondría tablas crudas fuera del modelo de RPCs y permisos. |
| **MapServer** | Más liviano que GeoServer para OGC, pero sigue siendo un servicio extra y no aporta análisis. Se reevalúa solo si aparece un requisito OGC. |
| **titiler** | Excelente para COG on-demand, mosaicos y colormaps, sin JVM. No se necesita mientras los rásteres sean pocos y estáticos; se puede evaluar si el tileado pregenerado se vuelve un cuello. |
| **Vectorizar los rásteres** | Es la opción que produjo los 11 GB de cotas. Duplica información, dispara backups y hace más lentos los tiles. No se usa para campos continuos. |
| **PostGIS raster** | Sirve para recortes y estadísticas zonales, pero no para servir mapas ni para álgebra pesada por request. Se evaluó para las estadísticas; la decisión es calcularlas en QGIS y publicar el CSV, no en el servidor. |
| **QGIS Server** | Publica proyectos QGIS por OGC, pero sigue siendo un servicio stateful y no resuelve el análisis. No se adopta. |

## Consecuencias

**Positivas**

- Menos servicios y menos RAM/CPU: no hay JVM ni catálogo paralelo; los tiles
  los sirve Nginx y el visor sigue funcionando con PostgreSQL detenido.
- Menos superficie de ataque y menos parches: no se expone `/geoserver/web` ni
  WFS con tablas crudas.
- Coherencia con ADR 012/015/016: versiones inmutables, rollback por capa y
  fallback documentado.
- Reproducibilidad: cada ráster queda con fuente, método, fecha, resolución,
  licencia y, si es MCDA, criterios y pesos.
- El almacenamiento es manejable: un puñado de COG + tiles entra holgado en los
  100 GB del VPS; el vector de cotas de 11 GB no.

**Negativas**

- El analista debe producir el ráster y subirlo; no hay análisis self-service
  desde el visor.
- No hay WMS/WCS propio para terceros. Si un organismo lo exige, habrá que
  agregar un sidecar OGC.
- Hay que mantener el pipeline de publicación, la leyenda y la consistencia
  entre el manifest y la config.
- El MCDA no es interactivo: cambiar pesos implica una versión nueva, no un
  recálculo en el navegador.
- Los rásteres de alta resolución pueden superar el límite de tiles; se mitiga
  con maxzoom adaptativo y recortes por comuna.

## Disparadores para revisar

Se abre un ADR nuevo (y se evalúa GeoServer/MapServer/titiler como sidecar) solo
si aparece uno de estos:

1. Un requisito contractual de **publicar WMS/WCS/WMTS a terceros** o integrarse
   a una IDE/SDI.
2. **Rásteres dinámicos o series temporales** que no se puedan pregenerar y
   necesiten mosaico/estilo en caliente.
3. Un equipo de cartografía que necesite **editar SLD sin deploy**.
4. Un volumen de rásteres que haga inmanejable el pipeline estático (decenas de
   capas o actualizaciones diarias).
5. La necesidad de **análisis interactivo con pesos**. Eso no es GeoServer: es
   un servicio de cómputo (GDAL/GRASS/Python) con cola y caché, y se diseña en
   el Sprint 41.

## Referencias

- `docs/specs/49-publicador-raster.md` — contrato de publicación.
- `docs/ROADMAP.md` — Sprint 49 y Sprint 41.
- `docs/ARCHITECTURE.md` §4.7 y §4.8.
- `docs/DECISIONS/012-servicio-de-tiles.md`,
  `015-cliente-de-tiles.md`, `016-conservar-geojson.md`.
- `docs/DECISIONS/017-*` (reservado para el análisis multicriterio).
