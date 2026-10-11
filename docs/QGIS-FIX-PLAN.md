# Plan de corrección en QGIS

**Fecha:** 2026-10-11
**Corrida auditoría:** `42df0e6f-84d6-40a1-865c-a34a0c039209`

Este documento lista **todos los problemas detectados** por la auditoría
de datos y debe usarse como guía para corregir las capas en QGIS.

---

## 1. Resumen ejecutivo

| Estado | Cantidad | % |
|---|---|---|
| ✅ OK | 16 | 23% |
| ⚠️ Warning | 47 | 68% |
| 🚨 Blocked | 6 | 9% |

**Total de capas auditadas:** 69

---

## 2. Capas bloqueadas (6)

Estas capas NO deben publicarse hasta corregir sus geometrías.

### 2.1. `capacidad_uso_suelo` (52 filas)

- **bad_geometries**: 5.77%

| Métrica | Valor |
|---|---|
| Total | 52 |
| Nulas | 0 |
| Vacías | 0 |
| Inválidas | 3 |
| Zero-Zero | 0 |
| SRID mismatch | 0 |
| Fuera del bbox | 0 |
| Duplicadas | 0 |

**Acción en QGIS:**
1. Abrir el archivo original de la capa en QGIS.
2. `Vector → Herramientas de geometría → Comprobar validez`.
3. Corregir las features inválidas (auto o manual).
4. Verificar con "Comprobar validez" que no queden errores.
5. Exportar como GeoJSON (EPSG:4326).

### 2.2. `territorios_operacionales` (10 filas)

- **bad_geometries**: 30%

| Métrica | Valor |
|---|---|
| Total | 10 |
| Nulas | 0 |
| Vacías | 0 |
| Inválidas | 3 |
| Zero-Zero | 0 |
| SRID mismatch | 0 |
| Fuera del bbox | 0 |
| Duplicadas | 0 |

**Acción en QGIS:**
1. Abrir el archivo original de la capa en QGIS.
2. `Vector → Herramientas de geometría → Comprobar validez`.
3. Corregir las features inválidas (auto o manual).
4. Verificar con "Comprobar validez" que no queden errores.
5. Exportar como GeoJSON (EPSG:4326).

### 2.3. `energia_potencial_eolico` (5 filas)

- **bad_geometries**: 80%

| Métrica | Valor |
|---|---|
| Total | 5 |
| Nulas | 0 |
| Vacías | 0 |
| Inválidas | 4 |
| Zero-Zero | 0 |
| SRID mismatch | 0 |
| Fuera del bbox | 0 |
| Duplicadas | 0 |

**Acción en QGIS:**
1. Abrir el archivo original de la capa en QGIS.
2. `Vector → Herramientas de geometría → Comprobar validez`.
3. Corregir las features inválidas (auto o manual).
4. Verificar con "Comprobar validez" que no queden errores.
5. Exportar como GeoJSON (EPSG:4326).

### 2.4. `energia_potencial_fotovoltaico` (9 filas)

- **bad_geometries**: 100%

| Métrica | Valor |
|---|---|
| Total | 9 |
| Nulas | 0 |
| Vacías | 0 |
| Inválidas | 9 |
| Zero-Zero | 0 |
| SRID mismatch | 0 |
| Fuera del bbox | 0 |
| Duplicadas | 0 |

**Acción en QGIS:**
1. Abrir el archivo original de la capa en QGIS.
2. `Vector → Herramientas de geometría → Comprobar validez`.
3. Corregir las features inválidas (auto o manual).
4. Verificar con "Comprobar validez" que no queden errores.
5. Exportar como GeoJSON (EPSG:4326).

### 2.5. `energia_potencial_solar_csp` (6 filas)

- **bad_geometries**: 100%

| Métrica | Valor |
|---|---|
| Total | 6 |
| Nulas | 0 |
| Vacías | 0 |
| Inválidas | 6 |
| Zero-Zero | 0 |
| SRID mismatch | 0 |
| Fuera del bbox | 0 |
| Duplicadas | 0 |

