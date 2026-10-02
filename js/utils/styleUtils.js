// Funciones para aplicar estilos a las capas.
import { escapeHtml, safeHTML } from './helpers.js';

/**
 * Obtiene el estilo de un punto para una característica GeoJSON.
 * @param {object} feature - La característica GeoJSON.
 * @param {object} configCapa - La configuración de estilo para la capa específica del tema.
 * @returns {object} Un objeto de estilo de Leaflet para puntos.
 */

// ── Formato de íconos ───
const ICON_EXTENSION = '.webp';

/**
 * Normaliza el nombre de archivo de un ícono al formato activo del proyecto.
 * Acepta .png o .webp y devuelve siempre ICON_EXTENSION.
 * @param {string} filename
 * @returns {string}
 */
const normalizeIconFilename = (filename) => {
  if (!filename) return filename;
  return filename.replace(/\.(png|webp)$/i, ICON_EXTENSION);
};

export function getPointStyle(feature, configCapa) {
  if (!feature || !feature.geometry || !feature.geometry.type) {
    console.warn("Feature inválido o sin geometría en getPointStyle");
    return {};
  }
  if (
    feature.geometry.type !== "Point" &&
    feature.geometry.type !== "MultiPoint"
  ) {
    console.warn(
      "getPointStyle solo es aplicable a geometrías Point o MultiPoint"
    );
    return {};
  }
  const atributoValor = configCapa.atributo
    ? feature.properties[configCapa.atributo]
    : null;
  let iconUrl = configCapa.estiloAlternativo?.iconUrl;
  if (configCapa.iconos && atributoValor && configCapa.iconos[atributoValor]) {
    iconUrl = `./assets/icons/${normalizeIconFilename(configCapa.iconos[atributoValor])}`;
  } else {
    if (configCapa.estiloAlternativo && configCapa.estiloAlternativo.iconUrl) {
      iconUrl = `./assets/icons/${normalizeIconFilename(configCapa.estiloAlternativo.iconUrl)}`;
    }
  }
  if (iconUrl) {
    return {
      icon: L.icon({
        iconUrl: iconUrl,
        iconSize: configCapa.estiloAlternativo?.iconSize || [25, 25],
        iconAnchor: configCapa.estiloAlternativo?.iconAnchor || [12, 25],
        popupAnchor: configCapa.estiloAlternativo?.popupAnchor || [0, -25],
      }),
    };
  } else {
    return {
      color: configCapa.estiloAlternativo?.color || "#333",
      fillColor: configCapa.estiloAlternativo?.fillColor || "#555",
      radius: configCapa.estiloAlternativo?.radius || 5,
      weight: configCapa.estiloAlternativo?.weight || 1,
      fillOpacity: configCapa.estiloAlternativo?.fillOpacity || 0.8,
    };
  }
}

/**
 * Obtiene el estilo para una característica GeoJSON (líneas y polígonos).
 * @param {object} feature - La característica GeoJSON.
 * @param {object} configCapa - La configuración de la capa específica.
 * @returns {object} Un objeto de estilo de Leaflet.
 */
