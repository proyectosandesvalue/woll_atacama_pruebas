import { DOM_PREFIXES } from "../config/constants.js";
import { appState } from "../store/appState.js";
import { actualizarLeyenda } from "../utils/legendUtils.js";
import { obtenerTodasLasCapasDeDimension } from "../utils/configUtils.js";
import { createContextLogger } from "../utils/logger.js";
import {
  cargarCapaIndividual,
  mostrarCapa,
  ocultarCapa,
  estimateLayerSize,
} from "../utils/layerUtils.js";
import { ConcurrentQueue } from "../utils/concurrentQueue.js";
import { crearElementoCapa, syncIndividualCheckboxes } from "./layerItem.js";

const log = createContextLogger("DimensionBuilder");

function agruparCapasPorDimensionEn(contenedor, temasConfig) {
  if (!contenedor || !temasConfig) return;

  contenedor.innerHTML = "";
  const dimensionKeys = Object.keys(temasConfig);

  dimensionKeys.forEach((temaKey) => {
    const temaConfig = temasConfig[temaKey];
    if (!temaConfig || !temaConfig.capas || temaConfig.capas.length === 0)
      return;

    const dimensionGroup = document.createElement("div");
    dimensionGroup.classList.add("dimension-group", "mb-3");
    dimensionGroup.setAttribute("data-dimension-key", temaKey);

    const header = document.createElement("div");
    header.classList.add(
      "dimension-group-header",
      "d-flex",
      "justify-content-between",
      "align-items-center",
      "mb-2"
    );

    const dimensionName =
      temaConfig.nombre || temaKey.charAt(0).toUpperCase() + temaKey.slice(1);
    const switchId = `${DOM_PREFIXES.DIMENSION_SWITCH}${temaKey}-${contenedor.id}`;
    const isInitialTheme = temaKey === appState.activeTemaName;
    const collapseId = `${DOM_PREFIXES.COLLAPSE_DIMENSION}${temaKey}-${contenedor.id}`;
    const temaIcono = temaConfig.icono || "layers";

    header.innerHTML = `
      <input class="dimension-switch sr-only" type="checkbox" id="${switchId}" value="${temaKey}" ${isInitialTheme ? "checked" : ""}>
      
      <label class="group-vis-btn" for="${switchId}" title="Modificar visibilidad completa">
        <span class="material-symbols-outlined vis-icon-on">visibility</span>
        <span class="material-symbols-outlined vis-icon-off">visibility_off</span>
      </label>
      
      <div class="dimension-title-container">
        <span class="material-symbols-outlined dimension-icon">${temaIcono}</span>
        <span class="dimension-title">${dimensionName}</span>
      </div>

      <button class="btn-collapse-toggle" type="button" aria-expanded="${isInitialTheme ? "true" : "false"}">
        <span id="btn-collapse-${temaKey}" class="material-symbols-outlined ${isInitialTheme ? "" : "collapsed-icon-rotated"}">expand_more</span>
      </button>
    `;

    const switchInput = header.querySelector(".dimension-switch");
    const collapseButton = header.querySelector(".btn-collapse-toggle");
    const switchLabel = header.querySelector(".dimension-title");
    const titleContainer = header.querySelector(".dimension-title-container");

    const childrenContainer = document.createElement("ul");
    childrenContainer.id = collapseId;
    childrenContainer.classList.add(
      "collapse",
      "dimension-children",
      "list-unstyled",
      "mt-1",
      "ps-0"
    );

    if (isInitialTheme) {
      childrenContainer.classList.add("show", "dimension-active");
    }

    const toggleCollapse = () => {
      childrenContainer.classList.toggle("show");
      const icon = header.querySelector("#btn-collapse-" + temaKey);
      if (icon) icon.classList.toggle("collapsed-icon-rotated");
    };
    collapseButton.addEventListener("click", toggleCollapse);
    titleContainer.addEventListener("click", toggleCollapse);

    const cargaInicial = temaConfig.cargaInicial || {};
    const gruposIniciales = cargaInicial.grupos || [];

    if (temaConfig.grupos && Object.keys(temaConfig.grupos).length > 0) {
      Object.entries(temaConfig.grupos).forEach(([grupoKey, grupoConfig]) => {
        const grupoLi = document.createElement("li");
        grupoLi.classList.add("grupo-tematico", "mb-2");
        grupoLi.setAttribute("data-grupo-key", grupoKey);

        const seCargaInicialmente =
          isInitialTheme && gruposIniciales.includes(grupoKey);

        const grupoSwitchId = `${DOM_PREFIXES.GRUPO_SWITCH}${temaKey}-${grupoKey}-${contenedor.id}`;
        const grupoCollapseId = `${DOM_PREFIXES.COLLAPSE_GRUPO}${temaKey}-${grupoKey}-${contenedor.id}`;

        const grupoHeader = document.createElement("div");
        grupoHeader.classList.add(
          "grupo-header",
          "d-flex",
          "align-items-center",
          "justify-content-between",
          "mb-1"
        );

        grupoHeader.innerHTML = `
          <input class="grupo-switch sr-only" type="checkbox" id="${grupoSwitchId}" data-tema="${temaKey}" data-grupo="${grupoKey}" ${seCargaInicialmente ? "checked" : ""}>
          
          <label class="group-vis-btn" for="${grupoSwitchId}" title="Modificar visibilidad del grupo">
            <span class="material-symbols-outlined vis-icon-on">visibility</span>
            <span class="material-symbols-outlined vis-icon-off">visibility_off</span>
          </label>
          
          <div class="dimension-title-container">
            <span class="grupo-nombre">${grupoConfig.nombre}</span>
          </div>

          <button class="btn-collapse-toggle-grupo" type="button" aria-expanded="${seCargaInicialmente ? "true" : "false"}">
            <span id="btn-collapse-grupo-${grupoKey}" class="material-symbols-outlined ${seCargaInicialmente ? "" : "collapsed-icon-rotated"}">expand_more</span>
          </button>
        `;

        const grupoSwitch = grupoHeader.querySelector(".grupo-switch");
        const grupoSwitchLabel = grupoHeader.querySelector(".grupo-nombre");
        const grupoCollapseBtn = grupoHeader.querySelector(
          ".btn-collapse-toggle-grupo"
        );
        const grupoTitleContainer = grupoHeader.querySelector(
          ".dimension-title-container"
        );

        const toggleGrupoCollapse = () => {
          const grupoCapasEl = document.getElementById(grupoCollapseId);
          if (grupoCapasEl) grupoCapasEl.classList.toggle("show");
          const icon = document.getElementById("btn-collapse-grupo-" + grupoKey);
          if (icon) icon.classList.toggle("collapsed-icon-rotated");
        };
        grupoCollapseBtn.addEventListener("click", toggleGrupoCollapse);
        grupoTitleContainer.addEventListener("click", toggleGrupoCollapse);

        grupoLi.appendChild(grupoHeader);

        const grupoCapasUl = document.createElement("ul");
        grupoCapasUl.id = grupoCollapseId;
        grupoCapasUl.classList.add(
          "collapse",
          "grupo-capas-list",
          "list-unstyled",
          "ps-3"
        );

        if (seCargaInicialmente) {
          grupoCapasUl.classList.add("show");
        }

        grupoConfig.capas.forEach((capaNombre) => {
          const capaLi = crearElementoCapa(
            capaNombre,
            temaKey,
            temaConfig,
            temasConfig,
            contenedor.id,
            seCargaInicialmente
          );
          grupoCapasUl.appendChild(capaLi);
        });

        grupoLi.appendChild(grupoCapasUl);
        childrenContainer.appendChild(grupoLi);

        grupoSwitch.addEventListener("change", async (e) => {
          const grupoActivo = e.target.checked;

          const capasCheckboxes = grupoCapasUl.querySelectorAll(
            'input.layer-checkbox[type="checkbox"]'
          );

          if (grupoActivo) {
            grupoSwitchLabel.innerHTML = `${grupoConfig.nombre} <small class="text-muted">(Cargando...)</small>`;

            for (const checkbox of capasCheckboxes) {
              const capaNombre = checkbox.value;

              if (!appState.layers.loaded.has(capaNombre)) {
                await cargarCapaIndividual(capaNombre, temaKey, temasConfig);
                // cargarCapaIndividual ya marca la capa como cargada
              }

              mostrarCapa(capaNombre);

              if (!checkbox.checked) {
                checkbox.checked = true;
              }
            }

            grupoSwitchLabel.textContent = grupoConfig.nombre;
          } else {
            capasCheckboxes.forEach((checkbox) => {
              const capaNombre = checkbox.value;
              ocultarCapa(capaNombre);

              if (checkbox.checked) {
                checkbox.checked = false;
              }
            });
          }

          actualizarLeyenda(temaKey, temasConfig);
        });

        grupoCapasUl.addEventListener("change", (e) => {
          if (
            e.target.classList.contains("form-check-input") &&
            !e.target.classList.contains("grupo-switch")
          ) {
            const capasCheckboxes = grupoCapasUl.querySelectorAll(
              'input.layer-checkbox[type="checkbox"]'
            );
            const todasActivas = Array.from(capasCheckboxes).every(
              (cb) => cb.checked
            );
            const todasInactivas = Array.from(capasCheckboxes).every(
              (cb) => !cb.checked
            );

            if (todasActivas) {
              grupoSwitch.checked = true;
            } else if (todasInactivas) {
              grupoSwitch.checked = false;
            }
          }
        });
      });
    } else {
      temaConfig.capas.forEach((capaNombre) => {
        const seCargaInicialmente = isInitialTheme;
        const capaLi = crearElementoCapa(
          capaNombre,
          temaKey,
          temaConfig,
          temasConfig,
          contenedor.id,
          seCargaInicialmente
        );
        childrenContainer.appendChild(capaLi);
      });
    }

    switchInput.addEventListener("change", async (e) => {
      const isActive = e.target.checked;

      if (isActive) {
        // Desactivar dimensión previa si existe
        if (
          appState.ui.activeDimension &&
          appState.ui.activeDimension !== temaKey
        ) {
          const prevSwitch = document.getElementById(
            `${DOM_PREFIXES.DIMENSION_SWITCH}${appState.ui.activeDimension}-${contenedor.id}`
          );
          if (prevSwitch) prevSwitch.checked = false;

          const prevChildrenContainer = document.getElementById(
            `${DOM_PREFIXES.COLLAPSE_DIMENSION}${appState.ui.activeDimension}-${contenedor.id}`
          );
          if (prevChildrenContainer) {
            prevChildrenContainer.classList.remove("dimension-active", "show");
            prevChildrenContainer
              .querySelectorAll('input.layer-checkbox[type="checkbox"]')
              .forEach((cb) => {
                if (cb.checked) {
                  cb.checked = false;
                  cb.dispatchEvent(new Event("change"));
                }
              });
            prevChildrenContainer
              .querySelectorAll('input.grupo-switch[type="checkbox"]')
              .forEach((cb) => {
                cb.checked = false;
              });
          }

          const prevCapas =
            temasConfig[appState.ui.activeDimension]?.capas || [];
          desactivarCapasDeDimension(
            appState.ui.activeDimension,
            prevCapas,
            temasConfig
          );
        }

        appState.ui.activeDimension = temaKey;

        const capasACargar = obtenerTodasLasCapasDeDimension(temaConfig);

        if (capasACargar.length > 0) {
          const originalText = switchLabel.textContent;
          switchLabel.innerHTML = `${originalText} <small class="text-muted">(Cargando...)</small>`;

          await activarCapasDeDimension(temaKey, capasACargar, temasConfig);

          switchLabel.textContent = originalText;
        }

        childrenContainer.classList.add("dimension-active", "show");

        // Sincronizar los checkboxes de UI: capas y grupos
        capasACargar.forEach((capaNombre) => {
          const checkbox = document.getElementById(
            `${DOM_PREFIXES.LAYER_CHECKBOX}${capaNombre}`
          );
          if (checkbox && !checkbox.checked) {
            checkbox.checked = true;
          }
        });

        if (temaConfig.grupos) {
          Object.keys(temaConfig.grupos).forEach((grupoKey) => {
            const grupoSwitch = document.getElementById(
              `${DOM_PREFIXES.GRUPO_SWITCH}${temaKey}-${grupoKey}-${contenedor.id}`
            );
            if (grupoSwitch && !grupoSwitch.checked) {
              grupoSwitch.checked = true;
            }
          });
        }

        actualizarLeyenda(temaKey, temasConfig);
      } else {
        const capas = obtenerTodasLasCapasDeDimension(temaConfig);
        desactivarCapasDeDimension(temaKey, capas, temasConfig);

        if (appState.ui.activeDimension === temaKey) {
          appState.ui.activeDimension = null;
        }

        childrenContainer.classList.remove("dimension-active");

        // Desmarcar todos los checkboxes (capas y grupos)
        childrenContainer
          .querySelectorAll('input.layer-checkbox[type="checkbox"]')
          .forEach((cb) => {
            if (cb.checked) {
              cb.checked = false;
              cb.dispatchEvent(new Event("change"));
            }
          });
        childrenContainer
          .querySelectorAll('input.grupo-switch[type="checkbox"]')
          .forEach((cb) => {
            cb.checked = false;
          });

        const legendContainer = document.getElementById("sidebar-legend");
        if (legendContainer) {
          legendContainer.innerHTML =
            '<p class="text-muted small">No hay capas activas.</p>';
        }
      }
    });

    dimensionGroup.appendChild(header);
    dimensionGroup.appendChild(childrenContainer);
    contenedor.appendChild(dimensionGroup);

    if (isInitialTheme) {
      appState.ui.activeDimension = temaKey;
    }
  });
}

