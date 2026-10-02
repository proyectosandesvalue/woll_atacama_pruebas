import { appState, isLayerLoaded } from "../store/appState.js";
import { logger } from "../utils/logger.js";
import { escapeHtml } from "../utils/helpers.js";
import { CONFIG } from "./index.js";
import { zoomToResult } from "./ui.js";

export let resultsMarkersGroup = null;
export let currentResults = [];
export let currentResultIndex = 0;

export function initResultsMarkersGroup() {
  if (resultsMarkersGroup) {
    if (appState.map) appState.map.removeLayer(resultsMarkersGroup);
  }
  if (appState.map) {
    resultsMarkersGroup = L.featureGroup().addTo(appState.map);
  }
}

export function clearResultsMarkers() {
  if (resultsMarkersGroup) {
    resultsMarkersGroup.clearLayers();
  }
  currentResults = [];
  currentResultIndex = 0;
}

export function showAllResultsOnMap(results) {
  initResultsMarkersGroup();
  currentResults = results;
  currentResultIndex = 0;

  if (!results || results.length === 0) return;

  const bounds = L.latLngBounds();
  let hasBounds = false;

  const limitedResults = results.slice(0, CONFIG.MAX_MARKERS_ON_MAP);

  limitedResults.forEach((item) => {
    if (!item.center) return;

    const marker = L.circleMarker(item.center, {
      radius: 8,
      fillColor: "#FF4444",
      color: "#FFFFFF",
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8,
    });

    // Escapamos los campos que provienen de datos GeoJSON.
    const safeDisplayName = escapeHtml(item.displayName || "");
    const safeNombreCapa = escapeHtml(item.nombreCapa || "");
    const safeCapaName = escapeHtml(item.capaName || "");
    const badgeHtml = !item.isMetadata && !isLayerLoaded(item.capaName)
      ? '<span class="badge badge-warning">Capa Inactiva</span>'
      : "";

    const popupContent = `
      <div class="search-popup-result">
        <strong>${safeDisplayName}</strong><br>
        <small>${safeNombreCapa || safeCapaName}</small><br>
        ${badgeHtml}
      </div>
    `;

    marker.bindPopup(popupContent);
    marker.on("click", () => {
      zoomToResult(item, appState.map, true);
    });

    resultsMarkersGroup.addLayer(marker);
    bounds.extend(item.center);
    hasBounds = true;
  });

  if (hasBounds) {
    appState.map.fitBounds(bounds, {
      padding: [50, 50],
      maxZoom: 13,
    });
  }

  if (results.length > CONFIG.MAX_MARKERS_ON_MAP) {
    logger.log(
      `[SearchControl] Mostrando ${CONFIG.MAX_MARKERS_ON_MAP} de ${results.length} resultados`
    );
  }
}

export function navigateResults(direction) {
  if (currentResults.length === 0) return;

  if (direction === "next") {
    currentResultIndex = (currentResultIndex + 1) % currentResults.length;
  } else {
    currentResultIndex =
      currentResultIndex === 0
        ? currentResults.length - 1
        : currentResultIndex - 1;
  }

  const result = currentResults[currentResultIndex];
  zoomToResult(result, appState.map, true);
}