const otrosConfig = {
  capas: [
    "wms_ide_minagri",
    "wms_ide_ciren_agroindustrias",
    "bienes_nacionales_protegidos",
    "sistema_areas_protegidas",
    "limite_comunal_linea",
    "toponimia",
  ],
  cargaInicial: {
    grupos: ["conservacion"],
    capas: ["limite_comunal_linea"],
    // Grupos que se cargan al activar la dimensión
    // O también puedes especificar capas individuales si no usas grupos:
    // capas: ["energia_linea_transmision", "subestaciones"]
    // Escenario 3: Sin cargaInicial = carga todo (backward compatible)
    // No defines la propiedad cargaInicial
  },
  grupos: {
    conservacion: {
      nombre: "Areas de Proteccion y Conservacion",
      capas: ["bienes_nacionales_protegidos", "sistema_areas_protegidas"],
    },
    contexto: {
      nombre: "Territorio",
      capas: ["limite_comunal_linea", "toponimia"],
    },
  },
  estilo: {
    wms_ide_minagri: {
      tipo: "wms",
      servicio: "ide_minagri", // debe coincidir con la key en wms_services.js
      nombrePersonalizado: "Destinos Turísticos (IDE Chile)",
      popupCampos: ["NOMBRE", "TIPO", "REGION"],
      alias: { NOMBRE: "Nombre", TIPO: "Tipo", REGION: "Región" },
      opacity: 0.8,
    },
    wms_ide_ciren_agroindustrias: {
      tipo: "wms",
      servicio: "ide_ciren_agroindustrias", // debe coincidir con la key en wms_services.js
    },
    bienes_nacionales_protegidos: {
      url: "bienes_nacionales_protegidos.geojson",
      type: "polygon", // Tipo de capa: point, line, polygon
      atributo: "REGION", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Bienes Nacionales Protegidos", // Nombre personalizado de la Capa
      colores: {
        Atacama: "#057a57ff",
      },
      popupCampos: [
        "BNP",
        "COMUNA",
        "SUPERFICIE",
        "DECRETO",
        "ACT_ADM",
        "ADMINISTRA",
        "Descripcion",
        "Origen Dato",
      ],
      alias: {
        BNP: "Nombre del Bien Nacional",
        COMUNA: "Comuna",
        SUPERFICIE: "Superficie en Ha",
        DECRETO: "Decreto",
        ACT_ADM: "Acto Administrativo",
        ADMINISTRA: "Administrador del Bien",
        Descripcion: "Descripcion",
        "Origen Dato": "Origen de la Informacion",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#4B5945", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.8, // Transparencia del relleno
      },
    },
    sistema_areas_protegidas: {
      url: "sistema_areas_protegidas.geojson",
      type: "polygon", // Tipo de capa: point, line, polygon
      atributo: "TERRITORIO", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Sistema Nacional de Areas Protegidas", // Nombre personalizado de la Capa
      colores: {
        Continente: "#216dfaff",
      },
      popupCampos: [
        "NOMBRE_UNI",
        "CATEGORIA",
        "REGION",
        "CONDICION",
        "DECRETO_VI",
        "TIPO_DE_PR",
        "TERRITORIO",
        "Descripcion",
        "Origen Dato",
      ],
      alias: {
        NOMBRE_UNI: "Nombre del SNAP",
        CATEGORIA: "Categoria",
        REGION: "Region",
        CONDICION: "Condicion",
        DECRETO_VI: "Decreto",
        TIPO_DE_PR: "Administrador",
        TERRITORIO: "Territorio",
        Descripcion: "Descripcion",
        "Origen Dato": "Origen de la Informacion",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#4B5945", // Color del borde
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

export default otrosConfig;
