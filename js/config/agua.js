const aguaConfig = {
  capas: [
    "hidrografia",
    "apr_rural",
    "plantas_desaladoras_puntos",
    "desaladoras_acueductos",
    "derechos_agua_2025",
    "plantas_aguas_servidas",
    "puntos_descargas",
    "territorios_operacionales",
    "lagunas_embalses",
    "salares",
    "humedales",
    "glaciares",
    "cuencas_dga",
    "acuiferos",
    "decrero_escasez_2021",
    "decrero_escasez_2022",
    "decrero_escasez_2023",
    "limite_comunal_linea",
    "toponimia",
  ],
  cargaInicial: {
    grupos: ["hidrografia", "reservas", "infraestructura"],
    capas: ["limite_comunal_linea"],
    // Grupos que se cargan al activar la dimensión
    // O también puedes especificar capas individuales si no usas grupos:
    // capas: ["energia_linea_transmision", "subestaciones"]
    // Escenario 3: Sin cargaInicial = carga todo (backward compatible)
    // No defines la propiedad cargaInicial
  },
  grupos: {
    hidrografia: {
      nombre: "Hidrografía y Cuerpos de Agua Superficial",
      capas: [
        "hidrografia",
        "lagunas_embalses",
        "salares",
        "humedales",
        "glaciares",
      ],
    },
    reservas: {
      nombre: "Reservas de Agua",
      capas: ["glaciares", "acuiferos"],
    },
    infraestructura: {
      nombre: "Infraestructura y Saneamiento",
      capas: [
        "apr_rural",
        "plantas_desaladoras_puntos",
        "desaladoras_acueductos",
        "plantas_aguas_servidas",
        "puntos_descargas",
        "territorios_operacionales",
      ],
    },
    gestion: {
      nombre: "Gestión y Regulación Administrativa",
      capas: [
        "derechos_agua_2025",
        "decrero_escasez_2021",
        "decrero_escasez_2022",
        "decrero_escasez_2023",
        "cuencas_dga",
      ],
    },
    contexto: {
      nombre: "Territorio",
      capas: ["limite_comunal_linea", "toponimia"],
    },
  },
  estilo: {
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
    apr_rural: {
      url: "apr_rural.geojson",
      type: "point", // Tipo de capa: point, line, polygon
      atributo: "COD_REG", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Servicios Sanitarios Rurales (Ex APR)", // Nombre personalizado de la Capa
      iconos: {
        "03": "Torre Agua.png",
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
        "COMUNA",
        "LEVANTAMIENTO",
        "FECHA_ACTUALIZACION",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        NOMBRE: "Nombre de la Instalacion",
        COMUNA: "Comuna",
        LEVANTAMIENTO: "Tipo",
        FECHA_ACTUALIZACION: "Ultima Actualizacion del Dato",
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
    plantas_desaladoras_puntos: {
      url: "plantas_desaladoras_puntos.geojson",
      type: "point", // Tipo de capa: point, line, polygon
      atributo: "Sistema", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Plantas Desaladoras", // Nombre personalizado de la Capa
      iconos: {
        "Osmosis Inversa": "desaladoras.png",
      },
      estiloAlternativo: {
        color: "#FF6B6B", // Color del borde del punto
        fillColor: "#FF6B6B", // Color de relleno del punto
        radius: 5, // Radio del punto
        weight: 1, // Grosor del borde del punto
        fillOpacity: 0.8, // Transparencia del relleno del punto
      },
      popupCampos: [
        "Nombre",
        "Propietario",
        "Proyecto",
        "Estado",
        "Obra",
        "Sistema",
        "Inversion en USD",
        "Produccion Nominal Instalada",
        "Inicio Operacion",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        Nombre: "Nombre de la Planta",
        Propietario: "Propietario",
        Proyecto: "Nombre del Proyecto",
        Estado: "Estado de la Planta",
        Obra: "Tipo",
        Sistema: "Sistema",
        "Inversion en USD": "Inversion en USD",
        "Produccion Nominal Instalada": "Produccion Nominal Instalada",
        "Inicio Operacion": "Inicio Operacion",
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
    desaladoras_acueductos: {
      url: "desaladoras_acueductos.geojson",
      type: "line",
      nombrePersonalizado: "Plantas Desaladoras - Acueductos",
      atributo: "Obra",
      colores: {
        Tuberia: "#414966",
      },
      popupCampos: [
        "Proyecto",
        "Propietario",
        "Nombre",
        "Obra",
        "Sistema",
        "Inversion en USD",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        Proyecto: "Nombre del Proyecto",
        Propietario: "Propietario",
        Nombre: "Obra",
        Obra: "Tipo",
        Sistema: "Sistema",
        "Inversion en USD": "Inversion en USD",
        Descripcion: "Descripcion",
        "Origen Data": "Origen de la Informacion",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#2d3436", // Color del borde
        weight: 2, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0, // Transparencia del relleno
      },
    },
    derechos_agua_2025: {
      url: "derechos_agua_2025.geojson",
      type: "point", // Tipo de capa: point, line, polygon
      nombrePersonalizado: "Derechos de Aprovechamiento de Agua", // Nombre personalizado de la Capa
      atributo: "Uso del Agua", // Asegúrate de que este atributo exista en tu GeoJSON
      iconos: {
        "Bebida/Uso Domestico/Saneamiento": "Derechos Agua.png",
        "Otros Usos": "derechos_otros_usos.png",
        Riego: "Derechos Riego.png",
        "Sin informacion": "Derechos_sininfo.png",
        "Uso Industrial": "derechos_industrial.png",
        "Uso Minero": "Derechos Mineria.png",
      },
      estiloAlternativo: {
        color: "#FF6B6B", // Color del borde del punto
        fillColor: "#FF6B6B", // Color de relleno del punto
        radius: 5, // Radio del punto
        weight: 1, // Grosor del borde del punto
        fillOpacity: 0.8, // Transparencia del relleno del punto
      },
      popupCampos: [
        "Nombre Solicitante",
        "Comuna",
        "Provincia",
        "Tipo Derecho",
        "Naturaleza del Agua",
        "Clasificación Fuente",
        "Uso del Agua",
        "Cuenca",
        "Fuente",
        "Ejercicio del Derecho",
        "Caudal Anual Promedio en Ls/s",
        "Unidad de Resolución/ Oficio/ C.B.R.",
        "Fecha de Resolución/ Envío al Juez/ Inscripción C.B.R.",
        "N° Resolución/ Oficio/ Fojas | N° CBR",
        "Fecha Toma Razón",
        "C.B.R.",
        "Fojas",
        "N° CBR",
        "Año",
        "Profundidad (m)",
        "Descripcion",
        "Fecha Corte Data",
        "Origen Data",
      ],
      alias: {
        "Nombre Solicitante": "Nombre del Solicitante",
        Comuna: "Comuna",
        Provincia: "Provincia",
        "Tipo Derecho": "Tipo de Derecho",
        "Naturaleza del Agua": "Naturaleza del Agua",
        "Clasificación Fuente": "Clasificacion de la Fuente",
        "Uso del Agua": "Uso del Agua",
        Cuenca: "Cuenca",
        Fuente: "Fuente",
        "Ejercicio del Derecho": "Ejercicio del Derecho",
        "Caudal Anual Promedio": "Caudal Anual Promedio",
        "Unidad de Resolución/ Oficio/ C.B.R.":
          "Unidad de Resolución/ Oficio/ C.B.R.",
        "Fecha de Resolución/ Envío al Juez/ Inscripción C.B.R.":
          "Fecha de Resolución/ Envío al Juez/ Inscripción C.B.R.",
        "N° Resolución/ Oficio/ Fojas | N° CBR":
          "N° Resolución/ Oficio/ Fojas | N° CBR",
        "Fecha Toma Razón": "Fecha Toma Razon",
        "C.B.R.": "Conservador de Bienes Raices",
        Fojas: "Forjas",
        "N° CBR": "N° CBR",
        Año: "Año",
        "Profundidad (m)": "Profundidad en Metros",
        Descripcion: "Descripcion",
        "Fecha Corte Data": "Fecha Corte Data",
        "Origen Data": "Origen del Dato",
      },
      // Definir colores por valor del atributo si es necesario
      colores: {
        Inactivo: "#FF6B6B",
        Activo: "#4ECDC4",
        Abandonado: "#C7F464",
      },
    },
    plantas_aguas_servidas: {
      url: "plantas_aguas_servidas.geojson",
      type: "point", // Tipo de capa: point, line, polygon
      atributo: "REGION", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Plantas de Tratamiento de Aguas Servidas", // Nombre personalizado de la Capa
      iconos: {
        "03": "planta_tratamiento.png",
      },
      estiloAlternativo: {
        color: "#FF6B6B", // Color del borde del punto
        fillColor: "#FF6B6B", // Color de relleno del punto
        radius: 5, // Radio del punto
        weight: 1, // Grosor del borde del punto
        fillOpacity: 0.8, // Transparencia del relleno del punto
      },
      popupCampos: [
        "NOMBRE_OBR",
        "DESCRIPC_2",
        "ANO_CONSTR",
        "DESCRIPCIO",
        "DESCRIPC_3",
        "DESCRIPC_4",
        "DESCRIPC_5",
        "FECHA_ACTUALIZACION",
        "Descripcion",
        "Ultima Actualizacion",
        "Origen Data",
      ],
      alias: {
        NOMBRE_OBR: "Nombre de la Instalacion",
        DESCRIPC_2: "Zona Cobertura",
        ANO_CONSTR: "Año Construccion",
        DESCRIPCIO: "Administrador de la Instalacion",
        DESCRIPC_3: "Estado de la Instalacion",
        DESCRIPC_4: "Tipo de Tratamiento",
        DESCRIPC_5: "Tipo de Descarga",
        Descripcion: "Descripcion",
        "Ultima Actualizacion": "Ultima Actualizacion del Dato",
        "Origen Data": "Origen de la Informacion",
      },
      // Definir colores por valor del atributo si es necesario
      colores: {
        Inactivo: "#FF6B6B",
        Activo: "#4ECDC4",
        Abandonado: "#C7F464",
      },
    },
    puntos_descargas: {
      url: "puntos_descargas.geojson",
      type: "point", // Tipo de capa: point, line, polygon
      atributo: "REGION", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Ptos. Descargas Plantas Aguas Servidas", // Nombre personalizado de la Capa
      iconos: {
        "03": "agua_descarga.png",
      },
      estiloAlternativo: {
        color: "#FF6B6B", // Color del borde del punto
        fillColor: "#FF6B6B", // Color de relleno del punto
        radius: 5, // Radio del punto
        weight: 1, // Grosor del borde del punto
        fillOpacity: 0.8, // Transparencia del relleno del punto
      },
      popupCampos: [
        "NOMBRE_OBR",
        "DESCRIPC_2",
        "ANO_CONSTR",
        "DESCRIPC_3",
        "DESCRIPC_4",
        "DESCRIPC_5",
        "FECHA_ACTUALIZACION",
        "Descripcion",
        "Ultima Actualizacion",
        "Origen Data",
      ],
      alias: {
        NOMBRE_OBR: "Nombre de la Instalacion",
        DESCRIPC_2: "Zona Cobertura",
        ANO_CONSTR: "Año Construccion",
        DESCRIPC_3: "Estado de la Instalacion",
        DESCRIPC_4: "Tipo de Tratamiento",
        DESCRIPC_5: "Tipo de Descarga",
        Descripcion: "Descripcion",
        "Ultima Actualizacion": "Ultima Actualizacion del Dato",
        "Origen Data": "Origen de la Informacion",
      },
      // Definir colores por valor del atributo si es necesario
      colores: {
        Inactivo: "#FF6B6B",
        Activo: "#4ECDC4",
        Abandonado: "#C7F464",
      },
    },
    territorios_operacionales: {
      url: "territorios_operacionales.geojson",
      type: "polygon",
      nombrePersonalizado: "Territorios Operacionales Agua Potable",
      atributo: "EMPRESA",
      colores: {
        "NUEVA ATACAMA": "#fa2828ff",
      },
      popupCampos: [
        "NOMBRE_SIS",
        "LOCALIDAD",
        "EMPRESA",
        "Ultima Actualizacion",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        NOMBRE_SIS: "Nombre de la Concesion",
        LOCALIDAD: "Localidad",
        EMPRESA: "Nombre del Concesionario",
        Descripcion: "Descripcion",
        "Ultima Actualizacion": "Ultima Actualizacion del Dato",
        "Origen Data": "Origen del Dato",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#3d0202ff", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.3, // Transparencia del relleno
      },
    },
    lagunas_embalses: {
      url: "lagunas_embalses.geojson",
      type: "polygon",
      nombrePersonalizado: "Lagunas, Tranques y Embalses",
      atributo: "REGION",
      colores: {
        III: "#116AA9",
      },
      popupCampos: [
        "NOMBRE",
        "TIPO",
        "PROVINCIA",
        "COMUNA",
        "AREA_KM2",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        NOMBRE: "Nombre",
        TIPO: "Tipo",
        PROVINCIA: "Provincia",
        COMUNA: "Comuna",
        AREA_KM2: "Superficie en Km2",
        Descripcion: "Descripcion",
        "Origen Data": "Origen del Dato",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#116AA9", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.8, // Transparencia del relleno
      },
    },
    salares: {
      url: "salares.geojson",
      type: "polygon",
      nombrePersonalizado: "Salares",
      atributo: "Descripcio",
      colores: {
        Salar: "#a4f1ffff",
        "Lago o Laguna": "#59d0ffff",
      },
      popupCampos: [
        "NOMBRE",
        "Descripcio",
        "Codigo",
        "Destinacio",
        "km2",
        "Ambiente",
        "Origen Data",
      ],
      alias: {
        NOMBRE: "Nombre de la Cuenca",
        Descripcio: "Descripcion",
        Codigo: "Codigo",
        Destinacio: "Destinacion",
        km2: "Area en Km2",
        "Origen Data": "Origen del Dato",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#000a9bff", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.3, // Transparencia del relleno
      },
    },
    humedales: {
      url: "humedales.geojson",
      type: "polygon",
      nombrePersonalizado: "Humedales",
      atributo: "Region",
      colores: {
        Atacama: "#52f76eff",
      },
      popupCampos: [
        "Nombre",
        "SubClase",
        "Comuna",
        "Cuenca",
        "Altitud",
        "Id_humedal",
        "Ha_humedal",
        "Descripcion",
        "Origen Dato",
      ],
      alias: {
        Nombre: "Nombre del Humedad",
        SubClase: "Tipo",
        Comuna: "Comuna",
        Cuenca: "Nombre de la Cuenca a la que Pertenece",
        Altitud: "Altitud",
        Id_humedal: "Codigo",
        Descripcion: "Descripcion",
        Ha_humedal: "Superficie en Hectáreas",
        "Origen Dato": "Origen del Dato",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#52f76eff", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.8, // Transparencia del relleno
      },
    },
    glaciares: {
      url: "glaciares.geojson",
      type: "polygon",
      nombrePersonalizado: "Glaciares",
      atributo: "COD_REG",
      colores: {
        "03": "#9FD5E2",
      },
      popupCampos: [
        "NOMBRE",
        "CLASIFICA",
        "AREA_KM2",
        "PROVINCIA",
        "COMUNA",
        "NOM_CUEN",
        "ORIENTA",
        "PENDIENTE",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        NOMBRE: "Nombre del Glaciar",
        CLASIFICA: "Clasificacion",
        AREA_KM2: "Superficie en Km2",
        PROVINCIA: "Provincia",
        COMUNA: "Comuna",
        NOM_CUEN: "Nombre de la Cuenca",
        ORIENTA: "Orientacion",
        PENDIENTE: "Pendiente",
        Descripcion: "Descripcion",
        "Origen Data": "Origen del Dato",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#9FD5E2", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.7, // Transparencia del relleno
      },
    },
    cuencas_dga: {
      url: "cuencas_dga.geojson",
      type: "polygon",
      nombrePersonalizado: "Cuencas DGA",
      atributo: "NOM_CUEN",
      colores: {
        "Endorreicas entre Frontera y Vertiente del Pacifico": "#FEEBE7",
        "Costeras Q.Pan de Azucar-R.Salado": "#FCC6BB",
        "Costeras e Islas R.Salado-R.Copiapo": "#FAA18F",
        "Rio Salado": "#F87C63",
        "Rio Copiapo": "#F54927",
        "Costeras entre R.Copiapo y Q.Totoral": "#F4320B",
        "Q.Totoral y Costeras hasta Q.Carrizal": "#C82909",
        "Quebrada Carrizal y Costeras hasta R. Huasco": "#9C2007",
        "Rio Huasco": "##701705",
        "Costeras e Islas entre R.Huasco y Cuarta Region": "#440E03",
        "Rio los Choros": "#180501",
      },
      popupCampos: ["NOM_CUEN", "Descripcion", "Area_km2", "Origen Data"],
      alias: {
        NOM_CUEN: "Nombre de la Cuenca",
        Descripcion: "Descripcion",
        Area_km2: "Area en Km2",
        "Origen Data": "Origen del Dato",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#000000", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.3, // Transparencia del relleno
      },
    },
    acuiferos: {
      url: "acuiferos.geojson",
      type: "polygon",
      nombrePersonalizado: "Acuiferos SHAC",
      atributo: "COD_REG",
      colores: {
        III: "#99a6ac",
      },
      popupCampos: [
        "SHAC",
        "NOM_ACUIF",
        "COD_SHAC",
        "NOM_BNA",
        "Descripcion",
        "Origen Dato",
      ],
      alias: {
        SHAC: "Sectores Hidrogeologicos de Aprovechamiento Comun (SHAC)",
        NOM_ACUIF: "Nombre del Acuifero",
        COD_SHAC: "Codigo del Acuifero",
        NOM_BNA: "Nombre de la Cuenca",
        Descripcion: "Descripcion",
        "Origen Dato": "Origen del Dato",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#99a6ac", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.7, // Transparencia del relleno
      },
    },
    decrero_escasez_2021: {
      url: "decrero_escasez_2021.geojson",
      type: "polygon",
      nombrePersonalizado: "Zona Decreto de escasez Hidrica 2021",
      atributo: "REGION",
      colores: {
        3: "#AE9889",
      },
      popupCampos: [
        "NOM_PROV",
        "Decreto",
        "Link Decreto",
        "Estado",
        "Fecha Caducidad",
        "Area de Afeccion",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        NOM_PROV: "Provincia",
        Decreto: "Nª Decreto",
        "Link Decreto": "Acceso al Decreto",
        Estado: "Estado",
        "Fecha Caducidad": "Fecha de Caducidad",
        "Area de Afeccion": "Area de Afeccion",
        Descripcion: "Descripcion",
        "Origen Data": "Origen del Dato",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#000000", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.3, // Transparencia del relleno
      },
    },
    decrero_escasez_2022: {
      url: "decrero_escasez_2022.geojson",
      type: "polygon",
      nombrePersonalizado: "Zona Decreto de escasez Hidrica 2022",
      atributo: "REGION",
      colores: {
        3: "#414966",
      },
      popupCampos: [
        "NOM_PROV",
        "Decreto",
        "Link Decreto",
        "Estado",
        "Fecha Caducidad",
        "Area de Afeccion",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        NOM_PROV: "Provincia",
        Decreto: "Nª Decreto",
        "Link Decreto": "Acceso al Decreto",
        Estado: "Estado",
        "Fecha Caducidad": "Fecha de Caducidad",
        "Area de Afeccion": "Area de Afeccion",
        Descripcion: "Descripcion",
        "Origen Data": "Origen del Dato",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#000000", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.3, // Transparencia del relleno
      },
    },
    decrero_escasez_2023: {
      url: "decrero_escasez_2023.geojson",
      type: "polygon",
      nombrePersonalizado: "Zona Decreto de escasez Hidrica 2023",
      atributo: "REGION",
      colores: {
        3: "#00A1A3",
      },
      popupCampos: [
        "NOM_PROV",
        "Decreto",
        "Link Decreto",
        "Estado",
        "Fecha Caducidad",
        "Area de Afeccion",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        NOM_PROV: "Provincia",
        Decreto: "Nª Decreto",
        "Link Decreto": "Acceso al Decreto",
        Estado: "Estado",
        "Fecha Caducidad": "Fecha de Caducidad",
        "Area de Afeccion": "Area de Afeccion",
        Descripcion: "Descripcion",
        "Origen Data": "Origen del Dato",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#000000", // Color del borde
        weight: 1, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0.3, // Transparencia del relleno
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

export default aguaConfig;
