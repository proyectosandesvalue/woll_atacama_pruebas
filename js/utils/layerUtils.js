/**
 * Utilidades para manejo de capas del mapa.
 *
 * Arquitectura de renderers:
 *  - Capas WMS (tipo: 'wms') → L.tileLayer.wms (vía wmsUtils.js)
 *  - Polígonos y líneas pesadas → Leaflet.glify (WebGL)
 *    Condición: configCapa.type === 'polygon' | 'line' y USE_GLIFY_RENDERER = true
 *  - Puntos (todos los tipos) → L.geoJson (cluster, heatmap, íconos por atributo)
 *    Razón: glify no soporta íconos PNG/SVG, cluster ni etiquetas permanentes.
 *
 * El módulo glifyAdapter.js encapsula toda la lógica WebGL y expone
 * un adaptador con la misma interfaz que L.Layer para que el resto del
 * código no necesite conocer el renderer subyacente.
 *
 * @module utils/layerUtils
 */

import { getEstiloCapa, getPointStyle, addLabelsToLayer } from "./styleUtils.js";
import { bindPopup } from "./popupUtils.js";
import { PATHS, MAP_CONFIG } from "../config/constants.js";
import {
  appState,
  addLayer,
  getLayer,
  markLayerAsLoaded,
  isLayerLoaded,
  removeLayer,
  updateLayerOrder,
  clearAllLayers,
  setLayerData,
  getLayerData,
  getDataFilter,
} from "../store/appState.js";
import { createContextLogger } from "./logger.js";
import { LayerLoadError, handleError } from "./errorHandler.js";
import { shouldUseGlify, createGlifyLayer } from "./glifyAdapter.js";
import { runWorkerTask } from "../workers/workerPool.js";
import { isWMSLayer, getWMSService, createWMSLayer } from "./wmsUtils.js";

let sharedCanvasRenderer = null;

/**
 * Obtiene (o crea) el renderer Canvas compartido.
 * Se inicializa de forma lazy para garantizar que el mapa ya existe.
 * @returns {L.Canvas|undefined}
 */
function getCanvasRenderer() {
  if (!MAP_CONFIG.PREFER_CANVAS) return undefined;
  if (!sharedCanvasRenderer && appState.map) {
    sharedCanvasRenderer = L.canvas();
  }
  return sharedCanvasRenderer || undefined;
}

const log = createContextLogger("LayerUtils");

export function initializeLayerState(map) {
  appState.map = map;
}

export function cargarCapasGeoJSON(tema, temasConfig) {
  if (!temasConfig[tema] || !temasConfig[tema].capas) {
    console.warn(`Tema '${tema}' no tiene capas definidas.`);
    return;
  }
  temasConfig[tema].capas.forEach((capaNombre) => {
    try {
      cargarCapaIndividual(capaNombre, tema, temasConfig);
    } catch (err) {
      console.warn(`Error cargando capa '${capaNombre}':`, err);
    }
  });
}

/**
 * Estima el tamaño relativo de una capa para priorizar la carga.
 *
 * NOTA: se abandonó la lista hardcoded de nombres (se desactualizaba con
 * cada refactor del catálogo). Ahora se estima por tipo de geometría.
 * Si necesitas precisión, usa `estimateLayerSizeFromUrl()` que hace un
 * HEAD al .geojson y lee Content-Length.
 *
 * @param {string} capaNombre
 * @param {object} [configCapa]
 * @returns {number}
 */
export function estimateLayerSize(capaNombre, configCapa) {
  const type = configCapa?.type;
  if (type === "polygon") return 100;
  if (type === "line") return 50;
  if (type === "point") return 20;
  return 10;
}

/**
 * Estima el tamaño real de una capa GeoJSON vía HEAD request.
 * Devuelve 0 si no se puede determinar.
 * @param {string} url
 * @returns {Promise<number>}
 */
export async function estimateLayerSizeFromUrl(url) {
  try {
    const absoluteUrl = new URL(url, window.location.href).href;
    const res = await fetch(absoluteUrl, { method: "HEAD" });
    const len = Number(res.headers.get("content-length") || 0);
    return Number.isFinite(len) ? len : 0;
  } catch {
    return 0;
  }
}