export function getEstiloCapa(feature, configCapa) {
  if (!feature || !feature.geometry || !feature.geometry.type) {
    console.warn("Feature inválido o sin geometría en getEstiloCapa");
    return {};
  }
  if (!configCapa) {
    console.warn("Configuración de capa no encontrada.");
    return { color: "#333" };
  }
  const atributoValor = configCapa.atributo
    ? feature.properties[configCapa.atributo]
    : null;
  // Para líneas (LineString o MultiLineString)
  if (
    feature.geometry.type === "LineString" ||
    feature.geometry.type === "MultiLineString"
  ) {
    // Prioridad de color:
    //  1. Color del atributo mapeado en configCapa.colores
    //  2. configCapa.estiloBase.color (color base configurado)
    //  3. Azul por defecto de Leaflet (#3388ff) — nunca gris invisible
    const lineColor =
      (configCapa.colores && atributoValor && configCapa.colores[atributoValor])
        ? configCapa.colores[atributoValor]
        : (configCapa.estiloBase?.color || "#3388ff");
    return {
      ...(configCapa.estiloBase || {}),
      color: lineColor,
    };
  }
  // Para polígonos (Polygon o MultiPolygon)
  if (
    feature.geometry.type === "Polygon" ||
    feature.geometry.type === "MultiPolygon"
  ) {
    const fillOpacity =
      configCapa.estiloBase && configCapa.estiloBase.fillOpacity !== undefined
        ? configCapa.estiloBase.fillOpacity
        : 0.7;

    return {
      ...(configCapa.estiloBase || {}),
      fillColor:
        configCapa.colores && atributoValor && configCapa.colores[atributoValor]
          ? configCapa.colores[atributoValor]
          : "#CCC",
      fillOpacity: fillOpacity,
      fill: fillOpacity > 0,
      color: configCapa.estiloBase?.color || "#333",
      weight: configCapa.estiloBase?.weight || 1,
      opacity: configCapa.estiloBase?.opacity || 0.8,
      interactive: true,
    };
  }
  // Para puntos - se maneja con getPointStyle
  if (
    feature.geometry.type === "Point" ||
    feature.geometry.type === "MultiPoint"
  ) {
    return {};
  }
  return {};
}

/**
 * Genera el contenido HTML para un popup de Leaflet.
 * @param {object} feature - La característica GeoJSON.
 * @param {object} configCapa - La configuración de estilo para la capa específica del tema.
 * @returns {string} El contenido HTML del popup.
 */
export function getPopupContent(feature, configCapa) {
  if (
    !feature ||
    !feature.properties ||
    !configCapa ||
    !configCapa.popupCampos
  ) {
    console.warn("Feature o configuración de capa inválida para el popup.");
    return '<div class="custom-popup">Información no disponible.</div>';
  }
  let content = '<div class="custom-popup">';
  // Usar el alias para los nombres de los campos en el popup
  const alias = configCapa.alias || {};
  // Obtener claves reales del feature para búsqueda insensible a mayúsculas
  const featureKeys = Object.keys(feature.properties);
  configCapa.popupCampos.forEach((campo) => {
    let valor = feature.properties[campo];
    // Si no encuentra el valor exacto, intentar búsqueda insensible a mayúsculas
    if (valor === undefined) {
      const keyMatch = featureKeys.find(k => k.toLowerCase() === campo.toLowerCase());
      if (keyMatch) {
        valor = feature.properties[keyMatch];
      }
    }
    const nombreVisible = alias[campo] || campo;
    if (valor !== undefined && valor !== null && valor !== "") {
      // nombreVisible viene de la config (controlado), pero se escapa por defensa.
      // valorConEnlaces ya escapa el texto y solo genera <a> para URLs http(s).
      const valorConEnlaces = convertirURLsAEnlaces(String(valor));
      content += `<p><strong>${escapeHtml(nombreVisible)}:</strong> ${valorConEnlaces}</p>`;
    }
  });
  content += "</div>";
  // Sanitizar el HTML final antes de inyectarlo en el DOM para prevenir ataques XSS
  return safeHTML(content);
}

/**
 * Convierte URLs en texto a enlaces clicables.
 * Escapa todo el contenido (incluido texto sin URL) y solo genera `<a>` para http(s).
 * @param {string} text - El texto que puede contener URLs.
 * @returns {string} El texto con URLs convertidas a enlaces HTML seguros.
 */
