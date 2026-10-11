# Auditoría de calidad de datos — Informe completo

- **Fecha:** 2026-10-11T15:40:31.956Z
- **Umbrales:** v1
- **Corrida:** `42df0e6f-84d6-40a1-865c-a34a0c039209`
- **Capas auditadas:** 69

## 1. Resumen ejecutivo

| Estado | Cantidad | % |
|---|---|---|
| ✅ OK | 16 | 23% |
| ⚠️ Warning | 47 | 68% |
| 🚨 Blocked | 6 | 9% |

## 2. Tabla completa (69 capas)

| Capa | Estado | Filas | Cols problemáticas | Config | Procedencia |
|---|---|---|---|---|---|
| capacidad_uso_suelo | blocked | 52 | 0 | 0 | — |
| energia_linea_media_transmision | blocked | 0 | 0 | 0 | — |
| energia_potencial_eolico | blocked | 5 | 0 | 0 | — |
| energia_potencial_fotovoltaico | blocked | 9 | 0 | 0 | — |
| energia_potencial_solar_csp | blocked | 6 | 0 | 0 | — |
| territorios_operacionales | blocked | 10 | 0 | 0 | — |
| acuiferos | warning | 57 | 6 | 0 | — |
| bienes_nacionales_protegidos | warning | 6 | 2 | 0 | — |
| borde_costero | warning | 450 | 8 | 2 | stale |
| camaras_frio | warning | 12 | 1 | 0 | — |
| catastro_especies_frutales | warning | 2956 | 0 | 0 | — |
| comunas_poligonos | warning | 9 | 0 | 0 | missing_provenance |
| derechos_agua_2025 | warning | 920 | 23 | 1 | — |
| distritos_mineros | warning | 3 | 0 | 2 | — |
| energia_almacenamiento_combustibles | warning | 2 | 9 | 2 | — |
| energia_plantas_eolicas | warning | 6 | 1 | 0 | — |
| energia_plantas_solares | warning | 46 | 1 | 0 | — |
| energia_potencial_hidrobombeo | warning | 132 | 0 | 0 | — |
| energia_terminales_maritimos | warning | 4 | 18 | 0 | — |
| energia_termoelectricas | warning | 12 | 1 | 0 | — |
| glaciares | warning | 863 | 2 | 0 | — |
| grandes_terremotos | warning | 15 | 4 | 2 | — |
| hidrografia | warning | 734 | 2 | 2 | — |
| humedales | warning | 1429 | 1 | 0 | — |
| incendios_forestales | warning | 100 | 7 | 1 | — |
| lagunas_embalses | warning | 66 | 7 | 0 | — |
| limite_comunal_linea | warning | 9 | 0 | 0 | missing_provenance |
| limites_urbanos | warning | 13 | 0 | 5 | — |
| plan_regulador_intercomunal_costero_norte | warning | 458 | 1 | 0 | — |
| plan_regulador_intercomunal_costero_sur | warning | 104 | 1 | 0 | — |
| plantas_aguas_servidas | warning | 11 | 2 | 1 | — |
| plantas_desaladoras_puntos | warning | 7 | 1 | 0 | — |
| prc_chañaral | warning | 83 | 0 | 2 | — |
| prc_chañaral_el_salado | warning | 7 | 0 | 2 | — |
| prc_chañaral_flamenco | warning | 9 | 0 | 2 | — |
| prc_chañaral_portofino | warning | 7 | 0 | 2 | — |
| prc_copiapo | warning | 16 | 0 | 2 | — |
| prc_diego_almagro | warning | 15 | 0 | 2 | — |
| prc_freirina | warning | 72 | 0 | 2 | — |
| prc_huasco | warning | 501 | 0 | 6 | — |
| prc_vallenar | warning | 9 | 0 | 2 | — |
| puertos | warning | 7 | 1 | 1 | — |
| puntos_criticos_invierno_2024 | warning | 420 | 1 | 1 | — |
| puntos_descargas | warning | 11 | 2 | 1 | — |
| red_canales | warning | 501 | 7 | 0 | — |
| red_ferroviaria | warning | 132 | 1 | 0 | — |
| relaves_mineros_sernageomin | warning | 172 | 5 | 0 | — |
| remociones_masa | warning | 363 | 1 | 27 | missing_provenance |
| salares | warning | 14 | 1 | 0 | — |
| sonami_mapa_minero | warning | 75 | 1 | 0 | — |
| toponimia | warning | 104 | 0 | 0 | missing_provenance |
| viveros_sag | warning | 23 | 7 | 0 | — |
| yacimientos | warning | 2090 | 13 | 2 | — |
| apr_rural | ok | 46 | 0 | 0 | — |
| catastro_plantas_embalaje | ok | 61 | 0 | 0 | — |
| catastro_variedades_frutales | ok | 2946 | 0 | 0 | — |
| cuencas_dga | ok | 11 | 0 | 0 | — |
| decrero_escasez_2021 | ok | 1 | 0 | 0 | — |
| decrero_escasez_2022 | ok | 1 | 0 | 0 | — |
| decrero_escasez_2023 | ok | 1 | 0 | 0 | — |
| desaladoras_acueductos | ok | 8 | 0 | 0 | — |
| energia_hidroelectricas | ok | 1 | 0 | 0 | — |
| energia_linea_transmision | ok | 109 | 0 | 0 | — |
| prc_caldera | ok | 62 | 0 | 0 | — |
| sistema_areas_protegidas | ok | 5 | 0 | 0 | — |
| subestaciones | ok | 111 | 0 | 0 | — |
| unidades_geomorfologicas | ok | 21 | 0 | 0 | — |
| volcanes_activos | ok | 4 | 0 | 0 | — |
| zonas_climaticas | ok | 14 | 0 | 0 | — |

