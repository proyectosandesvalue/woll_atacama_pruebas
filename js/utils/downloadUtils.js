/**
 * Utilidades para el modal de descarga de capas y exportación a GeoJSON/CSV
 * @module utils/downloadUtils
 */

import { appState, getDataFilter } from "../store/appState.js";
import { ensureLayerData } from "./layerUtils.js";
import { createContextLogger } from "./logger.js";
import { encontrarTemaParaCapa, obtenerNombrePersonalizado, getCapaConfig } from "./configUtils.js";

const log = createContextLogger('DownloadUtils');
const modal = document.getElementById('downloadModal');
const closeBtn = document.getElementById('downloadModalClose');
const layerNameEl = document.getElementById('downloadModalLayerName');
const btnGeoJSON = document.getElementById('btnDownloadGeoJSON');
const btnCSV = document.getElementById('btnDownloadCSV');
let isInitialized = false;
let currentCapa = null;
let currentTemasConfig = null;

/**
 * Inicializa los eventos del modal de descargas
 */
function initDownloadModal() {
    if (isInitialized) return;

    if (closeBtn) {
        closeBtn.addEventListener('click', closeDownloadModal);
    }

    // Cerrar al hacer clic en el overlay (backdrop)
    if (modal) {
        modal.addEventListener('click', (e) => {
            const dialogDimensions = modal.getBoundingClientRect();
            if (
                e.clientX < dialogDimensions.left ||
                e.clientX > dialogDimensions.right ||
                e.clientY < dialogDimensions.top ||
                e.clientY > dialogDimensions.bottom
            ) {
                closeDownloadModal();
            }
        });
    }

    if (btnGeoJSON) {
        btnGeoJSON.addEventListener('click', async () => {
            if (!currentCapa) return;
            await descargarGeoJSON(currentCapa, currentTemasConfig);
            closeDownloadModal();
        });
    }

    if (btnCSV) {
        btnCSV.addEventListener('click', async () => {
            if (!currentCapa || !currentTemasConfig) return;
            await descargarCSV(currentCapa, currentTemasConfig);
            closeDownloadModal();
        });
    }

    isInitialized = true;
}

/**
 * Abre el modal de descargas para una capa específica
 * @param {string} capaNombre - Nombre técnico de la capa
 * @param {Object} temasConfig - Configuración global de temas
 */
export function openDownloadModal(capaNombre, temasConfig) {
    initDownloadModal();

    currentCapa = capaNombre;
    currentTemasConfig = temasConfig;

    const temaKey = encontrarTemaParaCapa(capaNombre, temasConfig);
    const nombreVisual = obtenerNombrePersonalizado(capaNombre, temaKey, temasConfig) || capaNombre;

    if (layerNameEl) {
        layerNameEl.textContent = nombreVisual;
    }

    if (modal) {
        modal.showModal();
    }
}

/**
 * Cierra el modal de descargas
 */
export function closeDownloadModal() {
    if (modal) {
        modal.close();
    }
    currentCapa = null;
    currentTemasConfig = null;
}

/**
 * Convierte el `dataFilter` del visor a la especificación del endpoint.
 * @param {string} capaNombre
 * @returns {string|null}
 */
function buildExportFilter(capaNombre) {
    const dataFilter = getDataFilter(capaNombre);
    if (!dataFilter || dataFilter.size === 0) return null;
    const conditions = [];
    dataFilter.forEach((values, column) => {
        if (values && values.size > 0) {
            conditions.push({ column, operator: "in", value: [...values] });
        }
    });
    return conditions.length > 0
        ? JSON.stringify({ op: "and", conditions })
        : null;
}

/**
 * Columnas y encabezados visibles de la tabla para el CSV.
 * @param {object} configCapa
 * @returns {{columns: string[]|null, labels: string[]|null}}
 */
function getExportColumns(configCapa) {
    const alias = configCapa?.alias || {};
    const hasAlias = Object.keys(alias).length > 0;
    if (!hasAlias) return { columns: null, labels: null };

    if (Array.isArray(configCapa.popupCampos) && configCapa.popupCampos.length > 0) {
        return {
            columns: configCapa.popupCampos,
            labels: configCapa.popupCampos.map((key) => alias[key] || key),
        };
    }
    return {
        columns: Object.keys(alias),
        labels: Object.values(alias),
    };
}

const layerApiCache = new Map();

/**
 * ¿El servidor Node expone el endpoint de capas? En Vercel no existe.
 * @param {string} capaNombre
 * @returns {Promise<boolean>}
 */
async function hasLayerApi(capaNombre) {
    if (!layerApiCache.has(capaNombre)) {
        try {
            const res = await fetch(
                `/api/layer-features?layer_id=${encodeURIComponent(capaNombre)}&limit=1`,
                { headers: { Accept: "application/json" } }
            );
            layerApiCache.set(capaNombre, res.ok);
        } catch {
            layerApiCache.set(capaNombre, false);
        }
    }
    return layerApiCache.get(capaNombre);
}

/**
 * URL de exportación desde PostGIS, con filtro y columnas visibles.
 * @param {string} capaNombre
 * @param {"geojson"|"csv"} format
 * @param {object} configCapa
 * @returns {string}
 */
function buildExportUrl(capaNombre, format, configCapa) {
    const params = new URLSearchParams({ layer_id: capaNombre, format });
    const filter = buildExportFilter(capaNombre);
    if (filter) params.set("filter", filter);

    if (format === "csv") {
        const { columns, labels } = getExportColumns(configCapa);
        if (columns && labels) {
            params.set("columns", JSON.stringify(columns));
            params.set("labels", JSON.stringify(labels));
        }
    }
    return `/api/layer-export?${params.toString()}`;
}

function triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

/**
 * Descarga GeoJSON. En capas PostGIS usa el endpoint (misma data y filtro
 * que la tabla); si no está disponible, cae al archivo estático.
 * @param {string} capaNombre - Nombre técnico de la capa
 * @param {Object} temasConfig - Configuración global de temas
 */
async function descargarGeoJSON(capaNombre, temasConfig) {
    try {
        const temaKey = encontrarTemaParaCapa(capaNombre, temasConfig);
        const configCapa = getCapaConfig(capaNombre, temaKey, temasConfig);

        if (configCapa?.source?.type === "postgis" && (await hasLayerApi(capaNombre))) {
            triggerDownload(
                buildExportUrl(capaNombre, "geojson", configCapa),
                `${capaNombre}.geojson`
            );
            log.log(`Descargando GeoJSON desde PostGIS: ${capaNombre}`);
            return;
        }

        triggerDownload(`geojson/${capaNombre}.geojson`, `${capaNombre}.geojson`);
        log.log(`Descargando GeoJSON estático: ${capaNombre}`);
    } catch (e) {
        log.error("Error al descargar GeoJSON:", e);
        alert("Ocurrió un error al intentar descargar el archivo GeoJSON.");
    }
}

/**
 * Escapa y formatea un valor para CSV con punto y coma como delimitador.
 * Todos los valores van siempre entre comillas para evitar ambigüedades.
 * Los saltos de línea internos se reemplazan por espacio para no romper filas.
 * @param {any} val - Valor a escapar
 * @returns {string} - Valor formateado
 */
function escapeCSV(val) {
    if (val === null || val === undefined) return '""';
    // Convertir a string y normalizar: quitar \r, reemplazar \n por espacio
    const str = String(val)
        .replace(/\r/g, '')
        .replace(/\n/g, ' ');
    // Escapar comillas dobles duplicando y envolver siempre en comillas
    return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Extrae y descarga los datos tabulares configurados en formato CSV
 * @param {string} capaNombre - Nombre técnico de la capa
 * @param {Object} temasConfig - Configuración global de temas
 */
async function descargarCSV(capaNombre, temasConfig) {
    try {
        if (btnCSV) {
            btnCSV.style.pointerEvents = 'none';
            btnCSV.style.opacity = '0.5';
            btnCSV.querySelector('.download-title').textContent = 'Generando archivo...';
        }

        const temaKey = encontrarTemaParaCapa(capaNombre, temasConfig);

        const configCapa = getCapaConfig(capaNombre, temaKey, temasConfig);

        // En capas PostGIS, el CSV se genera en streaming desde el servidor
        // con las mismas columnas y filtro que la tabla.
        if (configCapa?.source?.type === "postgis" && (await hasLayerApi(capaNombre))) {
            triggerDownload(
                buildExportUrl(capaNombre, "csv", configCapa),
                `${capaNombre}_datos.csv`
            );
            log.log(`CSV generado desde PostGIS: ${capaNombre}`);
            return;
        }

        // 1. Obtener datos (descargar si no están en caché). En capas con
        // tiles, esto baja el GeoJSON completo solo para exportar.
        let geojson = appState.layers.geojsonData.get(capaNombre);
        if (!geojson) {
            log.log(`Datos para ${capaNombre} no encontrados en caché. Descargando para CSV...`);
            geojson = await ensureLayerData(capaNombre, configCapa);
        }

        if (!geojson || !geojson.features || geojson.features.length === 0) {
            throw new Error("La capa no contiene datos vectoriales o está vacía.");
        }

        const aliasConfig = configCapa?.alias || null;
        const dataFilter = getDataFilter(capaNombre);
        let features = geojson.features;
        if (dataFilter && dataFilter.size > 0) {
            features = features.filter((feature) => {
                for (const [attr, allowedValues] of dataFilter.entries()) {
                    const value = feature.properties?.[attr];
                    if (value === undefined || value === null) return false;
                    if (!allowedValues.has(String(value))) return false;
                }
                return true;
            });
        }

        // 3. Determinar columnas a exportar
        let columnasAMostrar = [];
        let nombresColumnas = [];

        if (aliasConfig && Object.keys(aliasConfig).length > 0) {
            columnasAMostrar = Object.keys(aliasConfig);
            nombresColumnas = Object.values(aliasConfig);
        } else {
            // Fallback si no hay alias
            if (features[0] && features[0].properties) {
                columnasAMostrar = Object.keys(features[0].properties);
                nombresColumnas = [...columnasAMostrar];
            }
        }

        // 4. Construir CSV (delimitador: punto y coma)
        const DELIMITER = ';';
        let csvContent = "";

        // Cabeceras
        csvContent += nombresColumnas.map(escapeCSV).join(DELIMITER) + "\r\n";

        // Filas
        features.forEach(feature => {
            const row = columnasAMostrar.map(col => {
                return escapeCSV(feature.properties ? feature.properties[col] : null);
            });
            csvContent += row.join(DELIMITER) + "\r\n";
        });

        // 5. Descargar archivo
        // BOM (\uFEFF) para forzar a Excel a leer UTF-8 correctamente
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${capaNombre}_datos.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => URL.revokeObjectURL(url), 100);

        log.log(`CSV generado exitosamente para ${capaNombre}`);

    } catch (e) {
        log.error("Error al generar CSV:", e);
        alert(`Ocurrió un error al generar la tabla: ${e.message}`);
    } finally {
        if (btnCSV) {
            btnCSV.style.pointerEvents = 'auto';
            btnCSV.style.opacity = '1';
            btnCSV.querySelector('.download-title').textContent = 'Tabla CSV (Excel)';
        }
    }
}