export async function fetchLayerData(capaNombre, configCapa) {
  const existingData = getLayerData(capaNombre);
  if (existingData) {
    log.debug(`[LayerUtils] Datos ya en caché para ${capaNombre}, saltando fetch.`);
    return existingData;
  }

  if (!configCapa?.url) {
    throw new Error(`La capa '${capaNombre}' no tiene URL de datos.`);
  }

  const relativeUrl = configCapa.url.startsWith("http")
    ? configCapa.url
    : `${PATHS.GEOJSON_BASE}${configCapa.url}`;
  const url = new URL(relativeUrl, window.location.href).href;
  log.debug(`Solicitando datos para ${capaNombre} desde: ${url}`);

  return runWorkerTask({ type: "FETCH_AND_PROCESS", url });
}

/**
 * Samplea una línea en N puntos equiespaciados y los añade a `out`.
 * Refactor de la lógica duplicada de createHeatmapLayer.
 */
function sampleLineIntoPoints(coords, out, samplesPerLine, intensity) {
  if (!Array.isArray(coords) || coords.length < 2) return;
  let totalLen = 0;
  const segs = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const dx = coords[i + 1][0] - coords[i][0];
    const dy = coords[i + 1][1] - coords[i][1];
    const len = Math.sqrt(dx * dx + dy * dy);
    segs.push(len);
    totalLen += len;
  }
  if (totalLen === 0) return;
  for (let i = 0; i < coords.length - 1; i++) {
    const steps = Math.max(1, Math.round((segs[i] / totalLen) * samplesPerLine));
    for (let s = 0; s < steps; s++) {
      const t = steps > 1 ? s / steps : 0;
      out.push({
        lat: coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t,
        lng: coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t,
        intensity,
      });
    }
  }
}

function createHeatmapLayer(data, configCapa, capaNombre) {
  const points = [];
  const intensityField = configCapa.heatmapIntensity || null;
  const hiddenSet = appState.layers.hiddenAttributes.get(capaNombre) || new Set();
  const atributoFiltro = configCapa.atributo;
  const SAMPLES_PER_LINE = 30;

  data.features.forEach((feature) => {
    if (!feature?.geometry?.type) return;
    if (atributoFiltro && hiddenSet.has(feature.properties[atributoFiltro])) return;

    const geomType = feature.geometry.type;
    let intensity = 1.0;
    if (intensityField && feature.properties[intensityField] !== undefined) {
      const val = parseFloat(feature.properties[intensityField]);
      if (!isNaN(val)) intensity = val;
    }

    if (geomType === "Point") {
      const coords = feature.geometry.coordinates;
      points.push({ lat: coords[1], lng: coords[0], intensity });
    } else if (geomType === "LineString") {
      sampleLineIntoPoints(feature.geometry.coordinates, points, SAMPLES_PER_LINE, 1.0);
    } else if (geomType === "MultiLineString") {
      feature.geometry.coordinates.forEach((lineCoords) => {
        sampleLineIntoPoints(lineCoords, points, SAMPLES_PER_LINE, 1.0);
      });
    }
  });

  const heatmapOptions = {
    radius: configCapa.heatmapRadius || 20,
    opacity: configCapa.heatmapOpacity !== undefined ? configCapa.heatmapOpacity : 0.8,
    gradient: configCapa.heatmapGradient || { 0.0: "blue", 0.5: "lime", 1.0: "red" },
  };
  const heatmapLayer = new L.WebGLHeatMap(heatmapOptions);
  heatmapLayer.setData(points);
  heatmapLayer._configCapa = configCapa;
  heatmapLayer._isHeatmap = true;
  return heatmapLayer;
}

export async function toggleHeatmapMode(capaNombre, temaKey, temasConfig) {
  const isHeatmap = appState.layers.heatmapMode.get(capaNombre);
  const newMode = !isHeatmap;
  if (newMode) appState.layers.clusterMode.set(capaNombre, false);
  appState.layers.heatmapMode.set(capaNombre, newMode);
  if (isLayerLoaded(capaNombre)) {
    const currentIndex = appState.layers.ordered.indexOf(capaNombre);
    ocultarCapa(capaNombre);
    removeLayer(capaNombre);
    appState.layers.loaded.delete(capaNombre);
    const nameLabel = document.querySelector(
      `.layer-item-container[data-capa-nombre="${capaNombre}"] .layer-item-name`
    );
    let originalText = "";
    if (nameLabel) {
      originalText = nameLabel.innerHTML;
      nameLabel.innerHTML = `${originalText} <span class="loading-indicator">...</span>`;
    }
    try {
      await cargarCapaIndividual(capaNombre, temaKey, temasConfig);
      if (currentIndex > -1) {
        updateLayerOrder(capaNombre, currentIndex);
        actualizarOrdenCapas();
      }
      applySavedOpacity(capaNombre);
    } finally {
      if (nameLabel) nameLabel.innerHTML = originalText;
    }
  }
}