## 3. Detalle por capa

### 3.x. `capacidad_uso_suelo` — BLOCKED

- **Filas:** 52
- **Geometrías:** total 52, nulas 0, vacías 0, inválidas 3, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** bad_geometries

**Columnas problemáticas (1):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `Nota Clasificacion` | has_nulls | 13.46 | 0 |  |

### 3.x. `energia_linea_media_transmision` — BLOCKED

- **Filas:** 0
- **Geometrías:** total 0, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** table_empty

**Columnas problemáticas (30):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `id` | empty | 0 | 0 |  |
| `OBJECTID` | empty | 0 | 0 |  |
| `EMPRESA_ID` | empty | 0 | 0 |  |
| `NOMBRE_EMPRESA` | empty | 0 | 0 |  |
| `PERIODO_STAR` | empty | 0 | 0 |  |
| `TRAMO_MT_ID` | empty | 0 | 0 |  |
| `TIPO_DISPOSICION_TRAMO_ID` | empty | 0 | 0 |  |
| `DESC_TIPO_DISPOSICION_TRAMO` | empty | 0 | 0 |  |
| `COMUNA_ID` | empty | 0 | 0 |  |
| `TIPO_PROPIEDAD_ID` | empty | 0 | 0 |  |
| `DESC_TIPO_PROPIEDAD` | empty | 0 | 0 |  |
| `EN_ZONA_CONCESION` | empty | 0 | 0 |  |
| `CONECTADA_RED` | empty | 0 | 0 |  |
| `IDENTIFICADOR_VNR` | empty | 0 | 0 |  |
| `CODIGO_VNR` | empty | 0 | 0 |  |
| `DESC_AISLACION` | empty | 0 | 0 |  |
| `DESC_MATERIAL` | empty | 0 | 0 |  |
| `DESC_TENSION` | empty | 0 | 0 |  |
| `LARGO_RED` | empty | 0 | 0 |  |
| `NUMERO_FASES` | empty | 0 | 0 |  |
| `NOMBRE_FASES` | empty | 0 | 0 |  |
| `PEEM_ID` | empty | 0 | 0 |  |
| `GIS_ID` | empty | 0 | 0 |  |
| `DATUM_ID` | empty | 0 | 0 |  |
| `X` | empty | 0 | 0 |  |
| `Y` | empty | 0 | 0 |  |
| `ZONA_UTM` | empty | 0 | 0 |  |
| `FECHA_INSTALACION` | empty | 0 | 0 |  |
| `Shape_Length` | empty | 0 | 0 |  |
| `Origen Data` | empty | 0 | 0 |  |

### 3.x. `energia_potencial_eolico` — BLOCKED

- **Filas:** 5
- **Geometrías:** total 5, nulas 0, vacías 0, inválidas 4, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** bad_geometries

### 3.x. `energia_potencial_fotovoltaico` — BLOCKED

- **Filas:** 9
- **Geometrías:** total 9, nulas 0, vacías 0, inválidas 9, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** bad_geometries

### 3.x. `energia_potencial_solar_csp` — BLOCKED

- **Filas:** 6
- **Geometrías:** total 6, nulas 0, vacías 0, inválidas 6, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** bad_geometries

### 3.x. `territorios_operacionales` — BLOCKED

- **Filas:** 10
- **Geometrías:** total 10, nulas 0, vacías 0, inválidas 3, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** bad_geometries

### 3.x. `acuiferos` — WARNING

- **Filas:** 57
- **Geometrías:** total 57, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** column_dirty, column_dirty, column_dirty, column_broken, column_broken, column_broken

**Columnas problemáticas (6):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `F_RES_DGA` | dirty | 68.42 | 0 |  |
| `F_TRAZON` | dirty | 68.42 | 0 |  |
| `F_PUB_DO` | dirty | 68.42 | 0 |  |
| `PUBMODIF_1` | broken | 87.72 | 0 |  |
| `PUBMODIF_2` | broken | 96.49 | 0 | id_like |
| `PUBMODIF_3` | broken | 100 | 0 |  |

### 3.x. `bienes_nacionales_protegidos` — WARNING

- **Filas:** 6
- **Geometrías:** total 6, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** column_dirty, column_dirty

**Columnas problemáticas (2):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `ACT_ADM` | dirty | 33.33 | 0 |  |
| `ADMINISTRA` | dirty | 66.67 | 0 |  |

### 3.x. `borde_costero` — WARNING

- **Filas:** 450
- **Geometrías:** total 450, nulas 0, vacías 2, inválidas 9, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 67
- **Flags:** stale
- **Warnings:** duplicate_geom, column_dirty, column_dirty, column_dirty, column_broken, column_dirty, column_broken, column_broken, column_broken, config_issues, stale
- **Config issues:**
  - `popup_field_missing`: `Origen Data`
  - `alias_key_missing`: `Origen Data`

**Columnas problemáticas (9):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `ID` | dirty | 40.67 | 0 |  |
| `ZONA_1` | has_nulls | 14.89 | 0 |  |
| `GLOSA` | dirty | 36.22 | 0 |  |
| `DESCRIP_ZO` | dirty | 34 | 0 | has_case_variants |
| `Etiqueta2` | broken | 99.56 | 0 | id_like |
| `Observacio` | dirty | 60.67 | 0 |  |
| `f_obsev` | broken | 97.33 | 0 |  |
| `editor_actualizacion` | broken | 99.78 | 0 | id_like |
| `fecha_actualizacion` | broken | 74.44 | 0 |  |

### 3.x. `camaras_frio` — WARNING

- **Filas:** 12
- **Geometrías:** total 12, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** column_broken

