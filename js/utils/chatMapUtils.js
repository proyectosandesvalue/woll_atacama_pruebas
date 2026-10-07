/**
 * chatMapUtils.js — Pinta los resultados geojson del chat en el mapa.
 *
 * El orquestador puede devolver un FeatureCollection (`payload.geojson`)
 * cuando el LLM usa la tool `get_layer_features`. Este módulo lo pinta
 * en una capa temporal destacada, con zoom automático.
 *
 * @module utils/chatMapUtils
 */

import { appState } from "../store/appState.js";
import { createContextLogger } from "./logger.js";

const log = createContextLogger("ChatMap");

const PANE_NAME = "chatResults";
const PANE_ZINDEX = 1000;

/**
 * Estilos destacados por tipo de geometría.
 * Colores que contrastan con las capas normales del visor.
 */
const STYLES = {
  point: {
    radius: 8,
    fillColor: "#FF3B30",
    color: "#FFFFFF",
    weight: 2,
    opacity: 1,
    fillOpacity: 0.85,
  },
  line: {
    color: "#FF3B30",
    weight: 4,
    opacity: 0.9,
  },
  polygon: {
    color: "#FF3B30",
    weight: 3,
    opacity: 0.9,
    fillColor: "#FF3B30",
    fillOpacity: 0.15,
  },
};

/**
 * Asegura que exista el pane dedicado a los resultados del chat.
 * Se crea una sola vez y se reutiliza.
 */
function ensurePane(map) {
  if (appState.chat.resultsPane && map.getPane(PANE_NAME)) {
    return appState.chat.resultsPane;
  }
  const pane = map.createPane(PANE_NAME);
  pane.style.zIndex = PANE_ZINDEX;
  appState.chat.resultsPane = pane;
  return pane;
}

/**
 * Recorre el geojson y agrupa las features por tipo de geometría.
 * (Point/MultiPoint, LineString/MultiLineString, Polygon/MultiPolygon).
 */
function classifyFeatures(features) {
  const points = [];
  const lines = [];
  const polygons = [];

  for (const f of features) {
    const t = f?.geometry?.type;
    if (!t) continue;
    if (t === "Point" || t === "MultiPoint") points.push(f);
    else if (t === "LineString" || t === "MultiLineString") lines.push(f);
    else if (t === "Polygon" || t === "MultiPolygon") polygons.push(f);
  }

  return { points, lines, polygons };
}

/**
 * Construye un popup con las propiedades de la feature.
 * Escapa HTML para evitar XSS.
 */
function buildPopup(feature) {
  const props = feature?.properties || {};
  const keys = Object.keys(props).slice(0, 8);
  if (keys.length === 0) return "";

  const escapeHtml = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const rows = keys
    .map((k) => {
      const v = props[k];
      if (v == null || v === "") return "";
      return `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`;
    })
    .filter(Boolean)
    .join("");

  if (!rows) return "";
  return `<table style="font-size:12px;border-collapse:collapse">${rows}</table>`;
}

/**
 * Pinta los resultados geojson en el mapa.
 *
 * @param {object} geojson - FeatureCollection
 * @param {object} [options]
 * @param {boolean} [options.fitBounds=true] - Hacer zoom a la extensión
 * @returns {boolean} true si se pintó algo
 */
export function showResults(geojson, options = {}) {
  const map = appState.map;
  if (!map) {
    log.warn("showResults: no hay mapa disponible");
    return false;
  }

  if (!geojson || geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
    log.warn("showResults: geojson inválido", geojson);
    return false;
  }

  if (geojson.features.length === 0) {
    log.debug("showResults: geojson vacío");
    return false;
  }

  // Limpiar capa anterior antes de pintar la nueva.
  clearResults();

  const pane = ensurePane(map);
  const { points, lines, polygons } = classifyFeatures(geojson.features);

  const layers = [];

  if (polygons.length > 0) {
    layers.push(
      L.geoJSON({ type: "FeatureCollection", features: polygons }, {
        pane: PANE_NAME,
        style: () => STYLES.polygon,
        onEachFeature: (feature, layer) => {
          const popup = buildPopup(feature);
          if (popup) layer.bindPopup(popup);
        },
      })
    );
  }

  if (lines.length > 0) {
    layers.push(
      L.geoJSON({ type: "FeatureCollection", features: lines }, {
        pane: PANE_NAME,
        style: () => STYLES.line,
        onEachFeature: (feature, layer) => {
          const popup = buildPopup(feature);
          if (popup) layer.bindPopup(popup);
        },
      })
    );
  }

  if (points.length > 0) {
    layers.push(
      L.geoJSON({ type: "FeatureCollection", features: points }, {
        pane: PANE_NAME,
        pointToLayer: (feature, latlng) =>
          L.circleMarker(latlng, { ...STYLES.point, pane: PANE_NAME }),
        onEachFeature: (feature, layer) => {
          const popup = buildPopup(feature);
          if (popup) layer.bindPopup(popup);
        },
      })
    );
  }

  const group = L.featureGroup(layers).addTo(map);
  appState.chat.resultsLayer = group;

  // Zoom a la extensión de los resultados.
  if (options.fitBounds !== false) {
    try {
      const bounds = group.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      }
    } catch (err) {
      log.warn("fitBounds falló:", err);
    }
  }

  log.debug(`Resultados pintados: ${geojson.features.length} features`);
  return true;
}

/**
 * Limpia la capa de resultados del mapa.
 */
export function clearResults() {
  const layer = appState.chat.resultsLayer;
  if (layer && appState.map && appState.map.hasLayer(layer)) {
    appState.map.removeLayer(layer);
  }
  appState.chat.resultsLayer = null;
}

/**
 * Indica si hay resultados pintados actualmente.
 */
export function hasResults() {
  return appState.chat.resultsLayer !== null;
}