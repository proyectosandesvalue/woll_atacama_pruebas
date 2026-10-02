/**
 * Estado global centralizado de la aplicación
 * Single Source of Truth para todo el estado
 * @module store/appState
 */

import { LOG_CONFIG } from "../config/constants.js";

export const appState = {
  /** @type {L.Map|null} Instancia del mapa de Leaflet */
  map: null,

  /** @type {L.TileLayer|null} Capa base actual */
  currentBaseLayer: null,

  /** @type {string|null} Tema/dimensión actualmente activa */
  activeTemaName: null,

  /** Gestión de capas */
  layers: {
    /** @type {Map<string, L.Layer>} Capas por nombre */
    byName: new Map(),

    /** @type {Map<string, object>} Datos GeoJSON originales */
    geojsonData: new Map(),

    /** @type {Array<string>} Orden de apilamiento de capas */
    ordered: [],

    /** @type {Set<string>} Capas ya cargadas */
    loaded: new Set(),

    /** @type {Set<string>} Capas siendo cargadas actualmente */
    loading: new Set(),

    /** @type {Map<string, Set<string>>} Atributos ocultos por capa (para filtrar) */
    hiddenAttributes: new Map(),

    /** @type {Map<string, boolean>} Modo cluster activado por capa */
    clusterMode: new Map(),

    /** @type {Map<string, boolean>} Modo heatmap por capa */
    heatmapMode: new Map(),

    /** @type {Map<string, Promise>} Promesas de carga en curso */
    pendingLoads: new Map(),

    /**
     * Filtros de datos activos por capa.
     * Estructura: { 'capaNombre': { 'atributo': new Set(['valorA', 'valorB']) } }
     * @type {Map<string, Map<string, Set<string>>>}
     */
    dataFilters: new Map(),
  },

  /** Estado de la UI */
  ui: {
    /** @type {string|null} Dimensión actualmente activa en el sidebar */
    activeDimension: null,

    /** @type {Map<string, Promise>} Operaciones pendientes */
    pendingOperations: new Map(),
  },

  /** Promise para esperar a que el mapa esté listo */
  mapReady: null,
  /** @private */
  _resolveMapReady: null,
};

// Configuración de la promesa del mapa con timeout de seguridad
// Si el mapa no se inicializa en 15s, rechaza con error en lugar de colgarse
appState.mapReady = new Promise((resolve, reject) => {
  appState._resolveMapReady = resolve;
  appState._rejectMapReady = reject;
});
setTimeout(() => {
  if (!appState.map) {
    const err = new Error("Timeout: el mapa no se inicializó en 15 segundos.");
    if (appState._rejectMapReady) appState._rejectMapReady(err);
  }
}, 15000);

// Evitar unhandled rejection si nadie escucha el rechazo del mapReady.
// `script.js` hace `await appState.mapReady` dentro de un try/catch, pero
// si ese módulo no llega a cargar, el reject quedaría huérfano.
appState.mapReady.catch(() => {
  /* silencioso: se maneja en script.js con try/catch */
});

/**
 * Inicializa el estado del mapa
 * @param {L.Map} map - Instancia del mapa de Leaflet
 */
export function initializeMap(map) {
  appState.map = map;
  if (appState._resolveMapReady) {
    appState._resolveMapReady(map);
  }
}

/**
 * Establece la capa base actual
 * @param {L.TileLayer} baseLayer - Capa base
 */
export function setCurrentBaseLayer(baseLayer) {
  appState.currentBaseLayer = baseLayer;
}

/**
 * Establece el tema activo
 * @param {string} temaName - Nombre del tema
 */
export function setActiveTema(temaName) {
  appState.activeTemaName = temaName;
}

/**
 * Agrega una capa al estado
 * @param {string} name - Nombre de la capa
 * @param {L.Layer} layer - Capa de Leaflet
 */
export function addLayer(name, layer) {
  appState.layers.byName.set(name, layer);
  if (!appState.layers.ordered.includes(name)) {
    appState.layers.ordered.push(name);
  }
}

/**
 * Obtiene una capa por nombre
 * @param {string} name - Nombre de la capa
 * @returns {L.Layer|undefined} Capa de Leaflet
 */
export function getLayer(name) {
  return appState.layers.byName.get(name);
}

/**
 * Elimina una capa del estado
 * @param {string} name - Nombre de la capa
 */