**Columnas problemáticas (2):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `Numero de Camaras de Frio` | broken | 91.67 | 0 | id_like |
| `Numero de Camaras de Prefrio` | has_nulls | 8.33 | 0 |  |

### 3.x. `catastro_especies_frutales` — WARNING

- **Filas:** 2956
- **Geometrías:** total 2956, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 327
- **Flags:** —
- **Warnings:** duplicate_geom

### 3.x. `comunas_poligonos` — WARNING

- **Filas:** 9
- **Geometrías:** total 9, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** missing_provenance
- **Warnings:** missing_provenance

### 3.x. `derechos_agua_2025` — WARNING

- **Filas:** 920
- **Geometrías:** total 920, nulas 2, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 230
- **Flags:** —
- **Warnings:** duplicate_geom, column_dirty, column_broken, column_broken, column_broken, column_dirty, column_dirty, column_dirty, column_broken, column_broken, column_dirty, column_broken, column_broken, column_broken, column_broken, column_broken, column_dirty, column_broken, column_broken, column_dirty, column_dirty, column_broken, column_broken, column_dirty, config_issues
- **Config issues:**
  - `popup_field_missing`: `Caudal Anual Promedio en Ls/s`

**Columnas problemáticas (25):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `N°` | dirty | 51.85 | 0 | numeric_as_text, id_like |
| `Fecha Toma Razón` | broken | 81.96 | 0 |  |
| `Artículo Transitorio` | broken | 89.46 | 0 |  |
| `Uso del Agua` | broken | 0 | 59.24 |  |
| `SubCuenca` | dirty | 44.89 | 0 |  |
| `SubSubCuenca` | dirty | 60.11 | 0 |  |
| `Fuente` | dirty | 6.96 | 0.11 | has_case_variants |
| `Caudal Ecológico (l/s)` | broken | 97.83 | 0 | numeric_as_text |
| `¿Caudal Ecológico Promedio?` | broken | 98.59 | 0 |  |
| `Volumen` | dirty | 50.11 | 0 | numeric_as_text |
| `Latitud Captación` | broken | 97.61 | 0 |  |
| `Longitud Captación` | broken | 97.61 | 0 |  |
| `Datum_1` | broken | 97.93 | 0 | numeric_as_text |
| `Latitud Restitución` | broken | 100 | 0 |  |
| `Longitud Restitución` | broken | 100 | 0 |  |
| `Referencia a puntos conocidos de captación` | dirty | 45.11 | 0 | has_case_variants |
| `Referencia a puntos conocidos de restitución` | broken | 99.67 | 0 | id_like |
| `Unidad Distancia` | broken | 98.59 | 0 |  |
| `C.B.R.` | dirty | 31.63 | 0 |  |
| `Fojas` | dirty | 31.63 | 0 | has_case_variants |
| `Código Expediente Antiguo` | broken | 79.13 | 0 |  |
| `¿Posee más de un punto de captación?` | broken | 99.89 | 0 | id_like |
| `N° Certificado/ Año` | dirty | 33.04 | 0 |  |
| `Radio (m)` | has_nulls | 21.96 | 0 | numeric_as_text |
| `Profundidad (m)` | has_nulls | 22.07 | 0 | numeric_as_text |

### 3.x. `distritos_mineros` — WARNING

- **Filas:** 3
- **Geometrías:** total 3, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** config_issues
- **Config issues:**
  - `popup_field_missing`: `Superficie en KM`
  - `alias_key_missing`: `Superficie en KM`

### 3.x. `energia_almacenamiento_combustibles` — WARNING

- **Filas:** 2
- **Geometrías:** total 2, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** column_broken, column_broken, column_broken, column_dirty, column_dirty, column_broken, column_broken, column_dirty, column_broken, config_issues
- **Config issues:**
  - `popup_field_missing`: `PET_DISEL`
  - `alias_key_missing`: `PET_DISEL`

**Columnas problemáticas (9):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `BENCINA` | broken | 100 | 0 |  |
| `BUTANO` | broken | 100 | 0 |  |
| `GASOLINAS` | broken | 100 | 0 |  |
| `GNL` | dirty | 50 | 0 |  |
| `KEROS_AVI` | dirty | 50 | 0 |  |
| `KEROS_DOM` | broken | 100 | 0 |  |
| `PET_COMBUS` | broken | 100 | 0 |  |
| `PET_DIESEL` | dirty | 50 | 0 |  |
| `PROPANO` | broken | 100 | 0 |  |

### 3.x. `energia_plantas_eolicas` — WARNING

- **Filas:** 6
- **Geometrías:** total 6, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** column_broken

**Columnas problemáticas (1):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `MEDIO_GENE` | broken | 100 | 0 |  |

### 3.x. `energia_plantas_solares` — WARNING

- **Filas:** 46
- **Geometrías:** total 46, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** column_dirty

**Columnas problemáticas (2):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `MEDIO_GENE` | dirty | 41.3 | 0 |  |
| `RCA` | has_nulls | 6.52 | 0 |  |

### 3.x. `energia_potencial_hidrobombeo` — WARNING

- **Filas:** 132
- **Geometrías:** total 132, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 70
- **Flags:** —
- **Warnings:** duplicate_geom

### 3.x. `energia_terminales_maritimos` — WARNING

- **Filas:** 4
- **Geometrías:** total 4, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** column_broken, column_broken, column_broken, column_broken, column_broken, column_broken, column_broken, column_broken, column_broken, column_broken, column_broken, column_broken, column_broken, column_broken, column_broken, column_broken, column_broken, column_broken

