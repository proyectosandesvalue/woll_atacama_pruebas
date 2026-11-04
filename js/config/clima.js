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

// ═══════════════════════════════════════════════════════════════
// FACTORY para capas ARClim
// ═══════════════════════════════════════════════════════════════
function createArclimLayer({
  id, indicatorId, label, description, unit,
  seasons = ["annual"],
  deltaType = "abs",
  scales, colores,
}) {
  const deltaUnit = deltaType === "rel" ? "%" : unit;
  
  const seasonLabels = { annual: "Anual", summer: "Verano (Oct-Mar)", winter: "Invierno (Abr-Sep)" };
  
  return {
    id,
    url: `/api/arclim-geojson?indicator=${indicatorId}&seasons=${seasons.join(",")}`,
    type: "polygon",
    nombrePersonalizado: label,
    descripcion: description,
    indicatorId,
    unit,
    deltaType,
    deltaUnit,
    seasonOptions: seasons.map(s => ({ value: s, label: seasonLabels[s] || s })),
    defaultSeason: "annual",
    scenarioOptions: [
      { key: "present",       label: "Histórico (1980-2010)" },
      { key: "future$ssp245", label: "Futuro SSP2-4.5" },
      { key: "future$ssp585", label: "Futuro SSP5-8.5" },
      { key: "delta$ssp245",  label: "Cambio SSP2-4.5" },
      { key: "delta$ssp585",  label: "Cambio SSP5-8.5" },
    ],
    defaultScenario: "future$ssp245",
    scenarioDescriptions: {
      "present":       "Línea base histórica. Datos observados y simulados para el período de referencia 1980-2010.",
      "future$ssp245": "Escenario SSP2-4.5 (RCP4.5): Trayectoria intermedia. Emisiones moderadas que se estabilizan a mediados de siglo. Proyecta un aumento global de ~2.7°C hacia 2100. Período futuro: 2035-2065.",
      "future$ssp585": "Escenario SSP5-8.5 (RCP8.5): Trayectoria de altas emisiones. Fuerte dependencia de combustibles fósiles. Proyecta un aumento global de ~4.4°C hacia 2100. Período futuro: 2035-2065.",
      "delta$ssp245":  "Cambio climático (amenaza) respecto al histórico bajo el escenario intermedio SSP2-4.5. Cuantifica la ocurrencia de condiciones potencialmente adversas.",
      "delta$ssp585":  "Cambio climático (amenaza) respecto al histórico bajo el escenario más pesimista SSP5-8.5. Cuantifica la ocurrencia de condiciones potencialmente adversas.",
    },
    scales,
    coloresByType: colores,
    choropleth: { field: null, scale: null },
    popupCampos: ["NOM_COMUNA"],
    alias: { NOM_COMUNA: "Comuna" },
    estiloBase: { color: "#ffffff", weight: 1, fillOpacity: 0.8 },
  };
}

// ═══════════════════════════════════════════════════════════════
// DEFINICIÓN DE LAS 21 CAPAS ARClim
// ═══════════════════════════════════════════════════════════════

