/**
 * Registro de tools del chat.
 *
 * Cada tool es un archivo en este directorio que exporta `{ schema, run }`.
 * Este archivo las importa, las registra en un array y expone:
 *   - TOOL_DEFINITIONS: los schemas para pasar al LLM.
 *   - TOOL_NAMES: solo los nombres (útil para logs/tests).
 *   - TOOL_RUNNERS: un mapa nombre → run().
 *
 * Agregar una tool nueva:
 *   1. Crear `tools/mi-tool.js` con `{ schema, run }`.
 *   2. Importarla acá.
 *   3. Agregarla al array `ALL_TOOLS`.
 *   Nada más.
 */

import getLayerStats from "./get-layer-stats.js";
import getLayerSchema from "./get-layer-schema.js";
import queryLayer from "./query-layer.js";
import aggregateLayer from "./aggregate-layer.js";
import aggregateByAdmin from "./aggregate-by-admin.js";
import aggregateByAdminAndColumn from "./aggregate-by-admin-and-column.js";
import countNearLayer from "./count-near-layer.js";
import aggregateNearLayer from "./aggregate-near-layer.js";
import getLayerFeatures from "./get-layer-features.js";


const ALL_TOOLS = [
  getLayerStats,
  getLayerSchema,
  queryLayer,
  aggregateLayer,
  aggregateByAdmin,
  aggregateByAdminAndColumn,
  countNearLayer,
  aggregateNearLayer,
  getLayerFeatures,
];

export const TOOL_DEFINITIONS = ALL_TOOLS.map((t) => t.schema);

export const TOOL_NAMES = ALL_TOOLS.map((t) => t.schema.function.name);

export const TOOL_RUNNERS = Object.fromEntries(
  ALL_TOOLS.map((t) => [t.schema.function.name, t.run])
);