**Columnas problemáticas (18):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `BUTANO` | broken | 100 | 0 |  |
| `FUE_OIL_N6` | broken | 75 | 0 |  |
| `GAS_93` | broken | 100 | 0 |  |
| `GAS_97` | broken | 100 | 0 |  |
| `GASOLINAS` | broken | 75 | 0 |  |
| `GN` | broken | 100 | 0 |  |
| `GNL` | broken | 100 | 0 |  |
| `IFO_180` | broken | 75 | 0 |  |
| `KEROS_AVI` | broken | 100 | 0 |  |
| `KEROSENE` | broken | 100 | 0 |  |
| `GLP` | broken | 100 | 0 |  |
| `NAFTA` | broken | 100 | 0 |  |
| `P_LIMPIOS` | broken | 100 | 0 |  |
| `P_NEGROS` | broken | 75 | 0 |  |
| `PET_CRUDO` | broken | 100 | 0 |  |
| `PROPANO` | broken | 100 | 0 |  |
| `OTROS` | broken | 100 | 0 |  |
| `NO_ESPECIF` | broken | 100 | 0 |  |

### 3.x. `energia_termoelectricas` — WARNING

- **Filas:** 12
- **Geometrías:** total 12, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** column_broken

**Columnas problemáticas (2):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `MEDIO_GENE` | broken | 100 | 0 |  |
| `RCA` | has_nulls | 25 | 0 | id_like |

### 3.x. `glaciares` — WARNING

- **Filas:** 863
- **Geometrías:** total 863, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** column_broken, column_broken

**Columnas problemáticas (2):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `CH_CASQ` | broken | 100 | 0 |  |
| `CUBIERTO` | broken | 100 | 0 |  |

### 3.x. `grandes_terremotos` — WARNING

- **Filas:** 15
- **Geometrías:** total 15, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 3
- **Flags:** —
- **Warnings:** duplicate_geom, column_dirty, column_broken, column_broken, column_dirty, config_issues
- **Config issues:**
  - `atributo_missing`: `Categoría`
  - `alias_key_missing`: `Link_Data:`

**Columnas problemáticas (4):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `Hora local` | dirty | 0 | 6.67 | id_like |
| `Efecto` | broken | 0 | 73.33 |  |
| `Magnitu_Mw` | broken | 93.33 | 0 | id_like |
| `Profundid_` | dirty | 46.67 | 0 |  |

### 3.x. `hidrografia` — WARNING

- **Filas:** 734
- **Geometrías:** total 734, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** column_dirty, column_dirty, config_issues
- **Config issues:**
  - `popup_field_missing`: `Ultima Actualizacion`
  - `alias_key_missing`: `Ultima Actualizacion`

**Columnas problemáticas (2):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `nombre_bcn` | dirty | 45.64 | 0 | has_case_variants |
| `nombre_mop` | dirty | 45.64 | 0 | has_case_variants |

### 3.x. `humedales` — WARNING

- **Filas:** 1429
- **Geometrías:** total 1429, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** column_broken

**Columnas problemáticas (1):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `Nombre` | broken | 0 | 85.65 |  |

### 3.x. `incendios_forestales` — WARNING

- **Filas:** 100
- **Geometrías:** total 100, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** column_dirty, column_broken, column_broken, column_dirty, column_dirty, column_dirty, column_dirty, config_issues
- **Config issues:**
  - `popup_field_missing`: `Descipcion`

**Columnas problemáticas (13):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `comuna` | has_nulls | 14 | 0 | has_case_variants |
| `causa_espe` | has_nulls | 18 | 0 |  |
| `total_otra` | dirty | 44 | 0 |  |
| `region` | has_nulls | 15 | 0 |  |
| `provincia` | has_nulls | 15 | 0 |  |
| `inicio_c` | has_nulls | 27 | 0 |  |
| `combus_i` | has_nulls | 27 | 0 |  |
| `inicio_in` | broken | 100 | 0 |  |
| `extincion` | broken | 100 | 0 |  |
| `orig_fid` | dirty | 58 | 0 | id_like |
| `total_o` | dirty | 56 | 0 |  |
| `fh_inicio` | dirty | 42 | 0 |  |
| `fh_extinci` | dirty | 42 | 0 |  |

### 3.x. `lagunas_embalses` — WARNING

- **Filas:** 66
- **Geometrías:** total 66, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** column_broken, column_broken, column_broken, column_broken, column_broken, column_broken, column_broken

**Columnas problemáticas (7):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `NOMBRE` | broken | 72.73 | 0 |  |
| `CODBNA` | broken | 1.52 | 86.36 |  |
| `LATITUD` | broken | 1.52 | 86.36 |  |
| `LONGITUD` | broken | 1.52 | 86.36 |  |
| `CLASIFICAC` | broken | 0 | 86.36 |  |
| `USO` | broken | 1.52 | 86.36 |  |
| `INFORMACIO` | broken | 1.52 | 86.36 |  |

### 3.x. `limite_comunal_linea` — WARNING

- **Filas:** 9
- **Geometrías:** total 9, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** missing_provenance
- **Warnings:** missing_provenance

### 3.x. `limites_urbanos` — WARNING

- **Filas:** 13
- **Geometrías:** total 13, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** config_issues
- **Config issues:**
  - `popup_field_missing`: `INSTRUMENT`
  - `popup_field_missing`: `ADMIN`
  - `alias_key_missing`: `INSTRUMENT`
  - `alias_key_missing`: `ADMIN`
  - `alias_key_missing`: `DO`

**Columnas problemáticas (2):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `DO_1` | has_nulls | 7.69 | 0 |  |
| `N_DOC` | has_nulls | 7.69 | 0 | numeric_as_text |

### 3.x. `plan_regulador_intercomunal_costero_norte` — WARNING

- **Filas:** 458
- **Geometrías:** total 458, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** column_broken