export async function toggleClusterMode(capaNombre, temaKey, temasConfig) {
  const isCluster = appState.layers.clusterMode.get(capaNombre);
  const newMode = !isCluster;
  if (newMode) appState.layers.heatmapMode.set(capaNombre, false);
  appState.layers.clusterMode.set(capaNombre, newMode);
  if (isLayerLoaded(capaNombre)) {
    const currentIndex = appState.layers.ordered.indexOf(capaNombre);
    ocultarCapa(capaNombre);
    removeLayer(capaNombre);
    appState.layers.loaded.delete(capaNombre);
    const nameLabel = document.querySelector(
      `.layer-item-container[data-capa-nombre="${capaNombre}"] .layer-item-name`
    );
    let originalText = "";
    if (nameLabel) {
      originalText = nameLabel.innerHTML;
      nameLabel.innerHTML = `${originalText} <span class="loading-indicator">...</span>`;
    }
    try {
      await cargarCapaIndividual(capaNombre, temaKey, temasConfig);
      if (currentIndex > -1) {
        updateLayerOrder(capaNombre, currentIndex);
        actualizarOrdenCapas();
      }
      applySavedOpacity(capaNombre);
    } finally {
      if (nameLabel) nameLabel.innerHTML = originalText;
    }
  }
}

export async function cargarCapaIndividual(capaNombre, temaKey, temasConfig, isInitialLoad = false) {
  if (appState.layers.pendingLoads.has(capaNombre)) {
    return appState.layers.pendingLoads.get(capaNombre);
  }

  const loadPromise = (async () => {
    try {
      const temaConf = temasConfig[temaKey];
      if (!temaConf) throw new Error(`Tema '${temaKey}' no encontrado en la configuración.`);
      const configCapa = temaConf.estilo?.[capaNombre];
      if (!configCapa)
        throw new Error(
          `Configuración de estilo no encontrada para la capa: ${capaNombre} en tema: ${temaKey}`
        );

      log.debug(`[LayerUtils] Iniciando carga de capa: ${capaNombre} (tema: ${temaKey})`);
      appState.layers.loading.add(capaNombre);

      if (isLayerLoaded(capaNombre)) {
        mostrarCapa(capaNombre);
        return;
      }

      // ── Rama WMS: L.tileLayer.wms, sin descarga de GeoJSON ──
      if (isWMSLayer(configCapa)) {
        const servicio = getWMSService(configCapa.servicio);
        const wmsLayer = createWMSLayer(configCapa, servicio);
        if (!wmsLayer) {
          throw new Error(
            `No se pudo crear la capa WMS '${capaNombre}' (servicio: ${configCapa.servicio}).`
          );
        }
        wmsLayer.addTo(appState.map);
        addLayer(capaNombre, wmsLayer);
        markLayerAsLoaded(capaNombre);
        applySavedOpacity(capaNombre);
        log.log(`Capa ${capaNombre} cargada como WMS (servicio: ${configCapa.servicio})`);
        return;
      }

      // ── Rama GeoJSON (fetch + process) ──
      const data = await fetchLayerData(capaNombre, configCapa);
      setLayerData(capaNombre, data);

      const dataFilter = getDataFilter(capaNombre);
      const dataParaRender =
        dataFilter && dataFilter.size > 0
          ? {
              type: "FeatureCollection",
              features: data.features.filter((feature) => {
                for (const [attr, allowedValues] of dataFilter.entries()) {
                  const featureVal = feature.properties?.[attr];
                  if (featureVal === undefined || featureVal === null) return false;
                  if (!allowedValues.has(String(featureVal))) return false;
                }
                return true;
              }),
            }
          : data;

      // ── Rama WebGL: polígonos y líneas con Leaflet.glify ──
      if (shouldUseGlify(configCapa)) {
        const glifyLayer = createGlifyLayer(appState.map, dataParaRender, configCapa, capaNombre);
        if (glifyLayer) {
          glifyLayer.addTo(appState.map);
          addLayer(capaNombre, glifyLayer);
          markLayerAsLoaded(capaNombre);
          applySavedOpacity(capaNombre);
          log.log(`Capa ${capaNombre} cargada con WebGL (glify)`);
          return;
        }
        log.warn(
          `glifyAdapter retornó null para '${capaNombre}'. Usando L.geoJson como fallback.`
        );
      }

      // ── Rama estándar: puntos, cluster, heatmap y fallback ──
      let isHeatmap = appState.layers.heatmapMode.get(capaNombre);
      let isCluster = appState.layers.clusterMode.get(capaNombre);
      if (isHeatmap === undefined && configCapa.heatmap === true) {
        isHeatmap = true;
        appState.layers.heatmapMode.set(capaNombre, true);
      }
      if (
        isCluster === undefined &&
        configCapa.type === "point" &&
        configCapa.cluster === true
      ) {
        isCluster = true;
        appState.layers.clusterMode.set(capaNombre, true);
      }

      let finalLayer;
      if (isHeatmap && (configCapa.type === "point" || configCapa.type === "line")) {
        finalLayer = createHeatmapLayer(dataParaRender, configCapa, capaNombre);
      } else if (
        isCluster &&
        configCapa.type === "point" &&
        typeof L.markerClusterGroup === "function"
      ) {
        const options = {
          renderer: getCanvasRenderer(),
          filter: function (feature) {
            if (configCapa.atributo && appState.layers.hiddenAttributes.has(capaNombre)) {
              const hiddenSet = appState.layers.hiddenAttributes.get(capaNombre);
              if (hiddenSet && hiddenSet.has(feature.properties[configCapa.atributo])) return false;
            }
            return true;
          },
          onEachFeature: function (feature, layer) {
            bindPopup(feature, layer, configCapa);
            layer.feature = feature;
            layer.options.layerName = capaNombre;
            if (configCapa.etiquetas && configCapa.etiquetas.campo)
              addLabelsToLayer(layer, feature, configCapa.etiquetas);
          },
          pointToLayer: function (feature, latlng) {
            return L.marker(latlng, getPointStyle(feature, configCapa));
          },
        };
        const geojsonLayer = L.geoJson(dataParaRender, options);
        const clusterGroup = L.markerClusterGroup({
          disableClusteringAtZoom: 16,
          maxClusterRadius: 70,
        });
        clusterGroup.addLayer(geojsonLayer);
        clusterGroup._geoJsonOptions = options;
        clusterGroup._isCluster = true;
        finalLayer = clusterGroup;
      } else {
        const isPoint = configCapa.type === "point";
        if (configCapa.type === "line" || configCapa.type === "polygon") {
          log.debug(
            `[LayerUtils] ${capaNombre} (${configCapa.type}) → renderizando con L.geoJson SVG`
          );
        }
        const options = {
          renderer: isPoint ? getCanvasRenderer() : undefined,
          filter: function (feature) {
            if (configCapa.atributo && appState.layers.hiddenAttributes.has(capaNombre)) {
              const hiddenSet = appState.layers.hiddenAttributes.get(capaNombre);
              if (hiddenSet && hiddenSet.has(feature.properties[configCapa.atributo])) return false;
            }
            return true;
          },
          onEachFeature: function (feature, layer) {
            bindPopup(feature, layer, configCapa);
            layer.feature = feature;
            layer.options.layerName = capaNombre;
            if (configCapa.etiquetas && configCapa.etiquetas.campo)
              addLabelsToLayer(layer, feature, configCapa.etiquetas);
          },
        };
        if (configCapa.type === "point") {
          options.pointToLayer = function (feature, latlng) {
            const marker = L.marker(latlng, getPointStyle(feature, configCapa));
            if (configCapa.etiquetas && configCapa.etiquetas.campo)
              addLabelsToLayer(marker, feature, configCapa.etiquetas);
            return marker;
          };
        } else {
          options.style = (feature) => getEstiloCapa(feature, configCapa);
        }
        finalLayer = L.geoJson(dataParaRender, options);
      }
      finalLayer.addTo(appState.map);
      addLayer(capaNombre, finalLayer);
      markLayerAsLoaded(capaNombre);
      applySavedOpacity(capaNombre);
      log.log(`Capa ${capaNombre} cargada exitosamente`);
    } catch (error) {
      const layerError = new LayerLoadError(capaNombre, error);
      handleError(layerError, "LayerUtils.cargarCapaIndividual", false);
      throw layerError;
    } finally {
      appState.layers.loading.delete(capaNombre);
      appState.layers.pendingLoads.delete(capaNombre);
    }
  })();

  appState.layers.pendingLoads.set(capaNombre, loadPromise);
  return loadPromise;
}

