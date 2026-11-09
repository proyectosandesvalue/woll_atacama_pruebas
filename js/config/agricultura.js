import { copernicusLayer } from "./copernicusLayer.js";

// Escala compartida por los índices de vegetación (misma paleta del NDVI).
const VEGETATION_STOPS = [
  { value: -1, color: "#8c8c8c" },
  { value: -0.2, color: "#d9c58a" },
  { value: 0, color: "#e8e0a0" },
  { value: 0.2, color: "#c7e9a0" },
  { value: 0.4, color: "#76c76a" },
  { value: 0.6, color: "#2e8b57" },
  { value: 0.8, color: "#004d00" },
  { value: 1, color: "#003300" },
];

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
    "copernicus_ndvi",
    "copernicus_evi",
    "copernicus_evi2",
    "copernicus_gndvi",
    "copernicus_savi",
    "copernicus_msavi2",
    "copernicus_vari",
    "copernicus_mcari",
    "copernicus_psri",
    "copernicus_ndyi",
    "copernicus_ari_1",
    "copernicus_agricultura",
    "copernicus_true_color_s2l2a",
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
    satelite: {
      nombre: "Satélite (Copernicus)",
      capas: [
        "copernicus_ndvi",
        "copernicus_evi",
        "copernicus_evi2",
        "copernicus_gndvi",
        "copernicus_savi",
        "copernicus_msavi2",
        "copernicus_vari",
        "copernicus_mcari",
        "copernicus_psri",
        "copernicus_ndyi",
        "copernicus_ari_1",
        "copernicus_agricultura",
        "copernicus_true_color_s2l2a",
      ],
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
        VIII: "#fd0505ff",
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
    copernicus_ndvi: copernicusLayer({
      servicio: "copernicus_ndvi",
      nombre: "NDVI (Sentinel-2)",
      title: "Índice de Vegetación (NDVI)",
      description: "El NDVI compara la luz infrarroja cercana con la luz roja para estimar la cantidad y el estado de la vegetación. Es un buen indicador de vegetación sana y activa: los valores altos corresponden a vegetación densa y vigorosa; los valores bajos, a suelo desnudo, agua o vegetación escasa. Se utiliza para monitorear cultivos, cobertura vegetal, estrés hídrico y sequías.",
      range: {
        min: -1,
        max: 1,
        text: "Valores cercanos a -1 indican agua, nieve o suelo desnudo; entre 0 y 0.2, vegetación escasa; entre 0.2 y 0.4, arbustos o pastizales; entre 0.4 y 0.6, vegetación moderada; sobre 0.6, vegetación densa y sana.",
      },
      legend: {
        type: "gradient",
        min: -1,
        max: 1,
        unit: "NDVI",
        labels: ["Agua / suelo desnudo", "Vegetación densa"],
        stops: VEGETATION_STOPS,
      },
    }),
    copernicus_evi: copernicusLayer({
      servicio: "copernicus_evi",
      nombre: "EVI (Sentinel-2)",
      title: "Índice de Vegetación Mejorado (EVI)",
      description: "El EVI estima la cantidad y el vigor de la vegetación combinando la luz infrarroja cercana con la roja y la azul. Corrige parte del efecto de la atmósfera y del suelo, por lo que funciona mejor que el NDVI en vegetación densa. Se utiliza para monitorear cultivos, bosques y cambios en la cobertura vegetal.",
      range: {
        min: -1,
        max: 1,
        text: "Valores bajo 0 indican agua, nieve o suelo desnudo; entre 0 y 0.2, vegetación escasa; entre 0.2 y 0.4, vegetación moderada; entre 0.4 y 0.6, vegetación densa; sobre 0.6, vegetación muy densa y vigorosa.",
      },
      legend: {
        type: "gradient",
        min: -1,
        max: 1,
        unit: "EVI",
        labels: ["Suelo / agua", "Vegetación densa"],
        stops: VEGETATION_STOPS,
      },
    }),
    copernicus_evi2: copernicusLayer({
      servicio: "copernicus_evi2",
      nombre: "EVI2 (Sentinel-2)",
      title: "Índice de Vegetación Mejorado de Dos Bandas (EVI2)",
      description: "El EVI2 es una versión del EVI que usa solo la luz infrarroja cercana y la roja, sin la banda azul. Mantiene la corrección del suelo y de la atmósfera, y se utiliza cuando la banda azul no está disponible o es poco confiable. Sirve para monitorear vegetación densa y cultivos.",
      range: {
        min: -1,
        max: 1,
        text: "Valores bajo 0 indican agua, nieve o suelo desnudo; entre 0 y 0.2, vegetación escasa; entre 0.2 y 0.4, vegetación moderada; entre 0.4 y 0.6, vegetación densa; sobre 0.6, vegetación muy densa y vigorosa.",
      },
      legend: {
        type: "gradient",
        min: -1,
        max: 1,
        unit: "EVI2",
        labels: ["Suelo / agua", "Vegetación densa"],
        stops: VEGETATION_STOPS,
      },
    }),
    copernicus_gndvi: copernicusLayer({
      servicio: "copernicus_gndvi",
      nombre: "GNDVI (Sentinel-2)",
      title: "Índice de Vegetación Verde (GNDVI)",
      description: "El GNDVI compara la luz infrarroja cercana con la luz verde. Es más sensible que el NDVI al contenido de clorofila de las hojas, por lo que ayuda a detectar estrés, cambios de vigor y madurez de los cultivos.",
      range: {
        min: -1,
        max: 1,
        text: "Valores bajo 0 indican agua o suelo desnudo; entre 0 y 0.2, vegetación escasa; entre 0.2 y 0.4, vegetación moderada; entre 0.4 y 0.6, vegetación densa; sobre 0.6, vegetación muy densa y con alta clorofila.",
      },
      legend: {
        type: "gradient",
        min: -1,
        max: 1,
        unit: "GNDVI",
        labels: ["Suelo / agua", "Alta clorofila"],
        stops: VEGETATION_STOPS,
      },
    }),
    copernicus_savi: copernicusLayer({
      servicio: "copernicus_savi",
      nombre: "SAVI (Sentinel-2)",
      title: "Índice de Vegetación Ajustado por Suelo (SAVI)",
      description: "El SAVI estima la vegetación corrigiendo el brillo del suelo, que en zonas áridas puede confundir al NDVI. Es útil en Atacama para monitorear vegetación dispersa, cultivos sobre suelo desnudo y áreas con poca cobertura vegetal.",
      range: {
        min: -1,
        max: 1,
        text: "Valores bajo 0 indican agua o suelo desnudo; entre 0 y 0.2, vegetación muy escasa; entre 0.2 y 0.4, vegetación dispersa; entre 0.4 y 0.6, vegetación moderada; sobre 0.6, vegetación densa.",
      },
      legend: {
        type: "gradient",
        min: -1,
        max: 1,
        unit: "SAVI",
        labels: ["Suelo desnudo", "Vegetación densa"],
        stops: VEGETATION_STOPS,
      },
    }),
    copernicus_msavi2: copernicusLayer({
      servicio: "copernicus_msavi2",
      nombre: "MSAVI2 (Sentinel-2)",
      title: "Índice de Vegetación Ajustado por Suelo Modificado (MSAVI2)",
      description: "El MSAVI2 es una versión avanzada del SAVI que ajusta automáticamente la interferencia del suelo, sin necesidad de configurar un factor manual. Es útil para monitorear cultivos en brote temprano y vegetación en zonas áridas o semidesérticas como Atacama.",
      range: {
        min: -1,
        max: 1,
        text: "Valores bajo 0 indican agua o sombras; entre 0 y 0.2, suelo desnudo o vegetación muy escasa; entre 0.2 y 0.4, vegetación dispersa; entre 0.4 y 0.6, cobertura moderada; sobre 0.6, vegetación densa.",
      },
      legend: {
        type: "gradient",
        min: -1,
        max: 1,
        unit: "MSAVI2",
        labels: ["Suelo desnudo", "Vegetación densa"],
        stops: VEGETATION_STOPS,
      },
    }),
    copernicus_vari: copernicusLayer({
      servicio: "copernicus_vari",
      nombre: "VARI (Sentinel-2)",
      title: "Índice de Vegetación Resistente a la Atmósfera (VARI)",
      description: "El VARI mide el verdor de las plantas usando solo el espectro visible (rojo, verde y azul), lo que reduce parte de las perturbaciones atmosféricas. Es útil para monitorear cultivos con imágenes de drones o cámaras aéreas convencionales que no tienen banda infrarroja.",
      range: {
        min: -1,
        max: 1,
        text: "Valores bajo 0 indican suelo, agua o sombras; entre 0 y 0.2, vegetación escasa o en inicio de desarrollo; sobre 0.2, vegetación densa, vigorosa y verde.",
      },
      legend: {
        type: "gradient",
        min: -1,
        max: 1,
        unit: "VARI",
        labels: ["Suelo / agua", "Vegetación verde"],
        stops: [
          { value: -1, color: "#8c8c8c" },
          { value: -0.2, color: "#c9b27c" },
          { value: 0, color: "#e8e0a0" },
          { value: 0.2, color: "#b7d97a" },
          { value: 0.5, color: "#4caf50" },
          { value: 1, color: "#1b5e20" },
        ],
      },
    }),
    copernicus_mcari: copernicusLayer({
      servicio: "copernicus_mcari",
      nombre: "MCARI (Sentinel-2)",
      title: "Índice de Absorción de Clorofila (MCARI)",
      description: "El MCARI mide la absorción de luz por la clorofila usando las bandas del borde rojo. Permite evaluar la concentración de clorofila y nitrógeno foliar, y se utiliza para la detección temprana de estrés nutricional, el diagnóstico de fertilización y la salud foliar.",
      range: {
        text: "No tiene un rango acotado entre -1 y 1. Los valores bajos indican escasa clorofila, follaje limitado o suelo expuesto; los valores altos, elevado contenido de clorofila y alto vigor fotosintético.",
      },
      legend: {
        type: "gradient",
        min: 0,
        max: 1,
        unit: "MCARI",
        labels: ["Baja clorofila", "Alta clorofila"],
        stops: [
          { value: 0, color: "#d9c58a" },
          { value: 0.2, color: "#e8e0a0" },
          { value: 0.5, color: "#9ccc65" },
          { value: 0.8, color: "#4caf50" },
          { value: 1, color: "#1b5e20" },
        ],
      },
    }),
    copernicus_psri: copernicusLayer({
      servicio: "copernicus_psri",
      nombre: "PSRI (Sentinel-2)",
      title: "Índice de Senescencia Vegetal (PSRI)",
      description: "El PSRI cuantifica el envejecimiento (senescencia) y la pérdida de pigmentos verdes de las plantas al comparar carotenoides y clorofila. Se utiliza para monitorear la maduración de cosechas, el estrés hídrico severo y la estimación de materia seca final.",
      range: {
        min: -1,
        max: 1,
        text: "Valores bajos o negativos indican vegetación verde, activa y saludable; valores altos o positivos, vegetación senescente, seca o lista para cosecha.",
      },
      legend: {
        type: "gradient",
        min: -1,
        max: 1,
        unit: "PSRI",
        labels: ["Vegetación activa", "Vegetación senescente / seca"],
        stops: [
          { value: -1, color: "#1b5e20" },
          { value: -0.2, color: "#76c76a" },
          { value: 0, color: "#e8e0a0" },
          { value: 0.2, color: "#f4a261" },
          { value: 0.5, color: "#b5651d" },
          { value: 1, color: "#6d4c41" },
        ],
      },
    }),
    copernicus_ndyi: copernicusLayer({
      servicio: "copernicus_ndyi",
      nombre: "NDYI (Sentinel-2)",
      title: "Índice de Amarillez (NDYI)",
      description: "El NDYI mide la intensidad del color amarillo en la cubierta vegetal comparando la luz verde y la azul. Permite monitorear la floración y las etapas del cultivo, y se utiliza para detectar floración (por ejemplo, en raps o canola), maduración y fases fenológicas clave.",
      range: {
        min: -1,
        max: 1,
        text: "Valores bajos o negativos indican vegetación verde o suelo; valores altos o positivos, presencia de floración amarilla o maduración avanzada.",
      },
      legend: {
        type: "gradient",
        min: -1,
        max: 1,
        unit: "NDYI",
        labels: ["Vegetación verde", "Floración / amarillez"],
        stops: [
          { value: -1, color: "#1b5e20" },
          { value: -0.2, color: "#76c76a" },
          { value: 0, color: "#e8e0a0" },
          { value: 0.2, color: "#fdd835" },
          { value: 0.5, color: "#f9a825" },
          { value: 1, color: "#f57f17" },
        ],
      },
    }),
    copernicus_ari_1: copernicusLayer({
      servicio: "copernicus_ari_1",
      nombre: "ARI_1 (Sentinel-2)",
      title: "Índice de Antocianinas (ARI_1)",
      description: "El ARI compara la luz verde con la del borde rojo para estimar el contenido de antocianinas, los pigmentos que dan color rojo, azul o púrpura a las hojas. Las antocianinas aumentan ante distintos tipos de estrés, por lo que el índice ayuda a detectar plantas afectadas y cambios fisiológicos. Se utiliza en frutales, viñas y vegetación natural.",
      range: {
        min: 0,
        max: 0.2,
        text: "En el artículo original, los árboles evaluados se ubicaron entre 0 y 0.2. Valores más altos indican mayor contenido de antocianinas; valores cercanos a 0, poco o nada de antocianinas.",
      },
      legend: {
        type: "gradient",
        min: 0,
        max: 0.2,
        unit: "ARI",
        labels: ["Sin antocianinas", "Alta concentración"],
        stops: [
          { value: 0, color: "#2e7d32" },
          { value: 0.05, color: "#fdd835" },
          { value: 0.1, color: "#e53935" },
          { value: 0.2, color: "#6a1b9a" },
        ],
      },
    }),
    copernicus_agricultura: copernicusLayer({
      servicio: "copernicus_agricultura",
      nombre: "Agricultura (Sentinel-2)",
      title: "Agricultura (Sentinel-2)",
      description: "Combina bandas del infrarrojo cercano y del rojo para resaltar superficies agrícolas y diferencias entre cultivos, suelo desnudo y vegetación. Se utiliza para identificar y monitorear áreas cultivadas.",
      range: {
        text: "No es un índice numérico: es una composición de bandas que resalta cultivos, suelo desnudo y vegetación. Los colores no tienen un rango único.",
      },
      note: "El mapa usa una combinación de bandas para resaltar cultivos y suelo. Rojo, Verde y Azul son las partes del color del píxel; no representan un índice numérico.",
      legend: {
        type: "note",
        text: "Composición de bandas 11 (SWIR), 8A (NIR) y 2 (azul).",
      },
    }),
    copernicus_true_color_s2l2a: copernicusLayer({
      servicio: "copernicus_true_color_s2l2a",
      nombre: "Color real Sentinel-2 L2A",
      title: "Color real Sentinel-2 L2A",
      description: "Imagen en color natural construida con las bandas roja, verde y azul de Sentinel-2 L2A. Se utiliza como referencia visual del territorio y para interpretar cambios en el paisaje.",
      range: {
        text: "No es un índice numérico: es una imagen de color natural. Los valores RGB representan la intensidad de la luz reflejada en las bandas roja, verde y azul.",
      },
      note: "Imagen de color natural. Los valores de abajo son las intensidades de rojo, verde y azul.",
      collection: "DSS2",
      legend: {
        type: "note",
        text: "Color real: bandas 4 (rojo), 3 (verde) y 2 (azul).",
      },
    }),

  },
  leyenda: {},
};

export default agriculturaConfig;
