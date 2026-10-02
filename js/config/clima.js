const climaConfig = {
  capas: ["zonas_climaticas", "limite_comunal_linea", "toponimia"],
  cargaInicial: {
    grupos: ["clima"],
    capas: ["limite_comunal_linea"],
    // Grupos que se cargan al activar la dimensión
    // O también puedes especificar capas individuales si no usas grupos:
    // capas: ["energia_linea_transmision", "subestaciones"]
    // Escenario 3: Sin cargaInicial = carga todo (backward compatible)
    // No defines la propiedad cargaInicial
  },
  grupos: {
    clima: {
      nombre: "Clima",
      capas: ["zonas_climaticas"],
    },
    contexto: {
      nombre: "Territorio",
      capas: ["limite_comunal_linea", "toponimia"],
    },
  },
  estilo: {
    zonas_climaticas: {
      url: "zonas_climaticas.geojson",
      type: "line",
      nombrePersonalizado: "Zonas Climaticas (Koppen-Geiger)",
      atributo: "KOPPEN_FIN",
      colores: {
        BSk: "#dda853",
        "BSk (s)": "#985b00",
        "BSk (s) (i)": "#ffb13b",
        "BSk (w)": "#be8125",
        BWh: "#d84c2a",
        "BWh (s)": "#af0508",
        BWk: "#ff5558",
        "Bwk (s)": "#ffd1d2",
        EF: "#2973b2",
        "EF (s)": "#6fbeff",
        "EF (w)": "#6fbeff",
        ET: "#a0cf59",
        "ET (s)": "#7cff01",
        "ET (w)": "#4c8b11",
      },
      popupCampos: [
        "DENOMINACI",
        "KOPPEN_FIN",
        "PP_MM",
        "TMED",
        "ALT_MIN",
        "ALT_MAX",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        DENOMINACI: "Clima",
        KOPPEN_FIN: "Codigo",
        PP_MM: "Precipitacion Promedio en mm",
        TMED: "Temperatura Promedio en ºC",
        ALT_MIN: "Altura Minima msnm",
        ALT_MAX: "Altura Maxima msnm",
        Descripcion: "Descripcion",
        "Origen Data": "Origen Data",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#2d3436", // Color del borde
        weight: 2, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.4, // Transparencia del relleno
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

export default climaConfig;
