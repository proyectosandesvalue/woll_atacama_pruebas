/**
 * Utilidades para manejo de leyendas del mapa
 * @module utils/legendUtils
 */

import leyendaAliasesGlobales from "../config/leyendaAliases.js";
import { normalizeIconFilename } from "./styleUtils.js";
import { createContextLogger } from "./logger.js";
import { appState } from "../store/appState.js";

const log = createContextLogger('LegendUtils');

/**
 * Actualiza la leyenda en la sidebar.
 * @param {string} tema - El tema actual.
 * @param {object} temasConfig - El objeto de configuración de temas.
 */
/**
 * Preserva la sección del chat antes de regenerar la leyenda,
 * y la reinserta después.
 */
function withChatLegendPreserved(container, fn) {
  const chatSections = Array.from(
    container.querySelectorAll(".chat-legend-section")
  );
  chatSections.forEach((s) => s.remove());

  try {
    fn();
  } finally {
    // Reinsertar las secciones del chat al principio, en orden inverso.
    for (let i = chatSections.length - 1; i >= 0; i--) {
      container.insertBefore(chatSections[i], container.firstChild);
    }
  }
}

/**
 * Actualiza la leyenda en la sidebar.
 * @param {string} tema - El tema actual.
 * @param {object} temasConfig - El objeto de configuración de temas.
 */
export function actualizarLeyenda(tema, temasConfig) {
  const sidebarLegendContainer = document.getElementById("sidebar-legend");

  if (!sidebarLegendContainer) {
    log.warn("Contenedor de leyenda no encontrado");
    return;
  }

  // Validar que existe el tema
  if (!temasConfig || !temasConfig[tema]) {
    log.warn(`No se encontró configuración para el tema: ${tema}`);
    withChatLegendPreserved(sidebarLegendContainer, () => {
      // Preservar el chat y mostrar mensaje de "no hay leyenda".
      const msg = document.createElement("p");
      msg.className = "text-muted small";
      msg.textContent = "No hay leyenda disponible para este tema.";
      // Solo agregar si no hay chat activo.
      if (sidebarLegendContainer.querySelectorAll(".chat-legend-section").length === 0) {
        sidebarLegendContainer.innerHTML = "";
        sidebarLegendContainer.appendChild(msg);
      }
    });
    return;
  }

  const temaConfig = temasConfig[tema];

  withChatLegendPreserved(sidebarLegendContainer, () => {
    // Verificar si existe configuración de leyenda manual
    if (temaConfig.leyenda && Object.keys(temaConfig.leyenda).length > 0) {
      log.debug(`Generando leyenda manual para tema: ${tema}`);
      sidebarLegendContainer.innerHTML = "";
      generarLeyendaManual(tema, temasConfig, sidebarLegendContainer);
      return;
    }

    // Generar leyenda automática con alias (local y global)
    log.debug(`Generando leyenda automática para tema: ${tema}`);
    sidebarLegendContainer.innerHTML = "";
    generarLeyendaAutomatica(tema, temasConfig, sidebarLegendContainer);
  });
}

/**
 * Genera leyenda desde configuración manual
 * @param {string} tema - El tema actual
 * @param {object} temasConfig - Configuración de temas
 * @param {HTMLElement} container - Contenedor donde insertar la leyenda
 */
function generarLeyendaManual(tema, temasConfig, container) {
  const temaConfig = temasConfig[tema];

  Object.entries(temaConfig.leyenda).forEach(([capa, config]) => {
    if (!config || !config.titulo || !config.items) {
      log.warn(`Configuración de leyenda inválida para capa: ${capa}`);
      return;
    }

    const sidebarLeyendaHTML = document.createElement("div");
    sidebarLeyendaHTML.classList.add("legend-container", "mb-3");

    const tituloLeyenda = document.createElement("h6");
    tituloLeyenda.classList.add("fw-bold", "text-primary", "mb-2");
    tituloLeyenda.textContent = config.titulo;
    sidebarLeyendaHTML.appendChild(tituloLeyenda);

    config.items.forEach((item) => {
      if (!item || !item.color || !item.label) {
        log.warn("Item de leyenda inválido:", item);
        return;
      }

      const itemLeyenda = crearItemLeyenda(item.color, item.label, item.icon);
      sidebarLeyendaHTML.appendChild(itemLeyenda);
    });

    container.appendChild(sidebarLeyendaHTML);
  });

  log.debug(`Leyenda manual actualizada para tema: ${tema}`);
}

/**
 * Genera una leyenda automática basada en la configuración de estilos con alias
 * Prioridad: leyendaAlias local > leyendaAliasesGlobales > valor original
 * @param {string} tema - El tema actual
 * @param {object} temasConfig - Configuración de temas
 * @param {HTMLElement} container - Contenedor donde insertar la leyenda
 */
