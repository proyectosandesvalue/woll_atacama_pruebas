/**
 * Rutas GET de estaciones y variables climáticas.
 */

import {
  handleHistoricalStations,
  handleStationAvailableDates,
  handleStationDetails,
  handleStationSeries,
  handleStationsMap,
  handleVariableAvailability,
  handleVariableAvailableDates,
} from "../handlers/stations.js";

function route(path, handler) {
  return {
    method: "GET",
    path,
    cors: { headers: "Content-Type" },
    handler: async (ctx) => handler(ctx.query, { getDB: ctx.getDB }),
  };
}

export const stationRoutes = [
  route("/api/stations-map", handleStationsMap),
  route("/api/station-details", handleStationDetails),
  route("/api/station-series", handleStationSeries),
  route("/api/station-available-dates", handleStationAvailableDates),
  route("/api/variable-availability", handleVariableAvailability),
  route("/api/variable-available-dates", handleVariableAvailableDates),
  route("/api/historical-stations", handleHistoricalStations),
];
