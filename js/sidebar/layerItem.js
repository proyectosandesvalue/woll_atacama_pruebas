import { DOM_PREFIXES } from "../config/constants.js";
import { appState } from "../store/appState.js";
import { actualizarLeyenda } from "../utils/legendUtils.js";
import { createContextLogger } from "../utils/logger.js";
import { openAttributeTable, openFilterModal } from "../utils/attributeTableUtils.js";
import { openDownloadModal } from "../utils/downloadUtils.js";
import { escapeHtml } from "../utils/helpers.js";
import {
  cargarCapaIndividual,
  mostrarCapa,
  ocultarCapa,
  setLayerOpacity,
  toggleClusterMode,
  toggleHeatmapMode,
  applySavedOpacity,
  updateLayerFilter,
} from "../utils/layerUtils.js";
import { getLayerOpacity, saveLayerOpacity } from "./opacityManager.js";

const log = createContextLogger("LayerItem");

document.addEventListener("click", (e) => {
  if (
    !e.target.closest(".layer-options-container") &&
    !e.target.closest(".layer-options-menu")
  ) {
    document.querySelectorAll(".layer-options-menu.show").forEach((menu) => {
      menu.classList.remove("show");
      if (menu.parentElement === document.body && menu._originalParent) {
        menu._originalParent.appendChild(menu);
        menu.style.position = "";
        menu.style.top = "";
        menu.style.left = "";
        menu.style.right = "";
        menu.style.zIndex = "";
      }
    });
    document.querySelectorAll(".menu-open-context").forEach((el) => {
      el.classList.remove("menu-open-context");
    });
  }
});

