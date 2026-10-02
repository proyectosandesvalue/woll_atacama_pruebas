// Funciones para generar y mostrar popups.

import { getPopupContent } from './styleUtils.js';
import { escapeHtml } from './helpers.js';

/**
 * Genera y vincula popups a las capas.
 * @param {object} feature - La característica GeoJSON.
 * @param {L.Layer} layer - La capa de Leaflet.
 * @param {object} configCapa - La configuración de la capa específica.
 */
export function bindPopup(feature, layer, configCapa) {
    if (configCapa && configCapa.popupCampos && configCapa.popupCampos.length > 0) {
        layer.on('click', (e) => {
            // Detener propagación para evitar clics del mapa u otros elementos
            L.DomEvent.stopPropagation(e);
            // 1. Obtener contenido del popup
            const content = getPopupContent(feature, configCapa);
            // 2. Inyectarlo en el sidebar
            const sidebarInfoContent = document.getElementById('sidebarInfoContent');
            if (sidebarInfoContent) {
                sidebarInfoContent.innerHTML = content;
            }
            // 3. Actualizar el título del sidebar
            const sidebarInfoTitle = document.getElementById('sidebarInfoTitle');
            if (sidebarInfoTitle) {
                const tituloStr = escapeHtml(configCapa.nombrePersonalizado || 'Información');
                sidebarInfoTitle.innerHTML = `
                  <span class="material-symbols-outlined" style="font-size: 18px;">info</span>
                  ${tituloStr}
                `;
            }
            // 4. Abrir el sidebar
            const sidebarInfo = document.getElementById('sidebarInfo');
            if (sidebarInfo) {
                sidebarInfo.classList.add('active');
            }
        });
    }
}
