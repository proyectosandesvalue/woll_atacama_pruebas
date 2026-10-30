import getLayerStats from "./get-layer-stats.js";
import getLayerSchema from "./get-layer-schema.js";
import queryLayer from "./query-layer.js";
import aggregateLayer from "./aggregate-layer.js";
import aggregateByAdmin from "./aggregate-by-admin.js";
import aggregateByAdminAndColumn from "./aggregate-by-admin-and-column.js";
import countNearLayer from "./count-near-layer.js";
import aggregateNearLayer from "./aggregate-near-layer.js";
import getLayerFeatures from "./get-layer-features.js";
import getStationWeather from "./get-station-weather.js";
import getHistoricalClimate from "./get-historical-climate.js";
import listClimateStations from "./list-climate-stations.js";

const ALL_TOOLS = [
  // Capas
  getLayerStats,
  getLayerSchema,
  queryLayer,
  aggregateLayer,
  aggregateByAdmin,
  aggregateByAdminAndColumn,
  countNearLayer,
  aggregateNearLayer,
  getLayerFeatures,
  // Clima
  getStationWeather,
  getHistoricalClimate,
  listClimateStations,
];

export const TOOL_DEFINITIONS = ALL_TOOLS.map((t) => t.schema);
export const TOOL_NAMES = ALL_TOOLS.map((t) => t.schema.function.name);
export const TOOL_RUNNERS = Object.fromEntries(
  ALL_TOOLS.map((t) => [t.schema.function.name, t.run])
);