export function crearElementoCapa(
  capaNombre,
  temaKey,
  temaConfig,
  temasConfig,
  contenedorId,
  isInitialTheme
) {
  const listItem = document.createElement("li");
  listItem.setAttribute("data-capa-nombre", capaNombre);
  listItem.classList.add("layer-item-container", "mb-2");

  const checkboxId = `${
    contenedorId === "sidebar-layers"
      ? DOM_PREFIXES.LAYER_CHECKBOX
      : DOM_PREFIXES.LAYER_CHECKBOX_MOBILE
  }-${capaNombre}`;

  const displayCapaName =
    temaConfig.estilo?.[capaNombre]?.nombrePersonalizado || capaNombre;
  const initialOpacity = getLayerOpacity(capaNombre);
  const configCapa = temaConfig.estilo?.[capaNombre] || {};

  let subCategoriesHtml = "";
  if (configCapa.atributo && (configCapa.iconos || configCapa.colores)) {
    const valoresObj = configCapa.iconos || configCapa.colores;
    const valores = Object.keys(valoresObj);
    const hiddenSet =
      appState.layers.hiddenAttributes.get(capaNombre) || new Set();

    const checkboxesHtml = valores
      .map((val) => {
        const valId = escapeHtml(val)
          .replace(/\s+/g, "-")
          .replace(/[^a-zA-Z0-9-]/g, "");
        const isChecked = !hiddenSet.has(val);
        return `
        <div class="sub-layer-item mb-1 d-flex align-items-center" style="font-size: 0.85em; gap: 6px; padding-left: 36px;">
          <input type="checkbox" class="sub-layer-checkbox form-check-input mt-0" 
            id="sub-${checkboxId}-${valId}" 
            data-capa="${escapeHtml(capaNombre)}" 
            data-valor="${escapeHtml(val)}" 
            ${isChecked ? "checked" : ""}>
          <label for="sub-${checkboxId}-${valId}" class="m-0 text-muted" style="cursor: pointer; opacity: 0.9;">${escapeHtml(val)}</label>
        </div>
      `;
      })
      .join("");

    subCategoriesHtml = `
      <div class="sub-layers-container mt-1 mb-2" style="display: ${isInitialTheme ? "block" : "none"};">
        ${checkboxesHtml}
      </div>
    `;
  }

  let isClusterMode = appState.layers.clusterMode.get(capaNombre);
  if (
    isClusterMode === undefined &&
    configCapa.type === "point" &&
    configCapa.cluster === true
  ) {
    isClusterMode = true;
  } else if (isClusterMode === undefined) {
    isClusterMode = false;
  }

  let isHeatmapMode = appState.layers.heatmapMode.get(capaNombre);
  if (
    isHeatmapMode === undefined &&
    configCapa.type === "point" &&
    configCapa.heatmap === true
  ) {
    isHeatmapMode = true;
    appState.layers.heatmapMode.set(capaNombre, true);
  } else if (isHeatmapMode === undefined) {
    isHeatmapMode = false;
  }

  listItem.innerHTML = `
    <div class="layer-item">
      <input 
        class="layer-checkbox sr-only" 
        type="checkbox" 
        id="${checkboxId}" 
        value="${capaNombre}"
        ${isInitialTheme ? "checked" : ""}
        data-capa="${capaNombre}"
        data-tema-padre="${temaKey}"
      >
      <label class="layer-vis-btn" for="${checkboxId}" title="Alternar visibilidad">
        <span class="material-symbols-outlined vis-icon-on">visibility</span>
        <span class="material-symbols-outlined vis-icon-off">visibility_off</span>
      </label>
      <div class="layer-item-content">
        <div class="layer-item-header">
          <label class="layer-item-name" for="${checkboxId}">${displayCapaName}</label>
          <span class="material-symbols-outlined layer-warning" title="Aviso">warning</span>
        </div>
        <div class="layer-opacity-control">
          <input 
            type="range" 
            class="layer-opacity-slider" 
            data-capa="${capaNombre}"
            min="0" 
            max="100" 
            value="${initialOpacity}"
            step="1"
          >
        </div>
      </div>
      <div class="layer-options-container">
        <button class="layer-menu-btn" title="Opciones" type="button">
          <span class="material-symbols-outlined">more_vert</span>
        </button>
        <div class="layer-options-menu">
          <button class="layer-option-item" type="button" data-action="zoom-capa" data-capa="${capaNombre}">
            <span class="material-symbols-outlined">zoom_in_map</span>
            Zoom a la Capa
          </button>
          <button class="layer-option-item" type="button" data-action="ver-tabla" data-capa="${capaNombre}">
            <span class="material-symbols-outlined">table_chart</span>
            Ver tabla de Atributos
          </button>
          <button class="layer-option-item" type="button" data-action="filter-data" data-capa="${capaNombre}">
            <span class="material-symbols-outlined">filter_alt</span>
            Filtrar Datos
          </button>
          ${
            configCapa.type === "point"
              ? `
          <button class="layer-option-item btn-cluster-toggle" type="button" data-action="toggle-cluster" data-capa="${capaNombre}">
            <span class="material-symbols-outlined">${isClusterMode ? "grid_off" : "grid_view"}</span>
            ${isClusterMode ? "Desactivar Cluster" : "Activar Cluster"}
          </button>
          <button class="layer-option-item btn-heatmap-toggle" type="button" data-action="toggle-heatmap" data-capa="${capaNombre}">
            <span class="material-symbols-outlined">heat</span>
            ${isHeatmapMode ? "Desactivar Mapa de Calor" : "Activar Mapa de Calor"}
          </button>
          `
              : ""
          }
          <button class="layer-option-item" type="button" data-action="descargar-capa" data-capa="${capaNombre}">
            <span class="material-symbols-outlined">download</span>
            Descargar Capa
          </button>
        </div>
      </div>
    </div>
    ${subCategoriesHtml}
  `;

  const checkbox = listItem.querySelector(`#${checkboxId}`);
  const opacitySlider = listItem.querySelector(".layer-opacity-slider");

  checkbox.addEventListener("change", async (e) => {
    const isChecked = e.target.checked;

    if (isChecked) {
      const subContainer = listItem.querySelector(".sub-layers-container");
      if (subContainer) subContainer.style.display = "block";

      if (!appState.layers.loaded.has(capaNombre)) {
        const nameLabel = listItem.querySelector(".layer-item-name");
        const originalText = nameLabel.innerHTML;
        nameLabel.innerHTML = `${originalText} <span class="loading-indicator">...</span>`;

        try {
          await cargarCapaIndividual(capaNombre, temaKey, temasConfig);
          // cargarCapaIndividual ya marca la capa como cargada.
          const opacity = parseInt(opacitySlider.value) / 100;
          if (opacity < 1) setLayerOpacity(capaNombre, opacity);
        } catch (err) {
          e.target.checked = false;
        } finally {
          nameLabel.innerHTML = originalText;
        }
      } else {
        mostrarCapa(capaNombre);
        const opacity = parseInt(opacitySlider.value) / 100;
        if (opacity < 1) setLayerOpacity(capaNombre, opacity);
      }
      listItem.classList.add("layer-active");
    } else {
      const subContainer = listItem.querySelector(".sub-layers-container");
      if (subContainer) subContainer.style.display = "none";
      ocultarCapa(capaNombre);
      listItem.classList.remove("layer-active");
    }
    actualizarLeyenda(temaKey, temasConfig);
  });

  if (opacitySlider) {
    opacitySlider.addEventListener("input", (e) => {
      const value = e.target.value;
      const opacity = value / 100;
      saveLayerOpacity(capaNombre, parseInt(value));
      if (checkbox.checked && appState.layers.loaded.has(capaNombre)) {
        setLayerOpacity(capaNombre, opacity);
      }
    });
  }

   const menuBtn = listItem.querySelector(".layer-menu-btn");
  const menuOptions = listItem.querySelector(".layer-options-menu");

  if (menuBtn && menuOptions) {
    const menuOriginalParent = menuOptions.parentElement;

    const closeOtherMenu = (menu) => {
      menu.classList.remove("show");
      const li =
        menu._originalParent?.closest(".layer-item-container") ||
        menu.closest(".layer-item-container");
      if (li) li.classList.remove("menu-open-context");
      if (menu.parentElement === document.body && menu._originalParent) {
        menu._originalParent.appendChild(menu);
        menu.style.position = "";
        menu.style.top = "";
        menu.style.left = "";
        menu.style.right = "";
        menu.style.zIndex = "";
      }
    };

    const repositionMenu = () => {
      const btnRect = menuBtn.getBoundingClientRect();
      const menuWidth = menuOptions.offsetWidth || 180;
      let left = btnRect.right - menuWidth;
      let top = btnRect.bottom + 4;

      if (left < 4) left = 4;
      const spaceBelow = window.innerHeight - top;
      if (spaceBelow < 160 && btnRect.top > 160) {
        top = btnRect.top - (menuOptions.offsetHeight || 160) - 4;
      }

      menuOptions.style.position = "fixed";
      menuOptions.style.top = `${top}px`;
      menuOptions.style.left = `${left}px`;
      menuOptions.style.right = "auto";
      menuOptions.style.zIndex = "99999";
    };

    const openMenu = () => {
      document.querySelectorAll(".layer-options-menu.show").forEach((menu) => {
        if (menu !== menuOptions) closeOtherMenu(menu);
      });
      document.querySelectorAll(".menu-open-context").forEach((el) => {
        if (el !== listItem) el.classList.remove("menu-open-context");
      });

      document.body.appendChild(menuOptions);
      menuOptions.classList.add("show");
      listItem.classList.add("menu-open-context");
      repositionMenu();
    };

    const closeMenu = () => {
      menuOptions.classList.remove("show");
      listItem.classList.remove("menu-open-context");
      if (menuOptions.parentElement !== menuOriginalParent) {
        menuOriginalParent.appendChild(menuOptions);
        menuOptions.style.position = "";
        menuOptions.style.top = "";
        menuOptions.style.left = "";
        menuOptions.style.right = "";
        menuOptions.style.zIndex = "";
      }
    };

    menuOptions._originalParent = menuOriginalParent;

    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (menuOptions.classList.contains("show")) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    const scrollableParent = menuBtn.closest(".sidebar-content");
    if (scrollableParent) {
      scrollableParent.addEventListener(
        "scroll",
        () => {
          if (menuOptions.classList.contains("show")) {
            repositionMenu();
          }
        },
        { passive: true }
      );
    }

    const btnVerTabla = menuOptions.querySelector('[data-action="ver-tabla"]');
    if (btnVerTabla) {
      btnVerTabla.addEventListener("click", (e) => {
        e.stopPropagation();
        closeMenu();
        openAttributeTable(capaNombre, temasConfig);
      });
    }

    const btnFilter = menuOptions.querySelector('[data-action="filter-data"]');
    if (btnFilter) {
      btnFilter.addEventListener("click", (e) => {
        e.stopPropagation();
        closeMenu();
        openFilterModal(capaNombre, temasConfig);
      });
    }

    const btnZoom = menuOptions.querySelector('[data-action="zoom-capa"]');
    if (btnZoom) {
      btnZoom.addEventListener("click", (e) => {
        e.stopPropagation();
        closeMenu();
        const layer = appState.layers.byName.get(capaNombre);
        if (layer && layer.getBounds) {
          appState.map.fitBounds(layer.getBounds(), {
            padding: [50, 50],
            maxZoom: 16,
          });
        } else {
          const geojsonData = appState.layers.geojsonData.get(capaNombre);
          if (geojsonData && window.turf) {
            try {
              const bbox = turf.bbox(geojsonData);
              const bounds = [
                [bbox[1], bbox[0]],
                [bbox[3], bbox[2]],
              ];
              appState.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
            } catch (err) {
              log.error("Error calculando bbox con Turf:", err);
              alert("No se pudo calcular la extensión de la capa.");
            }
          } else {
            alert(
              "Primero debe activar la capa para hacer zoom, o la capa no tiene extensión definida."
            );
          }
        }
      });
    }

    const btnDescargar = menuOptions.querySelector('[data-action="descargar-capa"]');
    if (btnDescargar) {
      btnDescargar.addEventListener("click", (e) => {
        e.stopPropagation();
        closeMenu();
        openDownloadModal(capaNombre, temasConfig);
      });
    }

    const btnCluster = menuOptions.querySelector('[data-action="toggle-cluster"]');
    const btnHeatmap = menuOptions.querySelector('[data-action="toggle-heatmap"]');

    if (btnCluster) {
      btnCluster.addEventListener("click", (e) => {
        e.stopPropagation();
        closeMenu();
        toggleClusterMode(capaNombre, temaKey, temasConfig).then(() => {
          const newMode = appState.layers.clusterMode.get(capaNombre);
          const heatmapMode = appState.layers.heatmapMode.get(capaNombre);
          btnCluster.innerHTML = `<span class="material-symbols-outlined">${newMode ? "grid_off" : "grid_view"}</span> ${newMode ? "Desactivar Cluster" : "Activar Cluster"}`;
          if (btnHeatmap) {
            btnHeatmap.innerHTML = `<span class="material-symbols-outlined">heat</span> ${heatmapMode ? "Desactivar Mapa de Calor" : "Activar Mapa de Calor"}`;
          }
          applySavedOpacity(capaNombre);
        });
      });
    }

    if (btnHeatmap) {
      btnHeatmap.addEventListener("click", (e) => {
        e.stopPropagation();
        closeMenu();
        toggleHeatmapMode(capaNombre, temaKey, temasConfig).then(() => {
          const newMode = appState.layers.heatmapMode.get(capaNombre);
          const clusterMode = appState.layers.clusterMode.get(capaNombre);
          btnHeatmap.innerHTML = `<span class="material-symbols-outlined">heat</span> ${newMode ? "Desactivar Mapa de Calor" : "Activar Mapa de Calor"}`;
          if (btnCluster) {
            btnCluster.innerHTML = `<span class="material-symbols-outlined">${clusterMode ? "grid_off" : "grid_view"}</span> ${clusterMode ? "Desactivar Cluster" : "Activar Cluster"}`;
          }
          applySavedOpacity(capaNombre);
        });
      });
    }
  }

  if (isInitialTheme) {
    listItem.classList.add("layer-active");
  }

  const subLayerCheckboxes = listItem.querySelectorAll(".sub-layer-checkbox");
  subLayerCheckboxes.forEach((subCb) => {
    subCb.addEventListener("change", (e) => {
      const isSubChecked = e.target.checked;
      const val = e.target.dataset.valor || "";

      let hiddenSet = appState.layers.hiddenAttributes.get(capaNombre);
      if (!hiddenSet) {
        hiddenSet = new Set();
        appState.layers.hiddenAttributes.set(capaNombre, hiddenSet);
      }

      if (isSubChecked) {
        hiddenSet.delete(val);
      } else {
        hiddenSet.add(val);
      }

      if (checkbox.checked && appState.layers.loaded.has(capaNombre)) {
        updateLayerFilter(capaNombre);
      }
    });
  });

  return listItem;
} 

export function syncIndividualCheckboxes(capaNombre, checkedState) {
  const mainCheckbox = document.getElementById(
    `${DOM_PREFIXES.LAYER_CHECKBOX}${capaNombre}`
  );
  if (mainCheckbox) {
    if (mainCheckbox.checked !== checkedState) {
      mainCheckbox.checked = checkedState;
    }
  }

  const mobileCheckbox = document.getElementById(
    `${DOM_PREFIXES.LAYER_CHECKBOX_MOBILE}${capaNombre}`
  );
  if (mobileCheckbox) {
    if (mobileCheckbox.checked !== checkedState) {
      mobileCheckbox.checked = checkedState;
    }
  }
}