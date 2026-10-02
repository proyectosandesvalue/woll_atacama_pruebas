const mineriaConfig = {
  capas: [
    "sonami_mapa_minero",
    "yacimientos",
    "relaves_mineros_sernageomin",
    "plantas_desaladoras_puntos",
    "desaladoras_acueductos",
    "red_ferroviaria",
    "puertos",
    "distritos_mineros",
    "limite_comunal_linea",
    "toponimia",
  ],
  cargaInicial: {
    grupos: ["instalaciones", "infraestructura"],
    capas: ["limite_comunal_linea"],
    // Grupos que se cargan al activar la dimensión
    // O también puedes especificar capas individuales si no usas grupos:
    // capas: ["energia_linea_transmision", "subestaciones"]
    // Escenario 3: Sin cargaInicial = carga todo (backward compatible)
    // No defines la propiedad cargaInicial
  },
  grupos: {
    yacimientos: {
      nombre: "Yacimientos",
      capas: ["yacimientos"],
    },
    instalaciones: {
      nombre: "Instalaciones Mineras",
      capas: [
        "sonami_mapa_minero",
        "relaves_mineros_sernageomin",
        "distritos_mineros",
      ],
    },
    infraestructura: {
      nombre: "Infraestructura de Soporte",
      capas: [
        "puertos",
        "red_ferroviaria",
        "plantas_desaladoras_puntos",
        "desaladoras_acueductos",
      ],
    },
    contexto: {
      nombre: "Territorio",
      capas: ["limite_comunal_linea", "toponimia"],
    },
  },
  estilo: {
    sonami_mapa_minero: {
      url: "sonami_mapa_minero.geojson",
      type: "point", // Tipo de capa: point, line, polygon
      nombrePersonalizado: "Instalaciones Mediana y Gran Mineria", // Nombre personalizado de la Capa
      atributo: "Tipo Mineral", // Asegúrate de que este atributo exista en tu GeoJSON
      iconos: {
        "Mineria no Metalica": "mina_mineria_no_metalica.png",
        Cobre: "mina_cobre.png",
        Oro: "mina_oro.png",
        "Mineria Metalica": "mina_mineria_metalica.png",
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
        "Mineral",
        "Tipo Mineral",
        "Tipo",
        "Estado",
        "Compañia",
        "Sitio WEB",
        "Nota",
        "Descripcion",
        "Origen del Dato",
      ],
      alias: {
        Nombre: "Nombre de la Instalación",
        Mineral: "Mineral",
        "Tipo Mineral": "Tipo",
        Tipo: "Instalacion",
        Estado: "Estado",
        Compañia: "Operador",
        "Sitio WEB": "Sitio Web",
        Nota: "Nota",
        Descripcion: "Descripcion",
        "Origen del Dato": "Origen del Dato",
      },
      // Definir colores por valor del atributo si es necesario
      colores: {
        Inactivo: "#FF6B6B",
        Activo: "#4ECDC4",
        Abandonado: "#C7F464",
      },
    },
    relaves_mineros_sernageomin: {
      url: "relaves_mineros_sernageomin.geojson",
      type: "point", // Tipo de capa: point, line, polygon
      atributo: "ESTADO_INS", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Relaves Mineros", // Nombre personalizado de la Capa
      iconos: {
        INACTIVO: "Relave_inactivo.png",
        ACTIVO: "Relave_activo.png",
        ABANDONADO: "Relave_Abandonado.png",
        "EN CONSTRUCCION": "relaves_construccion.png",
      },
      estiloAlternativo: {
        color: "#FF6B6B", // Color del borde del punto
        fillColor: "#FF6B6B", // Color de relleno del punto
        radius: 5, // Radio del punto
        weight: 1, // Grosor del borde del punto
        fillOpacity: 0.8, // Transparencia del relleno del punto
      },
      popupCampos: [
        "NOMBRE_INS",
        "NOMBRE_EMP",
        "COMUNA_INS",
        "NOMBRE_FAE",
        "TIPO_INSTA",
        "RECOBRERSO",
        "ESTADO_INS",
        "VOL_AUTORIZADO",
        "TON_AUTORIZADO",
        "Descripcion",
        "Origen Dato",
        "Ultima Actualizacion Dato",
      ],
      alias: {
        NOMBRE_INS: "Nombre Instalación",
        NOMBRE_EMP: "Nombre Empresa",
        COMUNA_INS: "Comuna",
        NOMBRE_FAE: "Nombre de la Faena",
        TIPO_INSTA: "Tipo Instalación",
        RECOBRERSO: "Recobrerso",
        ESTADO_INS: "Estado de la Instalación",
        VOL_AUTORIZADO: "Volumen Autorizado",
        TON_AUTORIZADO: "Toneladas Autorizadas",
        Descripcion: "Descripcion",
        "Origen Dato": "Origen del Dato",
        "Ultima Actualizacion Dato": "Ultima Actualizacion del Dato",
      },
      // Definir colores por valor del atributo si es necesario
      colores: {
        Inactivo: "#FF6B6B",
        Activo: "#4ECDC4",
        Abandonado: "#C7F464",
      },
    },
    yacimientos: {
      url: "yacimientos.geojson",
      type: "point", // Tipo de capa: point, line, polygon
      atributo: "GRUPO_RECU", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Yacimientos Minerales", // Nombre personalizado de la Capa
      iconos: {
        Ag: "ag.png",
        "Ag-(Au)": "ag_au.png",
        "Ag-(Cu)": "au_cu.png",
        " ": "sin_valor.png",
        "Ag-(Fe, Au, Cu)": "au_fe_au_cu.png",
        "Ag, Au": "ag_au_2.png",
        "Ag, Au-(Cu)": "ag_au_cu.png",
        "Ag, Au-(Pb, Zn, Cu)": "ag_au_pb_zn_cu.png",
        "Ag, Au, Cu": "ag_au_cu2.png",
        "Ag, Cu": "ag_cu2.png",
        "Ag, Cu-(Au, Pb, Zn)": "ag_cu_au_pb_zn.png",
        "Ag, Cu-(Co)": "ag_cu_co.png",
        "Ag, Pb": "ag_pb.png",
        Arcillas: "arcillas.png",
        Áridos: "aridos.png",
        Au: "au.png",
        "Au, Ag": "au_ag.png",
        "Au-(Ag, Co, Mo)": "au_ag_co_mo.png",
        "Au-(Ag, Cu, Pb, Zn)": "au_ag_cu_pb_zn.png",
        "Au-(Ag, Cu)": "au_ag_cu.png",
        "Au-(Ag, Pb, Cu)": "au_ag_pb_cu.png",
        "Au-(Ag, Pb, Zn)": "au_ag_pb_zn.png",
        "Au-(Ag, Pb)": "au_ag_pb.png",
        "Au-(Ag)": "au_ag2.png",
        "Au-(Cu, Ag, Zn)": "au_cu_ag_zn.png",
        "Au-(Cu)": "au_cu2.png",
        "Au-(Cu, Ag)": "au_cu_ag3.png",
        "Au-(Cu, Fe)": "au_cu_fe2.png",
        "Au-(Cu, Pb, Zn, Ag)": "au_cu_pb_zn_ag.png",
        "Au-(Cu, Pb)": "au_cu_pb.png",
        "Au-(Cu, Zn)": "au_cu_zn.png",
        "Au-(Fe, Cu)": "au_fe_cu.png",
        "Au-(Fe)": "au_fe.png",
        "Au-(Pb)": "au_pb.png",
        "Au-(Zn, Ag)": "au_zn_ag.png",
        "Au, Ag-(Cu)": "au_ag_cu.png",
        "Au, Ag-(Pb, Zn)": "au_ag_pb_zn.png",
        "Au, Cu": "au_cu.png",
        "Au, Cu-(Ag)": "au_cu_ag2.png",
        "Au, Cu-(Fe)": "au_cu_fe.png",
        "Au, Cu-(Mo)": "au_cu_mo.png",
        "Au, Cu, Ag": "au_cu_ag.png",
        "Au, Fe-(Cu)": "au_fe_cu2.png",
        Azufre: "azufre.png",
        Baritina: "baritina.png",
        "Carbonatos de Calcio": "carbonato.png",
        Co: "co.png",
        "Co, Ag": "co_ag.png",
        "Co, Au": "co_au.png",
        "Co, Cu": "co_cu.png",
        "Compuestos de Boro": "compuesto_boro.png",
        Cu: "cu.png",
        "Cu-(Ag)": "cu_ag2.png",
        "Cu-(Ag, Au, Pb, Zn)": "cu_ag_au_pb_zn.png",
        "Cu-(Ag, Au, Pb)": "cu_au_fe.png",
        "Cu-(Ag, Au)": "cu_au_pb_zn.png",
        "Cu-(Ag, Co)": "cu_au_pb_zn2.png",
        "Cu-(Ag, Pb, Zn)": "cu_ag_pb_zn.png",
        "Cu-(Ag, Zn)": "cu_ag_zn.png",
        "Cu-(Au)": "cu_au2.png",
        "Cu-(Au, Ag)": "cu_au_ag2.png",
        "Cu-(Au, Fe)": "cu_au_fe3.png",
        "Cu-(Au, Ag, Pb, Zn)": "cu_au_ag_pb_zn.png",
        "Cu-(Au, Ag, Pb)": "cu_au_ag_pb.png",
        "Cu-(Au, Mo)": "cu_au_mo.png",
        "Cu-(Au, Pb, Zn, Ag)": "cu_au_pb_zn_ag.png",
        "Cu-(Au, W)": "cu_au_w.png",
        "Cu-(Co)": "cu_co.png",
        "Cu-(Fe)": "cu_fe2.png",
        "Cu-(Fe, Au)": "cu_fe_au.png",
        "Cu-(Mo, Pb, Zn)": "cu_mo_pb_zn.png",
        "Cu-(Mo)": "cu_mo.png",
        "Cu-(Pb, Ag)": "cu_pb_ag.png",
        "Cu-(V)": "cu_v.png",
        "Cu-(W)": "cu_w.png",
        "Cu-(Zn)": "cu_zn.png",
        "Cu, Ag": "cu_ag.png",
        "Cu, Ag-(Au, Pb, Zn)": "cu_ag_au2.png",
        "Cu, Ag-(Au)": "cu_ag_au.png",
        "Cu, Ag-(Pb, Au)": "cu_ag_fe_pb.png",
        "Cu, Ag-(Pb, Zn)": "cu_ag_pb_zn2.png",
        "Cu, Au": "cu_au.png",
        "Cu, Au-(Ag, Pb, Zn)": "cu_au2.png",
        "Cu, Au-(Ag)": "cu_ag_fe.png",
        "Cu, Au-(Fe)": "cu_au_fe2.png",
        "Cu, Au, Ag": "cu_au_ag.png",
        "Cu, Au, Pb": "cu_au_pb.png",
        "Cu, Fe": "cu_fe.png",
        "Cu, Co": "cu_co2.png",
        "Cu, Co-(Au)": "cu_co_au.png",
        "Cu, Co, U": "cu_co_u.png",
        "Cu, Fe": "cu_fe3.png",
        "Cu, Fe-(Au, Ag)": "cu_fe_au_ag.png",
        "Cu, Fe-(Au)": "cu_fe_au2.png",
        "Cu, Fe, Au": "Cu_fe_au3",
        "Cu, Hg": "cu_hg.png",
        "Cu, Mo": "cu_mo.png",
        "Cu, W": "cu_w2",
        Diatomita: "diatomita.png",
        Dolomita: "dolomita.png",
        Fe: "fe.png",
        "Fe-(Au, Cu)": "fe_au_cu.png",
        "Fe-(Au)": "fe_au2.png",
        "Fe-(Cu, Au)": "fe_cu_au.png",
        "Fe-(Cu)": "fe_cu2.png",
        "Fe, Au": "fe_au.png",
        "Fe, Cu": "fe_cu.png",
        "Fe, Cu, Au": "fe_cu_au.png",
        "Fe, Cu-(Au)": "fe_cu_au2.png",
        "Fe, Cu, Au-(Co)": "fe_cu_au_co.png",
        Hg: "hg.png",
        Mn: "mn.png",
        Mo: "mo.png",
        "No especificado": "sin_valor.png",
        Pb: "pb.png",
        "Pb-(Au)": "pb_au.png",
        "Pb, Ag": "pb_ag.png",
        "Pb, Ag, Cu": "pb_ag_cu.png",
        "Pb, Zn": "pb_zn.png",
        "Pb, Zn-(Ag, Cu, Au)": "pb_za_ag_cu_au.png",
        "Pb, Zn-(Ag, Cu)": "pb_zn_ag_cu.png",
        "Pb, Zn-(Cu, Ag)": "pb_zn_cu_ag.png",
        Pirofilita: "pirofilita.png",
        Pumicita: "pumicita.png",
        "Recursos Silíceos": "recursos_siliceos.png",
        "Rocas Fosfóricas": "rocas_fosforicas.png",
        "Rocas Ornamentales": "rocas_ornamentales.png",
        Ti: "ti.png",
        "W, Au, Pb": "w_au_pb.png",
        Yeso: "yeso.png",
      },
      estiloAlternativo: {
        color: "#FF6B6B", // Color del borde del punto
        fillColor: "#FF6B6B", // Color de relleno del punto
        radius: 5, // Radio del punto
        weight: 1, // Grosor del borde del punto
        fillOpacity: 0.8, // Transparencia del relleno del punto
      },
      popupCampos: [
        "GRUPO_RECU",
        "TIPO_RECURSO",
        "COMUNA",
        "NOMBRE",
        "ID_YACIMIE",
        "TAMANO_YAC",
        "ACTIVIDAD_",
        "PROPIETARI",
        "ACCESIBILI",
        "URL_PDF",
        "Descripcion",
        "Origen Data",
        "Ultima Actualizacion",
      ],
      alias: {
        GRUPO_RECU: "Recurso",
        TIPO_RECURSO: "Tipo de Recurso",
        COMUNA: "Comuna",
        ID_YACIMIE: "Codigo del Yacimiento",
        NOMBRE: "Nombre del Yacimiento",
        TAMANO_YAC: "Tamaño del Yacimiento",
        ACTIVIDAD_: "Actividad",
        PROPIETARI: "Propietario",
        ACCESIBILI: "Accesibilidad",
        URL_PDF: "Informacion del Yacimiento",
        Descripcion: "Descripcion",
        "Origen Data": "Origen del Dato",
        "Ultima Actualizacion": "Ultima Actualizacion del Dato",
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
        Tuberia: "#008eecff",
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
        color: "#008eecff", // Color del borde
        weight: 2, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0, // Transparencia del relleno
      },
    },
    red_ferroviaria: {
      url: "red_ferroviaria.geojson",
      type: "line",
      nombrePersonalizado: "Red Ferroviaria",
      atributo: "Cod Region",
      colores: {
        3: "#333644",
      },
      popupCampos: [
        "OBEJTO",
        "Provincia",
        "Largo en Km",
        "Actividad en 2026",
        "Descripcion",
        "Origen Data",
      ],
      alias: {
        OBEJTO: "Nombre",
        Provincia: "Provincia",
        "Largo en Km": "Largo de la Via en Km",
        "Actividad en 2026": "¿Actividad en el 2026?",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#2d3436", // Color del borde
        weight: 2, // Grosor del borde
        // Opacity: sirve para darle transparencia a las lineas
        fillOpacity: 0, // Transparencia del relleno
      },
    },
    puertos: {
      url: "puertos.geojson",
      type: "point", // Tipo de capa: point, line, polygon
      atributo: "region", // Asegúrate de que este atributo exista en tu GeoJSON
      nombrePersonalizado: "Puertos", // Nombre personalizado de la Capa
      iconos: {
        3: "Infraestructura_dop.png",
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
        "Descripcion",
        "Propietario",
        "Sitio Web",
        "Tipo",
        "Minas Asociadas",
        "Numero Muelles",
        "Decreto Direcmar",
        "Nota",
        "Origen Dato",
      ],
      alias: {
        Nombre: "Nombre del Puerto",
        Propietario: "Propietario/Administrador",
        "Sitio Web": "Web",
        Tipo: "Tipo de Puerto",
        "Minas Asociadas": "Minas Asociadas",
        "Numero de Muelles": "Numero de Muelles",
        "Decreto Direcmar": "Decreto Aprobacion Direcmar",
        Descripcion: "Descripcion",
        Nota: "Descripcion",
        "Origen Dato": "Origen de la Informacion",
      },
      // Definir colores por valor del atributo si es necesario
      colores: {
        Inactivo: "#FF6B6B",
        Activo: "#4ECDC4",
        Abandonado: "#C7F464",
      },
    },
    distritos_mineros: {
      url: "distritos_mineros.geojson",
      type: "polygon", // Tipo de capa: point, line, polygon
      nombrePersonalizado: "Distritos Mineros", // Nombre personalizado de la CapaMU
      atributo: "Region",
      colores: {
        Atacama: "#ec5628ff",
      },
      popupCampos: [
        "Nombre",
        "Descripcion",
        "Superficie en KM",
        "Creador Dato",
        "Origen Data",
      ],
      alias: {
        Nombre: "Nombre del Distrito",
        Descripcion: "Descripcion",
        "Superficie en KM": "Sup. Total en Km",
        "Creador Dato": "Creador del Dato",
        "Origen Data": "Origen de la Informacion",
      },
      // Personalizar el color del borde y la transparencia
      estiloBase: {
        color: "#f31010ff", // Color del borde
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
        color: "#ff7f00", // Color del borde
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

export default mineriaConfig;
