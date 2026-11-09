/**
 * Utilidades para resolver y crear capas WMS desde la configuración.
 *
 * wms_services.js declara los servicios disponibles (URL, layer, formatos).
 * Las capas de los temas (agricultura.js, otros.js, etc.) pueden declararse
 * con `tipo: 'wms'` y `servicio: 'ide_minagri'` en lugar de `url`.
 *
 * @module utils/wmsUtils
 */

import wmsConfig from "../config/wms_services.js";
import { createContextLogger } from "./logger.js";

const log = createContextLogger('WMSUtils');

/**
 * Devuelve la definición de un servicio WMS por su clave en wms_services.js.
 * @param {string} servicioKey - Clave del servicio (ej. 'ide_minagri')
 * @returns {object|null}
 */
export function getWMSService(servicioKey) {
  if (!servicioKey || !wmsConfig?.servicios) return null;
  return wmsConfig.servicios[servicioKey] || null;
}

/**
 * Comprueba si una configuración de capa es WMS.
 * @param {object} configCapa
 * @returns {boolean}
 */
export function isWMSLayer(configCapa) {
  return configCapa?.tipo === 'wms' || (configCapa?.type === 'wms');
}

/**
 * Crea una capa WMS de Leaflet a partir de la config combinada
 * (config de la capa + servicio WMS referenciado).
 *
 * @param {object} configCapa - Config de la capa (con `servicio`)
 * @param {object} servicio - Definición del servicio WMS
 * @returns {L.TileLayer.WMS|null}
 */
export function createWMSLayer(configCapa, servicio) {
  if (!servicio || !servicio.url) {
    log.warn(`Servicio WMS no encontrado o sin URL para: ${configCapa?.servicio}`);
    return null;
  }

  const layerOptions = {
    layers: servicio.layers,
    format: servicio.format || 'image/png',
    transparent: servicio.transparent !== false,
    version: servicio.version || '1.3.0',
    attribution: servicio.attribution || '',
    opacity: configCapa?.opacity ?? servicio.opacity ?? 0.8,
  };

  // Solo pisar defaults de Leaflet cuando el servicio define el valor.
  if (servicio.maxNativeZoom != null) layerOptions.maxNativeZoom = servicio.maxNativeZoom;
  if (servicio.keepBuffer != null) layerOptions.keepBuffer = servicio.keepBuffer;
  if (servicio.tileSize != null) layerOptions.tileSize = servicio.tileSize;
  if (servicio.updateWhenIdle !== undefined) layerOptions.updateWhenIdle = servicio.updateWhenIdle;
  if (servicio.updateWhenZooming !== undefined) layerOptions.updateWhenZooming = servicio.updateWhenZooming;

  const layer = L.tileLayer.wms(servicio.url, layerOptions);

  layer._isWMS = true;
  layer._wmsService = servicio;
  layer._configCapa = configCapa;

  // Fecha seleccionada por el usuario (selector de fecha). Se aplica
  // como TIME en cada tile; si no hay, el servicio devuelve la última
  // imagen válida.
  if (configCapa?.wmsTime) {
    layer.wmsParams.TIME = configCapa.wmsTime;
  }

  return layer;
}