const planificacionConfig = {
  capas: [
    "plan_regulador_intercomunal_costero_norte",
    "plan_regulador_intercomunal_costero_sur",
    "borde_costero",
    "prc_caldera",
    "prc_chañaral",
    "prc_chañaral_el_salado",
    "prc_chañaral_flamenco",
    "prc_chañaral_portofino",
    "prc_copiapo",
    "prc_diego_almagro",
    "prc_freirina",
    "prc_huasco",
    "prc_vallenar",
    "limites_urbanos",
    "limite_comunal_linea",
    "toponimia",
  ],
  cargaInicial: {
    grupos: ["ipt_regionales"],
    capas: ["limite_comunal_linea"],
    // Grupos que se cargan al activar la dimensión
    // O también puedes especificar capas individuales si no usas grupos:
    // capas: ["energia_linea_transmision", "subestaciones"]
    // Escenario 3: Sin cargaInicial = carga todo (backward compatible)
    // No defines la propiedad cargaInicial
  },
  grupos: {
    ipt_comunales: {
      nombre: "IPT Comunales",
      capas: [
        "prc_caldera",
        "prc_chañaral",
        "prc_chañaral_el_salado",
        "prc_chañaral_flamenco",
        "prc_chañaral_portofino",
        "prc_copiapo",
        "prc_diego_almagro",
        "prc_freirina",
        "prc_huasco",
        "prc_vallenar",
      ],
    },
    ipt_regionales: {
      nombre: "IPT Regionales",
      capas: [
        "plan_regulador_intercomunal_costero_norte",
        "plan_regulador_intercomunal_costero_sur",
        "borde_costero",
      ],
    },
    contexto: {
      nombre: "Territorio",
      capas: ["limites_urbanos", "limite_comunal_linea", "toponimia"],
    },
  },
  estilo: {
    borde_costero: {
      url: "borde_costero.geojson",
      type: "polygon", // Tipo de capa: point, line, polygon
      atributo: "ZONA_1", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Macrozonificacion de los Usos del Borde Costero", // Nombre personalizado de la Capa
      colores: {
        NULL: "#DDA853",
        HC: "#FFFBCA",
        "R-RM": "#889E73",
        ZAMERB: "#500073",
        ZB: "#CBA35C",
        "ZC-PN": "#754E1A",
        ZCA: "#CDC1FF",
        ZE: "#FF8383",
        "ZEP-P": "#9AA6B2",
        ZEU: "#9ACBD0",
        ZI: "#48A6A7",
        "ZMA-T": "#2973B2",
        ZP: "#23486A",
        "ZP-AT": "#09122C",
        "ZP-C": "#785caaff",
        "ZPC-RC": "#9296a0ff",
        ZPQ: "#3c8f3cff",
        ZT: "#f09139ff",
        ZU: "#b6b30fff",
      },
      popupCampos: [
        "ZONA_1",
        "MACROZONIF",
        "DESCRIP_ZO",
        "Observacio",
        "Memoria_Explicativa",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        ZONA_1: "Zona",
        MACROZONIF: "Nombre de la Zona",
        DESCRIP_ZO: "Descripcion de la Zona",
        Observacio: "Observacion",
        Memoria_Explicativa: "Memoria Explicativa",
        Descripcion: "Descripcion",
        "Origen Data": "Origen de la Informacion",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#d1d1d1ff", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.8, // Transparencia del relleno
      },
    },
    plan_regulador_intercomunal_costero_norte: {
      url: "plan_regulador_intercomunal_costero_norte.geojson",
      type: "polygon", // Tipo de capa: point, line, polygon
      atributo: "ZONA", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Plan Regulador Intercomunal Costero - Zona Norte", // Nombre personalizado de la Capa
      colores: {
        AR: "#DDA853",
        "AR-1": "#FFFBCA",
        AR_2: "#889E73",
        AR_3: "#500073",
        AR_4: "#CBA35C",
        AVI: "#754E1A",
        "ZEI-1": "#CDC1FF",
        "ZEI-2": "#FF8383",
        "ZEI-1": "#9AA6B2",
        "ZEU-2": "#9ACBD0",
        "ZEU-2A": "#48A6A7",
        "ZEU-3": "#2973B2",
        "ZI-T": "#23486A",
        "ZPL-1": "#09122C",
        "ZRN-1": "#785caaff",
        "ZRN-2": "#9296a0ff",
        ZU: "#3c8f3cff",
      },
      popupCampos: [
        "ZONA",
        "NOMBRE",
        "UPERM",
        "UPROH",
        "DOC",
        "N__DOC",
        "DO",
        "Link_Decreto",
        "Link_Ordenanza",
        "Ley_LGUG",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        ZONA: "Zona",
        NOMBRE: "Nombre",
        UPERM: "Usos Permitidos",
        UPROH: "Uso Prohibido",
        DOC: "Tipo Documento",
        N__DOC: "Numero Documento",
        DO: "Fecha Publicacion",
        Link_Decreto: "Link Decreto",
        Link_Ordenanza: "Ordenanza Plan Regulador",
        Ley_LGUG: "Ley General Urbanismo y Construccion",
        Descripcion: "Descripcion",
        "Origen Data": "Origen de la Informacion",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#4B5945", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.8, // Transparencia del relleno
      },
    },
    plan_regulador_intercomunal_costero_sur: {
      url: "plan_regulador_intercomunal_costero_sur.geojson",
      type: "polygon", // Tipo de capa: point, line, polygon
      atributo: "ZONA", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Plan Regulador Intercomunal Costero - Zona Sur", // Nombre personalizado de la Capa
      colores: {
        AR: "#DDA853",
        "AR-1": "#FFFBCA",
        AR_2: "#889E73",
        AR_3: "#500073",
        AR_4: "#CBA35C",
        AVI: "#754E1A",
        "ZEI-1": "#CDC1FF",
        "ZEI-2": "#FF8383",
        "ZEI-1": "#9AA6B2",
        "ZEU-2": "#9ACBD0",
        "ZEU-2A": "#48A6A7",
        "ZEU-3": "#2973B2",
        "ZI-T": "#23486A",
        "ZPL-1": "#09122C",
        "ZRN-1": "#785caaff",
        "ZRN-2": "#9296a0ff",
        ZU: "#3c8f3cff",
      },
      popupCampos: [
        "ZONA",
        "NOMBRE",
        "UPERM",
        "UPROH",
        "DOC",
        "N__DOC",
        "DO",
        "Link_Decreto",
        "Link_Ordenanza",
        "Ley_LGUG",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        ZONA: "Zona",
        NOMBRE: "Nombre",
        UPERM: "Usos Permitidos",
        UPROH: "Uso Prohibido",
        DOC: "Tipo Documento",
        N__DOC: "Numero Documento",
        DO: "Fecha Publicacion",
        Link_Decreto: "Link Decreto",
        Link_Ordenanza: "Ordenanza Plan Regulador",
        Ley_LGUG: "Ley General Urbanismo y Construccion",
        Descripcion: "Descripcion",
        "Origen Data": "Origen de la Informacion",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#4B5945", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.8, // Transparencia del relleno
      },
    },
    prc_caldera: {
      url: "prc_caldera.geojson",
      type: "polygon", // Tipo de capa: point, line, polygon
      atributo: "ZONA", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Plan Regulador Comunal - Caldera", // Nombre personalizado de la Capa
      colores: {
        "A-2": "#DDA853",
        AP: "#FFFBCA",
        "C-1": "#889E73",
        "P-1": "#500073",
        "Parques Comunales": "#CBA35C",
        "Q-1": "#754E1A",
        "Q-2": "#CDC1FF",
        "R-1": "#FF8383",
        "R-2": "#9AA6B2",
        "R-3a": "#9ACBD0",
        "R-3B": "#48A6A7",
        "R-4": "#2973B2",
        "RBS-1": "#23486A",
        "RBS-2": "#09122C",
        "RBS-3": "#785caaff",
        "RBS-4": "#9296a0ff",
        "RBS-5": "#667766ff",
        "RBS-6": "#3c858fff",
        "S-1": "#3c5d8fff",
        "U-1": "#673c8fff",
        "U-10": "#8f3c76ff",
        "U-11": "#7c3c8fff",
        "U-12": "#8f8e3cff",
        "U-13": "#fdff70ff",
        "U-14": "#a35654ff",
        "U-15": "#8a2012ff",
        "U-16": "#e9b1b1ff",
        "U-17": "#9c1313ff",
        "U-18": "#8b6f6fff",
        "U-19": "#612816ff",
        "U-2": "#663425ff",
        "U-20": "#380505ff",
        "U-21": "#110707ff",
        "U-21": "#411703ff",
        "U-23": "#a1980eff",
        "U-3": "#eaf73eff",
        "U-4": "#1da8dfff",
        "U-5": "#58ebdeff",
        "U-6": "#a8ee38ff",
        "U-7": "#65a165ff",
        "U-8": "#bfe77eff",
        "U-9": "#234223ff",
        "UBS-1AI": "#cc74ddff",
        "UBS-1B": "#43275eff",
        "UBS-1CP": "#1c1761ff",
        "UBS-1E": "#724ed8ff",
        "UBS-1M": "#2f4bebff",
        "UBS-1P": "#0c36eeff",
        "UBS-1T": "#7ee1eeff",
        "UBS-1U": "#1004b8ff",
        "UBS-1V": "#6b69e7ff",
        "UBS-2": "#502579ff",
        "UBS-RS": "#7c3ce2ff",
      },
      popupCampos: [
        "ZONA",
        "NOMBRE",
        "LOCALIDAD",
        "UPERM",
        "UPROH",
        "Nº Decreto",
        "Fecha Publicacion",
        "Link Decreto",
        "Ordenanza PRC",
        "Link LGUC",
        "Ordenanza LGUC",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        ZONA: "Zona",
        NOMBRE: "Nombre de la Zona",
        LOCALIDAD: "Sector",
        UPERM: "Usos Permitidos",
        UPROH: "Uso Prohibido",
        "Nº Decreto": "Numero Documento",
        "Fecha Publicacion": "Fecha Publicacion",
        "Link Decreto": "Link Decreto",
        "Ordenanza PRC": "Ordenanza Plan Regulador",
        "Link LGUC": "Ley General Urbanismo y Construccion",
        "Ordenanza LGUC": "Ordenanza de la LGUC",
        Descripcion: "Descripcion",
        "Origen Data": "Origen de la Informacion",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#a1a1a1ff", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.8, // Transparencia del relleno
      },
    },
    prc_chañaral: {
      url: "prc_chañaral.geojson",
      type: "polygon", // Tipo de capa: point, line, polygon
      atributo: "ZONA", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Plan Regulador Comunal - Chañaral", // Nombre personalizado de la Capa
      colores: {
        ZE1: "#DDA853",
        ZE2: "#FFFBCA",
        ZP1: "#889E73",
        ZPA: "#500073",
        ZR1: "#CBA35C",
        ZR2: "#754E1A",
        ZU1: "#CDC1FF",
        ZU2: "#FF8383",
        ZU3: "#9AA6B2",
        ZU4: "#9ACBD0",
        ZU5: "#48A6A7",
        ZU6: "#2973B2",
        ZU7: "#23486A",
        ZU8: "#09122C",
        ZU9: "#785caaff",
      },
      popupCampos: [
        "ZONA",
        "NOMBRE",
        "UPERM",
        "UPROH",
        "Nº Decreto",
        "Fecha Publicacion",
        "Link Decreto",
        "Ordenanza PRC",
        "Link LGUC",
        "Ordenanza LGUC",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        ZONA: "Zona",
        NOMBRE: "Nombre de la Zona",
        UPERM: "Usos Permitidos",
        UPROH: "Uso Prohibido",
        "Nº Decreto": "Numero Documento",
        "Fecha Publicacion": "Fecha Publicacion",
        "Link Decreto": "Link Decreto",
        "Ordenanza PRC": "Ordenanza Plan Regulador",
        "Link LGUC": "Ley General Urbanismo y Construccion",
        "Ordenanza LGUC": "Ordenanza de la LGUC",
        Descripcion: "Descripcion",
        "Origen Data": "Origen de la Informacion",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#a1a1a1ff", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.8, // Transparencia del relleno
      },
    },
    prc_chañaral_el_salado: {
      url: "prc_chañaral_el_salado.geojson",
      type: "polygon", // Tipo de capa: point, line, polygon
      atributo: "ZONA", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Plan Regulador Comunal - Seccional El Salado", // Nombre personalizado de la Capa
      colores: {
        ZE1: "#DDA853",
        ZE2: "#FFFBCA",
        ZP1: "#889E73",
        ZPA: "#500073",
        ZR1: "#CBA35C",
        ZR2: "#754E1A",
        ZU1: "#CDC1FF",
        ZU2: "#FF8383",
        ZU3: "#9AA6B2",
        ZU4: "#9ACBD0",
        ZU5: "#48A6A7",
        ZU6: "#2973B2",
        ZU7: "#23486A",
        ZU8: "#09122C",
        ZU9: "#785caaff",
      },
      popupCampos: [
        "ZONA",
        "NOMBRE",
        "LOCALIDAD",
        "UPERM",
        "UPROH",
        "Nº Decreto",
        "Fecha Publicacion",
        "Link Decreto",
        "Ordenanza PRC",
        "Link LGUC",
        "Ordenanza LGUC",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        ZONA: "Zona",
        NOMBRE: "Nombre de la Zona",
        LOCALIDAD: "Sector",
        UPERM: "Usos Permitidos",
        UPROH: "Uso Prohibido",
        "Nº Decreto": "Numero Documento",
        "Fecha Publicacion": "Fecha Publicacion",
        "Link Decreto": "Link Decreto",
        "Ordenanza PRC": "Ordenanza Plan Regulador",
        "Link LGUC": "Ley General Urbanismo y Construccion",
        "Ordenanza LGUC": "Ordenanza de la LGUC",
        Descripcion: "Descripcion",
        "Origen Data": "Origen de la Informacion",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#a1a1a1ff", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.8, // Transparencia del relleno
      },
    },
    prc_chañaral_flamenco: {
      url: "prc_chañaral_flamenco.geojson",
      type: "polygon", // Tipo de capa: point, line, polygon
      atributo: "ZONA", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Plan Regulador Comunal - Seccional Flamenco", // Nombre personalizado de la Capa
      colores: {
        ZE1: "#DDA853",
        ZE2: "#FFFBCA",
        ZP1: "#889E73",
        ZPA: "#500073",
        ZR1: "#CBA35C",
        ZR2: "#754E1A",
        ZU1: "#CDC1FF",
        ZU2: "#FF8383",
        ZU3: "#9AA6B2",
        ZU4: "#9ACBD0",
        ZU5: "#48A6A7",
        ZU6: "#2973B2",
        ZU7: "#23486A",
        ZU8: "#09122C",
        ZU9: "#785caaff",
      },
      popupCampos: [
        "ZONA",
        "NOMBRE",
        "LOCALIDAD",
        "UPERM",
        "UPROH",
        "Nº Decreto",
        "Fecha Publicacion",
        "Link Decreto",
        "Ordenanza PRC",
        "Link LGUC",
        "Ordenanza LGUC",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        ZONA: "Zona",
        NOMBRE: "Nombre de la Zona",
        LOCALIDAD: "Sector",
        UPERM: "Usos Permitidos",
        UPROH: "Uso Prohibido",
        "Nº Decreto": "Numero Documento",
        "Fecha Publicacion": "Fecha Publicacion",
        "Link Decreto": "Link Decreto",
        "Ordenanza PRC": "Ordenanza Plan Regulador",
        "Link LGUC": "Ley General Urbanismo y Construccion",
        "Ordenanza LGUC": "Ordenanza de la LGUC",
        Descripcion: "Descripcion",
        "Origen Data": "Origen de la Informacion",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#a1a1a1ff", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.8, // Transparencia del relleno
      },
    },
    prc_chañaral_portofino: {
      url: "prc_chañaral_portofino.geojson",
      type: "polygon", // Tipo de capa: point, line, polygon
      atributo: "ZONA", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Plan Regulador Comunal - Seccional Portofino", // Nombre personalizado de la Capa
      colores: {
        ZE1: "#DDA853",
        ZE2: "#FFFBCA",
        ZP1: "#889E73",
        ZPA: "#500073",
        ZR1: "#CBA35C",
        ZR2: "#754E1A",
        ZU1: "#CDC1FF",
        ZU2: "#FF8383",
        ZU3: "#9AA6B2",
        ZU4: "#9ACBD0",
        ZU5: "#48A6A7",
        ZU6: "#2973B2",
        ZU7: "#23486A",
        ZU8: "#09122C",
        ZU9: "#785caaff",
      },
      popupCampos: [
        "ZONA",
        "NOMBRE",
        "LOCALIDAD",
        "UPERM",
        "UPROH",
        "Nº Decreto",
        "Fecha Publicacion",
        "Link Decreto",
        "Ordenanza PRC",
        "Link LGUC",
        "Ordenanza LGUC",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        ZONA: "Zona",
        NOMBRE: "Nombre de la Zona",
        LOCALIDAD: "Sector",
        UPERM: "Usos Permitidos",
        UPROH: "Uso Prohibido",
        "Nº Decreto": "Numero Documento",
        "Fecha Publicacion": "Fecha Publicacion",
        "Link Decreto": "Link Decreto",
        "Ordenanza PRC": "Ordenanza Plan Regulador",
        "Link LGUC": "Ley General Urbanismo y Construccion",
        "Ordenanza LGUC": "Ordenanza de la LGUC",
        Descripcion: "Descripcion",
        "Origen Data": "Origen de la Informacion",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#a1a1a1ff", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.8, // Transparencia del relleno
      },
    },
    prc_copiapo: {
      url: "prc_copiapo.geojson",
      type: "polygon", // Tipo de capa: point, line, polygon
      atributo: "ZONA", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Plan Regulador Comunal - Copiapó", // Nombre personalizado de la Capa
      colores: {
        "Z-A": "#DDA853",
        "Z-A1": "#FFFBCA",
        "Z-A2": "#889E73",
        "Z-A3": "#500073",
        "Z-A4": "#CBA35C",
        "Z-B": "#754E1A",
        "Z-B1": "#CDC1FF",
        "Z-C": "#FF8383",
        "Z-C1": "#9AA6B2",
        "Z-C2": "#9ACBD0",
        "Z-C3": "#48A6A7",
        "Z-D": "#2973B2",
        "Z-E": "#23486A",
        "Z-E1": "#09122C",
        "Z-F": "#785caaff",
      },
      popupCampos: [
        "ZONA",
        "NOMBRE",
        "UPERM",
        "UPROH",
        "Nº Decreto",
        "Fecha Publicacion",
        "Link Decreto",
        "Ordenanza PRC",
        "Link LGUC",
        "Ordenanza LGUC",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        ZONA: "Zona",
        NOMBRE: "Nombre de la Zona",
        UPERM: "Usos Permitidos",
        UPROH: "Uso Prohibido",
        "Nº Decreto": "Numero Documento",
        "Fecha Publicacion": "Fecha Publicacion",
        "Link Decreto": "Link Decreto",
        "Ordenanza PRC": "Ordenanza Plan Regulador",
        "Link LGUC": "Ley General Urbanismo y Construccion",
        "Ordenanza LGUC": "Ordenanza de la LGUC",
        Descripcion: "Descripcion",
        "Origen Data": "Origen de la Informacion",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#a1a1a1ff", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.8, // Transparencia del relleno
      },
    },
    prc_diego_almagro: {
      url: "prc_diego_almagro.geojson",
      type: "polygon", // Tipo de capa: point, line, polygon
      atributo: "ZONA", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Plan Regulador Comunal - Diego de Almagro", // Nombre personalizado de la Capa
      colores: {
        "Z-AVE": "#DDA853",
        "Z-AVP": "#FFFBCA",
        "ZC-1": "#889E73",
        "ZC-2": "#500073",
        "ZC-2B": "#CBA35C",
        "ZC-3": "#754E1A",
        "ZC-3B": "#CDC1FF",
        "ZC-4": "#FF8383",
        "ZC-5": "#9AA6B2",
        "ZC-6": "#9ACBD0",
        "ZE-1": "#48A6A7",
        "ZE-2": "#2973B2",
        "ZE-3": "#23486A",
        "ZE-4": "#09122C",
        "ZE-5": "#785caaff",
      },
      popupCampos: [
        "ZONA",
        "NOMBRE",
        "LOCALIDAD",
        "UPERM",
        "UPROH",
        "Nº Decreto",
        "Fecha Publicacion",
        "Link Decreto",
        "Ordenanza PRC",
        "Link LGUC",
        "Ordenanza LGUC",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        ZONA: "Zona",
        NOMBRE: "Nombre de la Zona",
        LOCALIDAD: "Sector",
        UPERM: "Usos Permitidos",
        UPROH: "Uso Prohibido",
        "Nº Decreto": "Numero Documento",
        "Fecha Publicacion": "Fecha Publicacion",
        "Link Decreto": "Link Decreto",
        "Ordenanza PRC": "Ordenanza Plan Regulador",
        "Link LGUC": "Ley General Urbanismo y Construccion",
        "Ordenanza LGUC": "Ordenanza de la LGUC",
        Descripcion: "Descripcion",
        "Origen Data": "Origen de la Informacion",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#a1a1a1ff", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.8, // Transparencia del relleno
      },
    },
    prc_freirina: {
      url: "prc_freirina.geojson",
      type: "polygon", // Tipo de capa: point, line, polygon
      atributo: "ZONA", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Plan Regulador Comunal - Freirina", // Nombre personalizado de la Capa
      colores: {
        C: "#DDA853",
        C1: "#FFFBCA",
        C2: "#889E73",
        D: "#500073",
        E: "#CBA35C",
        R1: "#754E1A",
        R2: "#CDC1FF",
        R3: "#FF8383",
        R4: "#9AA6B2",
        R6: "#9ACBD0",
        R7: "#48A6A7",
        "Área Verde": "#29b25dff",
      },
      popupCampos: [
        "ZONA",
        "NOMBRE",
        "UPERM",
        "UPROH",
        "Nº Decreto",
        "Fecha Publicacion",
        "Link Decreto",
        "Ordenanza PRC",
        "Link LGUC",
        "Ordenanza LGUC",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        ZONA: "Zona",
        NOMBRE: "Nombre de la Zona",
        UPERM: "Usos Permitidos",
        UPROH: "Uso Prohibido",
        "Nº Decreto": "Numero Documento",
        "Fecha Publicacion": "Fecha Publicacion",
        "Link Decreto": "Link Decreto",
        "Ordenanza PRC": "Ordenanza Plan Regulador",
        "Link LGUC": "Ley General Urbanismo y Construccion",
        "Ordenanza LGUC": "Ordenanza de la LGUC",
        Descripcion: "Descripcion",
        "Origen Data": "Origen de la Informacion",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#a1a1a1ff", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.8, // Transparencia del relleno
      },
    },
    prc_huasco: {
      url: "prc_huasco.geojson",
      type: "polygon", // Tipo de capa: point, line, polygon
      atributo: "ZONA", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Plan Regulador Comunal - Huasco", // Nombre personalizado de la Capa
      colores: {
        A1: "#DDA853",
        A2: "#FFFBCA",
        A3: "#889E73",
        A4: "#500073",
        A5: "#CBA35C",
        A6: "#754E1A",
        AV1: "#CDC1FF",
        AV2: "#FF8383",
        AV3: "#9AA6B2",
        "AVI-1": "#9ACBD0",
        B1: "#48A6A7",
        B2: "#2973B2",
        B3: "#23486A",
        B4: "#09122C",
        B5: "#785caaff",
        B6: "#9296a0ff",
        B7: "#667766ff",
        B7a: "#3c858fff",
        B8: "#3c5d8fff",
        C1: "#673c8fff",
        C2: "#8f3c76ff",
        C3: "#7c3c8fff",
        C4: "#8f8e3cff",
        C5: "#fdff70ff",
        D1: "#a35654ff",
        EP1: "#8a2012ff",
        EP2: "#e9b1b1ff",
      },
      popupCampos: [
        "ZONA",
        "NOMBRE",
        "LOC",
        "UPERM",
        "UPROH",
        "Nº Decreto",
        "Fecha Publicacion",
        "Link Decreto",
        "Ordenanza PRC",
        "Link LGUC",
        "Ordenanza LGUC",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        ZONA: "Zona",
        NOMBRE: "Nombre de la Zona",
        LOC: "Sector",
        UPERM: "Usos Permitidos",
        UPROH: "Uso Prohibido",
        "Nº Decreto": "Numero Documento",
        "Fecha Publicacion": "Fecha Publicacion",
        "Link Decreto": "Link Decreto",
        "Ordenanza PRC": "Ordenanza Plan Regulador",
        "Link LGUC": "Ley General Urbanismo y Construccion",
        "Ordenanza LGUC": "Ordenanza de la LGUC",
        Descripcion: "Descripcion",
        "Origen Data": "Origen de la Informacion",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#a1a1a1ff", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.8, // Transparencia del relleno
      },
    },
    prc_vallenar: {
      url: "prc_vallenar.geojson",
      type: "polygon", // Tipo de capa: point, line, polygon
      atributo: "ZONA", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Plan Regulador Comunal - Vallenar", // Nombre personalizado de la Capa
      colores: {
        ZD: "#DDA853",
        ZH: "#FFFBCA",
        ZI: "#889E73",
        ZR1: "#500073",
        ZR2: "#CBA35C",
        ZR3: "#754E1A",
        ZR4: "#CDC1FF",
        ZU1: "#FF8383",
        ZU2: "#9AA6B2",
      },
      popupCampos: [
        "ZONA",
        "NOMBRE",
        "LOCALIDAD",
        "UPERM",
        "UPROH",
        "Nº Decreto",
        "Fecha Publicacion",
        "Link Decreto",
        "Ordenanza PRC",
        "Link LGUC",
        "Ordenanza LGUC",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        ZONA: "Zona",
        NOMBRE: "Nombre de la Zona",
        LOCALIDAD: "Sector",
        UPERM: "Usos Permitidos",
        UPROH: "Uso Prohibido",
        "Nº Decreto": "Numero Documento",
        "Fecha Publicacion": "Fecha Publicacion",
        "Link Decreto": "Link Decreto",
        "Ordenanza PRC": "Ordenanza Plan Regulador",
        "Link LGUC": "Ley General Urbanismo y Construccion",
        "Ordenanza LGUC": "Ordenanza de la LGUC",
        Descripcion: "Descripcion",
        "Origen Data": "Origen de la Informacion",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#a1a1a1ff", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.8, // Transparencia del relleno
      },
    },
    limites_urbanos: {
      url: "limites_urbanos.geojson",
      type: "polygon", // Tipo de capa: point, line, polygon
      atributo: "REG", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Limites Urbanos", // Nombre personalizado de la Capa
      colores: {
        Atacama: "#DDA853",
      },
      popupCampos: [
        "NOM",
        "COM",
        "INSTRUMENT",
        "ADMIN",
        "DO_1",
        "N_DOC",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        NOM: "Nombre del Area Urbana",
        COM: "Comuna",
        INSTRUMENT: "Instrumento Regulador",
        ADMIN: "Administrador",
        N_DOC: "Numero del Decreto",
        DO: "Fecha del Decreto",
        Descripcion: "Descripcion",
        "Origen Data": "Origen de la Informacion",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#a1a1a1ff", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.8, // Transparencia del relleno
      },
    },
    limite_comunal_linea: {
      url: "limite_comunal_linea.geojson",
      type: "line",
      nombrePersonalizado: "Limite Comunal",
      atributo: "REGION",
      colores: {
        3: "#333644",
      },
      popupCampos: ["NOM_COMUNA", "NOM_PROVIN", "NOM_REGION"],
      alias: {
        NOM_COMUNA: "Comuna",
        NOM_PROVIN: "Provincia",
        NOM_REGION: "Region",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#2d3436", // Color del borde
        weight: 2, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0, // Transparencia del relleno
      },
    },
    toponimia: {
      url: "toponimia.geojson",
      type: "point", // Tipo de capa: point, line, polygon
      atributo: "Tipo", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Toponimia", // Nombre personalizado de la Capa
      iconos: {
        // Edicion de Iconos
        Asentamiento: "localidad.png",
      },
      estiloAlternativo: {
        // Icono alternativo en caso que no encuentre el icono
        color: "#FF6B6B", // Color del borde del punto
        fillColor: "#FF6B6B", // Color de relleno del punto
        radius: 4, // Radio del punto
        weight: 1, // Grosor del borde del punto
        fillOpacity: 0.8, // Transparencia del relleno del punto
      },
      popupCampos: ["Nombre"],
      alias: {
        Nombre: "Nombre",
      },
      etiquetas: {
        campo: "Nombre",
        estilo: {
          color: "#000000", // Color del texto
          fontSize: "9px", // Tamaño de la fuente
          fontFamily: "Arial, sans-serif", // Familia de la fuente
          bufferColor: "#88304E", // Color del contorno
          bufferWidth: 0.3, // Ancho del contorno
          offsetY: -20, // Añadida propiedad para el offset vertical
        },
      },
    },
  },
  leyenda: {},
};

export default planificacionConfig;
