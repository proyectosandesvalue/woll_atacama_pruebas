/**
 * Tool: get_wms_layer_info
 *
 * Devuelve metadatos de capas WMS/Copernicus: nombre, dimensión, servicio,
 * descripción, leyenda, rango, fecha disponible y si permite consulta por
 * píxel.
 */

import { getWmsCatalog, getWmsLayer } from "../wms-catalog.js";

export default {
  schema: {
    type: "function",
    function: {
      name: "get_wms_layer_info",
      description:
        "Devuelve metadatos de capas WMS/Copernicus: nombre, dimensión, " +
        "descripción, leyenda, rango, fecha de inicio y si permite consulta " +
        "por píxel. Si no indicas layer_id, lista todas las capas WMS.",
      parameters: {
        type: "object",
        properties: {
          layer_id: {
            type: "string",
            description:
              "ID de la capa WMS (ej: copernicus_ndvi). Opcional.",
          },
          dimension: {
            type: "string",
            description:
              "Filtrar por dimensión (agua, agricultura, clima, mineria). Opcional.",
          },
        },
        additionalProperties: false,
      },
    },
  },

  run: async ({ layer_id, dimension }) => {
    if (layer_id) {
      const layer = getWmsLayer(layer_id);
      if (!layer) {
        throw new Error(`Capa WMS no encontrada: ${layer_id}`);
      }
      return { layer };
    }
    return {
      layers: getWmsCatalog({ dimension: dimension || null }).map((layer) => ({
        layer_id: layer.layer_id,
        display_name: layer.display_name,
        dimension: layer.dimension,
        kind: layer.kind,
        pixel_query: layer.pixel_query,
      })),
    };
  },
};
