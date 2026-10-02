/**
 * Configuración global de alias para valores de leyenda
 * Útil para valores que se repiten en múltiples capas y dimensiones
 */
const leyendaAliasesGlobales = {
  // ===== REGIONES =====
  3: "Comunas",
  Atacama: "Región de Atacama",

  // ===== LÍMITES ADMINISTRATIVOS =====
  REGION: "Límite Regional",
  PROVINCIA: "Límite Provincial",
  COMUNA: "Límite Comunal",

  // ===== ESTADOS COMUNES =====
  OPERANDO: "En Operación",
  OPERACION: "En Operación",
  EN_CONSTRUCCION: "En Construcción",
  CONSTRUCCION: "En Construcción",
  PROYECTO: "En Proyecto",
  PLANIFICADO: "Planificado",
  CERRADO: "Cerrado/Inactivo",
  ABANDONO: "En Abandono",

  // ===== TENSIONES ELÉCTRICAS =====
  500: "500 kV (Alta Tensión)",
  220: "220 kV (Media-Alta Tensión)",
  110: "110 kV (Media Tensión)",
  23: "23 kV (Media-Baja Tensión)",
  "<=1 kV": "Menor o igual a 1 kV",
  ">1 kV y <15 kV": "Entre 1 kV y 15 kV",
  "15 kV": "15 kV (Media Tensión)",
  NULL: "Tensión no especificada",

  // ===== TIPOS DE ENERGÍA =====
  EOLICO: "Energía Eólica",
  FOTOVOLTAICO: "Energía Solar Fotovoltaica",
  TERMOELECTRICA: "Energía Termoeléctrica",
  "HIDRAULICA PASADA": "Energía Hidroeléctrica de Pasada",

  // ===== TIPOS DE AGUA/HIDROLOGÍA =====
  PERMANENTE: "Cauce Permanente",
  TEMPORAL: "Cauce Temporal",
  INTERMITENTE: "Cauce Intermitente",
  EMBALSE: "Embalse",
  LAGO: "Lago",
  LAGUNA: "Laguna",

  // ===== TIPOS DE ASENTAMIENTOS =====
  Asentamiento: "Localidad/Asentamiento",
  URBANO: "Área Urbana",
  RURAL: "Área Rural",

  // ===== TIPOS DE USO DE SUELO =====
  AGRICOLA: "Uso Agrícola",
  FORESTAL: "Uso Forestal",
  MINERO: "Uso Minero",
  INDUSTRIAL: "Uso Industrial",
  RESIDENCIAL: "Uso Residencial",

  // ===== OTROS VALORES COMUNES =====
  SI: "Sí",
  NO: "No",
  PUBLICO: "Público",
  PRIVADO: "Privado",
};

export default leyendaAliasesGlobales;
