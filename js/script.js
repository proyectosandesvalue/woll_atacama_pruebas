/**
 * script.js - UI Shell para la nueva interfaz
 * Integra tema, sidebars, tabs, coordenadas, modal y responsive mediante submódulos.
 * Ubicación: /js/script.js
 */

import { appState } from './store/appState.js';
import { createContextLogger } from './utils/logger.js';

const log = createContextLogger('UI-Shell');

// Importar submódulos de UI
import { initThemeUI } from './ui/themeUI.js';
import { initSidebarUI } from './ui/sidebarUI.js';
import { initMapUI, initModalUI } from './ui/mapUI.js';
import { initSearchUI } from './ui/searchUI.js';
import { initMobileUI } from './ui/mobileUI.js';
import { initChatUI } from './ui/chatUI.js';

// ── Módulo principal de UI (se ejecuta cuando el DOM y el mapa están listos) ──
async function initUI() {
  let map;
  try {
    map = await appState.mapReady;
  } catch (err) {
    log.error('No se pudo inicializar UI: el mapa no está disponible.', err.message);
    return;
  }

  if (!map) {
    log.error('No se pudo inicializar UI porque no hay mapa.');
    return;
  }

  // Inicializar componentes
  initThemeUI();
  initSidebarUI(map);
  initMapUI(map);
  initModalUI();
  initSearchUI(map);
  initMobileUI(map);
  initChatUI();

  log.log('UI Shell inicializada correctamente (modular)');
}

// ── Arranque ──
document.addEventListener('DOMContentLoaded', initUI);