**Acción en QGIS:**
1. Abrir el archivo original de la capa en QGIS.
2. `Vector → Herramientas de geometría → Comprobar validez`.
3. Corregir las features inválidas (auto o manual).
4. Verificar con "Comprobar validez" que no queden errores.
5. Exportar como GeoJSON (EPSG:4326).

### 2.6. `energia_linea_media_transmision` (0 filas)

- **table_empty**: 

| Métrica | Valor |
|---|---|
| Total | 0 |
| Nulas | 0 |
| Vacías | 0 |
| Inválidas | 0 |
| Zero-Zero | 0 |
| SRID mismatch | 0 |
| Fuera del bbox | 0 |
| Duplicadas | 0 |

**Acción en QGIS:**
1. Abrir el archivo original de la capa en QGIS.
2. `Vector → Herramientas de geometría → Comprobar validez`.
3. Corregir las features inválidas (auto o manual).
4. Verificar con "Comprobar validez" que no queden errores.
5. Exportar como GeoJSON (EPSG:4326).

---

## 3. Capas con geometrías duplicadas (10)

Las geometrías repetidas pueden ser legítimas (mismo punto con
diferentes atributos) o errores de carga. **Verificar en QGIS.**

| Capa | Duplicadas | Total | % |
|---|---|---|---|
| `catastro_especies_frutales` | 327 | 2956 | 11% |
| `derechos_agua_2025` | 230 | 920 | 25% |
| `energia_potencial_hidrobombeo` | 70 | 132 | 53% |
| `energia_linea_transmision` | 2 | 109 | 2% |
| `subestaciones` | 1 | 111 | 1% |
| `relaves_mineros_sernageomin` | 1 | 172 | 1% |
| `yacimientos` | 4 | 2090 | 0% |
| `borde_costero` | 67 | 450 | 15% |
| `grandes_terremotos` | 3 | 15 | 20% |
| `remociones_masa` | 3 | 363 | 1% |

---

## 4. Columnas rotas por capa

Columnas con >70% nulos o >50% sospechosos.
Se recomienda **eliminarlas del GeoJSON** antes de re-subir.

### `acuiferos` — 3 columna(s) rota(s)

| Columna | % nulos | % sospechosos | Acción |
|---|---|---|---|
| `PUBMODIF_1` | 87.72 | 0 | Revisar |
| `PUBMODIF_2` | 96.49 | 0 | Eliminar del GeoJSON |
| `PUBMODIF_3` | 100 | 0 | Eliminar del GeoJSON |

### `borde_costero` — 4 columna(s) rota(s)

| Columna | % nulos | % sospechosos | Acción |
|---|---|---|---|
| `Etiqueta2` | 99.56 | 0 | Eliminar del GeoJSON |
| `f_obsev` | 97.33 | 0 | Eliminar del GeoJSON |
| `editor_actualizacion` | 99.78 | 0 | Eliminar del GeoJSON |
| `fecha_actualizacion` | 74.44 | 0 | Revisar |

### `camaras_frio` — 1 columna(s) rota(s)

| Columna | % nulos | % sospechosos | Acción |
|---|---|---|---|
| `Numero de Camaras de Frio` | 91.67 | 0 | Revisar |

### `derechos_agua_2025` — 14 columna(s) rota(s)

