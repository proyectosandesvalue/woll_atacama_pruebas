/**
 * chatMapUtils.js — Pinta los resultados geojson del chat en el mapa.
 *
 * Soporta múltiples capas simultáneas, cada una con su propio styleConfig
 * (coloreo por atributo) y su propia familia de paleta.
 *
 * @module utils/chatMapUtils
 */

import { appState } from "../store/appState.js";
import { createContextLogger } from "./logger.js";

const log = createContextLogger("ChatMap");

const PANE_NAME = "chatResults";
const PANE_ZINDEX = 1000;

/**
 * Estilos por defecto por tipo de geometría.
 * Se usan cuando NO hay styleConfig.
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
    fillOpacity: 0.25,
  },
};

/**
 * 8 familias de paletas. Cada capa usa una familia distinta.
 * Cuando se superan las 8 capas, se reinicia el ciclo.
 */
const PALETTES = {
  blue: ["#1A19CC", "#5B9BD5", "#2f3562", "#8b8aff", "#4A90E2", "#1F3A93"],
  green: ["#38A78C", "#2A9D8F", "#7ED9A8", "#1F7A6B", "#4CAF50", "#2E7D32"],
  orange: ["#FF7A45", "#FFB93D", "#F4A261", "#D95D39", "#E67E22", "#D35400"],
  magenta: ["#D94A8C", "#A67C52", "#7D5BA6", "#C75A9E", "#E91E63", "#AD1457"],
  purple: ["#7D5BA6", "#9B59B6", "#8E44AD", "#6C3483", "#BB8FCE", "#4A235A"],
  teal: ["#2A9D8F", "#38A78C", "#1ABC9C", "#16A085", "#48C9B0", "#0E6251"],
  red: ["#D95D39", "#E74C3C", "#C0392B", "#FF5552", "#E67E22", "#922B21"],
  yellow: ["#FFB93D", "#F1C40F", "#F4A261", "#F39C12", "#F7DC6F", "#D4AC0D"],
};

const PALETTE_FAMILIES = Object.keys(PALETTES);

/**
 * Devuelve la siguiente familia de paleta en la rotación.
 */
function nextPaletteFamily() {
  const idx = appState.chat.paletteCounter % PALETTE_FAMILIES.length;
  appState.chat.paletteCounter++;
  return PALETTE_FAMILIES[idx];
}

// ── Utilidades HTML ────────────────────────────────────────────

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Asegura que exista el pane dedicado a los resultados del chat.
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
 * Devuelve un color estable para cada valor dentro de una familia de paleta.
 */
function getColorForValue(value, cache, paletteFamily) {
  const palette = PALETTES[paletteFamily] || PALETTES.blue;
  const key = value == null || value === "" ? "(sin dato)" : String(value);
  if (cache.has(key)) return cache.get(key);
  const color = palette[cache.size % palette.length];
  cache.set(key, color);
  return color;
}

/**
 * Construye un styleConfig a partir de options.styleConfig o options.style_hint.
 */
function buildStyleConfig(options) {
  const hint = options?.styleConfig || options?.style_hint;
  if (!hint || !hint.attribute) return null;
  return {
    attribute: hint.attribute,
    paletteFamily: hint.palette_family || null,
    kind: hint.kind || "choropleth-points",
  };
}

/**
 * Devuelve una función de estilo Leaflet que aplica color por feature.
 */
function makeFeatureStyler(baseStyle, styleConfig, colorCache) {
  if (!styleConfig) {
    return () => baseStyle;
  }
  const attr = styleConfig.attribute;
  const family = styleConfig.paletteFamily || "blue";
  return (feature) => {
    const value = feature?.properties?.[attr];
    const color = getColorForValue(value, colorCache, family);
    return {
      ...baseStyle,
      color: color,
      fillColor: color,
      fillOpacity: 0.55,
      weight: 2,
      opacity: 1,
    };
  };
}

/**
 * Genera el HTML de la lista de swatches.
 */
function buildLegendHtml(colorCache) {
  if (!colorCache || colorCache.size === 0) return "";
  const entries = Array.from(colorCache.entries()).sort(([a], [b]) =>
    String(a).localeCompare(String(b), "es")
  );
  return entries
    .map(
      ([value, color]) => `
      <div class="legend-item">
        <span class="legend-swatch" style="background:${color}"></span>
        <span class="legend-label">${escapeHtml(value)}</span>
      </div>
    `
    )
    .join("");
}


function capitalize(str) {
  if (!str || typeof str !== "string") return str;
  return str
    .replace(/_/g, " ")
    .split(" ")
    .map((w) =>
      w.length === 0 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()
    )
    .join(" ");
}

