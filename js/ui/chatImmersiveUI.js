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

import { appState } from "../store/appState.js";
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
  const mapLegend = document.getElementById("ciMapLegend");
  const mapCount = document.getElementById("ciMapCount");
  const mapStatusText = document.getElementById("ciMapStatusText");
  const newConversation = document.getElementById("ciNewConversation");
  const clearLayers = document.getElementById("ciClearLayers");
  const expandMap = document.getElementById("ciExpandMap");
  const themeToggle = document.getElementById("ciThemeToggle");
  const themeIcon = document.getElementById("ciThemeIcon");

  let isResizing = false;

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

  function buildLegendSection(layer) {
    const section = document.createElement("div");
    section.className = "ci-legend-section";

    const title = document.createElement("strong");
    title.textContent =
      layer.layerLabel || humanizeLayer(layer.layerId) || "Capa";
    section.appendChild(title);

    const rows = document.createElement("div");
    rows.className = "ci-legend-rows";

    const cache = layer.colorCache instanceof Map ? layer.colorCache : null;
    const entries = cache
      ? Array.from(cache.entries()).filter(
          ([value]) =>
            value != null &&
            value !== "" &&
            String(value).trim().toLowerCase() !== "(sin dato)"
        )
      : [];

    if (entries.length > 0) {
      const sorted = entries.sort(([a], [b]) =>
        String(a).localeCompare(String(b), "es")
      );
      sorted.slice(0, 6).forEach(([value, color]) => {
        const row = document.createElement("div");
        row.className = "ci-legend-row";

        const swatch = document.createElement("i");
        swatch.className = "ci-legend-swatch";
        swatch.style.background = color;
        row.appendChild(swatch);

        const text = document.createElement("span");
        text.textContent =
          value == null || value === "" ? "(sin dato)" : String(value);
        row.appendChild(text);

        rows.appendChild(row);
      });

      if (sorted.length > 6) {
        const more = document.createElement("span");
        more.className = "ci-legend-more";
        more.textContent = `+${sorted.length - 6} valores más`;
        rows.appendChild(more);
      }
    } else {
      const row = document.createElement("div");
      row.className = "ci-legend-row";

      const swatch = document.createElement("i");
      swatch.className = "ci-legend-swatch";
      swatch.style.background = layerColor(layer);
      row.appendChild(swatch);

      const text = document.createElement("span");
      text.textContent = `${layerFeatureCount(layer)} elementos`;
      row.appendChild(text);

      rows.appendChild(row);
    }

    section.appendChild(rows);
    return section;
  }

  function renderMapLayers(layers) {
    if (mapChips) {
      mapChips.innerHTML = "";
      layers
        .slice()
        .reverse()
        .forEach((layer) => mapChips.appendChild(buildLayerChip(layer)));
    }

    if (mapLegend) {
      mapLegend.innerHTML = "";
      if (layers.length > 0) {
        const title = document.createElement("strong");
        title.className = "ci-legend-title";
        title.textContent = "Capas visibles";
        mapLegend.appendChild(title);

        layers.forEach((layer) => {
          mapLegend.appendChild(buildLegendSection(layer));
        });

        const foot = document.createElement("div");
        foot.className = "ci-legend-foot";
        foot.textContent =
          "Fuente: capas del geoportal. La leyenda se genera desde el estilo de cada capa.";
        mapLegend.appendChild(foot);
      }
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

  function updateLayout() {
    const layers = appState.chat.resultsLayers || [];
    const hasMap = layers.length > 0;

    body.classList.toggle("chat-has-map", hasMap);
    if (hasMap) setIntroVisible(false);

    renderMapLayers(layers);

    // El mapa cambia de tamaño al abrir/cerrar el split.
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
    updateLayout();
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
  document.addEventListener("woll:chat-results", () => {
    updateLayout();
  });

  document.addEventListener("woll:chat-cleared", () => {
    setIntroVisible(true);
    updateLayout();
  });

  // ── Arranque ───────────────────────────────────────────────
  setIntroVisible(true);
  updateLayout();

  log.log("Shell /chat inicializado");
}