// ── Grupo 1: Olas de Calor (5) ──
const ARCLIM_OLAS_CALOR = [
  createArclimLayer({
    id: "arclim_hot_days",
    indicatorId: "hot_days",
    label: "Días Calurosos (>30°C)",
    description: "Número de días en que la temperatura máxima supera los 30°C.",
    unit: "días",
    seasons: ["annual", "summer"],
    deltaType: "abs",
    scales: {
      absolute: [ { value: 0, color: "#ffffcc" }, { value: 5, color: "#ffeda0" }, { value: 10, color: "#feb24c" }, { value: 20, color: "#f03b20" }, { value: 40, color: "#bd0026" }, { value: 60, color: "#800026" } ],
      delta:    [ { value: -10, color: "#2166ac" }, { value: 0, color: "#f7f7f7" }, { value: 5, color: "#ef8a62" }, { value: 10, color: "#b2182b" }, { value: 20, color: "#67001f" } ],
    },
    colores: {
      absolute: { "0-5 días": "#ffffcc", "5-10 días": "#ffeda0", "10-20 días": "#feb24c", "20-40 días": "#f03b20", "40-60 días": "#bd0026", "+60 días": "#800026" },
      delta:    { "Disminuye": "#2166ac", "Sin cambio": "#f7f7f7", "+5 días": "#ef8a62", "+10 días": "#b2182b", "+20 días": "#67001f" },
    },
  }),
  createArclimLayer({
    id: "arclim_consecutive_days_over_30C",
    indicatorId: "consecutive_days_over_30C",
    label: "Olas de Calor (>30°C, 3+ días)",
    description: "Número de días con Tmax > 30°C durante 3 o más días seguidos.",
    unit: "días",
    seasons: ["annual"],
    deltaType: "abs",
    scales: {
      absolute: [ { value: 0, color: "#ffffcc" }, { value: 5, color: "#ffeda0" }, { value: 15, color: "#feb24c" }, { value: 30, color: "#f03b20" }, { value: 60, color: "#800026" } ],
      delta:    [ { value: -20, color: "#2166ac" }, { value: 0, color: "#f7f7f7" }, { value: 10, color: "#ef8a62" }, { value: 30, color: "#b2182b" } ],
    },
    colores: {
      absolute: { "0-5 días": "#ffffcc", "5-15 días": "#ffeda0", "15-30 días": "#feb24c", "30-60 días": "#f03b20", "+60 días": "#800026" },
      delta:    { "Disminuye": "#2166ac", "Sin cambio": "#f7f7f7", "+10 días": "#ef8a62", "+30 días": "#b2182b" },
    },
  }),
  createArclimLayer({
    id: "arclim_very_hot_days",
    indicatorId: "very_hot_days",
    label: "Días Muy Calurosos (>34°C)",
    description: "Número de días en que la temperatura supera los 34°C.",
    unit: "días",
    seasons: ["annual", "summer"],
    deltaType: "abs",
    scales: {
      absolute: [ { value: 0, color: "#ffffcc" }, { value: 2, color: "#ffeda0" }, { value: 5, color: "#feb24c" }, { value: 10, color: "#f03b20" }, { value: 20, color: "#800026" } ],
      delta:    [ { value: -5, color: "#2166ac" }, { value: 0, color: "#f7f7f7" }, { value: 3, color: "#ef8a62" }, { value: 8, color: "#b2182b" } ],
    },
    colores: {
      absolute: { "0-2 días": "#ffffcc", "2-5 días": "#ffeda0", "5-10 días": "#feb24c", "10-20 días": "#f03b20", "+20 días": "#800026" },
      delta:    { "Disminuye": "#2166ac", "Sin cambio": "#f7f7f7", "+3 días": "#ef8a62", "+8 días": "#b2182b" },
    },
  }),
  createArclimLayer({
    id: "arclim_tropical_nights",
    indicatorId: "tropical_nights",
    label: "Noches Tropicales (Tmin >20°C)",
    description: "Número de días en que la temperatura mínima supera los 20°C.",
    unit: "días",
    seasons: ["annual", "summer"],
    deltaType: "abs",
    scales: {
      absolute: [ { value: 0, color: "#ffffcc" }, { value: 5, color: "#ffeda0" }, { value: 15, color: "#feb24c" }, { value: 30, color: "#f03b20" }, { value: 60, color: "#800026" } ],
      delta:    [ { value: -10, color: "#2166ac" }, { value: 0, color: "#f7f7f7" }, { value: 5, color: "#ef8a62" }, { value: 15, color: "#b2182b" } ],
    },
    colores: {
      absolute: { "0-5 días": "#ffffcc", "5-15 días": "#ffeda0", "15-30 días": "#feb24c", "30-60 días": "#f03b20", "+60 días": "#800026" },
      delta:    { "Disminuye": "#2166ac", "Sin cambio": "#f7f7f7", "+5 días": "#ef8a62", "+15 días": "#b2182b" },
    },
  }),
  createArclimLayer({
    id: "arclim_ola_calor_compuesto_dmc",
    indicatorId: "ola_calor_compuesto_dmc",
    label: "Olas de Calor Compuestas (DMC)",
    description: "Olas de calor considerando Tmax y Tmin: días con ambos bajo el percentil 10 por 3+ días.",
    unit: "días",
    seasons: ["annual"],
    deltaType: "abs",
    scales: {
      absolute: [ { value: 0, color: "#ffffcc" }, { value: 2, color: "#ffeda0" }, { value: 5, color: "#feb24c" }, { value: 10, color: "#f03b20" }, { value: 20, color: "#800026" } ],
      delta:    [ { value: -5, color: "#2166ac" }, { value: 0, color: "#f7f7f7" }, { value: 2, color: "#ef8a62" }, { value: 5, color: "#b2182b" } ],
    },
    colores: {
      absolute: { "0-2 días": "#ffffcc", "2-5 días": "#ffeda0", "5-10 días": "#feb24c", "10-20 días": "#f03b20", "+20 días": "#800026" },
      delta:    { "Disminuye": "#2166ac", "Sin cambio": "#f7f7f7", "+2 días": "#ef8a62", "+5 días": "#b2182b" },
    },
  }),
];