| Columna | % nulos | % sospechosos | Acción |
|---|---|---|---|
| `Fecha Toma Razón` | 81.96 | 0 | Revisar |
| `Artículo Transitorio` | 89.46 | 0 | Revisar |
| `Uso del Agua` | 0 | 59.24 | Revisar valores / eliminar |
| `Caudal Ecológico (l/s)` | 97.83 | 0 | Eliminar del GeoJSON |
| `¿Caudal Ecológico Promedio?` | 98.59 | 0 | Eliminar del GeoJSON |
| `Latitud Captación` | 97.61 | 0 | Eliminar del GeoJSON |
| `Longitud Captación` | 97.61 | 0 | Eliminar del GeoJSON |
| `Datum_1` | 97.93 | 0 | Eliminar del GeoJSON |
| `Latitud Restitución` | 100 | 0 | Eliminar del GeoJSON |
| `Longitud Restitución` | 100 | 0 | Eliminar del GeoJSON |
| `Referencia a puntos conocidos de restitución` | 99.67 | 0 | Eliminar del GeoJSON |
| `Unidad Distancia` | 98.59 | 0 | Eliminar del GeoJSON |
| `Código Expediente Antiguo` | 79.13 | 0 | Revisar |
| `¿Posee más de un punto de captación?` | 99.89 | 0 | Eliminar del GeoJSON |

### `energia_almacenamiento_combustibles` — 6 columna(s) rota(s)

| Columna | % nulos | % sospechosos | Acción |
|---|---|---|---|
| `BENCINA` | 100 | 0 | Eliminar del GeoJSON |
| `BUTANO` | 100 | 0 | Eliminar del GeoJSON |
| `GASOLINAS` | 100 | 0 | Eliminar del GeoJSON |
| `KEROS_DOM` | 100 | 0 | Eliminar del GeoJSON |
| `PET_COMBUS` | 100 | 0 | Eliminar del GeoJSON |
| `PROPANO` | 100 | 0 | Eliminar del GeoJSON |

### `energia_plantas_eolicas` — 1 columna(s) rota(s)

| Columna | % nulos | % sospechosos | Acción |
|---|---|---|---|
| `MEDIO_GENE` | 100 | 0 | Eliminar del GeoJSON |

### `energia_terminales_maritimos` — 18 columna(s) rota(s)

| Columna | % nulos | % sospechosos | Acción |
|---|---|---|---|
| `BUTANO` | 100 | 0 | Eliminar del GeoJSON |
| `FUE_OIL_N6` | 75 | 0 | Revisar |
| `GAS_93` | 100 | 0 | Eliminar del GeoJSON |
| `GAS_97` | 100 | 0 | Eliminar del GeoJSON |
| `GASOLINAS` | 75 | 0 | Revisar |
| `GN` | 100 | 0 | Eliminar del GeoJSON |
| `GNL` | 100 | 0 | Eliminar del GeoJSON |
| `IFO_180` | 75 | 0 | Revisar |
| `KEROS_AVI` | 100 | 0 | Eliminar del GeoJSON |
| `KEROSENE` | 100 | 0 | Eliminar del GeoJSON |
| `GLP` | 100 | 0 | Eliminar del GeoJSON |
| `NAFTA` | 100 | 0 | Eliminar del GeoJSON |
| `P_LIMPIOS` | 100 | 0 | Eliminar del GeoJSON |
| `P_NEGROS` | 75 | 0 | Revisar |
| `PET_CRUDO` | 100 | 0 | Eliminar del GeoJSON |
| `PROPANO` | 100 | 0 | Eliminar del GeoJSON |
| `OTROS` | 100 | 0 | Eliminar del GeoJSON |
| `NO_ESPECIF` | 100 | 0 | Eliminar del GeoJSON |

### `energia_termoelectricas` — 1 columna(s) rota(s)

| Columna | % nulos | % sospechosos | Acción |
|---|---|---|---|
| `MEDIO_GENE` | 100 | 0 | Eliminar del GeoJSON |

### `glaciares` — 2 columna(s) rota(s)

| Columna | % nulos | % sospechosos | Acción |
|---|---|---|---|
| `CH_CASQ` | 100 | 0 | Eliminar del GeoJSON |
| `CUBIERTO` | 100 | 0 | Eliminar del GeoJSON |

### `grandes_terremotos` — 2 columna(s) rota(s)