**Columnas problemáticas (2):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `UPREF` | broken | 100 | 0 |  |
| `PROVINCIA` | has_nulls | 7.86 | 0 |  |

### 3.x. `plan_regulador_intercomunal_costero_sur` — WARNING

- **Filas:** 104
- **Geometrías:** total 104, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** column_broken

**Columnas problemáticas (1):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `UPREF` | broken | 100 | 0 |  |

### 3.x. `plantas_aguas_servidas` — WARNING

- **Filas:** 11
- **Geometrías:** total 11, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** column_broken, column_broken, config_issues
- **Config issues:**
  - `popup_field_missing`: `FECHA_ACTUALIZACION`

**Columnas problemáticas (2):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `OTRO_TIPO_` | broken | 81.82 | 0 |  |
| `OTRO_TIPO1` | broken | 100 | 0 |  |

### 3.x. `plantas_desaladoras_puntos` — WARNING

- **Filas:** 7
- **Geometrías:** total 7, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** column_dirty

**Columnas problemáticas (2):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `Estado` | has_nulls | 14.29 | 0 |  |
| `Inicio Operacion` | dirty | 42.86 | 0 | numeric_as_text |

### 3.x. `prc_chañaral` — WARNING

- **Filas:** 83
- **Geometrías:** total 83, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** config_issues
- **Config issues:**
  - `popup_field_missing`: `Fecha Publicacion`
  - `alias_key_missing`: `Fecha Publicacion`

### 3.x. `prc_chañaral_el_salado` — WARNING

- **Filas:** 7
- **Geometrías:** total 7, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** config_issues
- **Config issues:**
  - `popup_field_missing`: `Fecha Publicacion`
  - `alias_key_missing`: `Fecha Publicacion`

### 3.x. `prc_chañaral_flamenco` — WARNING

- **Filas:** 9
- **Geometrías:** total 9, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** config_issues
- **Config issues:**
  - `popup_field_missing`: `Fecha Publicacion`
  - `alias_key_missing`: `Fecha Publicacion`

### 3.x. `prc_chañaral_portofino` — WARNING

- **Filas:** 7
- **Geometrías:** total 7, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** config_issues
- **Config issues:**
  - `popup_field_missing`: `Fecha Publicacion`
  - `alias_key_missing`: `Fecha Publicacion`

### 3.x. `prc_copiapo` — WARNING

- **Filas:** 16
- **Geometrías:** total 16, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** config_issues
- **Config issues:**
  - `popup_field_missing`: `Fecha Publicacion`
  - `alias_key_missing`: `Fecha Publicacion`

### 3.x. `prc_diego_almagro` — WARNING

- **Filas:** 15
- **Geometrías:** total 15, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** config_issues
- **Config issues:**
  - `popup_field_missing`: `Fecha Publicacion`
  - `alias_key_missing`: `Fecha Publicacion`

### 3.x. `prc_freirina` — WARNING

- **Filas:** 72
- **Geometrías:** total 72, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** config_issues
- **Config issues:**
  - `popup_field_missing`: `Fecha Publicacion`
  - `alias_key_missing`: `Fecha Publicacion`

### 3.x. `prc_huasco` — WARNING

- **Filas:** 501
- **Geometrías:** total 501, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** config_issues
- **Config issues:**
  - `popup_field_missing`: `NOMBRE`
  - `popup_field_missing`: `Nº Decreto`
  - `popup_field_missing`: `Fecha Publicacion`
  - `alias_key_missing`: `NOMBRE`
  - `alias_key_missing`: `Nº Decreto`
  - `alias_key_missing`: `Fecha Publicacion`

### 3.x. `prc_vallenar` — WARNING

- **Filas:** 9
- **Geometrías:** total 9, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** config_issues
- **Config issues:**
  - `popup_field_missing`: `Fecha Publicacion`
  - `alias_key_missing`: `Fecha Publicacion`

### 3.x. `puertos` — WARNING

- **Filas:** 7
- **Geometrías:** total 7, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** column_dirty, config_issues
- **Config issues:**
  - `alias_key_missing`: `Numero de Muelles`

**Columnas problemáticas (1):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `Sitio Web` | dirty | 42.86 | 0 |  |

### 3.x. `puntos_criticos_invierno_2024` — WARNING

- **Filas:** 420
- **Geometrías:** total 420, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** column_dirty, config_issues
- **Config issues:**
  - `alias_key_missing`: `Origen Dato`

**Columnas problemáticas (5):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `f1_accione` | has_nulls | 6.67 | 0 |  |
| `f2_accione` | dirty | 30.48 | 0 |  |
| `solucion_p` | has_nulls | 16.43 | 0 |  |
| `si_la_resp` | has_nulls | 26.67 | 0 |  |
| `riesgo_2024` | has_nulls | 14.29 | 0 |  |

### 3.x. `puntos_descargas` — WARNING

- **Filas:** 11
- **Geometrías:** total 11, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** column_broken, column_broken, config_issues
- **Config issues:**
  - `popup_field_missing`: `FECHA_ACTUALIZACION`

**Columnas problemáticas (2):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `OTRO_TIPO_` | broken | 81.82 | 0 |  |
| `OTRO_TIPO1` | broken | 100 | 0 |  |

### 3.x. `red_canales` — WARNING

- **Filas:** 501
- **Geometrías:** total 501, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** column_dirty, column_broken, column_dirty, column_dirty, column_dirty, column_dirty, column_broken

