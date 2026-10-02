/**
 * glifyAdapter.js
 *
 * Adaptador entre Leaflet.glify (WebGL) y la arquitectura de capas existente.
 *
 * Responsabilidades:
 *  - Decidir si una capa debe usar glify o L.geoJson (shouldUseGlify).
 *  - Convertir colores hex CSS a formato RGBA float para glify (hexToGlifyColor).
 *  - Construir el color callback con soporte de filtrado por alpha=0 (buildColorCallback).
 *  - Crear la instancia glify y envolverla en un adaptador con la misma interfaz
 *    que usan layerUtils.js y appState.js:
 *      .addTo(map) / .removeFrom(map)
 *      .setOpacity(value)
 *      .triggerFilterUpdate()
 *      ._isGlify = true  (flag de identificación)
 *
 * Capas soportadas: 'polygon' y 'line' solamente.
 * Puntos: siempre L.geoJson (cluster, heatmap, íconos por atributo).
 *
 * @module utils/glifyAdapter
 */

import { GLIFY_CONFIG } from '../config/constants.js';
import { appState } from '../store/appState.js';
import { getPopupContent } from './styleUtils.js';
import { createContextLogger } from './logger.js';
import { escapeHtml } from './helpers.js';

const log = createContextLogger('GlifyAdapter');

// ── Color por defecto cuando un feature no tiene categoría mapeada ──────────
const DEFAULT_GLIFY_COLOR = { r: 0.7, g: 0.7, b: 0.7, a: 0.7 };

// ── Opacidad aplicada globalmente (compartida entre color callback y setOpacity) ──
// Se actualiza como closure en cada instancia de adaptador.

// ─────────────────────────────────────────────────────────────────────────
// Sanitización de GeoJSON
// ─────────────────────────────────────────────────────────────────────────

/**
 * Verifica si una coordenada es un número válido y finito.
 * @param {*} v
 * @returns {boolean}
 */
function isValidCoord(v) {
    return typeof v === 'number' && isFinite(v);
}

/**
 * Verifica recursivamente que un array de coordenadas GeoJSON no contenga
 * valores nulos, undefined o NaN en ningún nivel.
 *
 * @param {Array} coords - Coordenadas GeoJSON en cualquier nivel de anidamiento
 * @param {number} depth - Profundidad actual (0 = par [lng,lat], >0 = ring/polygon)
 * @returns {boolean} true si todas las coordenadas son válidas
 */
function hasValidCoordinates(coords, depth = 0) {
    if (!Array.isArray(coords) || coords.length === 0) return false;
    if (depth === 0) {
        // Nivel de coordenada individual: [lng, lat] o [lng, lat, z]
        return isValidCoord(coords[0]) && isValidCoord(coords[1]);
    }
    return coords.every(c => hasValidCoordinates(c, depth - 1));
}

/**
 * Determina la profundidad de validación según el tipo de geometría.
 * @param {string} type
 * @returns {number}
 */
function coordDepthForType(type) {
    switch (type) {
        case 'Point': return 0;
        case 'LineString': return 1;
        case 'MultiLineString': return 2;
        case 'Polygon': return 2;
        case 'MultiPolygon': return 3;
        default: return 1;
    }
}

/**
 * Filtra el GeoJSON eliminando features con:
 *  - geometry null o undefined
 *  - coordinates null, undefined, arrays vacíos
 *  - coordenadas con valores NaN, null, o no numéricos
 *
 * Glify es muy estricto respecto a los datos que recibe: un solo feature
 * inválido hace que Leaflet's SphericalMercator.project() crashe con
 * "Cannot read properties of undefined (reading 'lat')".
 *
 * @param {object} geojson - FeatureCollection GeoJSON
 * @returns {object} FeatureCollection limpio
 */
