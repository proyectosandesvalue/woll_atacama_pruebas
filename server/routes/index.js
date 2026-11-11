/**
 * Tabla de rutas del servidor Node.
 *
 * El orden no importa: el router busca por path + método exactos.
 */

import { arclimRoute } from "./arclim.js";
import { chatRoute } from "./chat.js";
import { healthRoute, readyRoute } from "./health.js";
import { proxyRoute } from "./proxy.js";
import { stationRoutes } from "./stations.js";

export const routes = [
  chatRoute,
  proxyRoute,
  arclimRoute,
  ...stationRoutes,
  healthRoute,
  readyRoute,
];
