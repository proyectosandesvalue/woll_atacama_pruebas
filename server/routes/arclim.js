/**
 * Ruta GET /api/arclim-geojson.
 */

import { handleArclimGeoJSON } from "../handlers/arclim.js";

export const arclimRoute = {
  method: "GET",
  path: "/api/arclim-geojson",
  cors: { headers: "Content-Type" },
  handler: async (ctx) => handleArclimGeoJSON(ctx.query),
};
