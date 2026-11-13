# Spec 08-C — Migración de capas a tiles pregenerados

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 08-C |
| **Estado de la spec** | CERRADA (40/40 capas visibles no-punto con tiles; `comunas_poligonos` no está en la config del visor) |
| **Tamaño** | Grande (16-24 h) |
| **Dependencias** | 08-B (cliente y endpoint), 08-A/08-G (tiles publicados) |
| **Última revisión** | 2026-11-13 |

## 1. Objetivo y contexto

Migrar por dimensión las capas estáticas/edición de GeoJSON a tiles MVT
pregenerados, sin perder popup, zoom, tabla, filtros, categorías ocultas,
opacidad ni descarga. Cada capa se migra con un bloque `source` en su config y
se valida con el manifest de su versión.

La migración no toca la geometría ni el catálogo: los tiles ya existen en
`tiles/<layer>/<version>/` (08-A) y el endpoint de propiedades (08-B) entrega la
tabla desde PostGIS.

## 2. Alcance

> **GeoJSON (ADR 016):** se conservan los 71 archivos como fallback, fuente de
> puntos y respaldo de análisis (`comunas_poligonos`). No se eliminan en este
> sprint.

**Dentro**
- Agregar `source` a cada capa no-punto con manifest publicado.
- Verificar versión, `maxzoom`, `layerName` y `idColumn`.
- Probar popup, zoom, tabla (conteo vs PostGIS), filtro, categoría oculta y CSV.
- Dejar las capas de puntos en GeoJSON + API (decisión 08-0).

**Fuera**
- Regenerar tiles (08-G; se asume la versión publicada).
- Paginación/búsqueda server-side (08-D).
- Export GeoJSON/CSV en streaming (08-E).
- Cambiar estilos o configuraciones existentes.

## 3. Patrón por capa

```js
<layer>: {
  url: "<layer>.geojson",
  type: "polygon" | "line",
  source: {
    type: "postgis",
    idColumn: "fid",
    tiles: {
      mode: "static",
      version: "20261005",
      layerName: "<layer>",
      urlTemplate: "/tiles/<layer>/20261005/{z}/{x}/{y}.mvt",
      manifest: "/tiles/<layer>/20261005/manifest.json",
      minZoom: 0,
      maxZoom: <manifest.maxzoom>,
    },
    fallback: { type: "geojson", url: "<layer>.geojson" },
  },
  // ...estilo y popup existentes
}
```

Reglas:
- `version` y `maxZoom` salen del manifest; no se inventan.
- `layerName` es el `tile_slug` de la capa (normalmente el mismo `layer_id`).
- `idColumn` es `fid`/`gid`/`id` si existe; no es obligatorio para renderizar.
- El `type` de la config debe coincidir con la geometría de la tabla (polygon/line).
- Si el `popupCampos` tiene un nombre que no existe en la tabla, el campo se
  omite; corregir el nombre en la config (ej. `Origen Dato`).

## 4. Capas migradas (2026-11-13)

| Dimensión | Capa | Versión | z máx | Features | Tiles |
|---|---|---|---:|---:|---:|
| Planificación | `borde_costero` | 2026 | 14 | 382 | 2.887 |
| Agua | `hidrografia` | 20261005 | 14 | 734 | 7.232 |
| Agua | `humedales` | 20261005 | 14 | 1.429 | 2.518 |
| Agua | `cuencas_dga` | 20261005 | 13 | 11 | 6.340 |
| Agua | `decrero_escasez_2021` | 20261005 | 14 | 1 | 9.970 |
| Agua | `decrero_escasez_2022` | 20261005 | 14 | 1 | 5.772 |
| Agua | `decrero_escasez_2023` | 20261005 | 14 | 1 | 5.772 |
| Clima | `zonas_climaticas` | 20261005 | 13 | 14 | 5.822 |
| Planificación | `plan_regulador_intercomunal_costero_norte` | 20261005 | 14 | 458 | 3.292 |
| Planificación | `plan_regulador_intercomunal_costero_sur` | 20261005 | 14 | 104 | 1.812 |
| Suelo | `unidades_geomorfologicas` | 20261005 | 13 | 21 | 5.822 |
| Agricultura | `capacidad_uso_suelo` | 20261005 | 14 | 52 | 677 |
| Energía | `energia_linea_transmision` | 20261005 | 14 | 107 | 2.912 |
| Energía | `energia_potencial_fotovoltaico` | 20261005 | 13 | 9 | 3.222 |