| Columna | % nulos | % sospechosos | Acción |
|---|---|---|---|
| `Efecto` | 0 | 73.33 | Revisar valores / eliminar |
| `Magnitu_Mw` | 93.33 | 0 | Revisar |

### `humedales` — 1 columna(s) rota(s)

| Columna | % nulos | % sospechosos | Acción |
|---|---|---|---|
| `Nombre` | 0 | 85.65 | Revisar valores / eliminar |

### `incendios_forestales` — 2 columna(s) rota(s)

| Columna | % nulos | % sospechosos | Acción |
|---|---|---|---|
| `inicio_in` | 100 | 0 | Eliminar del GeoJSON |
| `extincion` | 100 | 0 | Eliminar del GeoJSON |

### `lagunas_embalses` — 7 columna(s) rota(s)

| Columna | % nulos | % sospechosos | Acción |
|---|---|---|---|
| `NOMBRE` | 72.73 | 0 | Revisar |
| `CODBNA` | 1.52 | 86.36 | Revisar valores / eliminar |
| `LATITUD` | 1.52 | 86.36 | Revisar valores / eliminar |
| `LONGITUD` | 1.52 | 86.36 | Revisar valores / eliminar |
| `CLASIFICAC` | 0 | 86.36 | Revisar valores / eliminar |
| `USO` | 1.52 | 86.36 | Revisar valores / eliminar |
| `INFORMACIO` | 1.52 | 86.36 | Revisar valores / eliminar |

### `plan_regulador_intercomunal_costero_norte` — 1 columna(s) rota(s)

| Columna | % nulos | % sospechosos | Acción |
|---|---|---|---|
| `UPREF` | 100 | 0 | Eliminar del GeoJSON |

### `plan_regulador_intercomunal_costero_sur` — 1 columna(s) rota(s)

| Columna | % nulos | % sospechosos | Acción |
|---|---|---|---|
| `UPREF` | 100 | 0 | Eliminar del GeoJSON |

### `plantas_aguas_servidas` — 2 columna(s) rota(s)

| Columna | % nulos | % sospechosos | Acción |
|---|---|---|---|
| `OTRO_TIPO_` | 81.82 | 0 | Revisar |
| `OTRO_TIPO1` | 100 | 0 | Eliminar del GeoJSON |

### `puntos_descargas` — 2 columna(s) rota(s)

| Columna | % nulos | % sospechosos | Acción |
|---|---|---|---|
| `OTRO_TIPO_` | 81.82 | 0 | Revisar |
| `OTRO_TIPO1` | 100 | 0 | Eliminar del GeoJSON |

### `red_canales` — 2 columna(s) rota(s)

| Columna | % nulos | % sospechosos | Acción |
|---|---|---|---|
| `PORC_REVES` | 100 | 0 | Eliminar del GeoJSON |
| `F_REVEST` | 100 | 0 | Eliminar del GeoJSON |

### `red_ferroviaria` — 1 columna(s) rota(s)

| Columna | % nulos | % sospechosos | Acción |
|---|---|---|---|
| `Nombre` | 100 | 0 | Eliminar del GeoJSON |

### `relaves_mineros_sernageomin` — 2 columna(s) rota(s)

| Columna | % nulos | % sospechosos | Acción |
|---|---|---|---|
| `ID_FAENA` | 75 | 0 | Revisar |
| `N_INSTALACION` | 79.65 | 0 | Revisar |

### `remociones_masa` — 1 columna(s) rota(s)

| Columna | % nulos | % sospechosos | Acción |
|---|---|---|---|
| `OBSERVACION` | 78.51 | 0 | Revisar |

### `viveros_sag` — 2 columna(s) rota(s)

| Columna | % nulos | % sospechosos | Acción |
|---|---|---|---|
| `v` | 95.65 | 0 | Eliminar del GeoJSON |
| `h` | 86.96 | 0 | Revisar |