export function mostrarCapa(capaNombre) {
  const layer = getLayer(capaNombre);
  if (!layer || !appState.map) {
    log.warn(`No se puede mostrar la capa ${capaNombre}: capa no encontrada`);
    return;
  }
  if (layer._isGlify) {
    layer.addTo(appState.map);
    log.debug(`Capa glify ${capaNombre} mostrada`);
    return;
  }
  if (!appState.map.hasLayer(layer)) {
    layer.addTo(appState.map);
    log.debug(`Capa ${capaNombre} mostrada`);
  }
}

export function ocultarCapa(capaNombre) {
  const capa = getLayer(capaNombre);
  if (!capa) return;
  if (capa._isGlify) {
    capa.removeFrom(appState.map);
    return;
  }
  if (appState.map.hasLayer(capa)) {
    appState.map.removeLayer(capa);
  }
}

export function updateLayerFilter(capaNombre) {
  const layer = getLayer(capaNombre);
  const data = getLayerData(capaNombre);
  if (!layer) return;

  // WMS: los filtros por atributo no aplican client-side.
  if (layer._isWMS) return;

  const dataFilter = getDataFilter(capaNombre);
  const hasDataFilter = dataFilter && dataFilter.size > 0;

  const filteredFeatures = hasDataFilter
    ? data.features.filter((feature) => {
        for (const [attr, allowedValues] of dataFilter.entries()) {
          const featureVal = feature.properties?.[attr];
          if (featureVal === undefined || featureVal === null) return false;
          if (!allowedValues.has(String(featureVal))) return false;
        }
        return true;
      })
    : null;

  const dataToUse = filteredFeatures
    ? { type: "FeatureCollection", features: filteredFeatures }
    : data;

  // Glify: re-render interno vía adaptador.
  if (layer._isGlify) {
    layer.triggerFilterUpdate();
    return;
  }

  // Heatmap: reusar el layer en vez de recrear (evita fuga de contextos WebGL).
  if (layer._isHeatmap) {
    if (!dataToUse) return;
    const configCapa = layer._configCapa;
    if (!configCapa) return;

    const hiddenSet = appState.layers.hiddenAttributes.get(capaNombre);
    const hasHidden = hiddenSet && hiddenSet.size > 0;
    const atributo = configCapa.atributo;

    const filteredData = {
      type: "FeatureCollection",
      features: dataToUse.features.filter((feature) => {
        if (hasHidden && atributo) {
          const val = feature.properties?.[atributo];
          if (val !== undefined && hiddenSet.has(val)) return false;
        }
        return true;
      }),
    };

    // Recalcular puntos y reusar el mismo canvas
    const points = [];
    const intensityField = configCapa.heatmapIntensity || null;
    const SAMPLES_PER_LINE = 30;
    filteredData.features.forEach((feature) => {
      if (!feature?.geometry?.type) return;
      const geomType = feature.geometry.type;
      let intensity = 1.0;
      if (intensityField && feature.properties[intensityField] !== undefined) {
        const val = parseFloat(feature.properties[intensityField]);
        if (!isNaN(val)) intensity = val;
      }
      if (geomType === "Point") {
        const coords = feature.geometry.coordinates;
        points.push({ lat: coords[1], lng: coords[0], intensity });
      } else if (geomType === "LineString") {
        sampleLineIntoPoints(feature.geometry.coordinates, points, SAMPLES_PER_LINE, 1.0);
      } else if (geomType === "MultiLineString") {
        feature.geometry.coordinates.forEach((lineCoords) => {
          sampleLineIntoPoints(lineCoords, points, SAMPLES_PER_LINE, 1.0);
        });
      }
    });
    layer.setData(points);
    applySavedOpacity(capaNombre);
    return;
  }

  if (dataToUse) {
    if (layer._isCluster) {
      layer.clearLayers();
      const geojsonLayer = L.geoJson(dataToUse, layer._geoJsonOptions);
      layer.addLayer(geojsonLayer);
    } else {
      layer.clearLayers();
      layer.addData(dataToUse);
    }
    applySavedOpacity(capaNombre);
  }
}