**Segundo lote (2026-11-13):**

| Dimensión | Capa | Features | Tiles |
|---|---|---:|---:|
| Agua | `acuiferos` | 57 | 5.230 |
| Agua | `glaciares` | 863 | 832 |
| Agua | `lagunas_embalses` | 66 | 345 |
| Agua | `salares` | 14 | 597 |
| Agua | `territorios_operacionales` | 10 | 166 |
| Agua | `desaladoras_acueductos` | 8 | 375 |
| Otros | `bienes_nacionales_protegidos` | 6 | 286 |
| Otros | `sistema_areas_protegidas` | 5 | 963 |
| Agricultura | `catastro_especies_frutales` | 2.662 | 479 |
| Agricultura | `red_canales` | 501 | 648 |
| Agricultura | `limite_comunal_linea` | 9 | 1.672 |
| Energía | `energia_potencial_eolico` | 5 | 152 |
| Energía | `energia_potencial_solar_csp` | 6 | 3.061 |
| Planificación | `prc_caldera` | 62 | 238 |
| Minería | `red_ferroviaria` | 132 | 818 |
| Planificación | 8 PRC (Chañaral, El Salado, Flamenco, Portofino, Copiapó, Diego de Almagro, Freirina, Vallenar) | 214 | 212 |
| Planificación | `limites_urbanos` | 13 | 399 |
| Minería | `distritos_mineros` | 3 | 1.763 |
| Planificación | `prc_huasco` (`NOM`/`N_DOC`/`P_DO`) | 501 | 28 |

**Total:** 40 capas no-punto con `source`, 82.314 tiles y 144,4 MB lógicos
(suma de manifests). `comunas_poligonos` tiene tabla y tiles pero no está en la
config del visor, así que no se migra. Las 27 capas de puntos quedan en
GeoJSON/API.

## 5. Criterios de aceptación por capa

| # | Verificación |
|---|---|
| CA-1 | Al activar la capa, Network muestra `.mvt` y **no** el `.geojson` |
| CA-2 | El popup abre con los campos de `popupCampos` (los existentes) |
| CA-3 | “Zoom a la capa” encuadra el bbox del manifest |
| CA-4 | La tabla muestra el conteo de PostGIS (no el del GeoJSON) |
| CA-5 | Un filtro por atributo devuelve el mismo conteo que SQL |
| CA-6 | Desmarcar una categoría redibuja el tile sin esa categoría |
| CA-7 | El CSV tiene el mismo número de filas que la tabla |
| CA-8 | Quitar `source` devuelve la capa al GeoJSON sin tocar código |
| CA-9 | Sin errores de consola (los 404 de tiles vacíos son esperados) |

## 6. Pendiente

1. **`comunas_poligonos`**: no está referenciada en `js/config/`; si se agrega
   al visor, sumar su `source`.
2. **Puntos**: no se migran a tiles; solo se valida la API de valores.
3. **Paginación/búsqueda server-side**: 08-D.

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| `type` de config no coincide con la geometría | Comparar con `chat_catalog.geometry_type`; probar render |
| `popupCampos` con nombres inexistentes | Revisar la tabla física (`\d`) y corregir |
| Capa >5.000 features | La tabla se trunca hasta 08-D; priorizar paginación |
| Estilo de líneas/polígonos distinto | Probar en el visor antes de commitear |
| Tiles 404 en bordes del bbox | Son tiles vacíos; se ignoran en `tileerror` |

## 8. Reversión

Quitar el bloque `source` de la capa. El loader vuelve al GeoJSON; los tiles
quedan en disco y el endpoint no se usa. No hay migración de datos.

## 9. Cierre

- Capas migradas: 40/40 visibles.
- Horas reales: 3,5 (piloto + tres lotes).
- Pendiente: paginación/búsqueda (08-D), export desde PostGIS (08-E), `comunas_poligonos` si se agrega al visor.
