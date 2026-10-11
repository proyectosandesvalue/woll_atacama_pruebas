# Auditoría de calidad de datos

- Fecha: 2026-10-11T15:40:31.956Z
- Umbrales: v1
- Capas: 69 (ok 16, warning 47, blocked 6)

| Capa | Estado | Filas | Cols problemáticas | Config | Procedencia |
|---|---|---|---|---|---|
| capacidad_uso_suelo | blocked | 52 | 0 | 0 | — |
| camaras_frio | warning | 12 | 1 | 0 | — |
| catastro_especies_frutales | warning | 2956 | 0 | 0 | — |
| catastro_plantas_embalaje | ok | 61 | 0 | 0 | — |
| catastro_variedades_frutales | ok | 2946 | 0 | 0 | — |
| red_canales | warning | 501 | 7 | 0 | — |
| viveros_sag | warning | 23 | 7 | 0 | — |
| acuiferos | warning | 57 | 6 | 0 | — |
| cuencas_dga | ok | 11 | 0 | 0 | — |
| derechos_agua_2025 | warning | 920 | 23 | 1 | — |
| glaciares | warning | 863 | 2 | 0 | — |
| humedales | warning | 1429 | 1 | 0 | — |
| lagunas_embalses | warning | 66 | 7 | 0 | — |
| limite_comunal_linea | warning | 9 | 0 | 0 | missing_provenance |
| plantas_aguas_servidas | warning | 11 | 2 | 1 | — |
| plantas_desaladoras_puntos | warning | 7 | 1 | 0 | — |
| desaladoras_acueductos | ok | 8 | 0 | 0 | — |
| puntos_descargas | warning | 11 | 2 | 1 | — |
| hidrografia | warning | 734 | 2 | 2 | — |
| salares | warning | 14 | 1 | 0 | — |
| apr_rural | ok | 46 | 0 | 0 | — |
| territorios_operacionales | blocked | 10 | 0 | 0 | — |
| toponimia | warning | 104 | 0 | 0 | missing_provenance |
| decrero_escasez_2021 | ok | 1 | 0 | 0 | — |
| decrero_escasez_2022 | ok | 1 | 0 | 0 | — |
| decrero_escasez_2023 | ok | 1 | 0 | 0 | — |
| zonas_climaticas | ok | 14 | 0 | 0 | — |
| comunas_poligonos | warning | 9 | 0 | 0 | missing_provenance |
| energia_almacenamiento_combustibles | warning | 2 | 9 | 2 | — |
| energia_potencial_eolico | blocked | 5 | 0 | 0 | — |
| energia_potencial_fotovoltaico | blocked | 9 | 0 | 0 | — |
| energia_potencial_hidrobombeo | warning | 132 | 0 | 0 | — |
| energia_potencial_solar_csp | blocked | 6 | 0 | 0 | — |
| energia_linea_media_transmision | blocked | 0 | 0 | 0 | — |
| energia_linea_transmision | ok | 109 | 0 | 0 | — |
| energia_plantas_eolicas | warning | 6 | 1 | 0 | — |
| energia_hidroelectricas | ok | 1 | 0 | 0 | — |
| energia_plantas_solares | warning | 46 | 1 | 0 | — |
| energia_termoelectricas | warning | 12 | 1 | 0 | — |
| subestaciones | ok | 111 | 0 | 0 | — |
| energia_terminales_maritimos | warning | 4 | 18 | 0 | — |
| distritos_mineros | warning | 3 | 0 | 2 | — |
| sonami_mapa_minero | warning | 75 | 1 | 0 | — |
| puertos | warning | 7 | 1 | 1 | — |
| red_ferroviaria | warning | 132 | 1 | 0 | — |
| relaves_mineros_sernageomin | warning | 172 | 5 | 0 | — |
| yacimientos | warning | 2090 | 13 | 2 | — |
| bienes_nacionales_protegidos | warning | 6 | 2 | 0 | — |
| sistema_areas_protegidas | ok | 5 | 0 | 0 | — |
| limites_urbanos | warning | 13 | 0 | 5 | — |
| borde_costero | warning | 450 | 8 | 2 | stale |
| prc_caldera | ok | 62 | 0 | 0 | — |
| prc_chañaral | warning | 83 | 0 | 2 | — |
| prc_copiapo | warning | 16 | 0 | 2 | — |
| prc_diego_almagro | warning | 15 | 0 | 2 | — |
| prc_freirina | warning | 72 | 0 | 2 | — |
| prc_huasco | warning | 501 | 0 | 6 | — |
| prc_chañaral_el_salado | warning | 7 | 0 | 2 | — |
| prc_chañaral_flamenco | warning | 9 | 0 | 2 | — |
| prc_chañaral_portofino | warning | 7 | 0 | 2 | — |
| prc_vallenar | warning | 9 | 0 | 2 | — |
| plan_regulador_intercomunal_costero_norte | warning | 458 | 1 | 0 | — |
| plan_regulador_intercomunal_costero_sur | warning | 104 | 1 | 0 | — |
| grandes_terremotos | warning | 15 | 4 | 2 | — |
| incendios_forestales | warning | 100 | 7 | 1 | — |
| puntos_criticos_invierno_2024 | warning | 420 | 1 | 1 | — |
| remociones_masa | warning | 363 | 1 | 27 | missing_provenance |
| volcanes_activos | ok | 4 | 0 | 0 | — |
| unidades_geomorfologicas | ok | 21 | 0 | 0 | — |