function generarLeyendaAutomatica(tema, temasConfig, container) {
  const temaConfig = temasConfig[tema];

    if (!temaConfig.estilo) {
    const msg = document.createElement("p");
    msg.className = "text-muted small";
    msg.textContent = "No hay información de leyenda disponible.";
    container.innerHTML = "";
    container.appendChild(msg);
    return;
  }

  log.debug(`Generando leyenda automática para tema: ${tema}`);

  // Obtener solo las capas que están visibles en el mapa
  const capasVisibles = obtenerCapasVisibles(tema, temasConfig);
  log.debug('Capas visibles detectadas:', capasVisibles);
  if (capasVisibles.length === 0) {
    const msg = document.createElement("p");
    msg.className = "text-muted small";
    msg.textContent = "No hay capas activas. Activa capas para ver su leyenda.";
    container.innerHTML = "";
    container.appendChild(msg);
    return;
  }

  let tieneLeyendas = false;

  Object.entries(temaConfig.estilo).forEach(([capaNombre, capaConfig]) => {
    // Solo mostrar leyenda para capas visibles
    if (!capasVisibles.includes(capaNombre)) {
      return;
    }

    const legendContainer = document.createElement("div");
    legendContainer.classList.add("legend-container", "mb-3");

    // Título de la capa
    const titulo = document.createElement("h2");
    titulo.classList.add("fw-bold", "text-primary", "mb-2", "legend-title");
    titulo.textContent = capaConfig.nombrePersonalizado || capaNombre;
    legendContainer.appendChild(titulo);

    // Obtener alias de leyenda local si existe
    const leyendaAliasLocal = capaConfig.leyendaAlias || {};

    let itemsAgregados = 0;

    // Generar items de leyenda basados en colores definidos
    if (capaConfig.colores) {
      Object.entries(capaConfig.colores).forEach(([valor, color]) => {
        // Sistema de prioridad: local > global > original
        const labelTexto = obtenerLabelConAlias(
          valor,
          leyendaAliasLocal,
          leyendaAliasesGlobales
        );
        const itemLeyenda = crearItemLeyenda(color, labelTexto);
        legendContainer.appendChild(itemLeyenda);
        itemsAgregados++;
      });
    }
    // Generar items basados en iconos
    else if (capaConfig.iconos) {
      Object.entries(capaConfig.iconos).forEach(([valor, iconFile]) => {
        // Sistema de prioridad: local > global > original
        const labelTexto = obtenerLabelConAlias(
          valor,
          leyendaAliasLocal,
          leyendaAliasesGlobales
        );
        const itemLeyenda = crearItemLeyenda(null, labelTexto, iconFile);
        legendContainer.appendChild(itemLeyenda);
        itemsAgregados++;
      });
    }
    // Estilo alternativo genérico
    else if (capaConfig.estiloAlternativo) {
      const color =
        capaConfig.estiloAlternativo.fillColor ||
        capaConfig.estiloAlternativo.color ||
        "#555";
      const labelTexto = capaConfig.leyendaTexto || "Elementos de la capa";
      const itemLeyenda = crearItemLeyenda(color, labelTexto);
      legendContainer.appendChild(itemLeyenda);
      itemsAgregados++;
    }
    // Leyenda de una capa WMS (gradiente, nota o items)
    else if (capaConfig.wmsLegend) {
      renderWmsLegend(legendContainer, capaConfig.wmsLegend);
      itemsAgregados++;
    }

    // Solo agregar si tiene contenido (más que solo el título)
    if (itemsAgregados > 0) {
      container.appendChild(legendContainer);
      tieneLeyendas = true;
    }
  });

    if (!tieneLeyendas) {
    const msg = document.createElement("p");
    msg.className = "text-muted small";
    msg.textContent = "Las capas activas no tienen leyenda configurada.";
    container.innerHTML = "";
    container.appendChild(msg);
  }
}

/**
 * Obtiene el label con sistema de prioridad de alias
 * @param {string} valorOriginal - Valor original del atributo
 * @param {object} aliasLocal - Alias locales de la capa
 * @param {object} aliasGlobal - Alias globales
 * @returns {string} Label final a mostrar
 */
function obtenerLabelConAlias(
  valorOriginal,
  aliasLocal = {},
  aliasGlobal = {}
) {
  if (aliasLocal[valorOriginal]) {
    return aliasLocal[valorOriginal];
  }

  if (aliasGlobal[valorOriginal]) {
    return aliasGlobal[valorOriginal];
  }

  return valorOriginal;
}

/**
 * Sanitiza un nombre de archivo de icono para evitar path traversal.
 * Acepta solo nombres simples (sin `/`, `\`, `..`).
 * @param {string} iconFile
 * @returns {string|null}
 */
function sanitizeIconFile(iconFile) {
  if (!iconFile || typeof iconFile !== "string") return null;
  const trimmed = iconFile.trim();
  if (
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("..")
  ) {
    return null;
  }
  return trimmed;
}

/**
 * Renderiza la leyenda declarada en `capaConfig.wmsLegend`.
 *
 * Tipos:
 *   - gradient: barra con stops { value, color } y labels.
 *   - note: texto explicativo.
 *   - items: lista de { color, label }.
 *
 * @param {HTMLElement} container
 * @param {object} legend
 */