// ── Grupo 2: Temperaturas (6) ──
const ARCLIM_TEMPERATURAS = [
  createArclimLayer({
    id: "arclim_tasmax",
    indicatorId: "tasmax_mean",
    label: "Temperatura Máxima Media",
    description: "Promedio de la temperatura máxima diaria.",
    unit: "°C",
    seasons: ["annual", "summer", "winter"],
    deltaType: "abs",
    scales: {
      absolute: [ { value: 5, color: "#313695" }, { value: 12, color: "#74add1" }, { value: 18, color: "#ffffbf" }, { value: 24, color: "#f46d43" }, { value: 30, color: "#a50026" }, { value: 36, color: "#660018" } ],
      delta:    [ { value: -2, color: "#2166ac" }, { value: 0, color: "#f7f7f7" }, { value: 1, color: "#ef8a62" }, { value: 2, color: "#b2182b" }, { value: 4, color: "#67001f" } ],
    },
    colores: {
      absolute: { "5-12°C": "#313695", "12-18°C": "#74add1", "18-24°C": "#ffffbf", "24-30°C": "#f46d43", "30-36°C": "#a50026", "+36°C": "#660018" },
      delta:    { "Disminuye": "#2166ac", "Sin cambio": "#f7f7f7", "+1°C": "#ef8a62", "+2°C": "#b2182b", "+4°C": "#67001f" },
    },
  }),
  createArclimLayer({
    id: "arclim_tasmin",
    indicatorId: "tasmin_mean",
    label: "Temperatura Mínima Media",
    description: "Promedio de la temperatura mínima diaria.",
    unit: "°C",
    seasons: ["annual", "summer", "winter"],
    deltaType: "abs",
    scales: {
      absolute: [ { value: -10, color: "#313695" }, { value: -5, color: "#74add1" }, { value: 0, color: "#ffffbf" }, { value: 5, color: "#f46d43" }, { value: 10, color: "#a50026" }, { value: 15, color: "#660018" } ],
      delta:    [ { value: -2, color: "#2166ac" }, { value: 0, color: "#f7f7f7" }, { value: 1, color: "#ef8a62" }, { value: 2, color: "#b2182b" }, { value: 4, color: "#67001f" } ],
    },
    colores: {
      absolute: { "-10 a -5°C": "#313695", "-5 a 0°C": "#74add1", "0 a 5°C": "#ffffbf", "5 a 10°C": "#f46d43", "10 a 15°C": "#a50026", "+15°C": "#660018" },
      delta:    { "Disminuye": "#2166ac", "Sin cambio": "#f7f7f7", "+1°C": "#ef8a62", "+2°C": "#b2182b", "+4°C": "#67001f" },
    },
  }),
  createArclimLayer({
    id: "arclim_mean_temperature",
    indicatorId: "mean_temperature",
    label: "Temperatura Media",
    description: "Valor medio de la temperatura media diaria, calculado como 0.5*(Tmax + Tmin).",
    unit: "°C",
    seasons: ["annual", "summer", "winter"],
    deltaType: "abs",
    scales: {
      absolute: [ { value: 0, color: "#313695" }, { value: 8, color: "#74add1" }, { value: 15, color: "#ffffbf" }, { value: 20, color: "#f46d43" }, { value: 25, color: "#a50026" }, { value: 30, color: "#660018" } ],
      delta:    [ { value: -2, color: "#2166ac" }, { value: 0, color: "#f7f7f7" }, { value: 1, color: "#ef8a62" }, { value: 2, color: "#b2182b" }, { value: 3, color: "#67001f" } ],
    },
    colores: {
      absolute: { "0-8°C": "#313695", "8-15°C": "#74add1", "15-20°C": "#ffffbf", "20-25°C": "#f46d43", "25-30°C": "#a50026", "+30°C": "#660018" },
      delta:    { "Disminuye": "#2166ac", "Sin cambio": "#f7f7f7", "+1°C": "#ef8a62", "+2°C": "#b2182b", "+3°C": "#67001f" },
    },
  }),
  createArclimLayer({
    id: "arclim_daily_temperature_range",
    indicatorId: "daily_temperature_range",
    label: "Amplitud Térmica",
    description: "Valor medio de la amplitud térmica diaria (Tmax - Tmin).",
    unit: "°C",
    seasons: ["annual"],
    deltaType: "abs",
    scales: {
      absolute: [ { value: 5, color: "#313695" }, { value: 10, color: "#74add1" }, { value: 15, color: "#ffffbf" }, { value: 20, color: "#f46d43" }, { value: 25, color: "#a50026" } ],
      delta:    [ { value: -2, color: "#2166ac" }, { value: 0, color: "#f7f7f7" }, { value: 1, color: "#ef8a62" }, { value: 2, color: "#b2182b" } ],
    },
    colores: {
      absolute: { "5-10°C": "#313695", "10-15°C": "#74add1", "15-20°C": "#ffffbf", "20-25°C": "#f46d43", "+25°C": "#a50026" },
      delta:    { "Disminuye": "#2166ac", "Sin cambio": "#f7f7f7", "+1°C": "#ef8a62", "+2°C": "#b2182b" },
    },
  }),
  createArclimLayer({
    id: "arclim_hottest_day",
    indicatorId: "hottest_day",
    label: "Día más Cálido del Año",
    description: "Temperatura (°C) del día más cálido del período considerado.",
    unit: "°C",
    seasons: ["annual", "summer"],
    deltaType: "abs",
    scales: {
      absolute: [ { value: 20, color: "#ffffbf" }, { value: 25, color: "#f46d43" }, { value: 30, color: "#a50026" }, { value: 35, color: "#660018" }, { value: 40, color: "#400010" } ],
      delta:    [ { value: -2, color: "#2166ac" }, { value: 0, color: "#f7f7f7" }, { value: 1, color: "#ef8a62" }, { value: 2, color: "#b2182b" }, { value: 4, color: "#67001f" } ],
    },
    colores: {
      absolute: { "20-25°C": "#ffffbf", "25-30°C": "#f46d43", "30-35°C": "#a50026", "35-40°C": "#660018", "+40°C": "#400010" },
      delta:    { "Disminuye": "#2166ac", "Sin cambio": "#f7f7f7", "+1°C": "#ef8a62", "+2°C": "#b2182b", "+4°C": "#67001f" },
    },
  }),
  createArclimLayer({
    id: "arclim_coldest_night",
    indicatorId: "coldest_night",
    label: "Noche más Fría del Año",
    description: "Temperatura mínima de la noche más fría del período considerado.",
    unit: "°C",
    seasons: ["annual", "winter"],
    deltaType: "abs",
    scales: {
      absolute: [ { value: -15, color: "#313695" }, { value: -10, color: "#74add1" }, { value: -5, color: "#ffffbf" }, { value: 0, color: "#f46d43" }, { value: 5, color: "#a50026" } ],
      delta:    [ { value: -2, color: "#2166ac" }, { value: 0, color: "#f7f7f7" }, { value: 1, color: "#ef8a62" }, { value: 3, color: "#b2182b" } ],
    },
    colores: {
      absolute: { "-15 a -10°C": "#313695", "-10 a -5°C": "#74add1", "-5 a 0°C": "#ffffbf", "0 a 5°C": "#f46d43", "+5°C": "#a50026" },
      delta:    { "Disminuye": "#2166ac", "Sin cambio": "#f7f7f7", "+1°C": "#ef8a62", "+3°C": "#b2182b" },
    },
  }),
];

