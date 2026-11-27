import getLayerStats from "./get-layer-stats.js";
import getLayerSchema from "./get-layer-schema.js";
import getLayerMetadata from "./get-layer-metadata.js";
import queryLayer from "./query-layer.js";
import aggregateLayer from "./aggregate-layer.js";
import aggregateByAdmin from "./aggregate-by-admin.js";
import aggregateByAdminAndColumn from "./aggregate-by-admin-and-column.js";
import compareLayers from "./compare-layers.js";
import rankMulticriteria from "./rank-multicriteria.js";
import countNearLayer from "./count-near-layer.js";
import aggregateNearLayer from "./aggregate-near-layer.js";
import spatialOverlay from "./spatial-overlay.js";
import nearestDistance from "./nearest-distance.js";
import getLayerFeatures from "./get-layer-features.js";
import getStationWeather from "./get-station-weather.js";
import getHistoricalClimate from "./get-historical-climate.js";
import getHistoricalSeries from "./get-historical-series.js";
import listClimateStations from "./list-climate-stations.js";
import getArclimForecast from "./get-arclim-forecast.js";
import getWmsLayerInfo from "./get-wms-layer-info.js";
import getWmsPixel from "./get-wms-pixel.js";
import getWmsAvailableDates from "./get-wms-available-dates.js";
import getWmsStatistics from "./get-wms-statistics.js";
import searchDocuments from "./search-documents.js";

const ALL_TOOLS = [
  // Capas
  getLayerStats,
  getLayerSchema,
  getLayerMetadata,
  queryLayer,
  aggregateLayer,
  aggregateByAdmin,
  aggregateByAdminAndColumn,
  compareLayers,
  rankMulticriteria,
  countNearLayer,
  aggregateNearLayer,
  spatialOverlay,
  nearestDistance,
  getLayerFeatures,
  // Clima
  getStationWeather,
  getHistoricalClimate,
  getHistoricalSeries,
  listClimateStations,
  // Proyecciones Climaticas
  getArclimForecast,
  // WMS / Copernicus
  getWmsLayerInfo,
  getWmsPixel,
  getWmsAvailableDates,
  getWmsStatistics,
  // Documentos (RAG)
  searchDocuments
];

export const TOOL_DEFINITIONS = ALL_TOOLS.map((t) => t.schema);
export const TOOL_NAMES = ALL_TOOLS.map((t) => t.schema.function.name);
export const TOOL_RUNNERS = Object.fromEntries(
  ALL_TOOLS.map((t) => [t.schema.function.name, t.run])
);

/**
 * Definiciones que se envían al LLM. Si el bloque documental está apagado,
 * `search_documents` no se ofrece (killswitch real, no solo prompt).
 *
 * @param {{documentsEnabled?: boolean}} [options]
 */
export function getToolDefinitions({ documentsEnabled = true } = {}) {
  if (documentsEnabled) return TOOL_DEFINITIONS;
  return TOOL_DEFINITIONS.filter(
    (tool) => tool.function?.name !== "search_documents"
  );
}