function renderWmsLegend(container, legend) {
  if (!legend || typeof legend !== "object") return;

  if (legend.type === "gradient" && Array.isArray(legend.stops) && legend.stops.length > 0) {
    const values = legend.stops
      .map((stop) => Number(stop.value))
      .filter((value) => Number.isFinite(value));
    const min = Number.isFinite(legend.min) ? legend.min : Math.min(...values);
    const max = Number.isFinite(legend.max) ? legend.max : Math.max(...values);
    const span = max - min || 1;

    const background = legend.stops
      .map((stop) => {
        const pct = Math.min(
          100,
          Math.max(0, ((Number(stop.value) - min) / span) * 100)
        );
        return `${stop.color} ${pct}%`;
      })
      .join(", ");

    const bar = document.createElement("div");
    bar.className = "legend-gradient-bar";
    bar.style.background = `linear-gradient(to right, ${background})`;
    container.appendChild(bar);

    if (Array.isArray(legend.labels) && legend.labels.length > 0) {
      const labels = document.createElement("div");
      labels.className = "legend-gradient-labels";
      legend.labels.forEach((text) => {
        const label = document.createElement("span");
        label.textContent = text;
        labels.appendChild(label);
      });
      container.appendChild(labels);
    }

    if (legend.unit) {
      const unit = document.createElement("div");
      unit.className = "legend-unit";
      unit.textContent = legend.unit;
      container.appendChild(unit);
    }
    return;
  }

  if (legend.type === "note" && legend.text) {
    const note = document.createElement("p");
    note.className = "text-muted small legend-note";
    note.textContent = legend.text;
    container.appendChild(note);
    return;
  }

  if (Array.isArray(legend.items)) {
    legend.items.forEach((item) => {
      if (!item?.label || !item?.color) return;
      container.appendChild(crearItemLeyenda(item.color, item.label));
    });
  }
}

function crearItemLeyenda(color, label, iconFile = null) {  const itemLeyenda = document.createElement("div");
  itemLeyenda.classList.add("legend-item", "d-flex", "align-items-center", "mb-1");

  const safeIconFile = sanitizeIconFile(iconFile);

  if (safeIconFile) {
    const iconBox = document.createElement("div");
    iconBox.classList.add("legend-icon", "me-2");
    iconBox.style.width = "18px";
    iconBox.style.height = "18px";
    iconBox.style.flexShrink = "0";

    const icon = document.createElement("img");
    icon.src = `./assets/icons/${normalizeIconFilename(safeIconFile)}`;
    icon.style.width = "100%";
    icon.style.height = "100%";
    icon.style.objectFit = "contain";
    icon.alt = String(label || "").trim() ? String(label) : "";

    icon.onerror = function () {
      log.warn(`No se pudo cargar el icono: ${safeIconFile}`);
      iconBox.innerHTML = "";
      iconBox.style.backgroundColor = "#ccc";
      iconBox.style.border = "1px solid #999";
      iconBox.style.borderRadius = "2px";
    };

    iconBox.appendChild(icon);
    itemLeyenda.appendChild(iconBox);
  } else if (color) {
    const colorBox = document.createElement("div");
    colorBox.classList.add("legend-color", "me-2");
    colorBox.style.backgroundColor = color;
    colorBox.style.width = "18px";
    colorBox.style.height = "18px";
    colorBox.style.border = "1px solid #ccc";
    colorBox.style.borderRadius = "2px";
    colorBox.style.flexShrink = "0";
    itemLeyenda.appendChild(colorBox);
  }

  const labelElement = document.createElement("span");
  labelElement.classList.add("small", "legend-label");
  labelElement.textContent = label;
  itemLeyenda.appendChild(labelElement);

  return itemLeyenda;
}

/**
 * Obtiene las capas visibles del tema activo.
 *
 * Usa `appState.layers.byName` + `appState.map.hasLayer` como source of
 * truth en lugar del DOM. Esto desacopla la leyenda del HTML y permite
 * que la lógica funcione incluso si el checkbox correspondiente no está
 * renderizado (por ejemplo, en mobile).
 *
 * @param {string} tema - El tema actual
 * @param {object} temasConfig - Configuración de temas
 * @returns {Array<string>} Array con nombres de capas visibles
 */
function obtenerCapasVisibles(tema, temasConfig) {
  const temaConfig = temasConfig?.[tema];

  if (!temaConfig?.capas || !Array.isArray(temaConfig.capas)) {
    log.warn(`[obtenerCapasVisibles] Tema '${tema}' no tiene capas configuradas`);
    return [];
  }

  const capasDelTema = new Set(temaConfig.capas);
  const visibles = [];

  for (const capaNombre of capasDelTema) {
    const layer = appState.layers.byName.get(capaNombre);
    if (!layer) continue;

    // Glify no es L.Layer y no responde a map.hasLayer; usamos isActive().
    if (layer._isGlify) {
      if (typeof layer.isActive === "function" && layer.isActive()) {
        visibles.push(capaNombre);
      }
      continue;
    }

    if (appState.map && appState.map.hasLayer(layer)) {
      visibles.push(capaNombre);
    }
  }

  log.debug(`[obtenerCapasVisibles] Resultado:`, visibles);
  return visibles;
}