## capacidad_uso_suelo — blocked
- bad_geometries: 5.77%

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| Nota Clasificacion | has_nulls | 13.46 | 0 |  |

## camaras_frio — warning
- column_broken: Numero de Camaras de Frio

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| Numero de Camaras de Frio | broken | 91.67 | 0 | id_like |
| Numero de Camaras de Prefrio | has_nulls | 8.33 | 0 |  |

## catastro_especies_frutales — warning
- duplicate_geom: 327

## red_canales — warning
- column_dirty: N_ACCIONES
- column_broken: PORC_REVES
- column_dirty: OUA
- column_dirty: OUA_TIPO
- column_dirty: OU_ID
- column_dirty: F_NUM_ACC
- column_broken: F_REVEST

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| CODCAN | has_nulls | 16.97 | 0 | numeric_as_text, id_like |
| N_ACCIONES | dirty | 58.28 | 0 |  |
| PORC_REVES | broken | 100 | 0 |  |
| OUA | dirty | 58.68 | 0 |  |
| OUA_TIPO | dirty | 58.68 | 0 |  |
| JV | has_nulls | 19.56 | 0 |  |
| OU_ID | dirty | 58.68 | 0 | numeric_as_text |
| JV_ID | has_nulls | 19.56 | 0 | numeric_as_text |
| F_NUM_ACC | dirty | 40.72 | 0 |  |
| F_REVEST | broken | 100 | 0 |  |
| F_OUA | has_nulls | 19.56 | 0 |  |

## viveros_sag — warning
- column_dirty: ft
- column_dirty: fo
- column_dirty: o
- column_broken: v
- column_broken: h
- column_dirty: apellip
- column_dirty: apellim

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| ft | dirty | 60.87 | 0 |  |
| fo | dirty | 52.17 | 0 |  |
| o | dirty | 47.83 | 0 |  |
| v | broken | 95.65 | 0 | id_like |
| h | broken | 86.96 | 0 |  |
| apellip | dirty | 52.17 | 0 | id_like |
| apellim | dirty | 52.17 | 0 | id_like |

## acuiferos — warning
- column_dirty: F_RES_DGA
- column_dirty: F_TRAZON
- column_dirty: F_PUB_DO
- column_broken: PUBMODIF_1
- column_broken: PUBMODIF_2
- column_broken: PUBMODIF_3

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| F_RES_DGA | dirty | 68.42 | 0 |  |
| F_TRAZON | dirty | 68.42 | 0 |  |
| F_PUB_DO | dirty | 68.42 | 0 |  |
| PUBMODIF_1 | broken | 87.72 | 0 |  |
| PUBMODIF_2 | broken | 96.49 | 0 | id_like |
| PUBMODIF_3 | broken | 100 | 0 |  |