export function sanitizeGeoJSON(geojson) {
    if (!geojson?.features?.length) return geojson;

    const original = geojson.features.length;
    const valid = geojson.features.filter(feature => {
        const geom = feature?.geometry;
        if (!geom || !geom.type || !geom.coordinates) return false;
        const depth = coordDepthForType(geom.type);
        return hasValidCoordinates(geom.coordinates, depth);
    });

    if (valid.length < original) {
        log.warn(`sanitizeGeoJSON: eliminados ${original - valid.length} features inválidos de ${original}`);
    }

    return { ...geojson, features: valid };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de color
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convierte un color hex CSS a objeto RGBA con valores entre 0 y 1.
 * Soporta formatos: #RGB, #RRGGBB, #RRGGBBAA.
 *
 * @param {string} hex - Color en formato hexadecimal (e.g. '#ff7f00', '#ff7f00ff')
 * @param {number} [alpha=1] - Valor de opacidad adicional (0-1), se multiplica con el alpha del hex
 * @returns {{ r: number, g: number, b: number, a: number }}
 */
export function hexToGlifyColor(hex, alpha = 1) {
    if (!hex || typeof hex !== 'string') return { ...DEFAULT_GLIFY_COLOR, a: alpha };

    const clean = hex.replace('#', '').trim();
    let r, g, b, a = 1;

    if (clean.length === 3) {
        r = parseInt(clean[0] + clean[0], 16);
        g = parseInt(clean[1] + clean[1], 16);
        b = parseInt(clean[2] + clean[2], 16);
    } else if (clean.length === 6) {
        r = parseInt(clean.slice(0, 2), 16);
        g = parseInt(clean.slice(2, 4), 16);
        b = parseInt(clean.slice(4, 6), 16);
    } else if (clean.length === 8) {
        r = parseInt(clean.slice(0, 2), 16);
        g = parseInt(clean.slice(2, 4), 16);
        b = parseInt(clean.slice(4, 6), 16);
        a = parseInt(clean.slice(6, 8), 16) / 255;
    } else {
        return { ...DEFAULT_GLIFY_COLOR, a: alpha };
    }

    return {
        r: r / 255,
        g: g / 255,
        b: b / 255,
        a: a * alpha,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Decisión de renderer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determina si una capa debe usar el renderer WebGL (glify).
 *
 * Reglas:
 *  1. El flag global GLIFY_CONFIG.USE_GLIFY_RENDERER debe estar activo.
 *  2. La librería L.glify debe estar disponible en window.
 *  3. El tipo de geometría debe ser 'polygon' o 'line'.
 *  4. Los puntos NUNCA usan glify (íconos, cluster, heatmap son incompatibles).
 *
 * @param {object} configCapa - Configuración de estilo de la capa
 * @returns {boolean}
 */
export function shouldUseGlify(configCapa) {
    if (!GLIFY_CONFIG.USE_GLIFY_RENDERER) return false;
    if (!window.L?.glify) {
        log.warn('L.glify no está disponible en window. Usando L.geoJson como fallback.');
        return false;
    }
    if (!configCapa?.type) return false;
    return GLIFY_CONFIG.GLIFY_TYPES.includes(configCapa.type);
}

// ─────────────────────────────────────────────────────────────────────────────
// Color callback con soporte de filtrado
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construye la función de color para glify.
 *
 * La función se evalúa por cada feature en cada re-render (updateStyle).
 * Si una categoría está en hiddenAttributes → alpha = 0 (invisible).
 * Si no hay atributo de color → usa DEFAULT_GLIFY_COLOR.
 *
 * @param {object} configCapa - Configuración de la capa (atributo, colores, estiloBase)
 * @param {string} capaNombre - Nombre de la capa (para leer hiddenAttributes en appState)
 * @param {{ current: number }} opacityRef - Referencia mutable a la opacidad actual
 * @returns {function(index: number, feature: object): {r,g,b,a}}
 */
function buildColorCallback(configCapa, capaNombre, opacityRef) {
    const atributo = configCapa.atributo || null;
    const colores = configCapa.colores || {};
    // Para líneas, el color base viene de estiloBase.color
    const baseColor = configCapa.estiloBase?.color || null;
    // Para polígonos rellenos, el color viene de colores[valor] o estiloBase.color
    const baseFillColor = configCapa.estiloBase?.fillColor || configCapa.estiloBase?.color || null;

    return function colorCallback(index, feature) {
        const opacity = opacityRef.current;

        const dataFilter = appState.layers.dataFilters.get(capaNombre);
        if (dataFilter && dataFilter.size > 0) {
            let filtered = true;
            for (const [attr, allowedValues] of dataFilter.entries()) {
                const featureVal = feature?.properties?.[attr];
                if (featureVal === undefined || featureVal === null || !allowedValues.has(String(featureVal))) {
                    filtered = false;
                    break;
                }
            }
            if (!filtered) return { r: 0, g: 0, b: 0, a: 0 };
        }

        if (atributo) {
            const hiddenSet = appState.layers.hiddenAttributes.get(capaNombre);
            const valor = feature?.properties?.[atributo];
            if (hiddenSet && valor !== undefined && hiddenSet.has(valor)) {
                return { r: 0, g: 0, b: 0, a: 0 };
            }

            if (valor !== undefined && colores[valor]) {
                return hexToGlifyColor(colores[valor], opacity);
            }
        }

        const fallbackColor = baseFillColor || baseColor;
        if (fallbackColor) {
            return hexToGlifyColor(fallbackColor, opacity);
        }

        return { ...DEFAULT_GLIFY_COLOR, a: opacity };
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Manejo de popups
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Muestra la información del polígono/línea en el panel lateral (sidebarInfo)
 * en lugar de usar un popup flotante, para mantener la misma experiencia
 * de usuario que tienen las capas de puntos.
 *
 * @param {object} feature - Feature GeoJSON
 * @param {object} configCapa - Config de la capa
 */
function openGlifySidebarInfo(feature, configCapa) {
    if (!configCapa.popupCampos || configCapa.popupCampos.length === 0) return;
    const content = getPopupContent(feature, configCapa);
    if (!content) return;

    // 1. Inyectarlo en el sidebar
    const sidebarInfoContent = document.getElementById('sidebarInfoContent');
    if (sidebarInfoContent) {
        sidebarInfoContent.innerHTML = content;
    }

    // 2. Actualizar el título del sidebar
    const sidebarInfoTitle = document.getElementById('sidebarInfoTitle');
    if (sidebarInfoTitle) {
        const tituloStr = escapeHtml(configCapa.nombrePersonalizado || 'Información');
        sidebarInfoTitle.innerHTML = `
          <span class="material-symbols-outlined" style="font-size: 18px;">info</span>
          ${tituloStr}
        `;
    }

    // 3. Abrir el sidebar
    const sidebarInfo = document.getElementById('sidebarInfo');
    if (sidebarInfo) {
        sidebarInfo.classList.add('active');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory principal: crea instancia glify y retorna adaptador
// ─────────────────────────────────────────────────────────────────────────────

// ── Contador global de contextos WebGL activos ───────────────────────────────
// Los navegadores tienen un límite duro (~8-16). Al superarlo matan contextos
// viejos (CONTEXT_LOST_WEBGL) y cualquier llamada posterior (createShader etc.)
// recibe null → crash. No podemos subir el límite del navegador; lo que podemos
// hacer es llevar la cuenta y no crear más contextos de los que el navegador soporta.
let _activeGlifyContexts = 0;
const MAX_GLIFY_CONTEXTS = 7; // margen conservador

/**
 * Crea una capa WebGL con Leaflet.glify y la envuelve en un adaptador
 * con la misma interfaz que usa el resto de la aplicación.
 *
 * @param {L.Map} map - Instancia del mapa Leaflet
 * @param {object} data - FeatureCollection GeoJSON
 * @param {object} configCapa - Config de estilo de la capa
 * @param {string} capaNombre - Nombre de la capa
 * @returns {object} Adaptador con interfaz compatible con L.Layer
 */
export function createGlifyLayer(map, data, configCapa, capaNombre) {
    // Sanitizar GeoJSON: eliminar features con coordenadas nulas o inválidas
    // antes de pasarlos a glify. Un solo feature inválido causa crash en
    // Leaflet's SphericalMercator.project() con "Cannot read .lat of undefined".
    const cleanData = sanitizeGeoJSON(data);
    // Referencia mutable a la opacidad — la comparten el color callback y setOpacity()
    const opacityRef = { current: configCapa.estiloBase?.fillOpacity ?? configCapa.estiloBase?.opacity ?? 0.8 };
    const colorFn = buildColorCallback(configCapa, capaNombre, opacityRef);

    let glifyInstance = null;

    function _initGlify() {
        // Destruir instancia previa
        if (glifyInstance) {
            try {
                glifyInstance.remove();
                _activeGlifyContexts = Math.max(0, _activeGlifyContexts - 1);
            } catch (_) { /* silent */ }
            glifyInstance = null;
        }

        // Rechazar si ya estamos en el límite de contextos del navegador
        if (_activeGlifyContexts >= MAX_GLIFY_CONTEXTS) {
            log.warn(`[GlifyAdapter] Límite de contextos WebGL alcanzado (${_activeGlifyContexts}/${MAX_GLIFY_CONTEXTS}). Omitiendo '${capaNombre}'.`);
            return;
        }

        try {
            if (configCapa.type === 'polygon') {
                glifyInstance = L.glify.shapes({
                    map,
                    data: cleanData,
                    color: colorFn,
                    opacity: opacityRef.current,
                    click(e, feature) {
                        L.DomEvent.stopPropagation(e);
                        openGlifySidebarInfo(feature, configCapa);
                        return true;
                    },
                });
            } else if (configCapa.type === 'line') {
                glifyInstance = L.glify.lines({
                    map,
                    data: cleanData,
                    color: colorFn,
                    opacity: opacityRef.current,
                    weight: configCapa.estiloBase?.weight ?? 2,
                    click(e, feature) {
                        L.DomEvent.stopPropagation(e);
                        openGlifySidebarInfo(feature, configCapa);
                        return true;
                    },
                });
            }

            if (glifyInstance) {
                _activeGlifyContexts++;

                // Escuchar pérdida de contexto WebGL
                // Cuando el browser mata el contexto, zeroeamos glifyInstance para
                // que el próximo addTo() lo recree en lugar de llamar createShader en null.
                const canvas = glifyInstance._canvas ?? glifyInstance.canvas ?? null;
                if (canvas) {
                    canvas.addEventListener('webglcontextlost', (e) => {
                        e.preventDefault();
                        log.warn(`[GlifyAdapter] WebGL context lost para '${capaNombre}'. Se reinicializará al reactivarse.`);
                        glifyInstance = null;
                        _activeGlifyContexts = Math.max(0, _activeGlifyContexts - 1);
                    }, { once: true });
                }
            }
        } catch (err) {
            log.error(`[GlifyAdapter] Error inicializando glify para '${capaNombre}':`, err);
            if (glifyInstance) {
                try { glifyInstance.remove(); } catch (_) { /* silent */ }
            }
            glifyInstance = null;
        }
    }

    // Inicializar la primera vez
    if (configCapa.type === 'polygon' || configCapa.type === 'line') {
        _initGlify();
        if (glifyInstance) {
            log.log(`Capa '${capaNombre}' creada con WebGL (glify.${configCapa.type === 'polygon' ? 'shapes' : 'lines'})`);
        } else {
            log.warn(`[GlifyAdapter] glify no pudo crear '${capaNombre}' (sin contextos disponibles o error). Retornando null → fallback a L.geoJson.`);
            return null;
        }
    } else {
        log.warn(`createGlifyLayer: tipo '${configCapa.type}' no soportado por glify. Retornando null.`);
        return null;
    }

    // ── Adaptador público ──────────────────────────────────────────────────
    return {
        /** Flag de identificación para layerUtils y appState */
        _isGlify: true,

        /** Referencia a la instancia glify (para acceso de emergencia) */
        get _glifyInstance() { return glifyInstance; },

        /**
         * Agrega la capa al mapa.
         * Si la instancia no existe o fue destruida, la recrea.
         */
        addTo(targetMap) {
            if (!glifyInstance) {
                log.debug(`[GlifyAdapter] Reinicializando '${capaNombre}' (context lost o primera carga).`);
                _initGlify();
                if (!glifyInstance) {
                    log.warn(`[GlifyAdapter] No se pudo reinicializar '${capaNombre}'. Límite de contextos WebGL alcanzado.`);
                }
            }
            return this;
        },

        /**
         * Remueve la capa del mapa.
         * Llama al remove() nativo y limpia la referencia para que sea recreada
         * la próxima vez que se llame addTo().
         */
        removeFrom(targetMap) {
            if (glifyInstance) {
                try {
                    glifyInstance.remove();
                    _activeGlifyContexts = Math.max(0, _activeGlifyContexts - 1);
                } catch (_) { /* silent */ }
                glifyInstance = null;
            }
            return this;
        },

        /**
         * Actualiza la opacidad de la capa.
         * Modifica opacityRef.current para que el color callback lo lea
         * en el próximo updateStyle().
         *
         * @param {number} value - Opacidad entre 0 y 1
         */
        setOpacity(value) {
            opacityRef.current = Math.max(0, Math.min(1, value));
            if (glifyInstance) {
                try { glifyInstance.updateStyle(); } catch (_) { /* silent */ }
            }
        },

        /**
         * Re-renderiza la capa aplicando el estado actual de hiddenAttributes.
         * En WebGL, los colores por feature se guardan en buffers durante
         * la inicialización. Para que un filtro de leyenda (alpha=0) tome
         * efecto de inmediato, se debe reinicializar la capa.
         */
        triggerFilterUpdate() {
            if (glifyInstance) {
                try { _initGlify(); } catch (_) { /* silent */ }
            }
        },

        /**
         * Indica si la capa está actualmente en el mapa.
         */
        isActive() {
            return glifyInstance !== null;
        },
    };
}
