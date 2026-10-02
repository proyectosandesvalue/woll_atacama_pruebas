/**
 * Punto de entrada principal de la aplicación
 * Maneja la inicialización y configuración global
 * @module app
 */

import capasBaseConfig from "./config/capasBase.js";
import { initMap, setBaseLayer } from "./utils/mapUtils.js";
import { actualizarCapasSidebar, activarCapasDeDimension } from "./sidebar/dimensionBuilder.js";
import { actualizarCapasBase, sincronizarEstadoCapas } from "./sidebar/groupManager.js";
import { actualizarLeyenda } from "./utils/legendUtils.js";
import { limpiarMapa } from "./utils/layerUtils.js";
import allTemasConfig from "./config/allTemasConfig.js";
import { obtenerCapasParaCargaInicial } from "./utils/configUtils.js";
import { logger } from "./utils/logger.js";
import { appState, initializeMap, setCurrentBaseLayer, setActiveTema } from "./store/appState.js";
import { buildSearchIndex } from "./search/index.js";
import { validarConfiguracionGlobal } from "./utils/configValidator.js";

document.addEventListener("DOMContentLoaded", () => {
  logger.log("Inicializando aplicación...");

  try {
    // Validar configuración estática antes de montar todo
    validarConfiguracionGlobal(allTemasConfig);

    // Inicialización del mapa, coordenadas centro del mapa, zoom inicial
    const map = initMap("map", [-27.69812, -70.35645], 7);
    const baseLayer = setBaseLayer(
      map,
      L.tileLayer(capasBaseConfig.openStreetMap.url, {
        attribution: capasBaseConfig.openStreetMap.nombre,
      })
    );

    // Inicializar estado global
    initializeMap(map);
    setCurrentBaseLayer(baseLayer);
    setActiveTema("agua");
    logger.log("Control de búsqueda agregado al mapa");
    actualizarCapasBase("sidebar-base-layers", capasBaseConfig);
    actualizarCapasSidebar(appState.activeTemaName, allTemasConfig);
    actualizarLeyenda(appState.activeTemaName, allTemasConfig);
    // Event listeners
    setupBaseLayerListeners();
    setupInitialTheme();
    setupThemeListeners();

    logger.log("Aplicación inicializada correctamente");
  } catch (error) {
    logger.error("Error fatal durante la inicialización:", error);
  }
});

function setupBaseLayerListeners() {
  logger.debug("Configurando listeners de capas base...");

  document.querySelectorAll(".base-layer-btn").forEach((button) => {
    button.addEventListener("click", function () {
      const layerKey = this.dataset.layer;
      cambiarCapaBasePorBoton(layerKey);
    });
  });
}

function cambiarCapaBasePorBoton(layerKey) {
  if (!capasBaseConfig[layerKey]) {
    logger.error(`Configuración de capa base '${layerKey}' no encontrada`);
    return;
  }
  document.querySelectorAll(".base-layer-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document.querySelector(`[data-layer="${layerKey}"]`)?.classList.add("active");
  appState.map.removeLayer(appState.currentBaseLayer);
  const nuevaCapaBase = L.tileLayer(capasBaseConfig[layerKey].url, {
    attribution: capasBaseConfig[layerKey].nombre,
    maxZoom: capasBaseConfig[layerKey].maxZoom || 18,
    minZoom: capasBaseConfig[layerKey].minZoom || 1,
  });
  nuevaCapaBase.addTo(appState.map);
  setCurrentBaseLayer(nuevaCapaBase);
  const radioButtons = document.querySelectorAll(
    `input[name="baseLayer"], input[name="baseLayerMobile"]`
  );
  radioButtons.forEach((radio) => {
    radio.checked = radio.value === layerKey;
  });
  logger.log(`Capa base cambiada a: ${capasBaseConfig[layerKey].nombre}`);
}

function setupInitialTheme() {
  logger.log("Cargando tema inicial:", appState.activeTemaName);
  const initialThemeButton = document.querySelector(
    `.theme-btn[data-theme="${appState.activeTemaName}"]`
  );
  if (initialThemeButton) {
    initialThemeButton.classList.add("active");
  }
  const temaConfig = allTemasConfig[appState.activeTemaName];
  if (!temaConfig) {
    logger.error(`Tema '${appState.activeTemaName}' no encontrado`);
    return;
  }
  const capasACargaInicial = obtenerCapasParaCargaInicial(temaConfig);
  logger.debug(
    `Capas a cargar inicialmente para ${appState.activeTemaName}:`,
    capasACargaInicial
  );
  (async () => {
    if (capasACargaInicial.length > 0) {
      await activarCapasDeDimension(
        appState.activeTemaName,
        capasACargaInicial,
        allTemasConfig
      );
    }

    actualizarCapasSidebar(appState.activeTemaName, allTemasConfig);
    sincronizarEstadoCapas(appState.activeTemaName, allTemasConfig);
    actualizarLeyenda(appState.activeTemaName, allTemasConfig);

    buildSearchIndex();
    logger.log("Índice de búsqueda construido");

    // Fase 1 del Chat IA: el contexto vive en Supabase (chat.chat_catalog).
    // El navegador ya no descarga 270 MB de GeoJSON en cada visita:
    // /api/chat consulta la BD real y devuelve datos en milisegundos.
  })();
}

function setupThemeListeners() {
  logger.debug("Configurando listeners de temas...");
  document.querySelectorAll(".theme-btn").forEach((button) => {
    button.addEventListener("click", function () {
      const themeName = this.dataset.theme;
      logger.log(`Cambiando a tema: ${themeName}`);
      if (allTemasConfig[themeName]) {
        document
          .querySelectorAll(".theme-btn")
          .forEach((btn) => btn.classList.remove("active"));
        this.classList.add("active");
        setActiveTema(themeName);
        limpiarMapa(appState.currentBaseLayer);
        const temaConfig = allTemasConfig[themeName];
        const capasACargaInicial = obtenerCapasParaCargaInicial(temaConfig);
        logger.debug(
          `Cargando capas iniciales para ${themeName}:`,
          capasACargaInicial
        );
        (async () => {
          if (capasACargaInicial.length > 0) {
            await activarCapasDeDimension(
              themeName,
              capasACargaInicial,
              allTemasConfig
            );
          }
          
          actualizarCapasSidebar(appState.activeTemaName, allTemasConfig);
          sincronizarEstadoCapas(appState.activeTemaName, allTemasConfig);
          actualizarLeyenda(appState.activeTemaName, allTemasConfig);
          buildSearchIndex();
          logger.log("Índice de búsqueda reconstruido para nuevo tema");
        })();
        logger.log(`Tema cambiado a: ${themeName}`);
      } else {
        logger.error(`Tema '${themeName}' no encontrado en la configuración`);
      }
    });
  });
}