// ── Grupo 3: Heladas y Frío (4) ──
const ARCLIM_HELADAS = [
  createArclimLayer({
    id: "arclim_frost_days",
    indicatorId: "frost_days",
    label: "Días de Helada",
    description: "Número de días en que la temperatura mínima es inferior a 0°C.",
    unit: "días",
    seasons: ["annual", "winter"],
    deltaType: "abs",
    scales: {
      absolute: [ { value: 0, color: "#f7fcf0" }, { value: 10, color: "#e0f3f8" }, { value: 20, color: "#7bccc4" }, { value: 40, color: "#2b8cbe" }, { value: 60, color: "#084081" }, { value: 100, color: "#00204d" } ],
      delta:    [ { value: -40, color: "#2166ac" }, { value: -20, color: "#67a9cf" }, { value: 0, color: "#f7f7f7" }, { value: 20, color: "#ef8a62" }, { value: 40, color: "#b2182b" } ],
    },
    colores: {
      absolute: { "0-10 días": "#f7fcf0", "10-20 días": "#e0f3f8", "20-40 días": "#7bccc4", "40-60 días": "#2b8cbe", "60-100 días": "#084081", "+100 días": "#00204d" },
      delta:    { "-40 a -20": "#2166ac", "-20 a 0": "#67a9cf", "Sin cambio": "#f7f7f7", "+20 a +40": "#ef8a62", "+40": "#b2182b" },
    },
  }),
  createArclimLayer({
    id: "arclim_frost_days_below_minus_2",
    indicatorId: "frost_days_below_minus_2_degrees",
    label: "Heladas Fuertes (< -2°C)",
    description: "Número de días con temperatura mínima bajo -2°C. Umbral de heladas que queman cultivos.",
    unit: "días",
    seasons: ["annual", "winter"],
    deltaType: "abs",
    scales: {
      absolute: [ { value: 0, color: "#f7fcf0" }, { value: 5, color: "#e0f3f8" }, { value: 10, color: "#7bccc4" }, { value: 20, color: "#2b8cbe" }, { value: 40, color: "#084081" } ],
      delta:    [ { value: -20, color: "#2166ac" }, { value: -10, color: "#67a9cf" }, { value: 0, color: "#f7f7f7" }, { value: 10, color: "#ef8a62" } ],
    },
    colores: {
      absolute: { "0-5 días": "#f7fcf0", "5-10 días": "#e0f3f8", "10-20 días": "#7bccc4", "20-40 días": "#2b8cbe", "+40 días": "#084081" },
      delta:    { "-20 a -10": "#2166ac", "-10 a 0": "#67a9cf", "Sin cambio": "#f7f7f7", "+10": "#ef8a62" },
    },
  }),
  createArclimLayer({
    id: "arclim_ice_days",
    indicatorId: "ice_days",
    label: "Días de Hielo (Tmax <0°C)",
    description: "Número de días en que la temperatura máxima es menor que 0°C.",
    unit: "días",
    seasons: ["annual", "winter"],
    deltaType: "abs",
    scales: {
      absolute: [ { value: 0, color: "#f7fcf0" }, { value: 2, color: "#e0f3f8" }, { value: 5, color: "#7bccc4" }, { value: 10, color: "#2b8cbe" }, { value: 20, color: "#084081" } ],
      delta:    [ { value: -10, color: "#2166ac" }, { value: -5, color: "#67a9cf" }, { value: 0, color: "#f7f7f7" }, { value: 5, color: "#ef8a62" } ],
    },
    colores: {
      absolute: { "0-2 días": "#f7fcf0", "2-5 días": "#e0f3f8", "5-10 días": "#7bccc4", "10-20 días": "#2b8cbe", "+20 días": "#084081" },
      delta:    { "-10 a -5": "#2166ac", "-5 a 0": "#67a9cf", "Sin cambio": "#f7f7f7", "+5": "#ef8a62" },
    },
  }),
  createArclimLayer({
    id: "arclim_cold_spell_duration_index_short",
    indicatorId: "cold_spell_duration_index_short",
    label: "Episodios Fríos (3+ días)",
    description: "Número de días con al menos 3 días consecutivos en que la Tmin no supera el percentil 10.",
    unit: "días",
    seasons: ["annual", "winter"],
    deltaType: "rel",  // CORREGIDO: delta porcentual
    scales: {
      absolute: [ { value: 0, color: "#f7fcf0" }, { value: 5, color: "#e0f3f8" }, { value: 10, color: "#7bccc4" }, { value: 20, color: "#2b8cbe" }, { value: 40, color: "#084081" } ],
      delta:    [ { value: -50, color: "#2166ac" }, { value: -20, color: "#67a9cf" }, { value: 0, color: "#f7f7f7" }, { value: 20, color: "#ef8a62" }, { value: 50, color: "#b2182b" } ], // CORREGIDO: escala en %
    },
    colores: {
      absolute: { "0-5 días": "#f7fcf0", "5-10 días": "#e0f3f8", "10-20 días": "#7bccc4", "20-40 días": "#2b8cbe", "+40 días": "#084081" },
      delta:    { "-50 a -20%": "#2166ac", "-20 a 0%": "#67a9cf", "Sin cambio": "#f7f7f7", "+20 a +50%": "#ef8a62", "+50%": "#b2182b" }, // CORREGIDO: colores en %
    },
  }),
];