**Columnas problemáticas (11):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `CODCAN` | has_nulls | 16.97 | 0 | numeric_as_text, id_like |
| `N_ACCIONES` | dirty | 58.28 | 0 |  |
| `PORC_REVES` | broken | 100 | 0 |  |
| `OUA` | dirty | 58.68 | 0 |  |
| `OUA_TIPO` | dirty | 58.68 | 0 |  |
| `JV` | has_nulls | 19.56 | 0 |  |
| `OU_ID` | dirty | 58.68 | 0 | numeric_as_text |
| `JV_ID` | has_nulls | 19.56 | 0 | numeric_as_text |
| `F_NUM_ACC` | dirty | 40.72 | 0 |  |
| `F_REVEST` | broken | 100 | 0 |  |
| `F_OUA` | has_nulls | 19.56 | 0 |  |

### 3.x. `red_ferroviaria` — WARNING

- **Filas:** 132
- **Geometrías:** total 132, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** column_broken

**Columnas problemáticas (2):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `OBEJTO` | has_nulls | 9.85 | 0 |  |
| `Nombre` | broken | 100 | 0 |  |

### 3.x. `relaves_mineros_sernageomin` — WARNING

- **Filas:** 172
- **Geometrías:** total 172, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 1
- **Flags:** —
- **Warnings:** column_dirty, column_dirty, column_dirty, column_broken, column_broken

**Columnas problemáticas (7):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `METODO_CONS` | dirty | 40.12 | 0 |  |
| `VOL_ACTUAL` | has_nulls | 8.72 | 0 |  |
| `TON_ACTUAL` | has_nulls | 9.3 | 0 |  |
| `RES_PDC_APRUEBA` | dirty | 55.23 | 0 |  |
| `RES_PDC_FECHA` | dirty | 55.23 | 0 |  |
| `ID_FAENA` | broken | 75 | 0 |  |
| `N_INSTALACION` | broken | 79.65 | 0 | id_like |

### 3.x. `remociones_masa` — WARNING

- **Filas:** 363
- **Geometrías:** total 363, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 3
- **Flags:** missing_provenance
- **Warnings:** column_broken, config_issues, missing_provenance
- **Config issues:**
  - `popup_field_missing`: `Código de la remoción en masa`
  - `popup_field_missing`: `Tipo de remoción en masa`
  - `popup_field_missing`: `Tipo de material`
  - `popup_field_missing`: `Clasificación de remoción en masa`
  - `popup_field_missing`: `Día del evento`
  - `popup_field_missing`: `Mes de inicio del evento`
  - `popup_field_missing`: `Año del evento`
  - `popup_field_missing`: `Estación de ocurrencia del evento`
  - `popup_field_missing`: `Enlace de documento asociado`
  - `popup_field_missing`: `Fuente de la información`
  - `popup_field_missing`: `Descripcion`
  - `popup_field_missing`: `Ultima Actualizacion`
  - `popup_field_missing`: `Origen Data`
  - `atributo_missing`: `Región`
  - `alias_key_missing`: `Código de la remoción en masa`
  - `alias_key_missing`: `Tipo de remoción en masa`
  - `alias_key_missing`: `Tipo de material`
  - `alias_key_missing`: `Clasificación de remoción en masa`
  - `alias_key_missing`: `Día del evento`
  - `alias_key_missing`: `Mes de inicio del evento`
  - `alias_key_missing`: `Año del evento`
  - `alias_key_missing`: `Estación de ocurrencia del evento`
  - `alias_key_missing`: `Enlace de documento asociado`
  - `alias_key_missing`: `Fuente de la información`
  - `alias_key_missing`: `Descripcion`
  - `alias_key_missing`: `Ultima Actualizacion`
  - `alias_key_missing`: `Origen Data`

**Columnas problemáticas (2):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `METODO` | has_nulls | 11.29 | 0 |  |
| `OBSERVACION` | broken | 78.51 | 0 |  |

### 3.x. `salares` — WARNING

- **Filas:** 14
- **Geometrías:** total 14, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** column_dirty

**Columnas problemáticas (1):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `Destinacio` | dirty | 50 | 0 |  |

### 3.x. `sonami_mapa_minero` — WARNING

- **Filas:** 75
- **Geometrías:** total 75, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 1, duplicadas 0
- **Flags:** —
- **Warnings:** outside_bbox, column_dirty

**Columnas problemáticas (5):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `Estado` | has_nulls | 18.67 | 0 | has_case_variants |
| `Compañia` | has_nulls | 8 | 0 |  |
| `Nª` | has_nulls | 20 | 0 | numeric_as_text |
| `Nota` | dirty | 34.67 | 0 |  |
| `Sitio WEB` | has_nulls | 13.33 | 0 |  |

### 3.x. `toponimia` — WARNING

- **Filas:** 104
- **Geometrías:** total 104, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** missing_provenance
- **Warnings:** missing_provenance

### 3.x. `viveros_sag` — WARNING

- **Filas:** 23
- **Geometrías:** total 23, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** column_dirty, column_dirty, column_dirty, column_broken, column_broken, column_dirty, column_dirty

**Columnas problemáticas (7):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `ft` | dirty | 60.87 | 0 |  |
| `fo` | dirty | 52.17 | 0 |  |
| `o` | dirty | 47.83 | 0 |  |
| `v` | broken | 95.65 | 0 | id_like |
| `h` | broken | 86.96 | 0 |  |
| `apellip` | dirty | 52.17 | 0 | id_like |
| `apellim` | dirty | 52.17 | 0 | id_like |

### 3.x. `yacimientos` — WARNING

- **Filas:** 2090
- **Geometrías:** total 2090, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 4
- **Flags:** —
- **Warnings:** column_broken, column_broken, column_broken, column_broken, column_broken, column_dirty, column_broken, column_broken, column_broken, column_dirty, column_broken, column_dirty, column_broken, config_issues
- **Config issues:**
  - `popup_field_missing`: `TIPO_RECURSO`
  - `alias_key_missing`: `TIPO_RECURSO`