export function removeLayer(name) {
  const layer = appState.layers.byName.get(name);
  if (layer && appState.map && appState.map.hasLayer(layer)) {
    appState.map.removeLayer(layer);
  }
  appState.layers.byName.delete(name);
  const index = appState.layers.ordered.indexOf(name);
  if (index > -1) {
    appState.layers.ordered.splice(index, 1);
  }
}

/**
 * Marca una capa como cargada
 * @param {string} name - Nombre de la capa
 */
export function markLayerAsLoaded(name) {
  appState.layers.loaded.add(name);
}

/**
 * Verifica si una capa está cargada
 * @param {string} name - Nombre de la capa
 * @returns {boolean} True si la capa está cargada
 */
export function isLayerLoaded(name) {
  return appState.layers.loaded.has(name);
}

/**
 * Limpia todas las capas del estado
 */
export function clearAllLayers() {
  appState.layers.byName.clear();
  appState.layers.ordered = [];
  appState.layers.loaded.clear();
}

/**
 * Establece la dimensión activa en la UI
 * @param {string|null} dimension - Nombre de la dimensión
 */
export function setActiveDimension(dimension) {
  appState.ui.activeDimension = dimension;
}

/**
 * Obtiene la dimensión activa en la UI
 * @returns {string|null} Nombre de la dimensión activa
 */
export function getActiveDimension() {
  return appState.ui.activeDimension;
}

/**
 * Actualiza el orden de una capa en la pila de renderizado
 * @param {string} name - Nombre de la capa
 * @param {number} newPosition - Nueva posición en la pila
 */
export function updateLayerOrder(name, newPosition) {
  const currentIndex = appState.layers.ordered.indexOf(name);
  if (currentIndex > -1) {
    appState.layers.ordered.splice(currentIndex, 1);
  }
  appState.layers.ordered.splice(newPosition, 0, name);
}

/**
 * Almacena los datos GeoJSON de una capa
 * @param {string} name - Nombre de la capa
 * @param {object} data - Datos GeoJSON
 */
export function setLayerData(name, data) {
  appState.layers.geojsonData.set(name, data);
}

/**
 * Obtiene los datos GeoJSON de una capa
 * @param {string} name - Nombre de la capa
 * @returns {object|undefined} Datos GeoJSON
 */
export function getLayerData(name) {
  return appState.layers.geojsonData.get(name);
}

/**
 * Establece un filtro de datos para una capa
 * @param {string} capaNombre - Nombre de la capa
 * @param {string} atributo - Nombre del atributo
 * @param {Set<string>} valores - Set de valores seleccionados
 */
export function setDataFilter(capaNombre, atributo, valores) {
  if (!appState.layers.dataFilters.has(capaNombre)) {
    appState.layers.dataFilters.set(capaNombre, new Map());
  }
  appState.layers.dataFilters.get(capaNombre).set(atributo, valores);
}

/**
 * Obtiene los filtros activos para una capa
 * @param {string} capaNombre - Nombre de la capa
 * @returns {Map<string, Set<string>>|undefined}
 */
export function getDataFilter(capaNombre) {
  return appState.layers.dataFilters.get(capaNombre);
}

/**
 * Verifica si una capa tiene filtros activos
 * @param {string} capaNombre - Nombre de la capa
 * @returns {boolean}
 */
export function hasDataFilter(capaNombre) {
  const filter = appState.layers.dataFilters.get(capaNombre);
  return filter !== undefined && filter.size > 0;
}

/**
 * Elimina un filtro específico de una capa
 * @param {string} capaNombre - Nombre de la capa
 * @param {string} atributo - Atributo a eliminar (opcional, si no se pasa elimina todos)
 */
export function clearDataFilter(capaNombre, atributo = null) {
  if (!appState.layers.dataFilters.has(capaNombre)) return;
  const filter = appState.layers.dataFilters.get(capaNombre);
  if (atributo) {
    filter.delete(atributo);
  } else {
    filter.clear();
  }
  if (filter.size === 0) {
    appState.layers.dataFilters.delete(capaNombre);
  }
}

// Exponer el estado en `window` SOLO en modo debug.
// En producción es un escape hatch peligroso (cualquier script puede mutar capas, filtros, etc.).
if (typeof window !== "undefined" && LOG_CONFIG.ENABLE_DEBUG) {
  window.appState = appState;
}