function convertirURLsAEnlaces(text) {
  if (typeof text !== "string") {
    return escapeHtml(String(text ?? ""));
  }
  // Expresión regular para detectar URLs
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;
  // Escapamos TODO el texto primero; luego reintroducimos <a> sobre el texto ya escapado.
  const escaped = escapeHtml(text);
  return escaped.replace(urlRegex, function (url) {
    // Tras el escape, la URL puede tener entidades HTML (&amp;, etc.).
    // Para el href las revertimos de forma controlada.
    const decodedForHref = url
      .replace(/&amp;/g, "&")
      .replace(/&#x2F;/g, "/")
      .replace(/&#x3D;/g, "=")
      .replace(/&#x60;/g, "`")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"');
    const cleanUrl = decodedForHref.replace(/[.,;:!?]$/, "");
    const punctuation = decodedForHref.slice(cleanUrl.length);
    const escapedHref = cleanUrl.replace(/"/g, "&quot;");
    // El texto visible vuelve a escaparse para que sea seguro en el HTML.
    const visibleText = escapeHtml(cleanUrl);
    return `<a href="${escapedHref}" target="_blank" rel="noopener noreferrer">${visibleText}</a>${punctuation}`;
  });
}

/**
 * Configuración global para estilos de popup
 * Permite personalizar los tamaños de fuente globalmente
 */
export const POPUP_CONFIG = {
  // Tamaños de fuente (en px)
  titleFontSize: 12,
  contentFontSize: 10,
  labelFontSize: 10,
  // Tamaños para móvil
  mobile: {
    titleFontSize: 12,
    contentFontSize: 10,
    labelFontSize: 10,
  },
  // Tamaños para pantallas muy pequeñas
  small: {
    titleFontSize: 11,
    contentFontSize: 9,
    labelFontSize: 9,
  },
};

/**
 * Aplica estilos dinámicos al popup basado en la configuración
 * Esta función puede ser llamada para actualizar estilos globalmente
 */
export function applyGlobalPopupStyles() {
  let styleElement = document.getElementById("dynamic-popup-styles");
  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = "dynamic-popup-styles";
    document.head.appendChild(styleElement);
  }
  const config = POPUP_CONFIG;
  styleElement.textContent = `
        .custom-popup {
            font-size: ${config.contentFontSize}px !important;
        }
        .custom-popup .popup-title {
            font-size: ${config.titleFontSize}px !important;
        }
        .custom-popup p {
            font-size: ${config.contentFontSize}px !important;
        }
        .custom-popup p strong {
            font-size: ${config.labelFontSize}px !important;
        }
        .custom-popup a {
            font-size: ${config.contentFontSize}px !important;
        }
        
        @media (max-width: 768px) {
            .custom-popup {
                font-size: ${config.mobile.contentFontSize}px !important;
            }
            .custom-popup .popup-title {
                font-size: ${config.mobile.titleFontSize}px !important;
            }
            .custom-popup p {
                font-size: ${config.mobile.contentFontSize}px !important;
            }
            .custom-popup p strong {
                font-size: ${config.mobile.labelFontSize}px !important;
            }
            .custom-popup a {
                font-size: ${config.mobile.contentFontSize}px !important;
            }
        }
        
        @media (max-width: 480px) {
            .custom-popup {
                font-size: ${config.small.contentFontSize}px !important;
            }
            .custom-popup .popup-title {
                font-size: ${config.small.titleFontSize}px !important;
            }
            .custom-popup p {
                font-size: ${config.small.contentFontSize}px !important;
            }
            .custom-popup p strong {
                font-size: ${config.small.labelFontSize}px !important;
            }
            .custom-popup a {
                font-size: ${config.small.contentFontSize}px !important;
            }
        }
    `;
}

/**
 * Añade etiquetas a una característica individual usando L.Tooltip.
 *
 * IMPORTANTE: el texto de la etiqueta se escapa antes de inyectarse,
 * porque proviene de `feature.properties` (dato del GeoJSON, no controlado).
 *
 * @param {L.Layer} layer - La capa de Leaflet (marker, polygon, etc.).
 * @param {object} feature - La característica GeoJSON.
 * @param {object} configEtiquetas - La configuración de etiquetas.
 */
export function addLabelsToLayer(layer, feature, configEtiquetas) {
  // VALIDACIONES
  if (!configEtiquetas || !configEtiquetas.campo) {
    return;
  }
  if (!feature || !feature.properties) {
    console.warn("addLabelsToLayer: Feature o properties inválidos");
    return;
  }
  const rawLabelText = feature.properties[configEtiquetas.campo];
  if (rawLabelText === undefined || rawLabelText === null || rawLabelText === "") {
    return;
  }
  // Escapamos el texto para prevenir XSS en el tooltip
  const labelText = escapeHtml(String(rawLabelText));

  // CONFIGURACIÓN DE ESTILOS
  const estilo = configEtiquetas.estilo || {};
  const {
    color = "#000000",
    fontSize = "9px",
    fontFamily = "Arial, sans-serif",
    fontWeight = "normal",
    bufferColor = "#ffffff",
    bufferWidth = 2,
    offsetX = 0,
    offsetY = 0,
  } = estilo;

  // DETERMINAR POSICIÓN SEGÚN TIPO DE GEOMETRÍA
  let labelPosition = null;
  const geomType = feature.geometry?.type;
  try {
    if (geomType === "Polygon" || geomType === "MultiPolygon") {
      if (layer.getCenter) {
        labelPosition = layer.getCenter();
      } else if (layer.getBounds) {
        labelPosition = layer.getBounds().getCenter();
      }
    } else if (geomType === "LineString" || geomType === "MultiLineString") {
      if (layer.getBounds) {
        labelPosition = layer.getBounds().getCenter();
      }
    } else if (geomType === "Point" || geomType === "MultiPoint") {
      if (layer.getLatLng) {
        labelPosition = layer.getLatLng();
      }
    } else {
      console.warn("addLabelsToLayer: Tipo de geometría no soportado:", geomType);
      return;
    }
  } catch (error) {
    console.warn("addLabelsToLayer: Error al determinar posición:", error);
    return;
  }
  if (!labelPosition) {
    console.warn("addLabelsToLayer: No se pudo determinar la posición de la etiqueta");
    return;
  }

  // CONFIGURAR OPCIONES DEL TOOLTIP
  const tooltipOptions = {
    permanent: configEtiquetas.permanent !== false, // true por defecto
    direction: "center",
    className: "custom-map-label",
    offset: L.point(offsetX, offsetY),
    opacity: 1,
  };

  // CREAR CONTENIDO DEL TOOLTIP
  // labelText ya está escapado; los colores vienen de config (controlados).
  let content = "";
  if (bufferWidth > 0) {
    content = `<span class="label-with-stroke" style="
            color: ${color};
            font-size: ${fontSize};
            font-family: ${fontFamily};
            font-weight: ${fontWeight};
            -webkit-text-stroke: ${bufferWidth}px ${bufferColor};
            paint-order: stroke fill;
            text-shadow: 
                ${bufferWidth}px ${bufferWidth}px 0 ${bufferColor},
                -${bufferWidth}px -${bufferWidth}px 0 ${bufferColor},
                ${bufferWidth}px -${bufferWidth}px 0 ${bufferColor},
                -${bufferWidth}px ${bufferWidth}px 0 ${bufferColor},
                0 ${bufferWidth}px 0 ${bufferColor},
                0 -${bufferWidth}px 0 ${bufferColor},
                ${bufferWidth}px 0 0 ${bufferColor},
                -${bufferWidth}px 0 0 ${bufferColor};
            white-space: nowrap;
            display: inline-block;
        ">${labelText}</span>`;
  } else {
    content = `<span style="
            color: ${color};
            font-size: ${fontSize};
            font-family: ${fontFamily};
            font-weight: ${fontWeight};
            white-space: nowrap;
            display: inline-block;
        ">${labelText}</span>`;
  }

  // CREAR Y VINCULAR EL TOOLTIP
  const tooltip = L.tooltip(tooltipOptions);
  tooltip.setContent(content);
  layer.bindTooltip(tooltip);
  if (tooltipOptions.permanent) {
    layer.openTooltip();
  }

  // APLICAR ESTILOS ADICIONALES AL AGREGAR AL MAPA
  layer.on("add", function () {
    const tooltipElement = layer.getTooltip()?._container;
    if (tooltipElement) {
      tooltipElement.style.zIndex = "1000";
      tooltipElement.style.pointerEvents = "none";
      tooltipElement.style.background = "transparent";
      tooltipElement.style.border = "none";
      tooltipElement.style.boxShadow = "none";
      tooltipElement.style.padding = "0";
    }
  });
}