// ── Grupo 4: Precipitación y Sequía (6) ──
const ARCLIM_PRECIPITACION = [
    createArclimLayer({
    id: "arclim_precipitacion",
    indicatorId: "pr_sum",
    label: "Precipitación Acumulada",
    description: "Cantidad total de precipitación (lluvia y nieve) acumulada.",
    unit: "mm",
    seasons: ["annual", "summer", "winter"],
    deltaType: "rel",
    scales: {
      absolute: [ { value: 0, color: "#ffffcc" }, { value: 25, color: "#a1dab4" }, { value: 50, color: "#41b6c4" }, { value: 100, color: "#2c7fb8" }, { value: 150, color: "#253494" }, { value: 200, color: "#081d58" } ],
      delta:    [ { value: -100, color: "#b2182b" }, { value: -50, color: "#ef8a62" }, { value: -20, color: "#fddbc7" }, { value: 0, color: "#f7f7f7" }, { value: 20, color: "#a1dab4" }, { value: 50, color: "#2c7fb8" } ],
    },
    colores: {
      absolute: { "0-25 mm": "#ffffcc", "25-50 mm": "#a1dab4", "50-100 mm": "#41b6c4", "100-150 mm": "#2c7fb8", "150-200 mm": "#253494", "+200 mm": "#081d58" },
      delta:    { "-100 a -50%": "#b2182b", "-50 a -20%": "#ef8a62", "-20 a 0%": "#fddbc7", "Sin cambio": "#f7f7f7", "+20 a +50%": "#a1dab4", "+50%": "#2c7fb8" },
    },
  }),
  createArclimLayer({
    id: "arclim_max_5day_precip",
    indicatorId: "max_5day_precip",
    label: "Precipitación Máx. en 5 Días",
    description: "Precipitación máxima acumulada en 5 días consecutivos.",
    unit: "mm",
    seasons: ["annual", "winter"],
    deltaType: "rel",
    scales: {
      absolute: [ { value: 0, color: "#ffffcc" }, { value: 10, color: "#a1dab4" }, { value: 25, color: "#41b6c4" }, { value: 50, color: "#2c7fb8" }, { value: 100, color: "#081d58" } ], // CORREGIDO: valores reales
      delta:    [ { value: -50, color: "#2166ac" }, { value: -20, color: "#67a9cf" }, { value: 0, color: "#f7f7f7" }, { value: 20, color: "#ef8a62" }, { value: 50, color: "#b2182b" } ],
    },
    colores: {
      absolute: { "0-10 mm": "#ffffcc", "10-25 mm": "#a1dab4", "25-50 mm": "#41b6c4", "50-100 mm": "#2c7fb8", "+100 mm": "#081d58" }, // CORREGIDO: valores reales
      delta:    { "-50 a -20%": "#2166ac", "-20 a 0%": "#67a9cf", "Sin cambio": "#f7f7f7", "+20 a +50%": "#ef8a62", "+50%": "#b2182b" },
    },
  }),
  createArclimLayer({
    id: "arclim_heavy_precipitation_days",
    indicatorId: "number_of_heavy_precipitation_days",
    label: "Días de Lluvia Intensa (>10mm)",
    description: "Número de días en que la precipitación diaria supera 10 mm.",
    unit: "días",
    seasons: ["annual", "winter"],
    deltaType: "rel",
    scales: {
      absolute: [ { value: 0, color: "#ffffcc" }, { value: 2, color: "#a1dab4" }, { value: 5, color: "#41b6c4" }, { value: 10, color: "#2c7fb8" }, { value: 20, color: "#081d58" } ], // CORREGIDO: valores reales
      delta:    [ { value: -50, color: "#2166ac" }, { value: -20, color: "#67a9cf" }, { value: 0, color: "#f7f7f7" }, { value: 20, color: "#ef8a62" }, { value: 50, color: "#b2182b" } ],
    },
    colores: {
      absolute: { "0-2 días": "#ffffcc", "2-5 días": "#a1dab4", "5-10 días": "#41b6c4", "10-20 días": "#2c7fb8", "+20 días": "#081d58" }, // CORREGIDO: valores reales
      delta:    { "-50 a -20%": "#2166ac", "-20 a 0%": "#67a9cf", "Sin cambio": "#f7f7f7", "+20 a +50%": "#ef8a62", "+50%": "#b2182b" },
    },
  }),
  createArclimLayer({
    id: "arclim_consecutive_dry_days",
    indicatorId: "consecutive_dry_days",
    label: "Sequías Consecutivas",
    description: "Número máximo de días consecutivos en que la precipitación diaria no supera 1 mm.",
    unit: "días",
    seasons: ["annual"],
    deltaType: "rel",
    scales: {
      absolute: [ { value: 0, color: "#f7fcf0" }, { value: 60, color: "#ffffcc" }, { value: 120, color: "#feb24c" }, { value: 180, color: "#f03b20" }, { value: 270, color: "#800026" }, { value: 365, color: "#400010" } ],
      delta:    [ { value: -50, color: "#2166ac" }, { value: -20, color: "#67a9cf" }, { value: 0, color: "#f7f7f7" }, { value: 20, color: "#ef8a62" }, { value: 50, color: "#b2182b" } ],
    },
    colores: {
      absolute: { "0-60 días": "#f7fcf0", "60-120 días": "#ffffcc", "120-180 días": "#feb24c", "180-270 días": "#f03b20", "270-365 días": "#800026", "Todo el año": "#400010" },
      delta:    { "-50 a -20%": "#2166ac", "-20 a 0%": "#67a9cf", "Sin cambio": "#f7f7f7", "+20 a +50%": "#ef8a62", "+50%": "#b2182b" },
    },
  }),
  createArclimLayer({
    id: "arclim_drought_periods",
    indicatorId: "drought_periods",
    label: "Frecuencia de Sequía",
    description: "Frecuencia de períodos en que la precipitación acumulada es menor al 75% del promedio histórico.",
    unit: "%",
    seasons: ["annual"],
    deltaType: "rel",
    scales: {
      absolute: [ { value: 0, color: "#f7fcf0" }, { value: 10, color: "#ffffcc" }, { value: 25, color: "#feb24c" }, { value: 40, color: "#f03b20" }, { value: 60, color: "#800026" } ], // CORREGIDO: valores reales
      delta:    [ { value: -50, color: "#2166ac" }, { value: -20, color: "#67a9cf" }, { value: 0, color: "#f7f7f7" }, { value: 20, color: "#ef8a62" }, { value: 50, color: "#b2182b" } ],
    },
    colores: {
      absolute: { "0-10%": "#f7fcf0", "10-25%": "#ffffcc", "25-40%": "#feb24c", "40-60%": "#f03b20", "+60%": "#800026" }, // CORREGIDO: valores reales
      delta:    { "-50 a -20%": "#2166ac", "-20 a 0%": "#67a9cf", "Sin cambio": "#f7f7f7", "+20 a +50%": "#ef8a62", "+50%": "#b2182b" },
    },
  }),
  createArclimLayer({
    id: "arclim_spi",
    indicatorId: "spi",
    label: "Índice de Precipitación (SPI)",
    description: "Standardized Precipitation Index: valores negativos indican déficit hídrico, positivos superávit.",
    unit: "Z",
    seasons: ["annual"],
    deltaType: "rel",
    scales: {
      absolute: [ { value: -2, color: "#67001f" }, { value: -1, color: "#d6604d" }, { value: 0, color: "#f7f7f7" }, { value: 1, color: "#4393c3" }, { value: 2, color: "#053061" } ],
      delta:    [ { value: -50, color: "#67001f" }, { value: -20, color: "#d6604d" }, { value: 0, color: "#f7f7f7" }, { value: 20, color: "#4393c3" }, { value: 50, color: "#053061" } ],
    },
    colores: {
      absolute: { "Sequía extrema (-2)": "#67001f", "Sequía (-1)": "#d6604d", "Normal (0)": "#f7f7f7", "Húmedo (+1)": "#4393c3", "Muy húmedo (+2)": "#053061" },
      delta:    { "-50 a -20%": "#67001f", "-20 a 0%": "#d6604d", "Sin cambio": "#f7f7f7", "+20 a +50%": "#4393c3", "+50%": "#053061" },
    },
  }),
];

