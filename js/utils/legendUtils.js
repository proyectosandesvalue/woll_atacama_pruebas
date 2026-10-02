/**
 * Utilidades para manejo de leyendas del mapa
 * @module utils/legendUtils
 */

import leyendaAliasesGlobales from "../config/leyendaAliases.js";
import { createContextLogger } from "./logger.js";
import { appState } from "../store/appState.js";

const log = createContextLogger('LegendUtils');

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

  // Limpiar leyenda anterior
  sidebarLegendContainer.innerHTML = "";

  // Validar que existe el tema
  if (!temasConfig || !temasConfig[tema]) {
    log.warn(`No se encontró configuración para el tema: ${tema}`);
    sidebarLegendContainer.innerHTML =
      '<p class="text-muted small">No hay leyenda disponible para este tema.</p>';
    return;
  }

  const temaConfig = temasConfig[tema];

  // Verificar si existe configuración de leyenda manual
  if (temaConfig.leyenda && Object.keys(temaConfig.leyenda).length > 0) {
    log.debug(`Generando leyenda manual para tema: ${tema}`);
    generarLeyendaManual(tema, temasConfig, sidebarLegendContainer);
    return;
  }

  // Generar leyenda automática con alias (local y global)
  log.debug(`Generando leyenda automática para tema: ${tema}`);
  generarLeyendaAutomatica(tema, temasConfig, sidebarLegendContainer);
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
    container.innerHTML =
      '<p class="text-muted small">No hay información de leyenda disponible.</p>';
    return;
  }

  log.debug(`Generando leyenda automática para tema: ${tema}`);

  // Obtener solo las capas que están visibles en el mapa
  const capasVisibles = obtenerCapasVisibles(tema, temasConfig);
  log.debug('Capas visibles detectadas:', capasVisibles);

  if (capasVisibles.length === 0) {
    container.innerHTML =
      '<p class="text-muted small">No hay capas activas. Activa capas para ver su leyenda.</p>';
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
    const titulo = document.createElement("h6");
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

    // Solo agregar si tiene contenido (más que solo el título)
    if (itemsAgregados > 0) {
      container.appendChild(legendContainer);
      tieneLeyendas = true;
    }
  });

  if (!tieneLeyendas) {
    container.innerHTML =
      '<p class="text-muted small">Las capas activas no tienen leyenda configurada.</p>';
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

function crearItemLeyenda(color, label, iconFile = null) {
  const itemLeyenda = document.createElement("div");
  itemLeyenda.classList.add("legend-item", "d-flex", "align-items-center", "mb-1");

  const safeIconFile = sanitizeIconFile(iconFile);

  if (safeIconFile) {
    const iconBox = document.createElement("div");
    iconBox.classList.add("legend-icon", "me-2");
    iconBox.style.width = "18px";
    iconBox.style.height = "18px";
    iconBox.style.flexShrink = "0";

    const icon = document.createElement("img");
    icon.src = `./assets/icons/${safeIconFile}`;
    icon.style.width = "100%";
    icon.style.height = "100%";
    icon.style.objectFit = "contain";
    icon.alt = label;

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