export async function activarCapasDeDimension(temaKey, listaCapas, temasConfig) {
  log.debug(
    `Activando dimensión: ${temaKey}. Cargando ${listaCapas.length} capas.`
  );

  const isMobile = window.innerWidth < 769;
  const CONCURRENCY_LIMIT = isMobile ? 2 : 4;

  const queue = new ConcurrentQueue(CONCURRENCY_LIMIT);

  const capasOrdenadas = [...listaCapas].sort((a, b) => {
    const configA = temasConfig[temaKey]?.estilo?.[a];
    const configB = temasConfig[temaKey]?.estilo?.[b];
    return estimateLayerSize(a, configA) - estimateLayerSize(b, configB);
  });

  const promises = capasOrdenadas.map((capaNombre) => {
    return queue.add(async () => {
      try {
        if (!appState.layers.loaded.has(capaNombre)) {
          await cargarCapaIndividual(capaNombre, temaKey, temasConfig);
          // cargarCapaIndividual ya marca la capa como cargada.
        } else {
          mostrarCapa(capaNombre);
        }
      } catch (error) {
        log.warn(`Error cargando ${capaNombre}:`, error);
      }
    });
  });

  await Promise.all(promises);

  capasOrdenadas.forEach((capaNombre) => {
    if (appState.layers.loaded.has(capaNombre)) {
      syncIndividualCheckboxes(capaNombre, true);
    }
  });

  log.log(`Dimensión ${temaKey} activada completamente.`);
}

