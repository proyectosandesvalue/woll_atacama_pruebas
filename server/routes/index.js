/**
 * Tabla de rutas del servidor Node.
 *
 * El orden no importa: el router busca por path + método exactos.
 */

import { adminRoutes } from "./admin.js";
import { adminRagRoutes } from "./admin-rag.js";
import { arclimRoute } from "./arclim.js";
import { chatRoute } from "./chat.js";
import { configRoutes } from "./config.js";
import { healthRoute, readyRoute } from "./health.js";
import { layerRoutes } from "./layers.js";
import { proxyRoute } from "./proxy.js";
import { stationRoutes } from "./stations.js";

export const routes = [
  chatRoute,
  ...configRoutes,
  ...adminRoutes,
  ...adminRagRoutes,
  proxyRoute,
  arclimRoute,
  ...layerRoutes,
  ...stationRoutes,
  healthRoute,
  readyRoute,
];
