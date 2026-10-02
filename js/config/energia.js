const energiaConfig = {
  capas: [
    "energia_linea_transmision",
    "energia_linea_media_transmision",
    "energia_plantas_eolicas",
    "energia_plantas_solares",
    "energia_hidroelectricas",
    "energia_termoelectricas",
    "energia_almacenamiento_combustibles",
    "energia_terminales_maritimos",
    "energia_potencial_fotovoltaico",
    "energia_potencial_solar_csp",
    "energia_potencial_hidrobombeo",
    "energia_potencial_eolico",
    "subestaciones",
    "limite_comunal_linea",
    "toponimia",
  ],
  cargaInicial: {
    grupos: ["infraestructura", "generacion_actual"],
    capas: ["limite_comunal_linea"],
    // Grupos que se cargan al activar la dimensión
    // O también puedes especificar capas individuales si no usas grupos:
    // capas: ["energia_linea_transmision", "subestaciones"]
    // Escenario 3: Sin cargaInicial = carga todo (backward compatible)
    // No defines la propiedad cargaInicial
  },
  grupos: {
    infraestructura: {
      nombre: "Transmision de Energia",
      capas: [
        "energia_linea_transmision",
        "energia_linea_media_transmision",
        "subestaciones",
      ],
    },
    generacion_actual: {
      nombre: "Generación de Energia",
      capas: [
        "energia_plantas_eolicas",
        "energia_plantas_solares",
        "energia_hidroelectricas",
        "energia_termoelectricas",
      ],
    },
    combustibles: {
      nombre: "Hidrocarburos",
      capas: [
        "energia_almacenamiento_combustibles",
        "energia_terminales_maritimos",
      ],
    },
    potencial: {
      nombre: "Potencial Energético",
      capas: [
        "energia_potencial_fotovoltaico",
        "energia_potencial_solar_csp",
        "energia_potencial_hidrobombeo",
        "energia_potencial_eolico",
      ],
    },
    contexto: {
      nombre: "Territorio",
      capas: ["limite_comunal_linea", "toponimia"],
    },
  },
  estilo: {
    energia_linea_transmision: {
      url: "energia_linea_transmision.geojson",
      type: "line",
      nombrePersonalizado: "Linea de Transmision Media-Alta Tension",
      atributo: "TENSION_KV", // Asegúrate de que este atributo exista en tu GeoJSON
      colores: {
        500: "#FF6B6B",
        220: "#4ECDC4",
        110: "#2A9D8F",
        23: "#E9C46A",
      }, // Configuracion del Estilo Base de la Linea (Ancho, transparencia, Segmentacion de la Linea)
      estiloBase: {
        weight: 4,
        opacity: 0.8,
        dashArray: "1",
      },
      popupCampos: [
        "NOMBRE",
        "TRAMO",
        "PROPIEDAD",
        "TIPO",
        "CIRCUITO",
        "SIST_ELECTRICO",
        "F_OPERACIO",
        "TENSION_KV",
        "LONG_KM",
        "ESTADO",
        "FECH_ACT",
        "Origen Data",
      ],
      alias: {
        NOMBRE: "Nombre",
        TRAMO: "Tramo",
        CIRCUITO: "Circuito",
        SIST_ELECTRICO: "Sistema Electrico",
        TENSION_KV: "Tension (KV)",
        LONG_KM: "Longitud de la linea en Km",
        PROPIEDAD: "Propietario",
        TIPO: "Tipo de Linea",
        F_OPERACIO: "Entrada en Operacion",
        ESTADO: "Estado de la Linea",
        FECH_ACT: "Ultima Actualizacion del Dato",
        "Origen Data": "Origen de la Informacion",
      },
    },
    energia_linea_media_transmision: {
      url: "energia_linea_media_transmision.geojson",
      type: "line",
      nombrePersonalizado: "Linea de Transmision - Media Tension",
      atributo: "DESC_TENSION", // Asegúrate de que este atributo exista en tu GeoJSON
      colores: {
        "<=1 kV": "#E2E9AE",
        ">1 kV y <15 kV": "#008296",
        "15 kV": "#D78600",
        "23 kV": "#E9C46A",
        NULL: "#7E8A97",
      }, // Configuracion del Estilo Base de la Linea (Ancho, transparencia, Segmentacion de la Linea)
      estiloBase: {
        weight: 4,
        opacity: 0.8,
        dashArray: "1",
      },
      popupCampos: [
        "NOMBRE_EMPRESA",
        "DESC_TIPO_DISPOSICION_TRAMO",
        "DESC_TIPO_PROPIEDAD",
        "DESC_MATERIAL",
        "DESC_TENSION",
        "LARGO_RED",
        "NUMERO_FASES",
        "NOMBRE_FASES",
        "FECHA_INSTALACION",
        "Origen Data",
      ],
      alias: {
        NOMBRE_EMPRESA: "Propietaria de la Linea",
        DESC_TIPO_DISPOSICION_TRAMO: "Disposicion del Tramo",
        DESC_TIPO_PROPIEDAD: "Tipo de Propiedad",
        DESC_MATERIAL: "Material del Cable",
        DESC_TENSION: "Tension (KV)",
        LARGO_RED: "Longitud de la linea en Mt",
        NUMERO_FASES: "Numero de Fases",
        NOMBRE_FASES: "Nombre de la Fases",
        FECHA_INSTALACION: "Fecha de Instalacion",
        "Origen Data": "Origen de la Informacion",
      },
    },
    subestaciones: {
      url: "subestaciones.geojson",
      type: "point", // Tipo de capa: point, line, polygon
      atributo: "SUBTIPO", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Subestaciones Elécticas", // Nombre personalizado de la Capa
      iconos: {
        100: "subestacion.png",
      },
      leyendaAlias: {
        100: "Subestación",
      },
      estiloAlternativo: {
        color: "#FF6B6B", // Color del borde del punto
        fillColor: "#FF6B6B", // Color de relleno del punto
        radius: 5, // Radio del punto
        weight: 1, // Grosor del borde del punto
        fillOpacity: 0.8, // Transparencia del relleno del punto
      },
      popupCampos: [
        "NOMBRE",
        "PROPIEDAD",
        "TIPO",
        "TENSION_KV",
        "ESTADO",
        "F_OPERACIO",
        "SIST_ELECT",
        "FECH_ACT",
        "Origen Data",
      ],
      alias: {
        NOMBRE: "Nombre",
        PROPIEDAD: "Propietario",
        TIPO: "Tipo",
        TENSION_KV: "Tension en KV",
        ESTADO: "Estado",
        F_OPERACIO: "Fecha Operacion",
        SIST_ELECT: "Sistema Electrico",
        FECH_ACT: "Ultima Actualizacion Dato",
        "Origen Data": "Origen de la Informacion",
      },
    },
    energia_plantas_eolicas: {
      url: "energia_plantas_eolicas.geojson",
      type: "point", // Tipo de capa: point, line, polygon
      atributo: "TIPO", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Plantas Eólicas", // Nombre personalizado de la Capa
      iconos: {
        EOLICO: "eolico.png",
      },
      estiloAlternativo: {
        color: "#FF6B6B", // Color del borde del punto
        fillColor: "#FF6B6B", // Color de relleno del punto
        radius: 5, // Radio del punto
        weight: 1, // Grosor del borde del punto
        fillOpacity: 0.8, // Transparencia del relleno del punto
      },
      popupCampos: [
        "NOMBRE",
        "PROPIEDAD",
        "POTENCIAMW",
        "UNIDADES",
        "SIST_ELECT",
        "ESTADO",
        "F_OPERACIO",
        "FECH_ACT",
        "Origen Data",
      ],
      alias: {
        NOMBRE: "Nombre",
        PROPIEDAD: "Propietario",
        POTENCIAMW: "Potencia en MW",
        UNIDADES: "Unidades",
        SIST_ELECT: "Sistema Eléctrico",
        ESTADO: "Estado",
        F_OPERACIO: "Fecha Entrada en Operación",
        FECH_ACT: "Ultima Actualizacion Dato",
        "Origen Data": "Origen de la Informacion",
      },
    },
    energia_plantas_solares: {
      url: "energia_plantas_solares.geojson",
      type: "point", // Tipo de capa: point, line, polygon
      atributo: "TIPO", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Plantas Solares", // Nombre personalizado de la Capa
      iconos: {
        FOTOVOLTAICO: "solar.png",
      },
      estiloAlternativo: {
        color: "#FF6B6B", // Color del borde del punto
        fillColor: "#FF6B6B", // Color de relleno del punto
        radius: 5, // Radio del punto
        weight: 1, // Grosor del borde del punto
        fillOpacity: 0.8, // Transparencia del relleno del punto
      },
      popupCampos: [
        "NOMBRE",
        "PROPIEDAD",
        "MEDIO_GENE",
        "POTENCIAMW",
        "SIST_ELECT",
        "ESTADO",
        "F_OPERACIO",
        "FECH_ACT",
        "Origen Data",
      ],
      alias: {
        NOMBRE: "Nombre Empresa",
        PROPIEDAD: "Propietario",
        MEDIO_GENE: "Medio de Generacion",
        POTENCIAMW: "Potencia en MW",
        SIST_ELECT: "Sistema Eléctrico",
        ESTADO: "Estado",
        F_OPERACIO: "Fecha Entrada en Operación",
        FECH_ACT: "Ultima Actualizacion Dato",
        "Origen Data": "Origen de la Informacion",
      },
    },
    energia_termoelectricas: {
      url: "energia_termoelectricas.geojson",
      type: "point", // Tipo de capa: point, line, polygon
      atributo: "TIPO", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Plantas Termoelectricas", // Nombre personalizado de la Capa
      iconos: {
        TERMOELECTRICA: "termoelectrica.png",
      },
      estiloAlternativo: {
        color: "#FF6B6B", // Color del borde del punto
        fillColor: "#FF6B6B", // Color de relleno del punto
        radius: 5, // Radio del punto
        weight: 1, // Grosor del borde del punto
        fillOpacity: 0.8, // Transparencia del relleno del punto
      },
      popupCampos: [
        "NOMBRE",
        "PROPIEDAD",
        "UNIDADES",
        "COMBUSTIBL",
        "POTENCIAMW",
        "SIST_ELECT",
        "ESTADO",
        "F_OPERACIO",
        "FECH_ACT",
        "Origen Data",
      ],
      alias: {
        NOMBRE: "Nombre Empresa",
        PROPIEDAD: "Propietario",
        UNIDADES: "Unidades",
        COMBUSTIBL: "Combustible Usado",
        POTENCIAMW: "Potencia en MW",
        SIST_ELECT: "Sistema Eléctrico",
        ESTADO: "Estado",
        F_OPERACIO: "Fecha Entrada en Operación",
        FECH_ACT: "Ultima Actualizacion Dato",
        "Origen Data": "Origen de la Informacion",
      },
    },
    energia_hidroelectricas: {
      url: "energia_hidroelectricas.geojson",
      type: "point", // Tipo de capa: point, line, polygon
      atributo: "TIPO", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Plantas Hidroelectricas", // Nombre personalizado de la Capa
      iconos: {
        "HIDRAULICA PASADA": "hidroelectrica.png",
      },
      estiloAlternativo: {
        color: "#FF6B6B", // Color del borde del punto
        fillColor: "#FF6B6B", // Color de relleno del punto
        radius: 5, // Radio del punto
        weight: 1, // Grosor del borde del punto
        fillOpacity: 0.8, // Transparencia del relleno del punto
      },
      popupCampos: [
        "NOMBRE",
        "PROPIEDAD",
        "TIPO",
        "MEDIO_GENE",
        "UNIDADES",
        "POTENCIAMW",
        "SIST_ELECT",
        "ESTADO",
        "F_OPERACIO",
        "FECH_ACT",
        "Origen Data",
      ],
      alias: {
        NOMBRE: "Nombre Empresa",
        PROPIEDAD: "Propietario",
        TIPO: "Tipo",
        MEDIO_GENE: "Medio de Generacion",
        UNIDADES: "Unidades",
        POTENCIAMW: "Potencia en MW",
        SIST_ELECT: "Sistema Eléctrico",
        ESTADO: "Estado",
        F_OPERACIO: "Fecha Entrada en Operación",
        FECH_ACT: "Ultima Actualizacion Dato",
        "Origen Data": "Origen de la Informacion",
      },
    },
    energia_almacenamiento_combustibles: {
      url: "energia_almacenamiento_combustibles.geojson",
      type: "point", // Tipo de capa: point, line, polygon
      atributo: "HUSO", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Almacenamiento de Combustibles", // Nombre personalizado de la Capa
      iconos: {
        "19 S": "almacenamiento_combustible.png",
      },
      estiloAlternativo: {
        color: "#FF6B6B", // Color del borde del punto
        fillColor: "#FF6B6B", // Color de relleno del punto
        radius: 5, // Radio del punto
        weight: 1, // Grosor del borde del punto
        fillOpacity: 0.8, // Transparencia del relleno del punto
      },
      popupCampos: [
        "NOMBRE",
        "PROPIEDAD",
        "DIRECCION",
        "COMUNA",
        "PROVINCIA",
        "CAPACID_M3",
        "GNL",
        "KEROS_AVI",
        "PET_DISEL",
        "FECHA_ACT",
        "Origen Data",
      ],
      alias: {
        NOMBRE: "Nombre Empresa",
        PROPIEDAD: "Propietario",
        DIRECCION: "Direccion",
        COMUNA: "Comuna",
        PROVINCIA: "Provincia",
        CAPACID_M3: "Capacidad en Mt3",
        GNL: "Almacenamiento de Gas Natural Licuado",
        KEROS_AVI: "Almacenamiento de Keroseno",
        PET_DISEL: "Almacenamiento de Petroleo Disel",
        FECHA_ACT: "Ultima Actualizacion Dato",
        "Origen Data": "Origen de la Informacion",
      },
    },
    energia_terminales_maritimos: {
      url: "energia_terminales_maritimos.geojson",
      type: "point", // Tipo de capa: point, line, polygon
      atributo: "HUSO", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Terminales Maritimos (Combustibles)", // Nombre personalizado de la Capa
      iconos: {
        "19 S": "terminal_maritimo.png",
      },
      estiloAlternativo: {
        color: "#FF6B6B", // Color del borde del punto
        fillColor: "#FF6B6B", // Color de relleno del punto
        radius: 5, // Radio del punto
        weight: 1, // Grosor del borde del punto
        fillOpacity: 0.8, // Transparencia del relleno del punto
      },
      popupCampos: [
        "NOMBRE",
        "PROPIEDAD",
        "OPERADOR",
        "ADMINISTRA",
        "DIRECCION",
        "COMUNA",
        "PROVINCIA",
        "TIPO",
        "ESTADO",
        "FUE_OIL_N6",
        "GASOLINAS",
        "IFO_180",
        "PET_DIESEL",
        "FECHA_ACT",
        "Origen Data",
      ],
      alias: {
        NOMBRE: "Nombre Empresa",
        PROPIEDAD: "Propietario",
        OPERADOR: "Operador",
        ADMINISTRA: "Administrador",
        DIRECCION: "Direccion",
        COMUNA: "Comuna",
        PROVINCIA: "Provincia",
        TIPO: "Tipo",
        ESTADO: "Estado",
        FUE_OIL_N6: "Descarga de Fuel Oil Nª6",
        GASOLINAS: "Descarga de Gasolinas",
        IFO_180: "Descarga de IFO 180",
        PET_DIESEL: "Descarga de Petroleo Disel",
        FECHA_ACT: "Ultima Actualizacion Dato",
        "Origen Data": "Origen de la Informacion",
      },
    },
    energia_potencial_fotovoltaico: {
      url: "energia_potencial_fotovoltaico.geojson",
      type: "polygon",
      nombrePersonalizado: "Generacion Potencial Energia Fotovoltaica 2021",
      atributo: "REGION",
      colores: {
        Atacama: "#77957C",
      },
      popupCampos: [
        "COMUNA",
        "REGION",
        "Superficie_ha",
        "Potencia_MW",
        "Origen Data",
        "Link Informe",
      ],
      alias: {
        COMUNA: "Comuna",
        REGION: "Region",
        Superficie_ha: "Sup. Total Comunal(ha)",
        Potencia_MW: "Potencia Total Comunal(MW)",
        "Origen Data": "Origen de la Informacion",
        "Link Informe": "Acceso al Informe",
      },
      estiloBase: {
        color: "#77957C",
        weight: 1,
        fillOpacity: 0.3,
      },
    },
    energia_potencial_solar_csp: {
      url: "energia_potencial_solar_csp.geojson",
      type: "polygon",
      nombrePersonalizado: "Generacion Potencial Energia Solar CSP 2021",
      atributo: "REGION",
      colores: {
        Atacama: "#2B6CAF",
      },
      popupCampos: [
        "COMUNA",
        "REGION",
        "Superficie_ha",
        "Potencia_MW",
        "Origen Data",
        "Link Informe",
      ],
      alias: {
        COMUNA: "Comuna",
        REGION: "Region",
        Superficie_ha: "Sup. Total Comunal(ha)",
        Potencia_MW: "Potencia Total Comunal(MW)",
        "Origen Data": "Origen de la Informacion",
        "Link Informe": "Acceso al Informe",
      },
      estiloBase: {
        color: "#2B6CAF",
        weight: 1,
        fillOpacity: 0.3,
      },
    },
    energia_potencial_eolico: {
      url: "energia_potencial_eolico.geojson",
      type: "polygon",
      nombrePersonalizado: "Generacion Potencial Energia Eolica 2021",
      atributo: "REGION",
      colores: {
        Atacama: "#F29200",
      },
      popupCampos: [
        "COMUNA",
        "REGION",
        "Superficie_ha",
        "Potencia_MW",
        "Origen Data",
        "Link Informe",
      ],
      alias: {
        COMUNA: "Comuna",
        REGION: "Region",
        Superficie_ha: "Sup. Total Comunal(ha)",
        Potencia_MW: "Potencia Total Comunal(MW)",
        "Origen Data": "Origen de la Informacion",
        "Link Informe": "Acceso al Informe",
      },
      estiloBase: {
        color: "#F29200",
        weight: 1,
        fillOpacity: 0.3,
      },
    },
    energia_potencial_hidrobombeo: {
      url: "energia_potencial_hidrobombeo.geojson",
      type: "point", // Tipo de capa: point, line, polygon
      atributo: "REGION", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado:
        "Generacion Potencial Energia Hidro Bombeo Agua de Mar 2021", // Nombre personalizado de la Capa
      iconos: {
        Atacama: "hidro_bombeo.png",
      },
      estiloAlternativo: {
        color: "#FF6B6B", // Color del borde del punto
        fillColor: "#FF6B6B", // Color de relleno del punto
        radius: 5, // Radio del punto
        weight: 1, // Grosor del borde del punto
        fillOpacity: 0.8, // Transparencia del relleno del punto
      },
      popupCampos: [
        "COMUNA",
        "REGION",
        "Potencia_MW",
        "Origen Data",
        "Link Informe",
      ],
      alias: {
        COMUNA: "Comuna",
        REGION: "Region",
        Potencia_MW: "Potencia Total Comunal(MW)",
        "Origen Data": "Origen de la Informacion",
        "Link Informe": "Acceso al Informe",
      },
    },
    limite_comunal_linea: {
      url: "limite_comunal_linea.geojson",
      type: "line",
      nombrePersonalizado: "Limite Comunal",
      atributo: "REGION",
      colores: {
        3: "#ff7f00",
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

export default energiaConfig;
