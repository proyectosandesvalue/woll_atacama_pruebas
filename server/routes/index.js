/**
 * Tabla de rutas del servidor Node.
 *
 * El orden no importa: el router busca por path + método exactos.
 */

import { adminRoutes } from "./admin.js";
import { adminApiRoutes } from "./admin-apis.js";
import { adminChatConfigRoutes } from "./admin-chat-config.js";
import { adminLayerRoutes } from "./admin-layers.js";
import { adminRagRoutes } from "./admin-rag.js";
import { adminTaxonomyRoutes } from "./admin-taxonomy.js";
import { adminUnansweredRoutes } from "./admin-unanswered.js";
import { arclimRoute } from "./arclim.js";
import { chatRoute } from "./chat.js";
import { configRoutes } from "./config.js";
import { healthRoute, readyRoute } from "./health.js";
import { layerRoutes } from "./layers.js";
import { proxyRoute } from "./proxy.js";
import { rasterRoutes } from "./raster.js";
import { stationRoutes } from "./stations.js";

export const routes = [
  chatRoute,
  ...configRoutes,
  ...adminRoutes,
  ...adminRagRoutes,
  ...adminApiRoutes,
  ...adminTaxonomyRoutes,
  ...adminLayerRoutes,
  ...adminChatConfigRoutes,
  ...adminUnansweredRoutes,
  proxyRoute,
  arclimRoute,
  ...layerRoutes,
  ...rasterRoutes,
  ...stationRoutes,
  healthRoute,
  readyRoute,
];
