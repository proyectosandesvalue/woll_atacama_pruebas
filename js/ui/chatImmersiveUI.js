/**
 * chatImmersiveUI.js — Shell /chat
 *
 * Reutiliza el mapa y el chat existentes. Solo agrega:
 *   - header propio de /chat
 *   - portada de chat completo
 *   - split mapa/chat cuando hay resultados
 *   - divisor arrastrable
 *   - header/leyenda del mapa
 *
 * No modifica el orquestador, las tools ni los prompts.
 */

import { appState, setCurrentBaseLayer } from "../store/appState.js";
import capasBaseConfig from "../config/capasBase.js";
import {
  clearResults,
  clearResultsByLayerId,
} from "../utils/chatMapUtils.js";
import { createContextLogger } from "../utils/logger.js";

const log = createContextLogger("ChatImmersive");

export const isChatImmersiveRoute =
  typeof window !== "undefined" && window.location.pathname === "/chat";

if (isChatImmersiveRoute && typeof document !== "undefined" && document.body) {
  document.body.classList.add("chat-immersive");
}

const SPLIT_KEY = "woll-chat-split";
const SPLIT_DEFAULT = 62;
const BASE_MAP_KEY = "woll-chat-basemap";
const DEFAULT_BASE_MAP = "openStreetMap";

