/**
 * Utilidades relacionadas con la manipulación del mapa
 * @module utils/mapUtils
 */

import { MAP_CONFIG } from "../config/constants.js";

/**
 * Inicializa el mapa de Leaflet
 * @param {string} idElemento - El ID del elemento HTML donde se renderizará el mapa
 * @param {number[]} coordenadas - Array con [latitud, longitud] iniciales
 * @param {number} zoom - El nivel de zoom inicial
 * @returns {L.Map} La instancia del mapa de Leaflet
 *
 * @example
 * const map = initMap('map', [-27.60080, -70.71899], 7);
 */
export function initMap(idElemento, coordenadas, zoom) {
  // NO creamos L.control.zoom: la app usa botones propios (#zoomInBtn / #zoomOutBtn)
  // y el CSS oculta el control nativo con `.leaflet-control-zoom { display: none }`.
  const mapOptions = {
    zoomControl: false,
  };

  const map = L.map(idElemento, mapOptions).setView(coordenadas, zoom);

  // Ajustar padding del mapa para desktop (el header es fixed).
  // Nota: el header real es `<header class="header header-custom">`, no `.navbar`.
  if (window.innerWidth >= 769) {
    setTimeout(() => {
      const header = document.querySelector(".header");
      const headerHeight = header ? header.getBoundingClientRect().height : 56;
      // Solo para log/depuración; map.invalidateSize() recalcula el viewport.
      void headerHeight;
      map.invalidateSize();
    }, 100);
  }

  return map;
}

/**
 * Establece la capa base del mapa
 * @param {L.Map} map - La instancia del mapa de Leaflet
 * @param {L.TileLayer} capa - La capa de Leaflet a usar como capa base
 * @returns {L.TileLayer} La capa base establecida
 */
export function setBaseLayer(map, capa) {
  capa.addTo(map);
  return capa;
}

/**
 * Cambia la capa base del mapa
 * @param {L.Map} map - La instancia del mapa de Leaflet
 * @param {L.TileLayer} nuevaCapa - La nueva capa base
 * @param {L.TileLayer} capaActual - La capa base actual
 */
export function changeBaseLayer(map, nuevaCapa, capaActual) {
  map.removeLayer(capaActual);
  nuevaCapa.addTo(map);
}

/**
 * Obtiene el centro del mapa en coordenadas EPSG:4326
 * @param {L.Map} map - La instancia del mapa de Leaflet
 * @returns {number[]} Array con [latitud, longitud] del centro del mapa
 */
export function obtenerCentroMapa(map) {
  const center = map.getCenter();
  return [center.lat, center.lng];
}

/**
 * Actualiza el centro del mapa
 * @param {L.Map} map - La instancia del mapa de Leaflet
 * @param {number[]} coordenadas - Array con [latitud, longitud] del nuevo centro
 * @param {number} zoom - El nivel de zoom para establecer después de cambiar el centro
 */
export function actualizarCentroMapa(map, coordenadas, zoom) {
  map.setView(coordenadas, zoom);
}