### `yacimientos` — 10 columna(s) rota(s)

| Columna | % nulos | % sospechosos | Acción |
|---|---|---|---|
| `OTROS_NOMB` | 94.5 | 0 | Revisar |
| `EDAD_GEOLO` | 0 | 99.95 | Revisar valores / eliminar |
| `MODELO_GEN` | 99.86 | 0.14 | Eliminar del GeoJSON |
| `PROPIETARI` | 96.41 | 0 | Eliminar del GeoJSON |
| `OBSERVACIO` | 82.25 | 0 | Revisar |
| `FECHA_TERR` | 100 | 0 | Eliminar del GeoJSON |
| `DESCRIPCIO` | 100 | 0 | Eliminar del GeoJSON |
| `DESCRIPC_1` | 91.67 | 0 | Revisar |
| `DESCRIPC_2` | 100 | 0 | Eliminar del GeoJSON |
| `DESCRIPC_3` | 100 | 0 | Eliminar del GeoJSON |

**Total de columnas rotas:** 86

---

## 5. Incoherencias config ↔ BD

Campos que el visor pide pero **no existen** en la tabla.
El fix es en los archivos `js/config/*.js`, no en QGIS.


### hidrografia (agricultura.js)

- **popup:** `Ultima Actualizacion`
  - Sugerencias: `Ultima Actualizacion Dato` (score 80)
- **alias:** `Ultima Actualizacion`
  - Sugerencias: `Ultima Actualizacion Dato` (score 80)

### derechos_agua_2025 (agua.js)

- **popup:** `Caudal Anual Promedio en Ls/s`
  - Sugerencias: `Caudal Anual Promedio` (score 80)
- **alias:** `CBR`
  - Sugerencias: `N° Resolución/ Oficio/ Fojas | N° CBR` (score 80), `N° CBR` (score 80)
- **alias:** `CBR`
  - Sugerencias: `N° Resolución/ Oficio/ Fojas | N° CBR` (score 80), `N° CBR` (score 80)

### plantas_aguas_servidas (agua.js)

- **popup:** `FECHA_ACTUALIZACION`
  - ⚠️ Sin sugerencia

### puntos_descargas (agua.js)

- **popup:** `FECHA_ACTUALIZACION`
  - ⚠️ Sin sugerencia

### energia_almacenamiento_combustibles (energia.js)

- **popup:** `PET_DISEL`
  - ⚠️ Sin sugerencia
- **alias:** `PET_DISEL`
  - ⚠️ Sin sugerencia

### puertos (mineria.js)

- **alias:** `Numero de Muelles`
  - Sugerencias: `Numero Muelles` (score 100)

### distritos_mineros (mineria.js)

- **popup:** `Superficie en KM`
  - Sugerencias: `Superficie en KM2` (score 80)
- **alias:** `Superficie en KM`
  - Sugerencias: `Superficie en KM2` (score 80)

### wms_ide_minagri (otros.js)

- **popup:** `NOMBRE`
  - ⚠️ Sin sugerencia
- **popup:** `TIPO`
  - ⚠️ Sin sugerencia
- **popup:** `REGION`
  - ⚠️ Sin sugerencia
- **atributo:** `REGION`
  - ⚠️ Sin sugerencia
- **alias:** `NOMBRE`
  - ⚠️ Sin sugerencia
- **alias:** `TIPO`
  - ⚠️ Sin sugerencia
- **alias:** `REGION`
  - ⚠️ Sin sugerencia

### wms_ide_ciren_agroindustrias (otros.js)

- **popup:** `BNP`
  - ⚠️ Sin sugerencia
- **popup:** `COMUNA`
  - ⚠️ Sin sugerencia
- **popup:** `SUPERFICIE`
  - ⚠️ Sin sugerencia
- **popup:** `DECRETO`
  - ⚠️ Sin sugerencia
- **popup:** `ACT_ADM`
  - ⚠️ Sin sugerencia