## derechos_agua_2025 — warning
- duplicate_geom: 230
- column_dirty: N°
- column_broken: Fecha Toma Razón
- column_broken: Artículo Transitorio
- column_broken: Uso del Agua
- column_dirty: SubCuenca
- column_dirty: SubSubCuenca
- column_dirty: Fuente
- column_broken: Caudal Ecológico (l/s)
- column_broken: ¿Caudal Ecológico Promedio?
- column_dirty: Volumen
- column_broken: Latitud Captación
- column_broken: Longitud Captación
- column_broken: Datum_1
- column_broken: Latitud Restitución
- column_broken: Longitud Restitución
- column_dirty: Referencia a puntos conocidos de captación
- column_broken: Referencia a puntos conocidos de restitución
- column_broken: Unidad Distancia
- column_dirty: C.B.R.
- column_dirty: Fojas
- column_broken: Código Expediente Antiguo
- column_broken: ¿Posee más de un punto de captación?
- column_dirty: N° Certificado/ Año
- config_issues: 1

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| N° | dirty | 51.85 | 0 | numeric_as_text, id_like |
| Fecha Toma Razón | broken | 81.96 | 0 |  |
| Artículo Transitorio | broken | 89.46 | 0 |  |
| Uso del Agua | broken | 0 | 59.24 |  |
| SubCuenca | dirty | 44.89 | 0 |  |
| SubSubCuenca | dirty | 60.11 | 0 |  |
| Fuente | dirty | 6.96 | 0.11 | has_case_variants |
| Caudal Ecológico (l/s) | broken | 97.83 | 0 | numeric_as_text |
| ¿Caudal Ecológico Promedio? | broken | 98.59 | 0 |  |
| Volumen | dirty | 50.11 | 0 | numeric_as_text |
| Latitud Captación | broken | 97.61 | 0 |  |
| Longitud Captación | broken | 97.61 | 0 |  |
| Datum_1 | broken | 97.93 | 0 | numeric_as_text |
| Latitud Restitución | broken | 100 | 0 |  |
| Longitud Restitución | broken | 100 | 0 |  |
| Referencia a puntos conocidos de captación | dirty | 45.11 | 0 | has_case_variants |
| Referencia a puntos conocidos de restitución | broken | 99.67 | 0 | id_like |
| Unidad Distancia | broken | 98.59 | 0 |  |
| C.B.R. | dirty | 31.63 | 0 |  |
| Fojas | dirty | 31.63 | 0 | has_case_variants |
| Código Expediente Antiguo | broken | 79.13 | 0 |  |
| ¿Posee más de un punto de captación? | broken | 99.89 | 0 | id_like |
| N° Certificado/ Año | dirty | 33.04 | 0 |  |
| Radio (m) | has_nulls | 21.96 | 0 | numeric_as_text |
| Profundidad (m) | has_nulls | 22.07 | 0 | numeric_as_text |

Config inconsistente:
- popup_field_missing: `Caudal Anual Promedio en Ls/s`

## glaciares — warning
- column_broken: CH_CASQ
- column_broken: CUBIERTO

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| CH_CASQ | broken | 100 | 0 |  |
| CUBIERTO | broken | 100 | 0 |  |

## humedales — warning
- column_broken: Nombre

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| Nombre | broken | 0 | 85.65 |  |

## lagunas_embalses — warning
- column_broken: NOMBRE
- column_broken: CODBNA
- column_broken: LATITUD
- column_broken: LONGITUD
- column_broken: CLASIFICAC
- column_broken: USO
- column_broken: INFORMACIO

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| NOMBRE | broken | 72.73 | 0 |  |
| CODBNA | broken | 1.52 | 86.36 |  |
| LATITUD | broken | 1.52 | 86.36 |  |
| LONGITUD | broken | 1.52 | 86.36 |  |
| CLASIFICAC | broken | 0 | 86.36 |  |
| USO | broken | 1.52 | 86.36 |  |
| INFORMACIO | broken | 1.52 | 86.36 |  |

## limite_comunal_linea — warning
- missing_provenance