// Lista completa de capas ARClim
const ARCLIM_LAYERS = [
  ...ARCLIM_OLAS_CALOR,
  ...ARCLIM_TEMPERATURAS,
  ...ARCLIM_HELADAS,
  ...ARCLIM_PRECIPITACION,
];

// ═══════════════════════════════════════════════════════════════
// CONFIG PRINCIPAL
// ═══════════════════════════════════════════════════════════════
const climaConfig = {
  capas: [
    "zonas_climaticas",
    ...ARCLIM_LAYERS.map(l => l.id),
    "limite_comunal_linea",
    "toponimia",
    ...LIVE_LAYERS.map(l => l.id),
    ...HISTORICAL_LAYERS.map(l => l.id),
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
    estaciones_meteorologicas: {
      nombre: "Estaciones Meteorológicas",
      subgrupos: {
        en_vivo: {
          nombre: "Estaciones en vivo",
          capas: LIVE_LAYERS.map(l => l.id),
        },
        historicas: {
          nombre: "Estaciones históricas (DGA)",
          capas: HISTORICAL_LAYERS.map(l => l.id),
        },
      },
    },
    proyecciones_climaticas: {
      nombre: "Proyecciones Climáticas (ARClim)",
      subgrupos: {
        olas_calor: {
          nombre: "Olas de Calor",
          capas: ARCLIM_OLAS_CALOR.map(l => l.id),
        },
        temperaturas: {
          nombre: "Temperaturas",
          capas: ARCLIM_TEMPERATURAS.map(l => l.id),
        },
        heladas: {
          nombre: "Heladas y Frío",
          capas: ARCLIM_HELADAS.map(l => l.id),
        },
        precipitacion: {
          nombre: "Precipitación y Sequía",
          capas: ARCLIM_PRECIPITACION.map(l => l.id),
        },
      },
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
    // Capas ARClim generadas por factory
    ...Object.fromEntries(ARCLIM_LAYERS.map(l => [l.id, l])),
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

// ─────────────────────────────────────────────────────────────
// CAPAS COMENTADAS PARA DESPUÉS: Viento, Radiación y Humedad
// ─────────────────────────────────────────────────────────────
// Para activarlas, descomenta los bloques y agrega los IDs a los grupos.
/*
const ARCLIM_VIENTO_RADIACION = [
  createArclimLayer({
    id: "arclim_vel_mean", indicatorId: "vel_mean", label: "Viento Medio",
    description: "Valor medio de la magnitud del viento.",
    unit: "m/s", seasons: ["annual","summer","winter"], deltaType: "rel",
    scales: {
      absolute: [ { value: 0, color: "#f7fbff" }, { value: 3, color: "#c7e9c0" }, { value: 6, color: "#41ab5d" }, { value: 10, color: "#006d2c" } ],
      delta:    [ { value: -30, color: "#2166ac" }, { value: 0, color: "#f7f7f7" }, { value: 30, color: "#b2182b" } ],
    },
    colores: {
      absolute: { "0-3 m/s": "#f7fbff", "3-6 m/s": "#c7e9c0", "6-10 m/s": "#41ab5d", "+10 m/s": "#006d2c" },
      delta:    { "-30%": "#2166ac", "Sin cambio": "#f7f7f7", "+30%": "#b2182b" },
    },
  }),
  // ... etc
];
*/

export default climaConfig;