- **popup:** `ADMINISTRA`
  - ⚠️ Sin sugerencia
- **popup:** `Descripcion`
  - ⚠️ Sin sugerencia
- **popup:** `Origen Dato`
  - ⚠️ Sin sugerencia
- **atributo:** `REGION`
  - ⚠️ Sin sugerencia
- **alias:** `BNP`
  - ⚠️ Sin sugerencia
- **alias:** `COMUNA`
  - ⚠️ Sin sugerencia
- **alias:** `SUPERFICIE`
  - ⚠️ Sin sugerencia
- **alias:** `DECRETO`
  - ⚠️ Sin sugerencia
- **alias:** `ACT_ADM`
  - ⚠️ Sin sugerencia
- **alias:** `ADMINISTRA`
  - ⚠️ Sin sugerencia
- **alias:** `Descripcion`
  - ⚠️ Sin sugerencia
- **alias:** `Origen Dato`
  - ⚠️ Sin sugerencia

### borde_costero (planificacion.js)

- **popup:** `Origen Data`
  - ⚠️ Sin sugerencia
- **alias:** `Origen Data`
  - ⚠️ Sin sugerencia

### prc_caldera (planificacion.js)

- **alias:** `Decreto`
  - Sugerencias: `Link Decreto` (score 80), `Nº Decreto` (score 80)

### prc_copiapo (planificacion.js)

- **popup:** `Fecha Publicacion`
  - ⚠️ Sin sugerencia
- **alias:** `Decreto`
  - Sugerencias: `Nº Decreto` (score 80), `Fecha Decreto` (score 80), `Link Decreto` (score 80)
- **alias:** `Fecha Publicacion`
  - ⚠️ Sin sugerencia

### prc_diego_almagro (planificacion.js)

- **popup:** `Fecha Publicacion`
  - ⚠️ Sin sugerencia
- **alias:** `Decreto`
  - Sugerencias: `Nº Decreto` (score 80), `Fecha Decreto` (score 80), `Link Decreto` (score 80)
- **alias:** `Fecha Publicacion`
  - ⚠️ Sin sugerencia

### prc_freirina (planificacion.js)

- **popup:** `Fecha Publicacion`
  - ⚠️ Sin sugerencia
- **alias:** `Decreto`
  - Sugerencias: `Nº Decreto` (score 80), `Fecha Decreto` (score 80), `Link Decreto` (score 80)
- **alias:** `Fecha Publicacion`
  - ⚠️ Sin sugerencia

### prc_huasco (planificacion.js)

- **popup:** `NOMBRE`
  - Sugerencias: `NOM` (score 80)
- **popup:** `Nº Decreto`
  - ⚠️ Sin sugerencia
- **popup:** `Fecha Publicacion`
  - ⚠️ Sin sugerencia
- **alias:** `NOMBRE`
  - Sugerencias: `NOM` (score 80)
- **alias:** `Decreto`
  - Sugerencias: `Link Decreto` (score 80)
- **alias:** `Fecha Publicacion`
  - ⚠️ Sin sugerencia

### prc_vallenar (planificacion.js)

- **popup:** `Fecha Publicacion`
  - ⚠️ Sin sugerencia
- **alias:** `Decreto`
  - Sugerencias: `Nº Decreto` (score 80), `Fecha Decreto` (score 80), `Link Decreto` (score 80)
- **alias:** `Fecha Publicacion`
  - ⚠️ Sin sugerencia

### limites_urbanos (planificacion.js)

- **popup:** `INSTRUMENT`
  - Sugerencias: `INSTRUMENT_1` (score 80)
- **popup:** `ADMIN`
  - Sugerencias: `ADMIN_1` (score 80)
- **alias:** `INSTRUMENT`
  - Sugerencias: `INSTRUMENT_1` (score 80)
- **alias:** `ADMIN`
  - Sugerencias: `ADMIN_1` (score 80)