export function moverCapa(capaNombre, nuevaPosicion) {
  const capa = getLayer(capaNombre);
  if (!capa) {
    log.warn(`Capa '${capaNombre}' no encontrada para mover.`);
    return;
  }
  if (capa._isGlify) {
    capa.removeFrom(appState.map);
    updateLayerOrder(capaNombre, nuevaPosicion);
    capa.addTo(appState.map);
  } else {
    if (appState.map.hasLayer(capa)) appState.map.removeLayer(capa);
    updateLayerOrder(capaNombre, nuevaPosicion);
    capa.addTo(appState.map);
  }
  actualizarOrdenCapas();
}

export function actualizarOrdenCapas() {
  appState.layers.ordered.forEach((nombreCapa) => {
    const capa = getLayer(nombreCapa);
    if (capa && typeof capa.bringToFront === "function") {
      capa.bringToFront();
    }
  });
}

export function limpiarCapasDeDimension(capasArray) {
  if (!Array.isArray(capasArray)) return;
  capasArray.forEach((capaNombre) => {
    const capa = getLayer(capaNombre);
    if (!capa) return;
    if (capa._isGlify) {
      capa.removeFrom(appState.map);
    } else if (appState.map.hasLayer(capa)) {
      appState.map.removeLayer(capa);
    }
    const mainChk = document.getElementById(`capa-${capaNombre}`);
    const mobileChk = document.getElementById(`capa-mobile-${capaNombre}`);
    if (mainChk) mainChk.checked = false;
    if (mobileChk) mobileChk.checked = false;
  });
}

