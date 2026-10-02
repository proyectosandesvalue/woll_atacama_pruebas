const agriculturaConfig = {
  capas: [
    "viveros_sag",
    "catastro_plantas_embalaje",
    "camaras_frio",
    "catastro_variedades_frutales",
    "catastro_especies_frutales",
    "capacidad_uso_suelo",
    "red_canales",
    "hidrografia",
    "limite_comunal_linea",
    "toponimia",
  ],
  cargaInicial: {
    grupos: ["catastro"],
    capas: ["limite_comunal_linea"],
    // Grupos que se cargan al activar la dimensión
    // O también puedes especificar capas individuales si no usas grupos:
    // capas: ["energia_linea_transmision", "subestaciones"]
    // Escenario 3: Sin cargaInicial = carga todo (backward compatible)
    // No defines la propiedad cargaInicial
  },
  grupos: {
    catastro: {
      nombre: "Catastro Fruticola",
      capas: [
        "catastro_especies_frutales",
        "catastro_variedades_frutales",
        "catastro_plantas_embalaje",
        "camaras_frio",
        "viveros_sag",
      ],
    },
    recursos: {
      nombre: "Recursos Naturales (Agua y Suelo)",
      capas: ["capacidad_uso_suelo", "red_canales", "hidrografia"],
    },
    contexto: {
      nombre: "Territorio",
      capas: ["limite_comunal_linea", "toponimia"],
    },
  },
  estilo: {
    viveros_sag: {
      url: "viveros_sag.geojson",
      type: "point", // Tipo de capa: point, line, polygon
      atributo: "codreg", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Viveros inscritos en SAG", // Nombre personalizado de la Capa
      iconos: {
        "03": "viveros_sag.png",
      },
      estiloAlternativo: {
        color: "#FF6B6B", // Color del borde del punto
        fillColor: "#FF6B6B", // Color de relleno del punto
        radius: 5, // Radio del punto
        weight: 1, // Grosor del borde del punto
        fillOpacity: 0.8, // Transparencia del relleno del punto
      },
      popupCampos: [
        "nom_vivero",
        "direccion",
        "nom_com",
        "fecha_insc",
        "sp_1",
        "sp_2",
        "sp_3",
        "sup_ha",
        "Descripcion",
        "Ultima Actualizacion Dato",
        "Origen_Informacion",
      ],
      alias: {
        nom_vivero: "Nombre Vivero",
        direccion: "Direccion",
        nom_com: "Comuna",
        urba_rural: "Urbano - Rural",
        fecha_insc: "Fecha Inscripcion en SAG",
        sp_1: "Especie Cultivada",
        sp_2: "Especie Cultivada",
        sp_3: "Especie Cultivada",
        sup_ha: "Superficie en Ha",
        Descripcion: "Descripcion",
        "Ultima Actualizacion Dato": "Ultima Actualizacion del Dato",
        Origen_Informacion: "Origen del Dato",
      },
    },
    catastro_plantas_embalaje: {
      url: "plantas_embalaje.geojson",
      type: "point", // Tipo de capa: point, line, polygon
      atributo: "Comuna", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Catastro Fruticola - Plantas de Embalaje", // Nombre personalizado de la Capa
      iconos: {
        "Alto del Carmen": "plantas_embalaje.png",
        Copiapo: "plantas_embalaje.png",
        "Tierra Amarilla": "plantas_embalaje.png",
        Vallenar: "plantas_embalaje.png",
      },
      estiloAlternativo: {
        color: "#FF6B6B", // Color del borde del punto
        fillColor: "#FF6B6B", // Color de relleno del punto
        radius: 5, // Radio del punto
        weight: 1, // Grosor del borde del punto
        fillOpacity: 0.8, // Transparencia del relleno del punto
      },
      popupCampos: [
        "ESPECIE",
        "Nuemro de Lineas",
        "Tipo de Lineas",
        "Comuna",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        ESPECIE: "Especie Procesada",
        "Nuemro de Lineas": "Numero de Lineas",
        "Tipo de Lineas": "Tipo de Linea",
        Comuna: "Comuna",
        Descripcion: "Descripcion",
        "Origen Data": "Origen del Dato",
      },
    },
    camaras_frio: {
      url: "camaras_frio.geojson",
      type: "point", // Tipo de capa: point, line, polygon
      atributo: "Codigo Region", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Catastro Fruticola - Camaras de Frio", // Nombre personalizado de la Capa
      iconos: {
        3: "CamarasFrio.png",
      },
      estiloAlternativo: {
        color: "#FF6B6B", // Color del borde del punto
        fillColor: "#FF6B6B", // Color de relleno del punto
        radius: 5, // Radio del punto
        weight: 1, // Grosor del borde del punto
        fillOpacity: 0.8, // Transparencia del relleno del punto
      },
      popupCampos: [
        "Tipo de Camaras",
        "Numero de Camaras de Frio",
        "Numero de Camaras de Prefrio",
        "Comuna",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        "Tipo de Camaras": "Tipo de Camaras",
        "Numero de Camaras de Frio": "Numero de Camaras de Frio",
        "Numero de Camaras de Prefrio": "Numero de Camaras de Prefrio",
        Comuna: "Comuna",
        Descripcion: "Descripcion",
        "Origen Data": "Origen del Dato",
      },
    },
    catastro_variedades_frutales: {
      url: "catastro_variedades_frutales.geojson",
      type: "point", // Tipo de capa: point, line, polygon
      atributo: "especie", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Catastro fruticola - Variedades Frutales", // Nombre personalizado de la Capa
      iconos: {
        ALMENDRO: "fruto_almendro.png",
        CHIRIMOYO: "frutas_chirimoya.png",
        GRANADO: "frutas_granada.png",
        HIGUERA: "frutas_higos.png",
        JOJOBA: "frutas_jojoba.png",
        LIMA: "frutas_lima_limon.png",
        LIMONERO: "fruta_limon.png",
        MANDARINO: "frutas_mandarino.png",
        MANGO: "frutas_mango.png",
        MEMBRILLO: "frutas_membrillos.png",
        NARANJO: "frutas_naranjo.png",
        NECTARINO: "frutas_nectarino.png",
        NISPERO: "frutas_nispero.png",
        NOGAL: "frutas_nogal.png",
        OLIVO: "frutas_olivo.png",
        PALTO: "frutas_palta.png",
        TUNA: "frutas_tuna.png",
        "VID DE MESA": "frutas_uva.png",
      },
      estiloAlternativo: {
        color: "#FF6B6B", // Color del borde del punto
        fillColor: "#FF6B6B", // Color de relleno del punto
        radius: 5, // Radio del punto
        weight: 1, // Grosor del borde del punto
        fillOpacity: 0.8, // Transparencia del relleno del punto
      },
      popupCampos: [
        "especie",
        "variedad",
        "comuna",
        "ano_plant",
        "asociacion",
        "reinjerto",
        "sist_plant",
        "sist_condu",
        "polinizant",
        "num_arbol",
        "superf_fru",
        "met_riego",
        "met_conduc",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        especie: "Nombre de la Especie",
        variedad: "Variedad",
        comuna: "Comuna",
        ano_plant: "Año de la Plantacion",
        asociacion: "Asociacion",
        reinjerto: "Reinjerto",
        sist_plant: "Sistema de Plantacion",
        sist_condu: "Sistema de Conduccion",
        polinizant: "Polinizante",
        num_arbol: "Numero de Arboles",
        superf_fru: "Superficie Plantada en Ha",
        met_riego: "Metodo de Riego",
        met_conduc: "Metodo de Conduccion Agua",
        Descripcion: "Descripcion",
        "Origen Data": "Origen de la Informacion",
      },
      // Definir colores por valor del atributo si es necesario
      colores: {
        Inactivo: "#FF6B6B",
        Activo: "#4ECDC4",
        Abandonado: "#C7F464",
      },
    },
    catastro_especies_frutales: {
      url: "catastro_especies_frutales.geojson",
      type: "polygon",
      nombrePersonalizado: "Catastro Fruticola - Especies Frutales",
      atributo: "especie",
      colores: {
        ALMENDRO: "#8daa91",
        CHIRIMOYO: "#788475",
        GRANADO: "#2D7AFF",
        HIGUERA: "#453643",
        JOJOBA: "#28112B",
        LIMA: "#FCB0B3",
        LIMONERO: "#FF5552",
        MANDARINO: "#F5853F",
        MANGO: "#E5C2C0",
        MEMBRILLO: "#880D1E",
        NARANJO: "#08415C",
        NECTARINO: "#DDE8B9",
        NISPERO: "#CBEEF3",
        NOGAL: "#9C42F7",
        OLIVO: "#E2CD11",
        PALTO: "#408924",
        TUNA: "#A97100",
        "VID DE MESA": "#3E00A9",
      },
      popupCampos: [
        "especie",
        "ano_planta",
        "asociacion",
        "reinjerto",
        "sist_plant",
        "sist_condu",
        "polinizant",
        "sup_frutal",
        "met_riego",
        "met_conduc",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        especie: "Nombre de la Especie",
        ano_planta: "Año de la Plantacion",
        asociacion: "Asociacion",
        reinjerto: "Reinjerto",
        sist_plant: "Sistema de Plantacion",
        sist_condu: "Sistema de Conduccion",
        polinizant: "Polinizante",
        sup_frutal: "Superficie Plantada en Ha",
        met_riego: "Metodo de Riego",
        met_conduc: "Metodo de Conduccion Agua",
        Descripcion: "Descripcion",
        "Origen Data": "Origen de la Informacion",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#bbbcccff", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.3, // Transparencia del relleno
      },
    },
    capacidad_uso_suelo: {
      url: "capacidad_uso_suelo.geojson",
      type: "polygon",
      nombrePersonalizado: "Capacidad de Uso de los Suelos",
      atributo: "textcaus",
      colores: {
        I: "#00a516ff",
        II: "#7dd168ff",
        III: "#c9cc30ff",
        IV: "#453643",
        V: "#490606ff",
        VI: "#FCB0B3",
        VII: "#FF5552",
        VII: "#fd0505ff",
        "N.C.": "#68a8ddff",
      },
      popupCampos: [
        "textcaus",
        "sup_ha",
        "nomcom",
        "Nota Clasificacion",
        "Año Estudio CIREN",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        textcaus: "Clase",
        sup_ha: "Superficie en Hectareas",
        nomcom: "Nombre de la Comuna",
        "Nota Clasificacion": "Descripcion de la Clase",
        "Año Estudio CIREN": "Año del Estudio CIREN",
        Descripcion: "Descripcion",
        "Origen Data": "Origen de la Informacion",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#bbbcccff", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.8, // Transparencia del relleno
      },
    },
    red_canales: {
      url: "red_canales.geojson",
      type: "line",
      nombrePersonalizado: "Red de Canalales - CNR",
      atributo: "F_ORIGN_FH", // Asegúrate de que este atributo exista en tu GeoJSON
      colores: {
        "Comision Nacional del Riego": "#055661ff",
      }, // Configuracion del Estilo Base de la Linea (Ancho, transparencia, Segmentacion de la Linea)
      estiloBase: {
        weight: 2.5,
        opacity: 0.8,
        dashArray: "1",
      },
      popupCampos: [
        "NOMCAN",
        "ORIGEN",
        "FUENTEHID",
        "TIPO_CANAL",
        "OUA",
        "OUA_TIPO",
        "F_ORIGN_FH",
        "Descripcion",
        "Origen de la Data",
      ],
      alias: {
        NOMCAN: "Nombre del Canal",
        ORIGEN: "Origen",
        FUENTEHID: "Origen de la Fuente",
        TIPO_CANAL: "Tipo",
        OUA: "Nombre de la Organizacion de Usuarios de Agua",
        OUA_TIPO: "Tipo de Organizacion",
        F_ORIGN_FH: "Creador del Dato",
        Descripcion: "Descripcion",
        "Origen de la Data": "Origen del Dato",
      },
    },
    hidrografia: {
      url: "hidrografia.geojson",
      type: "line",
      nombrePersonalizado: "Red Hidrografica",
      atributo: "tipo_bcn", // Asegúrate de que este atributo exista en tu GeoJSON
      colores: {
        Quebrada: "#8af1ffff",
        Arroyo: "#54cfffff",
        Estero: "#2abccfff",
        Rio: "#3e6bffff",
      }, // Configuracion del Estilo Base de la Linea (Ancho, transparencia, Segmentacion de la Linea)
      estiloBase: {
        weight: 2.5,
        opacity: 0.8,
        dashArray: "1",
      },
      popupCampos: [
        "nom_cuen",
        "nom_subc",
        "nom_ssubc",
        "tipo_bcn",
        "strahler_n",
        "direccion",
        "Descripcion",
        "Origen Data",
        "Ultima Actualizacion",
      ],
      alias: {
        nom_cuen: "Nombre Cuenca",
        nom_subc: "Nombre de la Subcuenca",
        nom_ssubc: "Nombre de la Subsubcuenca",
        tipo_bcn: "Tipo",
        strahler_n: "Indice de Strahler",
        direccion: "Direccion del Cauce",
        Descripcion: "Descripcion",
        "Origen Data": "Origen del Dato",
        "Ultima Actualizacion": "Ultima Actualizacion del Dato",
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
          color: "#ffffffff", // Color del texto
          fontSize: "9px", // Tamaño de la fuente
          fontFamily: "Arial, sans-serif", // Familia de la fuente
          fontWeight: "600", // Peso de la fuente
          bufferColor: "#88304E", // Color del contorno
          bufferWidth: 2, // Ancho del contorno
          offsetY: -20, // Añadida propiedad para el offset vertical
          offsetX: 0, // Añadida propiedad para el offset horizontal
        },
      },
    },
  },
  leyenda: {},
};

export default agriculturaConfig;