**Columnas problemáticas (13):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `OTROS_NOMB` | broken | 94.5 | 0 |  |
| `EDAD_GEOLO` | broken | 0 | 99.95 |  |
| `MODELO_GEN` | broken | 99.86 | 0.14 |  |
| `PROPIETARI` | broken | 96.41 | 0 |  |
| `OBSERVACIO` | broken | 82.25 | 0 | has_case_variants |
| `GEOLOGO_TE` | dirty | 66.12 | 0 | has_case_variants |
| `FECHA_TERR` | broken | 100 | 0 |  |
| `DESCRIPCIO` | broken | 100 | 0 |  |
| `DESCRIPC_1` | broken | 91.67 | 0 |  |
| `ACCESIBILI` | dirty | 62.63 | 0 |  |
| `DESCRIPC_2` | broken | 100 | 0 |  |
| `NOMBRE_DIS` | dirty | 0 | 34.74 |  |
| `DESCRIPC_3` | broken | 100 | 0 |  |

### 3.x. `apr_rural` — OK

- **Filas:** 46
- **Geometrías:** total 46, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** —

### 3.x. `catastro_plantas_embalaje` — OK

- **Filas:** 61
- **Geometrías:** total 61, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** —

### 3.x. `catastro_variedades_frutales` — OK

- **Filas:** 2946
- **Geometrías:** total 2946, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** —

### 3.x. `cuencas_dga` — OK

- **Filas:** 11
- **Geometrías:** total 11, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** —

### 3.x. `decrero_escasez_2021` — OK

- **Filas:** 1
- **Geometrías:** total 1, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** —

### 3.x. `decrero_escasez_2022` — OK

- **Filas:** 1
- **Geometrías:** total 1, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** —

### 3.x. `decrero_escasez_2023` — OK

- **Filas:** 1
- **Geometrías:** total 1, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** —

### 3.x. `desaladoras_acueductos` — OK

- **Filas:** 8
- **Geometrías:** total 8, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** —

**Columnas problemáticas (2):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `Descripcion` | has_nulls | 12.5 | 0 |  |
| `Sistema` | has_nulls | 12.5 | 0 |  |

### 3.x. `energia_hidroelectricas` — OK

- **Filas:** 1
- **Geometrías:** total 1, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** —

### 3.x. `energia_linea_transmision` — OK

- **Filas:** 109
- **Geometrías:** total 109, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 2
- **Flags:** —
- **Warnings:** —

**Columnas problemáticas (1):**

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| `F_OPERACIO` | has_nulls | 23.85 | 0 |  |

### 3.x. `prc_caldera` — OK

- **Filas:** 62
- **Geometrías:** total 62, nulas 0, vacías 0, inválidas 3, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** —

### 3.x. `sistema_areas_protegidas` — OK

- **Filas:** 5
- **Geometrías:** total 5, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** —

### 3.x. `subestaciones` — OK

- **Filas:** 111
- **Geometrías:** total 111, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 1
- **Flags:** —
- **Warnings:** —

### 3.x. `unidades_geomorfologicas` — OK

- **Filas:** 21
- **Geometrías:** total 21, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** —

### 3.x. `volcanes_activos` — OK

- **Filas:** 4
- **Geometrías:** total 4, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** —

### 3.x. `zonas_climaticas` — OK

- **Filas:** 14
- **Geometrías:** total 14, nulas 0, vacías 0, inválidas 0, zero_zero 0, srid_mismatch 0, outside_bbox 0, duplicadas 0
- **Flags:** —
- **Warnings:** —

## 4. Anexo A — Config issues (visores)

**Capas con problemas de config:** 23

- **derechos_agua_2025:**
  - `popup_field_missing`: `Caudal Anual Promedio en Ls/s`
- **plantas_aguas_servidas:**
  - `popup_field_missing`: `FECHA_ACTUALIZACION`
- **puntos_descargas:**
  - `popup_field_missing`: `FECHA_ACTUALIZACION`
- **hidrografia:**
  - `popup_field_missing`: `Ultima Actualizacion`
  - `alias_key_missing`: `Ultima Actualizacion`
- **energia_almacenamiento_combustibles:**
  - `popup_field_missing`: `PET_DISEL`
  - `alias_key_missing`: `PET_DISEL`
- **distritos_mineros:**
  - `popup_field_missing`: `Superficie en KM`
  - `alias_key_missing`: `Superficie en KM`
- **puertos:**
  - `alias_key_missing`: `Numero de Muelles`
- **yacimientos:**
  - `popup_field_missing`: `TIPO_RECURSO`
  - `alias_key_missing`: `TIPO_RECURSO`
- **limites_urbanos:**
  - `popup_field_missing`: `INSTRUMENT`
  - `popup_field_missing`: `ADMIN`
  - `alias_key_missing`: `INSTRUMENT`
  - `alias_key_missing`: `ADMIN`
  - `alias_key_missing`: `DO`
- **borde_costero:**
  - `popup_field_missing`: `Origen Data`
  - `alias_key_missing`: `Origen Data`
- **prc_chañaral:**
  - `popup_field_missing`: `Fecha Publicacion`
  - `alias_key_missing`: `Fecha Publicacion`
- **prc_copiapo:**
  - `popup_field_missing`: `Fecha Publicacion`
  - `alias_key_missing`: `Fecha Publicacion`
- **prc_diego_almagro:**
  - `popup_field_missing`: `Fecha Publicacion`
  - `alias_key_missing`: `Fecha Publicacion`
- **prc_freirina:**
  - `popup_field_missing`: `Fecha Publicacion`
  - `alias_key_missing`: `Fecha Publicacion`