/**
 * Renderiza la leyenda multi-sección: una por capa con su nombre visible.
 * Cada sección tiene un botón para quitar esa capa específica.
 */
function renderLegend() {
  const container = document.getElementById("sidebar-legend");
  if (!container) return;

  // Eliminar todas las secciones previas del chat.
  container
    .querySelectorAll(".chat-legend-section")
    .forEach((el) => el.remove());

  const layers = appState.chat.resultsLayers || [];
  if (layers.length === 0) return;

  // Crear una sección por capa, en orden inverso (última arriba).
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    const section = document.createElement("div");
    section.className = "chat-legend-section legend-container mb-3";
    section.dataset.layerId = layer.layerId || "";

    const titleText =
      (layer.layerLabel && String(layer.layerLabel).trim()) ||
      capitalize(layer.layerId) ||
      "Capa";

    const attributeLabel = layer.styleHint?.attribute
      ? ` · por ${layer.styleHint.attribute.toLowerCase()}`
      : "";

    // Construir el cuerpo de la leyenda:
    //   - Si hay colorCache (style_hint), mostrar swatches por valor.
    //   - Si no, mostrar un item genérico con el color base.
    const colorCache = layer.colorCache || new Map();
    let swatchesHtml = buildLegendHtml(colorCache);

    if (!swatchesHtml || !swatchesHtml.trim()) {
      // Fallback: item genérico.
      const fallbackLabel = layer.layerLabel || capitalize(layer.layerId) || "Elementos";
      const fallbackColor = STYLES.point.fillColor || "#FF3B30";
      swatchesHtml = `
        <div class="legend-item">
          <span class="legend-swatch" style="background:${fallbackColor}"></span>
          <span class="legend-label">${escapeHtml(fallbackLabel)}</span>
        </div>
      `;
    }

    section.innerHTML = `
      <div class="chat-legend-section-header">
        <h6 class="fw-bold text-primary mb-2 legend-title chat-legend-title">
          <span class="material-symbols-outlined chat-legend-title-icon">auto_awesome</span>
          ${escapeHtml(titleText)}${attributeLabel}
        </h6>
        <button class="chat-legend-remove" type="button" title="Quitar esta capa" data-layer-id="${escapeHtml(layer.layerId || "")}">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="chat-legend-body">${swatchesHtml}</div>
    `;

    container.insertBefore(section, container.firstChild);
  }

  // Listener para los botones de "quitar capa".
  container.querySelectorAll(".chat-legend-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const layerId = btn.dataset.layerId;
      if (layerId) {
        clearResultsByLayerId(layerId);
        renderLegend();
      }
    });
  });
}

/**
 * Construye el HTML del popup para una feature.
 */
function buildPopup(feature) {
  const props = feature?.properties || {};
  if (Object.keys(props).length === 0) return "";

  const TECH_FIELDS =
    /^(id|fid|objectid|gid|geom|geometry|the_geom|shape_leng|shape_area)$/i;

  const keys = Object.keys(props).filter(
    (k) => !TECH_FIELDS.test(k) && props[k] != null && props[k] !== ""
  );

  if (keys.length === 0) return "";

  const titleKey = keys.find((k) =>
    /^nombre$|^name$|^titulo$|^título$/i.test(k)
  );
  const title = titleKey ? escapeHtml(props[titleKey]) : "";

  const rows = keys
    .filter((k) => k !== titleKey)
    .slice(0, 10)
    .map((k) => {
      const v = props[k];
      const str = String(v);
      const truncated = str.length > 140 ? str.slice(0, 140) + "…" : str;
      return `<p><strong>${escapeHtml(k)}:</strong> ${escapeHtml(truncated)}</p>`;
    })
    .filter(Boolean)
    .join("");

  if (!rows && !title) return "";

  return `
    <div class="custom-popup">
      ${title ? `<div class="popup-title">${title}</div>` : ""}
      ${rows}
    </div>
  `;
}

/**
 * Pinta UN geojson. Lo agrega a resultsLayers (no reemplaza).
 *
 * @param {object} geojson - FeatureCollection
 * @param {object} [options]
 * @param {boolean} [options.fitBounds=true]
 * @param {object} [options.styleConfig]
 * @param {string} [options.layerId] - ID de la capa (para acumulación)
 * @param {string} [options.layerLabel] - Nombre visible de la capa
 * @param {boolean} [options.clearExisting=false] - Si true, limpia las anteriores
 * @returns {boolean}
 */