- **alias:** `DO`
  - Sugerencias: `DO_1` (score 80), `N_DOC` (score 80), `T_DOC` (score 80)

### volcanes_activos (riesgos.js)

- **alias:** `Nota 2`
  - Sugerencias: `Nota` (score 80), `Nota 2:` (score 80)

### grandes_terremotos (riesgos.js)

- **atributo:** `Categoría`
  - ⚠️ Sin sugerencia

### incendios_forestales (riesgos.js)

- **popup:** `Descipcion`
  - ⚠️ Sin sugerencia

### puntos_criticos_invierno_2024 (riesgos.js)

- **alias:** `Origen Dato`
  - ⚠️ Sin sugerencia

### remociones_masa (riesgos.js)

- **popup:** `Código de la remoción en masa`
  - ⚠️ Sin sugerencia
- **popup:** `Tipo de remoción en masa`
  - ⚠️ Sin sugerencia
- **popup:** `Tipo de material`
  - Sugerencias: `TIPO_MATERIAL` (score 100)
- **popup:** `Clasificación de remoción en masa`
  - ⚠️ Sin sugerencia
- **popup:** `Día del evento`
  - Sugerencias: `DIA_EVENTO` (score 100)
- **popup:** `Mes de inicio del evento`
  - ⚠️ Sin sugerencia
- **popup:** `Año del evento`
  - Sugerencias: `ANO_EVENTO` (score 100)
- **popup:** `Estación de ocurrencia del evento`
  - ⚠️ Sin sugerencia
- **popup:** `Enlace de documento asociado`
  - Sugerencias: `ENLACE` (score 80)
- **popup:** `Fuente de la información`
  - Sugerencias: `FUENTE_INFO` (score 80)
- **popup:** `Descripcion`
  - ⚠️ Sin sugerencia
- **popup:** `Ultima Actualizacion`
  - ⚠️ Sin sugerencia
- **popup:** `Origen Data`
  - ⚠️ Sin sugerencia
- **alias:** `Código de la remoción en masa`
  - ⚠️ Sin sugerencia
- **alias:** `Tipo de remoción en masa`
  - ⚠️ Sin sugerencia
- **alias:** `Tipo de material`
  - Sugerencias: `TIPO_MATERIAL` (score 100)
- **alias:** `Clasificación de remoción en masa`
  - ⚠️ Sin sugerencia
- **alias:** `Día del evento`
  - Sugerencias: `DIA_EVENTO` (score 100)
- **alias:** `Mes de inicio del evento`
  - ⚠️ Sin sugerencia
- **alias:** `Año del evento`
  - Sugerencias: `ANO_EVENTO` (score 100)
- **alias:** `Estación de ocurrencia del evento`
  - ⚠️ Sin sugerencia
- **alias:** `Enlace de documento asociado`
  - Sugerencias: `ENLACE` (score 80)
- **alias:** `Fuente de la información`
  - Sugerencias: `FUENTE_INFO` (score 80)
- **alias:** `Descripcion`
  - ⚠️ Sin sugerencia
- **alias:** `Ultima Actualizacion`
  - ⚠️ Sin sugerencia
- **alias:** `Origen Data`
  - ⚠️ Sin sugerencia

---

### Resumen

| Tipo | Total |
|---|---|
| popupCampos huérfanos | 41 |
| atributo huérfano | 3 |
| alias huérfano | 48 |

---

## 6. Capas con 5+ columnas problemáticas

| Capa | Dirty | Broken | Total |
|---|---|---|---|
| `derechos_agua_2025` | 9 | 14 | 23 |
| `energia_terminales_maritimos` | 0 | 18 | 18 |
| `yacimientos` | 3 | 10 | 13 |
| `energia_almacenamiento_combustibles` | 3 | 6 | 9 |
| `borde_costero` | 4 | 4 | 8 |
| `incendios_forestales` | 5 | 2 | 7 |
| `lagunas_embalses` | 0 | 7 | 7 |
| `red_canales` | 5 | 2 | 7 |
| `viveros_sag` | 5 | 2 | 7 |
| `acuiferos` | 3 | 3 | 6 |
| `relaves_mineros_sernageomin` | 3 | 2 | 5 |