- **prc_huasco:**
  - `popup_field_missing`: `NOMBRE`
  - `popup_field_missing`: `Nº Decreto`
  - `popup_field_missing`: `Fecha Publicacion`
  - `alias_key_missing`: `NOMBRE`
  - `alias_key_missing`: `Nº Decreto`
  - `alias_key_missing`: `Fecha Publicacion`
- **prc_chañaral_el_salado:**
  - `popup_field_missing`: `Fecha Publicacion`
  - `alias_key_missing`: `Fecha Publicacion`
- **prc_chañaral_flamenco:**
  - `popup_field_missing`: `Fecha Publicacion`
  - `alias_key_missing`: `Fecha Publicacion`
- **prc_chañaral_portofino:**
  - `popup_field_missing`: `Fecha Publicacion`
  - `alias_key_missing`: `Fecha Publicacion`
- **prc_vallenar:**
  - `popup_field_missing`: `Fecha Publicacion`
  - `alias_key_missing`: `Fecha Publicacion`
- **grandes_terremotos:**
  - `atributo_missing`: `Categoría`
  - `alias_key_missing`: `Link_Data:`
- **incendios_forestales:**
  - `popup_field_missing`: `Descipcion`
- **puntos_criticos_invierno_2024:**
  - `alias_key_missing`: `Origen Dato`
- **remociones_masa:**
  - `popup_field_missing`: `Código de la remoción en masa`
  - `popup_field_missing`: `Tipo de remoción en masa`
  - `popup_field_missing`: `Tipo de material`
  - `popup_field_missing`: `Clasificación de remoción en masa`
  - `popup_field_missing`: `Día del evento`
  - `popup_field_missing`: `Mes de inicio del evento`
  - `popup_field_missing`: `Año del evento`
  - `popup_field_missing`: `Estación de ocurrencia del evento`
  - `popup_field_missing`: `Enlace de documento asociado`
  - `popup_field_missing`: `Fuente de la información`
  - `popup_field_missing`: `Descripcion`
  - `popup_field_missing`: `Ultima Actualizacion`
  - `popup_field_missing`: `Origen Data`
  - `atributo_missing`: `Región`
  - `alias_key_missing`: `Código de la remoción en masa`
  - `alias_key_missing`: `Tipo de remoción en masa`
  - `alias_key_missing`: `Tipo de material`
  - `alias_key_missing`: `Clasificación de remoción en masa`
  - `alias_key_missing`: `Día del evento`
  - `alias_key_missing`: `Mes de inicio del evento`
  - `alias_key_missing`: `Año del evento`
  - `alias_key_missing`: `Estación de ocurrencia del evento`
  - `alias_key_missing`: `Enlace de documento asociado`
  - `alias_key_missing`: `Fuente de la información`
  - `alias_key_missing`: `Descripcion`
  - `alias_key_missing`: `Ultima Actualizacion`
  - `alias_key_missing`: `Origen Data`

## 5. Anexo B — Procedencia y vigencia

**Capas sin columna de origen:** 4
- limite_comunal_linea
- toponimia
- comunas_poligonos
- remociones_masa

**Capas con datos obsoletos (>3 años):** 1
- borde_costero

## 6. Anexo C — Geometrías

**Capas bloqueadas por geometría/tabla vacía:** 6

- **capacidad_uso_suelo** (52 filas):
  - `bad_geometries`: 5.77%
- **territorios_operacionales** (10 filas):
  - `bad_geometries`: 30%
- **energia_potencial_eolico** (5 filas):
  - `bad_geometries`: 80%
- **energia_potencial_fotovoltaico** (9 filas):
  - `bad_geometries`: 100%
- **energia_potencial_solar_csp** (6 filas):
  - `bad_geometries`: 100%
- **energia_linea_media_transmision** (0 filas):
  - `table_empty`: 

## 7. Anexo D — Plan de acción

### Fase 1 — Fix de las 6 blocked en QGIS

Corregir geometrías `Ring Self-intersection` con QGIS:
- `capacidad_uso_suelo`
- `territorios_operacionales`
- `energia_potencial_eolico`
- `energia_potencial_fotovoltaico`
- `energia_potencial_solar_csp`

Y resolver `energia_linea_media_transmision` (tabla vacía).

### Fase 2 — Capas con muchas columnas problemáticas

- `derechos_agua_2025`: 23 columnas problemáticas.
- `energia_terminales_maritimos`: 18 columnas problemáticas.
- `yacimientos`: 13 columnas problemáticas.
- `energia_almacenamiento_combustibles`: 9 columnas problemáticas.
- `borde_costero`: 8 columnas problemáticas.
- `red_canales`: 7 columnas problemáticas.
- `viveros_sag`: 7 columnas problemáticas.
- `lagunas_embalses`: 7 columnas problemáticas.
- `incendios_forestales`: 7 columnas problemáticas.
- `acuiferos`: 6 columnas problemáticas.
- `relaves_mineros_sernageomin`: 5 columnas problemáticas.

### Fase 3 — Config issues del visor

- `derechos_agua_2025`
- `plantas_aguas_servidas`
- `puntos_descargas`
- `hidrografia`
- `energia_almacenamiento_combustibles`
- `distritos_mineros`
- `puertos`
- `yacimientos`
- `limites_urbanos`
- `borde_costero`
- `prc_chañaral`
- `prc_copiapo`
- `prc_diego_almagro`
- `prc_freirina`
- `prc_huasco`
- `prc_chañaral_el_salado`
- `prc_chañaral_flamenco`
- `prc_chañaral_portofino`
- `prc_vallenar`
- `grandes_terremotos`
- `incendios_forestales`
- `puntos_criticos_invierno_2024`
- `remociones_masa`

### Fase 4 — Resto de warnings

Las capas restantes tienen 1-2 columnas problemáticas o flags menores.
Se resuelven en la medida que se toquen.