function humanizeLayer(value) {
  if (!value) return "Capa";
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function layerColor(layer) {
  return layer?.baseColor || "#0284c7";
}

function layerFeatureCount(layer) {
  return Array.isArray(layer?.geojson?.features)
    ? layer.geojson.features.length
    : 0;
}

/**
 * @param {L.Map} map
 */
export function initChatImmersiveUI(map) {
  if (!isChatImmersiveRoute || !map) return;

  const body = document.body;
  body.classList.add("chat-immersive");

  const mainLayout = document.querySelector(".main-layout");
  const divider = document.getElementById("ciDivider");
  const chatForm = document.getElementById("ai-chat-form");
  const chatInput = document.getElementById("ai-chat-input");
  const mapCanvas = document.querySelector(".map-canvas");
  const mapChips = document.getElementById("ciMapChips");
  const mapCount = document.getElementById("ciMapCount");
  const mapStatusText = document.getElementById("ciMapStatusText");
  const mapToggle = document.getElementById("ciShowMap");
  const basemapSelect = document.getElementById("ciBasemapSelect");
  const newConversation = document.getElementById("ciNewConversation");
  const clearLayers = document.getElementById("ciClearLayers");
  const expandMap = document.getElementById("ciExpandMap");
  const themeToggle = document.getElementById("ciThemeToggle");
  const themeIcon = document.getElementById("ciThemeIcon");

  let isResizing = false;
  let mapCollapsed = false;
  let currentBasemapKey = DEFAULT_BASE_MAP;

  if (chatInput) {
    chatInput.placeholder = "Pregunta algo sobre el territorio...";
  }

  // ── Portada / conversación ─────────────────────────────────
  function setIntroVisible(visible) {
    body.classList.toggle("ci-intro-hidden", !visible);
    if (visible) {
      window.setTimeout(() => {
        chatInput?.focus({ preventScroll: true });
      }, 60);
    }
  }

  chatForm?.addEventListener("submit", () => {
    setIntroVisible(false);
  });

  document.querySelectorAll("[data-ci-query]").forEach((button) => {
    button.addEventListener("click", () => {
      const query = button.getAttribute("data-ci-query");
      if (!query || !chatInput || !chatForm) return;
      chatInput.value = query;
      chatForm.requestSubmit();
    });
  });

  newConversation?.addEventListener("click", () => {
    document.getElementById("clearChatBtn")?.click();
  });

  function syncThemeIcon() {
    if (!themeIcon) return;
    themeIcon.textContent =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "light_mode"
        : "dark_mode";
  }

  themeToggle?.addEventListener("click", () => {
    document.getElementById("themeToggle")?.click();
    window.setTimeout(syncThemeIcon, 0);
  });

  const themeObserver = new MutationObserver(syncThemeIcon);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  syncThemeIcon();

  // ── Mapa base ───────────────────────────────────────────────
  function applyBasemap(key, { persist = true } = {}) {
    const config = capasBaseConfig[key];
    if (!config || !map) return false;

    if (key === currentBasemapKey && appState.currentBaseLayer) {
      if (basemapSelect) basemapSelect.value = key;
      return true;
    }

    try {
      const next = L.tileLayer(config.url, {
        attribution: config.nombre,
        maxZoom: config.maxZoom || 19,
        minZoom: config.minZoom || 1,
      });
      const previous = appState.currentBaseLayer;
      if (previous && map.hasLayer(previous)) {
        map.removeLayer(previous);
      }
      next.addTo(map);
      setCurrentBaseLayer(next);
      currentBasemapKey = key;
      if (basemapSelect) basemapSelect.value = key;
      if (persist) {
        try {
          window.localStorage.setItem(BASE_MAP_KEY, key);
        } catch {
          /* almacenamiento no disponible */
        }
      }
      return true;
    } catch (error) {
      log.warn("No se pudo cambiar el mapa base:", error.message);
      return false;
    }
  }

  if (basemapSelect) {
    let saved = null;
    try {
      saved = window.localStorage.getItem(BASE_MAP_KEY);
    } catch {
      /* almacenamiento no disponible */
    }
    if (saved && saved !== DEFAULT_BASE_MAP && capasBaseConfig[saved]) {
      applyBasemap(saved, { persist: false });
    } else {
      applyBasemap(DEFAULT_BASE_MAP, { persist: false });
    }
    basemapSelect.addEventListener("change", () => {
      const key = basemapSelect.value;
      if (!applyBasemap(key)) {
        basemapSelect.value = currentBasemapKey;
      }
    });
  }

  // ── Mapa: chips, leyenda y estado ───────────────────────────
  function removeLayerFromMap(layer) {
    if (!layer) return;

    if (layer.layerId) {
      clearResultsByLayerId(layer.layerId);
    } else {
      if (
        layer.leafletLayer &&
        appState.map &&
        appState.map.hasLayer(layer.leafletLayer)
      ) {
        appState.map.removeLayer(layer.leafletLayer);
      }
      appState.chat.resultsLayers = (appState.chat.resultsLayers || []).filter(
        (entry) => entry !== layer
      );
    }

    updateLayout();
  }

  function buildLayerChip(layer) {
    const chip = document.createElement("span");
    chip.className = "ci-layer-chip";

    const dot = document.createElement("i");
    dot.className = "ci-layer-dot";
    dot.style.background = layerColor(layer);
    chip.appendChild(dot);

    const label = document.createElement("span");
    label.textContent =
      layer.layerLabel || humanizeLayer(layer.layerId) || "Capa";
    chip.appendChild(label);

    const count = layerFeatureCount(layer);
    if (count > 0) {
      const badge = document.createElement("b");
      badge.textContent = String(count);
      chip.appendChild(badge);
    }

    const remove = document.createElement("button");
    remove.type = "button";
    remove.setAttribute(
      "aria-label",
      `Quitar capa ${layer.layerLabel || humanizeLayer(layer.layerId)}`
    );
    remove.innerHTML =
      '<span class="material-symbols-outlined">close</span>';
    remove.addEventListener("click", () => removeLayerFromMap(layer));
    chip.appendChild(remove);

    return chip;
  }

  function fitToLayers(layers) {
    if (!map || !Array.isArray(layers) || layers.length === 0) return;

    const fit = () => {
      try {
        map.invalidateSize();
        const group = L.featureGroup(
          layers.map((layer) => layer.leafletLayer).filter(Boolean)
        );
        const bounds = group.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        }
      } catch (error) {
        log.warn(
          "No se pudo centrar el mapa en los resultados:",
          error.message
        );
      }
    };

    // El split se muestra en este tick; dos frames después el contenedor
    // ya tiene tamaño y fitBounds calcula el zoom correcto.
    window.requestAnimationFrame(() => window.requestAnimationFrame(fit));
  }

  function renderMapLayers(layers) {
    if (mapChips) {
      mapChips.innerHTML = "";
      layers
        .slice()
        .reverse()
        .forEach((layer) => mapChips.appendChild(buildLayerChip(layer)));
    }

    const label =
      layers.length === 1
        ? "1 capa visible"
        : `${layers.length} capas visibles`;

    if (mapCount) mapCount.textContent = label;
    if (mapStatusText) {
      mapStatusText.textContent = `Mapa interactivo · ${label}`;
    }
  }

  function updateMapToggle(hasResults, showMap) {
    if (!mapToggle) return;
    mapToggle.hidden = !hasResults;
    if (!hasResults) return;

    mapToggle.setAttribute("aria-pressed", String(showMap));
    const label = showMap ? "Ocultar mapa" : "Ver mapa";
    mapToggle.title = label;
    mapToggle.setAttribute("aria-label", label);
  }

  function updateLayout() {
    const layers = appState.chat.resultsLayers || [];
    const hasResults = layers.length > 0;
    if (!hasResults) mapCollapsed = false;

    const showMap = hasResults && !mapCollapsed;

    body.classList.toggle("chat-has-map", showMap);
    if (hasResults) setIntroVisible(false);

    renderMapLayers(layers);
    updateMapToggle(hasResults, showMap);

    if (!showMap) return;

    // El mapa cambia de tamaño al abrir o cerrar el split.
    window.requestAnimationFrame(() => {
      try {
        map.invalidateSize();
      } catch (error) {
        log.warn("No se pudo actualizar el tamaño del mapa:", error.message);
      }
    });
  }

  clearLayers?.addEventListener("click", () => {
    clearResults();
    mapCollapsed = false;
    updateLayout();
  });

  mapToggle?.addEventListener("click", () => {
    const layers = appState.chat.resultsLayers || [];
    if (layers.length === 0) return;

    mapCollapsed = !mapCollapsed;
    updateLayout();
    if (!mapCollapsed) fitToLayers(layers);
  });

  // ── Divisor arrastrable ────────────────────────────────────
  function setSplitWidth(percent, persist = true) {
    if (!mainLayout || !divider) return;
    const clamped = Math.min(72, Math.max(32, Number(percent) || SPLIT_DEFAULT));

    mainLayout.style.setProperty("--ci-map-width", `${clamped}%`);
    divider.setAttribute("aria-valuenow", String(Math.round(clamped)));

    if (persist) {
      try {
        window.localStorage.setItem(SPLIT_KEY, String(clamped));
      } catch {
        /* almacenamiento no disponible */
      }
    }

    window.requestAnimationFrame(() => {
      try {
        map.invalidateSize();
      } catch {
        /* sin mapa */
      }
    });
  }

  function widthFromPointer(clientX) {
    const rect = mainLayout.getBoundingClientRect();
    if (!rect.width) return SPLIT_DEFAULT;
    return ((clientX - rect.left) / rect.width) * 100;
  }

  divider?.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    isResizing = true;
    divider.focus();
    try {
      divider.setPointerCapture?.(event.pointerId);
    } catch {
      /* pointer capture no disponible */
    }
    body.classList.add("is-resizing");
    event.preventDefault();
  });

  divider?.addEventListener("pointermove", (event) => {
    if (!isResizing) return;
    setSplitWidth(widthFromPointer(event.clientX));
  });

  function endResize(event) {
    if (!isResizing) return;
    isResizing = false;
    body.classList.remove("is-resizing");
    try {
      divider.releasePointerCapture?.(event.pointerId);
    } catch {
      /* pointer capture no disponible */
    }
  }

  divider?.addEventListener("pointerup", endResize);
  divider?.addEventListener("pointercancel", endResize);
  divider?.addEventListener("dblclick", () => setSplitWidth(SPLIT_DEFAULT));

  divider?.addEventListener("keydown", (event) => {
    const current =
      Number(divider.getAttribute("aria-valuenow")) || SPLIT_DEFAULT;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setSplitWidth(current - 2);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setSplitWidth(current + 2);
    } else if (event.key === "Home") {
      event.preventDefault();
      setSplitWidth(32);
    } else if (event.key === "End") {
      event.preventDefault();
      setSplitWidth(72);
    }
  });

  try {
    const saved = Number(window.localStorage.getItem(SPLIT_KEY));
    if (Number.isFinite(saved) && saved >= 32 && saved <= 72) {
      setSplitWidth(saved, false);
    } else {
      setSplitWidth(SPLIT_DEFAULT, false);
    }
  } catch {
    setSplitWidth(SPLIT_DEFAULT, false);
  }

  // ── Pantalla completa del mapa ─────────────────────────────
  expandMap?.addEventListener("click", async () => {
    if (!mapCanvas) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await mapCanvas.requestFullscreen();
      }
    } catch {
      log.warn("El navegador no permitió pantalla completa para el mapa.");
    }
  });

  document.addEventListener("fullscreenchange", () => {
    window.setTimeout(() => map.invalidateSize(), 120);
  });

  // ── Eventos del chat ───────────────────────────────────────
  document.addEventListener("woll:chat-results", (event) => {
    const newLayers = event.detail?.layers || [];
    if (newLayers.length > 0) mapCollapsed = false;

    updateLayout();
    fitToLayers(newLayers);
  });

  document.addEventListener("woll:chat-cleared", () => {
    mapCollapsed = false;
    setIntroVisible(true);
    updateLayout();
  });

  // ── Arranque ───────────────────────────────────────────────
  setIntroVisible(true);
  updateLayout();

  log.log("Shell /chat inicializado");
}