---

## 7. Tablas vacías (1)

- `energia_linea_media_transmision`

**Acción:** buscar el archivo original o deshabilitar del catálogo.

---

## 8. Plan de acción por fases

### Fase 1 — Geometrías inválidas (QGIS)

- [ ] `capacidad_uso_suelo`
- [ ] `territorios_operacionales`
- [ ] `energia_potencial_eolico`
- [ ] `energia_potencial_fotovoltaico`
- [ ] `energia_potencial_solar_csp`

### Fase 2 — Columnas rotas (QGIS)

- [ ] `acuiferos` (3 columnas)
- [ ] `borde_costero` (4 columnas)
- [ ] `derechos_agua_2025` (14 columnas)
- [ ] `energia_almacenamiento_combustibles` (6 columnas)
- [ ] `energia_terminales_maritimos` (18 columnas)
- [ ] `lagunas_embalses` (7 columnas)
- [ ] `yacimientos` (10 columnas)

### Fase 3 — Incoherencias config (editar `js/config/*.js`)

Ver sección 5.

### Fase 4 — Duplicados de geometría

- [ ] `catastro_especies_frutales` (327 duplicadas)
- [ ] `derechos_agua_2025` (230 duplicadas)
- [ ] `energia_potencial_hidrobombeo` (70 duplicadas)
- [ ] `energia_linea_transmision` (2 duplicadas)
- [ ] `subestaciones` (1 duplicadas)
- [ ] `relaves_mineros_sernageomin` (1 duplicadas)
- [ ] `yacimientos` (4 duplicadas)
- [ ] `borde_costero` (67 duplicadas)
- [ ] `grandes_terremotos` (3 duplicadas)
- [ ] `remociones_masa` (3 duplicadas)

### Fase 5 — Tablas vacías

- [ ] `energia_linea_media_transmision`

---

## 9. Prioridades

### 9.1. Urgente (esta semana) — 1-2h en QGIS

Corregir las capas con más del 30% de geometrías inválidas:

- [ ] `territorios_operacionales` (30% inválidas)
- [ ] `energia_potencial_eolico` (80% inválidas)
- [ ] `energia_potencial_fotovoltaico` (100% inválidas)
- [ ] `energia_potencial_solar_csp` (100% inválidas)

### 9.2. Alta (próximas 2 semanas) — 3-4h en QGIS

Capas con 5-30% inválidas y columnas rotas grandes:

- [ ] `capacidad_uso_suelo` (5.77% inválidas)
- [ ] `derechos_agua_2025` (23 columnas problemáticas)
- [ ] `energia_terminales_maritimos` (18 columnas problemáticas)
- [ ] `yacimientos` (13 columnas problemáticas)
- [ ] `energia_almacenamiento_combustibles` (9 columnas problemáticas)
- [ ] `borde_costero` (8 columnas problemáticas)
- [ ] `incendios_forestales` (7 columnas problemáticas)
- [ ] `lagunas_embalses` (7 columnas problemáticas)
- [ ] `red_canales` (7 columnas problemáticas)
- [ ] `viveros_sag` (7 columnas problemáticas)
- [ ] `acuiferos` (6 columnas problemáticas)
- [ ] `relaves_mineros_sernageomin` (5 columnas problemáticas)

### 9.3. Media (cuando haya tiempo)

- Incoherencias config: 92 issues en 23 capas (ver sección 5).
- Duplicados de geometría: 10 capas.
- Tablas vacías: 1 capa(s).
- Columnas dirty (30-70% nulos): revisar caso por caso.

---

_Generado automáticamente desde audit-data.json y CONFIG-COHERENCE.md._