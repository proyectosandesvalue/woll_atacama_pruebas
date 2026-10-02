/**
 * Utilidades para el modal de descarga de capas y exportación a GeoJSON/CSV
 * @module utils/downloadUtils
 */

import { appState } from "../store/appState.js";
import { cargarCapaIndividual } from "./layerUtils.js";
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
            await descargarGeoJSON(currentCapa);
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
 * Descarga el archivo GeoJSON original
 * @param {string} capaNombre - Nombre técnico de la capa
 */
async function descargarGeoJSON(capaNombre) {
    try {
        const url = `geojson/${capaNombre}.geojson`;

        const a = document.createElement('a');
        a.href = url;
        a.download = `${capaNombre}.geojson`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        log.log(`Descargando GeoJSON para la capa: ${capaNombre}`);
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

        // 1. Obtener datos (descargar si no están en caché)
        let geojson = appState.layers.geojsonData.get(capaNombre);
        if (!geojson) {
            log.log(`Datos para ${capaNombre} no encontrados en caché. Descargando para CSV...`);
            await cargarCapaIndividual(capaNombre, temaKey, temasConfig);
            appState.layers.loaded.add(capaNombre);
            geojson = appState.layers.geojsonData.get(capaNombre);
        }

        if (!geojson || !geojson.features || geojson.features.length === 0) {
            throw new Error("La capa no contiene datos vectoriales o está vacía.");
        }

        const configCapa = getCapaConfig(capaNombre, temaKey, temasConfig);
        const aliasConfig = configCapa?.alias || null;
        const features = geojson.features;

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