## plantas_aguas_servidas — warning
- column_broken: OTRO_TIPO_
- column_broken: OTRO_TIPO1
- config_issues: 1

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| OTRO_TIPO_ | broken | 81.82 | 0 |  |
| OTRO_TIPO1 | broken | 100 | 0 |  |

Config inconsistente:
- popup_field_missing: `FECHA_ACTUALIZACION`

## plantas_desaladoras_puntos — warning
- column_dirty: Inicio Operacion

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| Estado | has_nulls | 14.29 | 0 |  |
| Inicio Operacion | dirty | 42.86 | 0 | numeric_as_text |

## puntos_descargas — warning
- column_broken: OTRO_TIPO_
- column_broken: OTRO_TIPO1
- config_issues: 1

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| OTRO_TIPO_ | broken | 81.82 | 0 |  |
| OTRO_TIPO1 | broken | 100 | 0 |  |

Config inconsistente:
- popup_field_missing: `FECHA_ACTUALIZACION`

## hidrografia — warning
- column_dirty: nombre_bcn
- column_dirty: nombre_mop
- config_issues: 2

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| nombre_bcn | dirty | 45.64 | 0 | has_case_variants |
| nombre_mop | dirty | 45.64 | 0 | has_case_variants |

Config inconsistente:
- popup_field_missing: `Ultima Actualizacion`
- alias_key_missing: `Ultima Actualizacion`

## salares — warning
- column_dirty: Destinacio

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| Destinacio | dirty | 50 | 0 |  |

## territorios_operacionales — blocked
- bad_geometries: 30%

## toponimia — warning
- missing_provenance

## comunas_poligonos — warning
- missing_provenance

## energia_almacenamiento_combustibles — warning
- column_broken: BENCINA
- column_broken: BUTANO
- column_broken: GASOLINAS
- column_dirty: GNL
- column_dirty: KEROS_AVI
- column_broken: KEROS_DOM
- column_broken: PET_COMBUS
- column_dirty: PET_DIESEL
- column_broken: PROPANO
- config_issues: 2

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| BENCINA | broken | 100 | 0 |  |
| BUTANO | broken | 100 | 0 |  |
| GASOLINAS | broken | 100 | 0 |  |
| GNL | dirty | 50 | 0 |  |
| KEROS_AVI | dirty | 50 | 0 |  |
| KEROS_DOM | broken | 100 | 0 |  |
| PET_COMBUS | broken | 100 | 0 |  |
| PET_DIESEL | dirty | 50 | 0 |  |
| PROPANO | broken | 100 | 0 |  |

Config inconsistente:
- popup_field_missing: `PET_DISEL`
- alias_key_missing: `PET_DISEL`

## energia_potencial_eolico — blocked
- bad_geometries: 80%

## energia_potencial_fotovoltaico — blocked
- bad_geometries: 100%

## energia_potencial_hidrobombeo — warning
- duplicate_geom: 70

## energia_potencial_solar_csp — blocked
- bad_geometries: 100%

## energia_linea_media_transmision — blocked
- table_empty

## energia_plantas_eolicas — warning
- column_broken: MEDIO_GENE

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| MEDIO_GENE | broken | 100 | 0 |  |

## energia_plantas_solares — warning
- column_dirty: MEDIO_GENE

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| MEDIO_GENE | dirty | 41.3 | 0 |  |
| RCA | has_nulls | 6.52 | 0 |  |

## energia_termoelectricas — warning
- column_broken: MEDIO_GENE

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| MEDIO_GENE | broken | 100 | 0 |  |
| RCA | has_nulls | 25 | 0 | id_like |

