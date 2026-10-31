const EMPTY_GEOJSON = "data:application/json,%7B%22type%22:%22FeatureCollection%22,%22features%22:%5B%5D%7D";

const LIVE_LAYERS = [
  { id: "estacion_temp_avg",   variable: "temp_avg",   label: "Temperatura actual" },
  { id: "estacion_temp_max",   variable: "temp_max",   label: "Temperatura máxima" },
  { id: "estacion_temp_min",   variable: "temp_min",   label: "Temperatura mínima" },
  { id: "estacion_humedad",    variable: "humedad",    label: "Humedad" },
  { id: "estacion_radiacion",  variable: "radiacion",  label: "Radiación solar" },
  { id: "estacion_precip",     variable: "precip",     label: "Precipitación" },
  { id: "estacion_viento_vel", variable: "viento_vel", label: "Velocidad del viento" },
  { id: "estacion_viento_dir", variable: "viento_dir", label: "Dirección del viento" },
  { id: "estacion_uvb_max",    variable: "uvb_max",    label: "Índice UVB" },
  { id: "estacion_presion",    variable: "presion",    label: "Presión atmosférica" },
];

const HISTORICAL_LAYERS = [
  { id: "estacion_temp_min_diaria",    variable: "temp_min_diaria",    label: "Temperatura mínima del día" },
  { id: "estacion_temp_max_diaria",    variable: "temp_max_diaria",    label: "Temperatura máxima del día" },
  { id: "estacion_temp_media_diaria",  variable: "temp_media_diaria",  label: "Temperatura media del día" },
  { id: "estacion_temp_media_mensual", variable: "temp_media_mensual", label: "Temperatura media del mes" },
  { id: "estacion_precip_diaria",      variable: "precip_diaria",      label: "Precipitación acumulada del día" },
  { id: "estacion_precip_mensual",     variable: "precip_mensual",     label: "Precipitación acumulada del mes" },
  { id: "estacion_precip_max_anual",   variable: "precip_max_anual",   label: "Precipitación máxima 24h del año" },
];

const CALIDAD_VARIABLES = [
  "calidad_aluminio_total", "calidad_arsenico_total", "calidad_bicarbonato", "calidad_boro",
  "calidad_cadmio_total", "calidad_calcio_disuelto", "calidad_calcio_total", "calidad_carbonato",
  "calidad_cloruro", "calidad_cobalto_total", "calidad_cobre_total", "calidad_conductividad_especifica",
  "calidad_cromo_hexavalente_disuelto", "calidad_cromo_hexavalente_total", "calidad_demanda_quimica_de_oxigeno",
  "calidad_fierro_total", "calidad_fosfato", "calidad_fosforo_total", "calidad_litio_disuelto",
  "calidad_magnesio_disuelto", "calidad_magnesio_total", "calidad_manganeso_total", "calidad_mercurio_disuelto",
  "calidad_mercurio_total", "calidad_molibdeno_disuelto", "calidad_niquel_total", "calidad_nitrato",
  "calidad_nitrito", "calidad_nitrogeno_amoniacal", "calidad_oxigeno_disuelto", "calidad_ph",
  "calidad_plata_total", "calidad_plomo_total", "calidad_potasio_disuelto", "calidad_potasio_total",
  "calidad_razon_de_absorcion_de_sodio_ras", "calidad_selenio_disuelto", "calidad_selenio_total",
  "calidad_silice", "calidad_sodio_disuelto", "calidad_sodio_total", "calidad_sulfato",
  "calidad_temperatura_del_agua", "calidad_zinc_total"
];