export function showResults(geojson, options = {}) {
  const map = appState.map;
  if (!map) {
    log.warn("showResults: no hay mapa disponible");
    return false;
  }

  if (
    !geojson ||
    geojson.type !== "FeatureCollection" ||
    !Array.isArray(geojson.features)
  ) {
    log.warn("showResults: geojson inválido", geojson);
    return false;
  }

  if (geojson.features.length === 0) {
    log.debug("showResults: geojson vacío");
    return false;
  }

  // Si clearExisting, limpia todas las capas anteriores.
  if (options.clearExisting) {
    clearResults();
  }

  // Si ya existe una capa con el mismo layerId, la reemplaza.
  const layerId = options.layerId || options.styleConfig?.layer_id || null;
  if (layerId) {
    clearResultsByLayerId(layerId);
  }

  const styleConfig = buildStyleConfig(options);
  const colorCache = new Map();

  // Asignar familia de paleta si no hay.
  if (styleConfig && !styleConfig.paletteFamily) {
    styleConfig.paletteFamily = nextPaletteFamily();
  }

  const pane = ensurePane(map);
  const { points, lines, polygons } = classifyFeatures(geojson.features);

  const layers = [];

  const polygonStyleFn = makeFeatureStyler(
    STYLES.polygon,
    styleConfig,
    colorCache
  );
  const lineStyleFn = makeFeatureStyler(STYLES.line, styleConfig, colorCache);

  if (polygons.length > 0) {
    layers.push(
      L.geoJSON(
        { type: "FeatureCollection", features: polygons },
        {
          pane: PANE_NAME,
          style: polygonStyleFn,
          onEachFeature: (feature, layer) => {
            const popup = buildPopup(feature);
            if (popup) layer.bindPopup(popup);
          },
        }
      )
    );
  }

  if (lines.length > 0) {
    layers.push(
      L.geoJSON(
        { type: "FeatureCollection", features: lines },
        {
          pane: PANE_NAME,
          style: lineStyleFn,
          onEachFeature: (feature, layer) => {
            const popup = buildPopup(feature);
            if (popup) layer.bindPopup(popup);
          },
        }
      )
    );
  }

  if (points.length > 0) {
    layers.push(
      L.geoJSON(
        { type: "FeatureCollection", features: points },
        {
          pane: PANE_NAME,
          pointToLayer: (feature, latlng) => {
            let style = { ...STYLES.point, pane: PANE_NAME };
            if (styleConfig) {
              const value = feature?.properties?.[styleConfig.attribute];
              const color = getColorForValue(
                value,
                colorCache,
                styleConfig.paletteFamily
              );
              style = {
                ...style,
                fillColor: color,
                color: color,
              };
            }
            return L.circleMarker(latlng, style);
          },
          onEachFeature: (feature, layer) => {
            const popup = buildPopup(feature);
            if (popup) layer.bindPopup(popup);
          },
        }
      )
    );
  }

  const group = L.featureGroup(layers).addTo(map);

  // Registrar en resultsLayers.
  appState.chat.resultsLayers.push({
    layerId,
    layerLabel: options.layerLabel || null,
    geojson,
    styleHint: styleConfig,
    leafletLayer: group,
    colorCache,
  });

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

  renderLegend();

  log.debug(
    `Resultados pintados: ${geojson.features.length} features (layerId=${layerId}, total capas=${appState.chat.resultsLayers.length})`
  );
  return true;
}

/**
 * Limpia TODAS las capas de resultados del mapa.
 */
export function clearResults() {
  const layers = appState.chat.resultsLayers || [];
  for (const entry of layers) {
    if (
      entry.leafletLayer &&
      appState.map &&
      appState.map.hasLayer(entry.leafletLayer)
    ) {
      appState.map.removeLayer(entry.leafletLayer);
    }
  }
  appState.chat.resultsLayers = [];

  // Quitar la leyenda del chat.
  const container = document.getElementById("sidebar-legend");
  if (container) {
    container
      .querySelectorAll(".chat-legend-section")
      .forEach((el) => el.remove());
  }
}

/**
 * Limpia una capa específica de resultados (por layerId).
 */
export function clearResultsByLayerId(layerId) {
  const layers = appState.chat.resultsLayers || [];
  const remaining = [];

  for (const entry of layers) {
    if (entry.layerId === layerId) {
      if (
        entry.leafletLayer &&
        appState.map &&
        appState.map.hasLayer(entry.leafletLayer)
      ) {
        appState.map.removeLayer(entry.leafletLayer);
      }
    } else {
      remaining.push(entry);
    }
  }

  appState.chat.resultsLayers = remaining;
}

/**
 * Indica si hay resultados pintados actualmente.
 */
export function hasResults() {
  return (appState.chat.resultsLayers || []).length > 0;
}