## energia_terminales_maritimos — warning
- column_broken: BUTANO
- column_broken: FUE_OIL_N6
- column_broken: GAS_93
- column_broken: GAS_97
- column_broken: GASOLINAS
- column_broken: GN
- column_broken: GNL
- column_broken: IFO_180
- column_broken: KEROS_AVI
- column_broken: KEROSENE
- column_broken: GLP
- column_broken: NAFTA
- column_broken: P_LIMPIOS
- column_broken: P_NEGROS
- column_broken: PET_CRUDO
- column_broken: PROPANO
- column_broken: OTROS
- column_broken: NO_ESPECIF

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| BUTANO | broken | 100 | 0 |  |
| FUE_OIL_N6 | broken | 75 | 0 |  |
| GAS_93 | broken | 100 | 0 |  |
| GAS_97 | broken | 100 | 0 |  |
| GASOLINAS | broken | 75 | 0 |  |
| GN | broken | 100 | 0 |  |
| GNL | broken | 100 | 0 |  |
| IFO_180 | broken | 75 | 0 |  |
| KEROS_AVI | broken | 100 | 0 |  |
| KEROSENE | broken | 100 | 0 |  |
| GLP | broken | 100 | 0 |  |
| NAFTA | broken | 100 | 0 |  |
| P_LIMPIOS | broken | 100 | 0 |  |
| P_NEGROS | broken | 75 | 0 |  |
| PET_CRUDO | broken | 100 | 0 |  |
| PROPANO | broken | 100 | 0 |  |
| OTROS | broken | 100 | 0 |  |
| NO_ESPECIF | broken | 100 | 0 |  |

## distritos_mineros — warning
- config_issues: 2

Config inconsistente:
- popup_field_missing: `Superficie en KM`
- alias_key_missing: `Superficie en KM`

## sonami_mapa_minero — warning
- outside_bbox: 1
- column_dirty: Nota

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| Estado | has_nulls | 18.67 | 0 | has_case_variants |
| Compañia | has_nulls | 8 | 0 |  |
| Nª | has_nulls | 20 | 0 | numeric_as_text |
| Nota | dirty | 34.67 | 0 |  |
| Sitio WEB | has_nulls | 13.33 | 0 |  |

## puertos — warning
- column_dirty: Sitio Web
- config_issues: 1

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| Sitio Web | dirty | 42.86 | 0 |  |

Config inconsistente:
- alias_key_missing: `Numero de Muelles`

## red_ferroviaria — warning
- column_broken: Nombre

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| OBEJTO | has_nulls | 9.85 | 0 |  |
| Nombre | broken | 100 | 0 |  |

## relaves_mineros_sernageomin — warning
- column_dirty: METODO_CONS
- column_dirty: RES_PDC_APRUEBA
- column_dirty: RES_PDC_FECHA
- column_broken: ID_FAENA
- column_broken: N_INSTALACION

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| METODO_CONS | dirty | 40.12 | 0 |  |
| VOL_ACTUAL | has_nulls | 8.72 | 0 |  |
| TON_ACTUAL | has_nulls | 9.3 | 0 |  |
| RES_PDC_APRUEBA | dirty | 55.23 | 0 |  |
| RES_PDC_FECHA | dirty | 55.23 | 0 |  |
| ID_FAENA | broken | 75 | 0 |  |
| N_INSTALACION | broken | 79.65 | 0 | id_like |

## yacimientos — warning
- column_broken: OTROS_NOMB
- column_broken: EDAD_GEOLO
- column_broken: MODELO_GEN
- column_broken: PROPIETARI
- column_broken: OBSERVACIO
- column_dirty: GEOLOGO_TE
- column_broken: FECHA_TERR
- column_broken: DESCRIPCIO
- column_broken: DESCRIPC_1
- column_dirty: ACCESIBILI
- column_broken: DESCRIPC_2
- column_dirty: NOMBRE_DIS
- column_broken: DESCRIPC_3
- config_issues: 2

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| OTROS_NOMB | broken | 94.5 | 0 |  |
| EDAD_GEOLO | broken | 0 | 99.95 |  |
| MODELO_GEN | broken | 99.86 | 0.14 |  |
| PROPIETARI | broken | 96.41 | 0 |  |
| OBSERVACIO | broken | 82.25 | 0 | has_case_variants |
| GEOLOGO_TE | dirty | 66.12 | 0 | has_case_variants |
| FECHA_TERR | broken | 100 | 0 |  |
| DESCRIPCIO | broken | 100 | 0 |  |
| DESCRIPC_1 | broken | 91.67 | 0 |  |
| ACCESIBILI | dirty | 62.63 | 0 |  |
| DESCRIPC_2 | broken | 100 | 0 |  |
| NOMBRE_DIS | dirty | 0 | 34.74 |  |
| DESCRIPC_3 | broken | 100 | 0 |  |