const climaConfig = {
  capas: [
    "zonas_climaticas",
    "limite_comunal_linea",
    "toponimia",
    ...LIVE_LAYERS.map(l => l.id),
    ...HISTORICAL_LAYERS.map(l => l.id),
    "estacion_calidad_agua",
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
    estaciones_en_vivo: {
      nombre: "Estaciones en vivo",
      capas: LIVE_LAYERS.map(l => l.id),
    },
    estaciones_historicas: {
      nombre: "Estaciones históricas (DGA)",
      capas: [
        ...HISTORICAL_LAYERS.map(l => l.id),
        "estacion_calidad_agua",
      ],
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
      colores: { BSk: "#dda853", "BSk (s)": "#985b00", "BSk (s) (i)": "#ffb13b", "BSk (w)": "#be8125", BWh: "#d84c2a", "BWh (s)": "#af0508", BWk: "#ff5558", "Bwk (s)": "#ffd1d2", EF: "#2973b2", "EF (s)": "#6fbeff", "EF (w)": "#6fbeff", ET: "#a0cf59", "ET (s)": "#7cff01", "ET (w)": "#4c8b11" },
      popupCampos: ["DENOMINACI", "KOPPEN_FIN", "PP_MM", "TMED", "ALT_MIN", "ALT_MAX", "Descripcion", "Origen Data"],
      alias: { DENOMINACI: "Clima", KOPPEN_FIN: "Codigo", PP_MM: "Precipitacion Promedio en mm", TMED: "Temperatura Promedio en ºC", ALT_MIN: "Altura Minima msnm", ALT_MAX: "Altura Maxima msnm", Descripcion: "Descripcion", "Origen Data": "Origen Data" },
      estiloBase: { color: "#2d3436", weight: 2, fillOpacity: 0.4 },
    },
    limite_comunal_linea: {
      url: "limite_comunal_linea.geojson",
      type: "line",
      nombrePersonalizado: "Limite Comunal",
      atributo: "REGION",
      colores: { 3: "#333644" },
      popupCampos: ["NOM_COMUNA", "NOM_PROVIN", "NOM_REGION"],
      alias: { NOM_COMUNA: "Comuna", NOM_PROVIN: "Provincia", NOM_REGION: "Region" },
      estiloBase: { color: "#2d3436", weight: 2, fillOpacity: 0 },
    },
    toponimia: {
      url: "toponimia.geojson",
      type: "point",
      atributo: "Tipo",
      nombrePersonalizado: "Toponimia",
      iconos: { Asentamiento: "localidad.png" },
      estiloAlternativo: { color: "#FF6B6B", fillColor: "#FF6B6B", radius: 4, weight: 1, fillOpacity: 0.8 },
      popupCampos: ["Nombre"],
      alias: { Nombre: "Nombre" },
      etiquetas: { campo: "Nombre", estilo: { color: "#000000", fontSize: "9px", fontFamily: "Arial, sans-serif", bufferColor: "#88304E", bufferWidth: 0.3, offsetY: -20 } },
    },
  },
  leyenda: {},
};

// Generar estilos de capas en vivo
LIVE_LAYERS.forEach(l => {
  climaConfig.estilo[l.id] = {
    url: EMPTY_GEOJSON,
    type: "point",
    nombrePersonalizado: l.label,
    variable: l.variable,
    estado: "online",
    isHistorical: false,
  };
});

// Generar estilos de capas históricas
HISTORICAL_LAYERS.forEach(l => {
  climaConfig.estilo[l.id] = {
    url: EMPTY_GEOJSON,
    type: "point",
    nombrePersonalizado: l.label,
    variable: l.variable,
    estado: "historica",
    isHistorical: true,
  };
});

// Estilo de calidad del agua (con selector)
climaConfig.estilo["estacion_calidad_agua"] = {
  url: EMPTY_GEOJSON,
  type: "point",
  nombrePersonalizado: "Calidad del agua",
  variable: "calidad_arsenico_total",
  estado: "historica",
  isHistorical: true,
  selectorVariables: {
    default: "calidad_arsenico_total",
    opciones: CALIDAD_VARIABLES.map(v => ({
      valor: v,
      label: v.replace(/^calidad_/, "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    }))
  }
};

export default climaConfig;