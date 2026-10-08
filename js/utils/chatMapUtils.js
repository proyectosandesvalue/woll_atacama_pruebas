/**
 * chatMapUtils.js — Pinta los resultados geojson del chat en el mapa.
 *
 * El orquestador puede devolver un FeatureCollection (`payload.geojson`)
 * cuando el LLM usa la tool `get_layer_features`. Este módulo lo pinta
 * en una capa temporal destacada, con zoom automático.
 *
 * Soporta `styleConfig` opcional para colorear las features según un
 * atributo (por ejemplo, COMUNA) y generar una leyenda dinámica.
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
 * Paleta de colores para colorear por atributo.
 * Cicla si hay más valores únicos que colores.
 */
const ATTRIBUTE_PALETTE = [
  "#1A19CC", // azul WoLL
  "#FFB93D", // amarillo
  "#2f3562", // azul oscuro
  "#8b8aff", // lavanda
  "#FF7A45", // naranja
  "#38A78C", // verde
  "#D94A8C", // magenta
  "#5B9BD5", // celeste
  "#A67C52", // marrón
  "#7D5BA6", // violeta
  "#F4A261", // durazno
  "#2A9D8F", // verde azulado
];

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
 * Devuelve un color estable para cada valor (usando un Map de cache).
 */
function getColorForValue(value, cache) {
  const key = value == null || value === "" ? "(sin dato)" : String(value);
  if (cache.has(key)) return cache.get(key);
  const color = ATTRIBUTE_PALETTE[cache.size % ATTRIBUTE_PALETTE.length];
  cache.set(key, color);
  return color;
}

/**
 * Construye un styleConfig a partir de options.styleConfig o options.style_hint.
 * Devuelve null si no hay attribute.
 */
function buildStyleConfig(options) {
  const hint = options?.styleConfig || options?.style_hint;
  if (!hint || !hint.attribute) return null;
  return {
    attribute: hint.attribute,
    palette: hint.palette || ATTRIBUTE_PALETTE,
    kind: hint.kind || "choropleth-points",
  };
}

/**
 * Devuelve una función de estilo Leaflet que aplica color por feature
 * según el atributo del styleConfig. Si no hay styleConfig, devuelve
 * el estilo base sin cambios.
 *
 * Cuando se colorea por atributo:
 *   - Vértice y relleno usan el MISMO color (más coherente visualmente).
 *   - fillOpacity más alto (0.55) para que el color se vea.
 *   - weight más fino (2) para no tapar el relleno.
 */
function makeFeatureStyler(baseStyle, styleConfig, colorCache) {
  if (!styleConfig) {
    return () => baseStyle;
  }
  const attr = styleConfig.attribute;
  return (feature) => {
    const value = feature?.properties?.[attr];
    const color = getColorForValue(value, colorCache);
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
 * Genera el HTML de la lista de swatches a partir del colorCache.
 * El título se agrega en renderLegend (no acá).
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

/**
 * Inyecta la leyenda del chat como una sección más dentro del contenedor
 * #sidebar-legend. NO reemplaza la leyenda del visor: se apila arriba.
 *
 * Si html está vacío, elimina la sección del chat.
 */
function renderLegend(html, attributeLabel = "") {
  const container = document.getElementById("sidebar-legend");
  if (!container) return;

  // Eliminar la sección previa del chat si existía.
  const previous = container.querySelector(".chat-legend-section");
  if (previous) previous.remove();

  if (!html || !html.trim()) return;

  // Crear la nueva sección.
  const section = document.createElement("div");
  section.className = "chat-legend-section legend-container mb-3";
  section.innerHTML = `
    <h6 class="fw-bold text-primary mb-2 legend-title chat-legend-title">
      <span class="material-symbols-outlined chat-legend-title-icon">auto_awesome</span>
      Resultados del chat${attributeLabel ? ` · ${attributeLabel}` : ""}
    </h6>
    <div class="chat-legend-body">${html}</div>
  `;

  // Insertar al principio del contenedor para que aparezca arriba.
  container.insertBefore(section, container.firstChild);
}

/**
 * Construye el HTML del popup para una feature.
 */
function buildPopup(feature) {
  const props = feature?.properties || {};
  if (Object.keys(props).length === 0) return "";

  // Campos técnicos que NO se muestran al usuario.
  const TECH_FIELDS =
    /^(id|fid|objectid|gid|geom|geometry|the_geom|shape_leng|shape_area)$/i;

  // Filtrar campos técnicos y vacíos.
  const keys = Object.keys(props).filter(
    (k) => !TECH_FIELDS.test(k) && props[k] != null && props[k] !== ""
  );

  if (keys.length === 0) return "";

  // Título: primer campo que parezca "nombre".
  const titleKey = keys.find((k) =>
    /^nombre$|^name$|^titulo$|^título$/i.test(k)
  );
  const title = titleKey ? escapeHtml(props[titleKey]) : "";

  // Resto de campos como párrafos.
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
 * Pinta los resultados geojson en el mapa.
 *
 * @param {object} geojson - FeatureCollection
 * @param {object} [options]
 * @param {boolean} [options.fitBounds=true] - Hacer zoom a la extensión
 * @param {object} [options.styleConfig] - { attribute, palette, kind }
 * @returns {boolean} true si se pintó algo
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

    // Limpiar capa anterior antes de pintar la nueva.
  clearResults();

  const styleConfig = buildStyleConfig(options);
  const colorCache = new Map();

  // Limpiar la sección del chat en la leyenda si no vamos a colorear.
  if (!styleConfig) {
    renderLegend("");
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
                const color = getColorForValue(value, colorCache);
                style = {
                ...style,
                fillColor: color,
                color: color,  // vértice del mismo color que el relleno
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

    // Leyenda dinámica si hay styleConfig.
  if (styleConfig) {
    const attributeLabel = styleConfig.attribute
      ? `por ${styleConfig.attribute.toLowerCase()}`
      : "";
    const legendHtml = buildLegendHtml(colorCache);
    renderLegend(legendHtml, attributeLabel);
  }

  log.debug(`Resultados pintados: ${geojson.features.length} features`);
  return true;
}

/**
 * Limpia la capa de resultados del mapa.
 */
/**
 * Limpia la capa de resultados del mapa y su sección en la leyenda.
 */
export function clearResults() {
  const layer = appState.chat.resultsLayer;
  if (layer && appState.map && appState.map.hasLayer(layer)) {
    appState.map.removeLayer(layer);
  }
  appState.chat.resultsLayer = null;

  // Quitar la sección del chat de la leyenda.
  const container = document.getElementById("sidebar-legend");
  if (container) {
    const section = container.querySelector(".chat-legend-section");
    if (section) section.remove();
  }
}

/**
 * Indica si hay resultados pintados actualmente.
 */
export function hasResults() {
  return appState.chat.resultsLayer !== null;
}