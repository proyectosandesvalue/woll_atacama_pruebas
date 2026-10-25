const climaConfig = {
  capas: [
    "zonas_climaticas", 
    "limite_comunal_linea", 
    "toponimia", 
    "estaciones_metereologicas_atacama" // <-- NUEVA CAPA
  ],
  cargaInicial: {
    grupos: ["clima"],
    capas: ["limite_comunal_linea"],
  },
  grupos: {
    clima: {
      nombre: "Clima",
      capas: ["zonas_climaticas"],
    },
    // <-- NUEVA SUBDIMENSIÓN -->
    estaciones_observaciones: {
      nombre: "Estaciones y Observaciones",
      capas: ["estaciones_metereologicas_atacama"],
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
      estiloBase: {
        color: "#2d3436",
        weight: 2,
        fillOpacity: 0.4,
      },
    },

    // <-- NUEVA CAPA: ESTACIONES METEOROLÓGICAS -->
    estaciones_metereologicas_atacama: {
      url: "estaciones_metereologicas_atacama.geojson",
      type: "point",
      nombrePersonalizado: "Estaciones Meteorológicas de Atacama",
      // Atributo para colorear por tipo de estación
      atributo: "tipoEstacion",
      colores: {
        "Automática": "#10b981",   // Verde
        "Convencional": "#6b7280", // Gris
        "Mixta": "#3b82f6",        // Azul
      },
      popupCampos: [
        "nombreEstacion",
        "comuna",
        "provincia",
        "altitud",
        "tipoEstacion",
        "tipoClasificacion",
        "zonaGeografica",
        "fechaInstalacion",
      ],
      alias: {
        nombreEstacion: "Estación",
        comuna: "Comuna",
        provincia: "Provincia",
        altitud: "Altitud (m)",
        tipoEstacion: "Tipo",
        tipoClasificacion: "Clasificación",
        zonaGeografica: "Zona Geográfica",
        fechaInstalacion: "Fecha de instalación",
      },
      // Íconos (puedes descomentar y usar íconos específicos si los tienes)
      // iconos: {
      //   "Automática": "estacion_auto.png",
      //   "Convencional": "estacion_conv.png",
      // },
      estiloAlternativo: {
        // Fallback si no hay íconos o si quieres que sean círculos de colores
        color: "#333333",       // Color del borde
        fillColor: "#3388ff",   // Color de relleno por defecto (se sobreescribe con 'colores')
        radius: 6,              // Radio del punto
        weight: 1.5,            // Grosor del borde
        fillOpacity: 0.9,       // Transparencia del relleno
      },
      // Opcional: etiquetas con el nombre de la estación
      // etiquetas: {
      //   campo: "nombreEstacion",
      //   estilo: {
      //     color: "#000000",
      //     fontSize: "10px",
      //     fontFamily: "Arial, sans-serif",
      //     bufferColor: "#ffffff",
      //     bufferWidth: 1,
      //     offsetY: -10,
      //   },
      // },
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
      estiloBase: {
        color: "#2d3436",
        weight: 2,
        fillOpacity: 0,
      },
    },
    toponimia: {
      url: "toponimia.geojson",
      type: "point",
      atributo: "Tipo",
      nombrePersonalizado: "Toponimia",
      iconos: {
        Asentamiento: "localidad.png",
      },
      estiloAlternativo: {
        color: "#FF6B6B",
        fillColor: "#FF6B6B",
        radius: 4,
        weight: 1,
        fillOpacity: 0.8,
      },
      popupCampos: ["Nombre"],
      alias: {
        Nombre: "Nombre",
      },
      etiquetas: {
        campo: "Nombre",
        estilo: {
          color: "#000000",
          fontSize: "9px",
          fontFamily: "Arial, sans-serif",
          bufferColor: "#88304E",
          bufferWidth: 0.3,
          offsetY: -20,
        },
      },
    },
  },
  leyenda: {},
};

export default climaConfig;