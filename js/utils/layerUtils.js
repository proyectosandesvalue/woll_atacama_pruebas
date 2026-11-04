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
   // Excepción: ARClim se carga directamente en el hilo principal (sin worker)
  // porque el worker no resuelve correctamente la ruta relativa /api/...
  if (configCapa.url && configCapa.url.startsWith("/api/")) {
    const res = await fetch(configCapa.url);
    if (!res.ok) throw new Error(`HTTP ${res.status} al cargar ${configCapa.url}`);
    return await res.json();
  }
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
      if (shouldUseGlify(configCapa) && !configCapa.choropleth) {
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
                        if (configCapa.indicatorId) {
              layer.on("click", (e) => {
                L.DomEvent.stopPropagation(e);
                
                const props = feature.properties;
                const nombre = props.NOM_COMUNA || "Comuna";
                
                const activeField = configCapa.choropleth.field;
                const val = props[activeField] || 0;
                
                // Parse: $CLIMA$<ind>$<season>$<scenarioKey>
                const parts = activeField.replace(/^\$CLIMA\$/, "").split("$");
                const season = parts[1];
                const scenarioKey = parts.slice(2).join("$");
                
                const scenario = (configCapa.scenarioOptions || []).find(o => o.key === scenarioKey);
                const seasonOpt = (configCapa.seasonOptions || []).find(o => o.value === season);
                const scenarioDesc = (configCapa.scenarioDescriptions || {})[scenarioKey] || "";
                const isDelta = scenarioKey.startsWith("delta");
                const displayUnit = isDelta && configCapa.deltaType === "rel" ? "%" : configCapa.unit;

                const sidebar = document.getElementById("sidebarInfo");
                const title = document.getElementById("sidebarInfoTitle");
                const content = document.getElementById("sidebarInfoContent");

                if (sidebar && title && content) {
                  title.innerHTML = `<span class="material-symbols-outlined" style="font-size: 18px;">info</span> ${nombre}`;
                  
                  content.innerHTML = `
                    <div class="custom-popup" style="padding: 4px;">
                      <p style="margin: 0 0 16px 0; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5;">
                        ${configCapa.descripcion}
                      </p>
                      <p style="margin: 0 0 12px 0; font-size: 0.75rem; color: var(--text-tertiary); line-height: 1.4; font-style: italic;">
                        Los índices cuantifican la ocurrencia de condiciones meteorológicas potencialmente adversas, calculadas a partir de la distribución diaria de variables atmosféricas.
                      </p>
                      
                      <div style="background: var(--bg-surface-2); padding: 16px; border-radius: 8px; border-left: 4px solid var(--color-brand-text); margin-bottom: 16px;">
                        <span style="display: block; font-size: 0.75rem; text-transform: uppercase; color: var(--text-tertiary); font-weight: 700; letter-spacing: 0.05em; margin-bottom: 4px;">
                          ${scenario ? scenario.label : scenarioKey}${seasonOpt && seasonOpt.value !== "annual" ? ` · ${seasonOpt.label}` : ""}
                        </span>
                        <span style="font-size: 1.6rem; font-weight: 800; color: var(--color-brand-text);">
                          ${isDelta && val > 0 ? "+" : ""}${Number(val).toFixed(2)} <span style="font-size: 1rem; font-weight: 600;">${displayUnit}</span>
                        </span>
                      </div>

                      <!-- Gráfico comparativo con botones de acción -->
                      <div style="margin-bottom: 16px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                          <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary);">Comparativa de Escenarios</span>
                          <div style="display: flex; gap: 8px;">
                            <button id="arclimSidebarExpand" style="background: transparent; border: none; cursor: pointer; color: var(--text-tertiary); display: flex;" title="Agrandar gráfico">
                              <span class="material-symbols-outlined" style="font-size: 18px;">open_in_full</span>
                            </button>
                            <button id="arclimSidebarDownload" style="background: transparent; border: none; cursor: pointer; color: var(--text-tertiary); display: flex;" title="Descargar imagen">
                              <span class="material-symbols-outlined" style="font-size: 18px;">download</span>
                            </button>
                          </div>
                        </div>
                        <div style="height: 160px; position: relative;">
                          <canvas id="arclimSidebarChart"></canvas>
                        </div>
                      </div>

                      <div style="margin-top: 16px; padding: 12px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 6px;">
                        <span style="display: block; font-size: 0.7rem; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">Sobre el escenario</span>
                        <span style="font-size: 0.75rem; color: var(--text-secondary); line-height: 1.4;">${scenarioDesc}</span>
                      </div>
                      <p style="margin-top: 20px; font-size: 0.7rem; color: var(--text-tertiary); text-align: center; line-height: 1.4;">
                        Fuente: <a href="https://arclim.mma.gob.cl/" target="_blank" style="color: var(--color-brand-text); text-decoration: none; font-weight: 600;">ARClim (MMA)</a><br>
                        <span style="font-size: 0.65rem;">Para más información, visite el <a href="https://www.ipcc.ch/report/ar6/wg1/chapter/technical-summary/" target="_blank" style="color: var(--color-brand-text); text-decoration: underline;">Resumen Técnico del IPCC AR6 WG1</a>.</span>
                      </p>
                    </div>
                  `;
                  sidebar.classList.add("active");

                  // Extraer los valores para el gráfico (AHORA ESTÁ DENTRO DEL IF)
                  const fieldPresent = `$CLIMA$${configCapa.indicatorId}$${season}$present`;
                  const fieldFuture45 = `$CLIMA$${configCapa.indicatorId}$${season}$future$ssp245`;
                  const fieldFuture85 = `$CLIMA$${configCapa.indicatorId}$${season}$future$ssp585`;
                  
                  const dataForChart = [
                    props[fieldPresent] || 0,
                    props[fieldFuture45] || 0,
                    props[fieldFuture85] || 0
                  ];

                  setTimeout(() => {
                    const canvas = document.getElementById("arclimSidebarChart");
                    if (!canvas) return;

                    if (window._arclimSidebarChart) window._arclimSidebarChart.destroy();

                    window._arclimSidebarChart = new Chart(canvas.getContext("2d"), {
                      type: 'bar',
                      data: {
                        labels: ['Histórico', 'SSP2-4.5', 'SSP5-8.5'],
                        datasets: [{
                          label: configCapa.nombrePersonalizado,
                          data: dataForChart,
                          backgroundColor: ['#94a3b8', '#f59e0b', '#ef4444'],
                          borderRadius: 4
                        }]
                      },
                      options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { display: false },
                          tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.y.toFixed(2)} ${configCapa.unit}` } }
                        },
                        scales: {
                          y: { beginAtZero: true, ticks: { font: { size: 10 } } },
                          x: { ticks: { font: { size: 10, weight: 'bold' } } }
                        }
                      }
                    });

                    // LISTENER: Descargar Gráfico
                    document.getElementById("arclimSidebarDownload")?.addEventListener("click", () => {
                      const link = document.createElement("a");
                      link.download = `ARClim_${nombre}_${season}.png`;
                      link.href = window._arclimSidebarChart.toBase64Image();
                      link.click();
                    });

                    // LISTENER: Agrandar Gráfico (usando el modal existente)
                    document.getElementById("arclimSidebarExpand")?.addEventListener("click", () => {
                      const modal = document.getElementById("chartModal");
                      const modalTitle = document.getElementById("chartModalTitle");
                      const body = document.getElementById("chartModalBody");
                      if (!modal || !body) return;

                      modalTitle.textContent = `Comparativa de Escenarios · ${nombre}`;
                      body.style.background = "var(--bg-surface-2)";
                      body.innerHTML = `
                        <div style="padding: 24px; height: 500px; background: var(--bg-surface); border-radius: 8px;">
                          <canvas id="arclimExpandedChart"></canvas>
                        </div>
                      `;
                      modal.showModal();

                      setTimeout(() => {
                        const expCanvas = document.getElementById("arclimExpandedChart");
                        if (!expCanvas) return;
                        if (window._arclimExpandedChart) window._arclimExpandedChart.destroy();

                        window._arclimExpandedChart = new Chart(expCanvas.getContext("2d"), {
                          type: 'bar',
                          data: {
                            labels: ['Histórico (1980-2010)', 'Futuro SSP2-4.5', 'Futuro SSP5-8.5'],
                            datasets: [{
                              label: configCapa.nombrePersonalizado,
                              data: dataForChart,
                              backgroundColor: ['#94a3b8', '#f59e0b', '#ef4444'],
                              borderRadius: 6,
                              barPercentage: 0.5
                            }]
                          },
                          options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                              legend: { display: false },
                              tooltip: {
                                titleFont: { size: 16 },
                                bodyFont: { size: 14 },
                                callbacks: { label: (ctx) => ` ${ctx.parsed.y.toFixed(2)} ${configCapa.unit}` }
                              }
                            },
                            scales: {
                              y: { beginAtZero: true, title: { display: true, text: configCapa.unit, font: { size: 14, weight: 'bold' } }, ticks: { font: { size: 12 } } },
                              x: { ticks: { font: { size: 13, weight: 'bold' } }, grid: { display: false } }
                            }
                          }
                        });
                      }, 50);
                    });

                  }, 50);
                } 
              }); 
            } else { 
              bindPopup(feature, layer, configCapa);
            }
            
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
          // Soporte para choropleth (mapa de calor por polígonos)
          options.style = (feature) => {
            if (configCapa.choropleth) {
              const field = configCapa.choropleth.field;
              const rawVal = feature.properties?.[field];
              if (rawVal !== undefined && rawVal !== null && !isNaN(Number(rawVal))) {
                const baseStyle = getEstiloCapa(feature, configCapa);
                return {
                  ...baseStyle,
                  fillColor: getChoroplethColor(Number(rawVal), configCapa.choropleth.scale),
                  fillOpacity: 0.8,
                  color: "#ffffff",
                  weight: 1,
                };
              }
            }
            return getEstiloCapa(feature, configCapa);
          };
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

/**
 * Devuelve un color hex basado en una escala de stops.
 */
function getChoroplethColor(value, scale) {
  if (!scale || scale.length === 0) return "#cccccc";
  if (value <= scale[0].value) return scale[0].color;
  for (let i = 0; i < scale.length - 1; i++) {
    if (value >= scale[i].value && value <= scale[i + 1].value) {
      const ratio = (value - scale[i].value) / (scale[i + 1].value - scale[i].value);
      return interpolateColor(scale[i].color, scale[i + 1].color, ratio);
    }
  }
  return scale[scale.length - 1].color;
}

export function updateChoropleth(capaNombre, newField, newScale, configCapa) {
  configCapa.choropleth.field = newField;
  if (newScale) configCapa.choropleth.scale = newScale;

  const layer = getLayer(capaNombre);
  if (!layer) return;

  layer.setStyle((feature) => {
    const rawVal = feature.properties?.[newField];
    if (rawVal !== undefined && rawVal !== null && !isNaN(Number(rawVal))) {
      return {
        fillColor: getChoroplethColor(Number(rawVal), configCapa.choropleth.scale),
        fillOpacity: 0.8,
        color: "#ffffff",
        weight: 1,
      };
    }
    return getEstiloCapa(feature, configCapa);
  });
}

/**
 * Interpola entre dos colores hex.
 */
function interpolateColor(c1, c2, ratio) {
  const r1 = parseInt(c1.slice(1, 3), 16);
  const g1 = parseInt(c1.slice(3, 5), 16);
  const b1 = parseInt(c1.slice(5, 7), 16);
  const r2 = parseInt(c2.slice(1, 3), 16);
  const g2 = parseInt(c2.slice(3, 5), 16);
  const b2 = parseInt(c2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
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