Config inconsistente:
- popup_field_missing: `TIPO_RECURSO`
- alias_key_missing: `TIPO_RECURSO`

## bienes_nacionales_protegidos — warning
- column_dirty: ACT_ADM
- column_dirty: ADMINISTRA

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| ACT_ADM | dirty | 33.33 | 0 |  |
| ADMINISTRA | dirty | 66.67 | 0 |  |

## limites_urbanos — warning
- config_issues: 5

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| DO_1 | has_nulls | 7.69 | 0 |  |
| N_DOC | has_nulls | 7.69 | 0 | numeric_as_text |

Config inconsistente:
- popup_field_missing: `INSTRUMENT`
- popup_field_missing: `ADMIN`
- alias_key_missing: `INSTRUMENT`
- alias_key_missing: `ADMIN`
- alias_key_missing: `DO`

## borde_costero — warning
- duplicate_geom: 67
- column_dirty: ID
- column_dirty: GLOSA
- column_dirty: DESCRIP_ZO
- column_broken: Etiqueta2
- column_dirty: Observacio
- column_broken: f_obsev
- column_broken: editor_actualizacion
- column_broken: fecha_actualizacion
- config_issues: 2
- stale

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| ID | dirty | 40.67 | 0 |  |
| ZONA_1 | has_nulls | 14.89 | 0 |  |
| GLOSA | dirty | 36.22 | 0 |  |
| DESCRIP_ZO | dirty | 34 | 0 | has_case_variants |
| Etiqueta2 | broken | 99.56 | 0 | id_like |
| Observacio | dirty | 60.67 | 0 |  |
| f_obsev | broken | 97.33 | 0 |  |
| editor_actualizacion | broken | 99.78 | 0 | id_like |
| fecha_actualizacion | broken | 74.44 | 0 |  |

Config inconsistente:
- popup_field_missing: `Origen Data`
- alias_key_missing: `Origen Data`

## prc_chañaral — warning
- config_issues: 2

Config inconsistente:
- popup_field_missing: `Fecha Publicacion`
- alias_key_missing: `Fecha Publicacion`

## prc_copiapo — warning
- config_issues: 2

Config inconsistente:
- popup_field_missing: `Fecha Publicacion`
- alias_key_missing: `Fecha Publicacion`

## prc_diego_almagro — warning
- config_issues: 2

Config inconsistente:
- popup_field_missing: `Fecha Publicacion`
- alias_key_missing: `Fecha Publicacion`

## prc_freirina — warning
- config_issues: 2

Config inconsistente:
- popup_field_missing: `Fecha Publicacion`
- alias_key_missing: `Fecha Publicacion`

## prc_huasco — warning
- config_issues: 6

Config inconsistente:
- popup_field_missing: `NOMBRE`
- popup_field_missing: `Nº Decreto`
- popup_field_missing: `Fecha Publicacion`
- alias_key_missing: `NOMBRE`
- alias_key_missing: `Nº Decreto`
- alias_key_missing: `Fecha Publicacion`

## prc_chañaral_el_salado — warning
- config_issues: 2

Config inconsistente:
- popup_field_missing: `Fecha Publicacion`
- alias_key_missing: `Fecha Publicacion`

## prc_chañaral_flamenco — warning
- config_issues: 2

Config inconsistente:
- popup_field_missing: `Fecha Publicacion`
- alias_key_missing: `Fecha Publicacion`

## prc_chañaral_portofino — warning
- config_issues: 2

Config inconsistente:
- popup_field_missing: `Fecha Publicacion`
- alias_key_missing: `Fecha Publicacion`

## prc_vallenar — warning
- config_issues: 2

Config inconsistente:
- popup_field_missing: `Fecha Publicacion`
- alias_key_missing: `Fecha Publicacion`

## plan_regulador_intercomunal_costero_norte — warning
- column_broken: UPREF

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| UPREF | broken | 100 | 0 |  |
| PROVINCIA | has_nulls | 7.86 | 0 |  |