export function desactivarCapasDeDimension(temaKey, listaCapas, temasConfig) {
  log.debug(
    `Desactivando dimensión: ${temaKey}. Ocultando ${listaCapas.length} capas.`
  );

  for (const capaNombre of listaCapas) {
    if (appState.layers.byName.has(capaNombre)) {
      ocultarCapa(capaNombre);
    }
  }

  log.log(
    `Dimensión ${temaKey} desactivada. Capas ocultadas y checkboxes desmarcados.`
  );
}

export function actualizarCapasSidebar(activeTemaName, temasConfig) {
  if (!temasConfig) {
    log.error(
      "temasConfig es undefined en actualizarCapasSidebar. No se puede construir el sidebar."
    );
    return;
  }

  const sidebarLayers = document.getElementById("sidebar-layers");
  const sidebarLayersMobile = document.getElementById("sidebar-layers-mobile");

  if (sidebarLayers) {
    agruparCapasPorDimensionEn(sidebarLayers, temasConfig);
  } else {
    log.warn("Contenedor de capas desktop ('sidebar-layers') no encontrado.");
  }

  if (sidebarLayersMobile) {
    agruparCapasPorDimensionEn(sidebarLayersMobile, temasConfig);
  } else {
    log.debug(
      "Contenedor de capas mobile ('sidebar-layers-mobile') no encontrado. Posiblemente no estemos en un breakpoint móvil."
    );
  }

  log.debug("Sidebar de capas actualizada con todas las capas disponibles");
}

export function activarDimension(temaKey) {
  if (appState.ui.activeDimension === temaKey) return;

  const switchDesktop = document.getElementById(
    `${DOM_PREFIXES.DIMENSION_SWITCH}${temaKey}-sidebar-layers`
  );
  if (switchDesktop) {
    if (!switchDesktop.checked) {
      switchDesktop.click();
    }
    return;
  }

  const switchMobile = document.getElementById(
    `${DOM_PREFIXES.DIMENSION_SWITCH}${temaKey}-sidebar-layers-mobile`
  );
  if (switchMobile) {
    if (!switchMobile.checked) {
      switchMobile.click();
    }
  }
}