export function limpiarMapa(capaBaseActual) {
  log.debug("Limpiando todas las capas del mapa...");
  if (!appState.map) {
    log.warn("No hay mapa inicializado para limpiar");
    return;
  }

  // Glify: no son L.Layer, eachLayer no las detecta
  appState.layers.byName.forEach((capa) => {
    if (capa._isGlify) {
      try {
        capa.removeFrom(appState.map);
      } catch (_) {
        /* silent */
      }
    }
  });

  // L.geoJson / WMS / heatmap estándar
  appState.map.eachLayer((layer) => {
    if (layer !== capaBaseActual) {
      appState.map.removeLayer(layer);
    }
  });

  clearAllLayers();
  sharedCanvasRenderer = null;
  log.log("Mapa limpiado exitosamente");
}

export function applySavedOpacity(capaNombre) {
  try {
    const savedOpacities = JSON.parse(localStorage.getItem("layer-opacities") || "{}");
    const savedOpacity = savedOpacities[capaNombre];
    if (savedOpacity !== undefined && savedOpacity < 100) {
      setLayerOpacity(capaNombre, savedOpacity / 100);
    }
  } catch (e) {
    log.warn(`Error aplicando opacidad guardada para ${capaNombre}:`, e);
  }
}

export function setLayerOpacity(capaNombre, opacity) {
  const layer = getLayer(capaNombre);
  if (!layer) return;

  if (layer._isGlify) {
    layer.setOpacity(opacity);
    return;
  }

  // WMS soporta setOpacity nativo
  if (layer._isWMS && typeof layer.setOpacity === "function") {
    layer.setOpacity(opacity);
    return;
  }

  if (layer.setOptions && typeof layer.setOptions === "function") {
    layer.setOptions({ opacity: opacity });
  } else if (layer._isCluster === true) {
    layer.eachLayer((subLayer) => {
      if (subLayer.eachLayer) {
        subLayer.eachLayer((marker) => {
          if (marker.setOpacity) marker.setOpacity(opacity);
          else if (marker.setStyle) marker.setStyle({ fillOpacity: opacity, opacity: opacity });
        });
      } else if (subLayer.setOpacity) subLayer.setOpacity(opacity);
      else if (subLayer.setStyle) subLayer.setStyle({ fillOpacity: opacity, opacity: opacity });
    });
  } else if (layer.setStyle) {
    layer.setStyle({ fillOpacity: opacity, opacity: opacity });
    layer.eachLayer((subLayer) => {
      if (subLayer.setOpacity) subLayer.setOpacity(opacity);
      else if (subLayer.setStyle) subLayer.setStyle({ fillOpacity: opacity, opacity: opacity });
    });
  } else if (layer.setOpacity) {
    layer.setOpacity(opacity);
  }
}