## plan_regulador_intercomunal_costero_sur — warning
- column_broken: UPREF

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| UPREF | broken | 100 | 0 |  |

## grandes_terremotos — warning
- duplicate_geom: 3
- column_dirty: Hora local
- column_broken: Efecto
- column_broken: Magnitu_Mw
- column_dirty: Profundid_
- config_issues: 2

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| Hora local | dirty | 0 | 6.67 | id_like |
| Efecto | broken | 0 | 73.33 |  |
| Magnitu_Mw | broken | 93.33 | 0 | id_like |
| Profundid_ | dirty | 46.67 | 0 |  |

Config inconsistente:
- atributo_missing: `Categoría`
- alias_key_missing: `Link_Data:`

## incendios_forestales — warning
- column_dirty: total_otra
- column_broken: inicio_in
- column_broken: extincion
- column_dirty: orig_fid
- column_dirty: total_o
- column_dirty: fh_inicio
- column_dirty: fh_extinci
- config_issues: 1

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| comuna | has_nulls | 14 | 0 | has_case_variants |
| causa_espe | has_nulls | 18 | 0 |  |
| total_otra | dirty | 44 | 0 |  |
| region | has_nulls | 15 | 0 |  |
| provincia | has_nulls | 15 | 0 |  |
| inicio_c | has_nulls | 27 | 0 |  |
| combus_i | has_nulls | 27 | 0 |  |
| inicio_in | broken | 100 | 0 |  |
| extincion | broken | 100 | 0 |  |
| orig_fid | dirty | 58 | 0 | id_like |
| total_o | dirty | 56 | 0 |  |
| fh_inicio | dirty | 42 | 0 |  |
| fh_extinci | dirty | 42 | 0 |  |

Config inconsistente:
- popup_field_missing: `Descipcion`

## puntos_criticos_invierno_2024 — warning
- column_dirty: f2_accione
- config_issues: 1

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| f1_accione | has_nulls | 6.67 | 0 |  |
| f2_accione | dirty | 30.48 | 0 |  |
| solucion_p | has_nulls | 16.43 | 0 |  |
| si_la_resp | has_nulls | 26.67 | 0 |  |
| riesgo_2024 | has_nulls | 14.29 | 0 |  |

Config inconsistente:
- alias_key_missing: `Origen Dato`

## remociones_masa — warning
- column_broken: OBSERVACION
- config_issues: 27
- missing_provenance

| Columna | Calidad | % nulos | % sospechosos | Flags |
|---|---|---|---|---|
| METODO | has_nulls | 11.29 | 0 |  |
| OBSERVACION | broken | 78.51 | 0 |  |

Config inconsistente:
- popup_field_missing: `Código de la remoción en masa`
- popup_field_missing: `Tipo de remoción en masa`
- popup_field_missing: `Tipo de material`
- popup_field_missing: `Clasificación de remoción en masa`
- popup_field_missing: `Día del evento`
- popup_field_missing: `Mes de inicio del evento`
- popup_field_missing: `Año del evento`
- popup_field_missing: `Estación de ocurrencia del evento`
- popup_field_missing: `Enlace de documento asociado`
- popup_field_missing: `Fuente de la información`
- popup_field_missing: `Descripcion`
- popup_field_missing: `Ultima Actualizacion`
- popup_field_missing: `Origen Data`
- atributo_missing: `Región`
- alias_key_missing: `Código de la remoción en masa`
- alias_key_missing: `Tipo de remoción en masa`
- alias_key_missing: `Tipo de material`
- alias_key_missing: `Clasificación de remoción en masa`
- alias_key_missing: `Día del evento`
- alias_key_missing: `Mes de inicio del evento`
- alias_key_missing: `Año del evento`
- alias_key_missing: `Estación de ocurrencia del evento`
- alias_key_missing: `Enlace de documento asociado`
- alias_key_missing: `Fuente de la información`
- alias_key_missing: `Descripcion`
- alias_key_missing: `Ultima Actualizacion`
- alias_key_missing: `Origen Data`
