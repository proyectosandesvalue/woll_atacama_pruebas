/**
 * Catálogo de capas WMS para el chat.
 *
 * Las capas WMS no tienen tabla física y por eso quedan fuera de
 * `chat.chat_catalog`. Este módulo las expone como metadatos para que el LLM
 * sepa que existen y use las tools WMS en vez de intentar `query_layer`.
 *
 * La fuente es la misma configuración del visor: `js/config/allTemasConfig.js`
 * y `js/config/wms_services.js`. No se duplica la lista a mano.
 */

import allTemasConfig from "../../js/config/allTemasConfig.js";
import wmsConfig from "../../js/config/wms_services.js";

function buildCatalog() {
  const byId = new Map();

  for (const [dimension, tema] of Object.entries(allTemasConfig)) {
    for (const layerId of tema.capas || []) {
      const layer = tema.estilo?.[layerId];
      if (!layer) continue;
      if (!(layer.tipo === "wms" || layer.type === "wms")) continue;

      const service = wmsConfig.servicios?.[layer.servicio];
      if (!service) continue;

      const isCopernicus = String(layer.servicio || "").startsWith(
        "copernicus_"
      );

      byId.set(layerId, {
        layer_id: layerId,
        display_name:
          layer.nombrePersonalizado || service.nombre || layerId,
        dimension,
        service: layer.servicio,
        service_layers: service.layers,
        attribution: service.attribution || null,
        info_format: service.info_format || null,
        kind: isCopernicus ? "copernicus" : "wms",
        pixel_query: isCopernicus,
        description:
          layer.wmsFeatureInfo?.description || layer.descripcion || null,
        wmsFeatureInfo: layer.wmsFeatureInfo || null,
        wmsLegend: layer.wmsLegend || null,
        wmsDateSelector: Boolean(layer.wmsDateSelector),
        wmsCollection: layer.wmsCollection || null,
        wmsMaxcc: layer.wmsMaxcc ?? null,
        wmsHistoryStart: layer.wmsHistoryStart || null,
      });
    }
  }

  return [...byId.values()].sort((a, b) =>
    a.display_name.localeCompare(b.display_name, "es")
  );
}

export const WMS_LAYERS = Object.freeze(buildCatalog());

export function getWmsLayer(layerId) {
  return WMS_LAYERS.find((layer) => layer.layer_id === layerId) || null;
}

export function getWmsCatalog({ dimension = null } = {}) {
  if (!dimension) return WMS_LAYERS;
  return WMS_LAYERS.filter((layer) => layer.dimension === dimension);
}

export function buildWmsPromptBlock() {
  if (WMS_LAYERS.length === 0) return "";
  const lines = WMS_LAYERS.map((layer) => {
    const pixel = layer.pixel_query ? "píxel sí" : "solo metadatos";
    return `- ${layer.layer_id} — ${layer.display_name} [${layer.dimension}] (${pixel})`;
  });
  return (
    "\n\nCAPAS WMS/SATELITALES (no tienen tabla física; usa " +
    "get_wms_layer_info y get_wms_pixel, NO query_layer):\n" +
    lines.join("\n")
  );
}
