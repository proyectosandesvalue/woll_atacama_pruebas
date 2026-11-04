import { DOM_PREFIXES } from "../config/constants.js";
import { appState } from "../store/appState.js";
import { actualizarLeyenda } from "../utils/legendUtils.js";
import { obtenerTodasLasCapasDeDimension } from "../utils/configUtils.js";
import { createContextLogger } from "../utils/logger.js";
import { cargarCapaIndividual, mostrarCapa, ocultarCapa, estimateLayerSize, updateChoropleth } from "../utils/layerUtils.js";
import { ConcurrentQueue } from "../utils/concurrentQueue.js";
import { crearElementoCapa, syncIndividualCheckboxes } from "./layerItem.js";
import { loadLayer, clearLayer } from "../utils/stationsMapUtils.js";
import { attachDateSelector, getDate, updateDateSelector } from "../utils/dateSelector.js";

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
    const switchLabel = header.querySelector(".dimension-title");

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
    
    // Escuchamos el clic en todo el header (ignorando el botón de visibilidad)
    header.addEventListener("click", (e) => {
      if (e.target.closest(".group-vis-btn")) return;
      toggleCollapse();
    });

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

        const toggleGrupoCollapse = () => {
          const grupoCapasEl = document.getElementById(grupoCollapseId);
          if (grupoCapasEl) grupoCapasEl.classList.toggle("show");
          const icon = document.getElementById("btn-collapse-grupo-" + grupoKey);
          if (icon) icon.classList.toggle("collapsed-icon-rotated");
        };
        
        // Escuchamos el clic en todo el grupoHeader (ignorando el botón de visibilidad)
        grupoHeader.addEventListener("click", (e) => {
          if (e.target.closest(".group-vis-btn")) return;
          toggleGrupoCollapse();
        });

        grupoLi.appendChild(grupoHeader);

        const grupoCapasUl = document.createElement("ul");
        grupoCapasUl.id = grupoCollapseId;
        grupoCapasUl.classList.add("collapse", "grupo-capas-list", "list-unstyled", "ps-3");

        if (seCargaInicialmente) {
          grupoCapasUl.classList.add("show");
        }

        // Helper: renderiza un array de capas dentro de un <ul>
        const renderCapas = (capasArray, containerUl) => {
          capasArray.forEach((capaNombre) => {
            const capaLi = crearElementoCapa(
              capaNombre, temaKey, temaConfig, temasConfig, contenedor.id, seCargaInicialmente
            );
            const capaConfig = temaConfig.estilo?.[capaNombre];
            
            if (capaConfig?.variable) {
              attachStationLayer(capaLi, capaConfig, capaNombre);
            } else if (capaConfig?.indicatorId) {
              attachChoroplethSelector(capaLi, capaConfig, capaNombre, temaKey, temasConfig);
            }
            
            containerUl.appendChild(capaLi);
          });
        };

        // Si el grupo tiene subgrupos, los renderizamos anidados
        if (grupoConfig.subgrupos) {
          Object.entries(grupoConfig.subgrupos).forEach(([subKey, subConfig]) => {
            const subLi = document.createElement("li");
            subLi.classList.add("subgrupo-tematico", "mb-1");
            subLi.setAttribute("data-subgrupo-key", subKey);

            const subCollapseId = `${grupoCollapseId}-sub-${subKey}`;

            const subHeader = document.createElement("div");
            subHeader.classList.add("subgrupo-header", "mb-1");
            // Forzamos los estilos inline para evitar saltos de línea
            subHeader.style.display = "flex";
            subHeader.style.alignItems = "center";
            subHeader.style.justifyContent = "space-between";
            subHeader.style.flexWrap = "nowrap";
            subHeader.style.width = "100%";
            subHeader.style.padding = "4px 0";
            subHeader.style.cursor = "pointer";

            subHeader.innerHTML = `
              <div class="dimension-title-container" style="flex: 1; min-width: 0; padding-left: 4px; display: flex; align-items: center;">
                <span class="subgrupo-nombre" style="font-size: 13px; font-weight: 600; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${subConfig.nombre}
                </span>
              </div>
              <button class="btn-collapse-toggle-subgrupo" type="button" aria-expanded="false" style="flex-shrink: 0; background: transparent; border: none; padding: 0; cursor: pointer; color: var(--text-tertiary); display: flex; align-items: center;">
                <span id="btn-collapse-sub-${grupoKey}-${subKey}" class="material-symbols-outlined collapsed-icon-rotated" style="font-size: 18px; margin: 0;">expand_more</span>
              </button>
            `;

            const subCapasUl = document.createElement("ul");
            subCapasUl.id = subCollapseId;
            subCapasUl.classList.add("collapse", "subgrupo-capas-list", "list-unstyled", "ps-4");

            const toggleSubCollapse = () => {
              subCapasUl.classList.toggle("show");
              const icon = document.getElementById(`btn-collapse-sub-${grupoKey}-${subKey}`);
              if (icon) icon.classList.toggle("collapsed-icon-rotated");
            };
            
            // Asignamos el evento a TODO el subHeader, sin buscar botones internos
            subHeader.addEventListener("click", toggleSubCollapse);

            subLi.appendChild(subHeader);
            subLi.appendChild(subCapasUl);
            grupoCapasUl.appendChild(subLi);

            renderCapas(subConfig.capas, subCapasUl);
          });
        } else if (grupoConfig.capas) {
          renderCapas(grupoConfig.capas, grupoCapasUl);
        }

        grupoLi.appendChild(grupoCapasUl);
        childrenContainer.appendChild(grupoLi);

        grupoSwitch.addEventListener("change", async (e) => {
          const grupoActivo = e.target.checked;
          const capasCheckboxes = grupoCapasUl.querySelectorAll('input.layer-checkbox[type="checkbox"]');

          if (grupoActivo) {
            grupoSwitchLabel.innerHTML = `${grupoConfig.nombre} <small class="text-muted">(Cargando...)</small>`;

            for (const checkbox of capasCheckboxes) {
              const capaNombre = checkbox.value;
              const capaConfig = temaConfig.estilo?.[capaNombre];

              if (!capaConfig?.variable && capaNombre !== 'estaciones_historicas_atacama' && !appState.layers.loaded.has(capaNombre)) {
              await cargarCapaIndividual(capaNombre, temaKey, temasConfig);
            }
            if (!capaConfig?.variable && capaNombre !== 'estaciones_historicas_atacama') {
              mostrarCapa(capaNombre);
            }

              if (!checkbox.checked) checkbox.checked = true;
            }

            grupoSwitchLabel.textContent = grupoConfig.nombre;
          } else {
            capasCheckboxes.forEach((checkbox) => {
              const capaNombre = checkbox.value;
              ocultarCapa(capaNombre);
              if (checkbox.checked) checkbox.checked = false;
            });
          }

          actualizarLeyenda(temaKey, temasConfig);
        });

        grupoCapasUl.addEventListener("change", (e) => {
          if (e.target.classList.contains("form-check-input") && !e.target.classList.contains("grupo-switch")) {
            const capasCheckboxes = grupoCapasUl.querySelectorAll('input.layer-checkbox[type="checkbox"]');
            const todasActivas = Array.from(capasCheckboxes).every((cb) => cb.checked);
            const todasInactivas = Array.from(capasCheckboxes).every((cb) => !cb.checked);

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
          capaNombre, temaKey, temaConfig, temasConfig, contenedor.id, seCargaInicialmente
        );
        const capaConfig = temaConfig.estilo?.[capaNombre];
        
        if (capaConfig?.variable) {
          attachStationLayer(capaLi, capaConfig, capaNombre);
        } else if (capaConfig?.indicatorId) {
          attachChoroplethSelector(capaLi, capaConfig, capaNombre, temaKey, temasConfig);
        }
        
        childrenContainer.appendChild(capaLi);
      });
    }

    switchInput.addEventListener("change", async (e) => {
      const isActive = e.target.checked;

      if (isActive) {
        if (appState.ui.activeDimension && appState.ui.activeDimension !== temaKey) {
          const prevSwitch = document.getElementById(`${DOM_PREFIXES.DIMENSION_SWITCH}${appState.ui.activeDimension}-${contenedor.id}`);
          if (prevSwitch) prevSwitch.checked = false;

          const prevChildrenContainer = document.getElementById(`${DOM_PREFIXES.COLLAPSE_DIMENSION}${appState.ui.activeDimension}-${contenedor.id}`);
          if (prevChildrenContainer) {
            prevChildrenContainer.classList.remove("dimension-active", "show");
            prevChildrenContainer.querySelectorAll('input.layer-checkbox[type="checkbox"]').forEach((cb) => {
              if (cb.checked) {
                cb.checked = false;
                cb.dispatchEvent(new Event("change"));
              }
            });
            prevChildrenContainer.querySelectorAll('input.grupo-switch[type="checkbox"]').forEach((cb) => {
              cb.checked = false;
            });
          }

          const prevCapas = temasConfig[appState.ui.activeDimension]?.capas || [];
          desactivarCapasDeDimension(appState.ui.activeDimension, prevCapas, temasConfig);
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

        capasACargar.forEach((capaNombre) => {
          const checkbox = document.getElementById(`${DOM_PREFIXES.LAYER_CHECKBOX}${capaNombre}`);
          if (checkbox && !checkbox.checked) checkbox.checked = true;
        });

        if (temaConfig.grupos) {
          Object.keys(temaConfig.grupos).forEach((grupoKey) => {
            const grupoSwitch = document.getElementById(`${DOM_PREFIXES.GRUPO_SWITCH}${temaKey}-${grupoKey}-${contenedor.id}`);
            if (grupoSwitch && !grupoSwitch.checked) grupoSwitch.checked = true;
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

        childrenContainer.querySelectorAll('input.layer-checkbox[type="checkbox"]').forEach((cb) => {
          if (cb.checked) {
            cb.checked = false;
            cb.dispatchEvent(new Event("change"));
          }
        });
        childrenContainer.querySelectorAll('input.grupo-switch[type="checkbox"]').forEach((cb) => {
          cb.checked = false;
        });

        const legendContainer = document.getElementById("sidebar-legend");
        if (legendContainer) {
          legendContainer.innerHTML = '<p class="text-muted small">No hay capas activas.</p>';
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
  log.debug(`Activando dimensión: ${temaKey}. Cargando ${listaCapas.length} capas.`);

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
      const capaConfig = temasConfig[temaKey]?.estilo?.[capaNombre];
      
      // Ignorar carga estática si es dinámica o histórica
      if (capaConfig?.variable || capaNombre === 'estaciones_historicas_atacama') return;

      try {
        if (!appState.layers.loaded.has(capaNombre)) {
          await cargarCapaIndividual(capaNombre, temaKey, temasConfig);
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
  log.debug(`Desactivando dimensión: ${temaKey}. Ocultando ${listaCapas.length} capas.`);

  for (const capaNombre of listaCapas) {
    if (appState.layers.byName.has(capaNombre)) {
      ocultarCapa(capaNombre);
    }
  }

  log.log(`Dimensión ${temaKey} desactivada. Capas ocultadas y checkboxes desmarcados.`);
}

export function actualizarCapasSidebar(activeTemaName, temasConfig) {
  if (!temasConfig) {
    log.error("temasConfig es undefined en actualizarCapasSidebar. No se puede construir el sidebar.");
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
    log.debug("Contenedor de capas mobile ('sidebar-layers-mobile') no encontrado. Posiblemente no estemos en un breakpoint móvil.");
  }

  log.debug("Sidebar de capas actualizada con todas las capas disponibles");
}

export function activarDimension(temaKey) {
  if (appState.ui.activeDimension === temaKey) return;

  const switchDesktop = document.getElementById(`${DOM_PREFIXES.DIMENSION_SWITCH}${temaKey}-sidebar-layers`);
  if (switchDesktop) {
    if (!switchDesktop.checked) switchDesktop.click();
    return;
  }

  const switchMobile = document.getElementById(`${DOM_PREFIXES.DIMENSION_SWITCH}${temaKey}-sidebar-layers-mobile`);
  if (switchMobile) {
    if (!switchMobile.checked) switchMobile.click();
  }
}

function attachStationLayer(capaLi, capaConfig, layerId) {
  const originalCheckbox = capaLi.querySelector('input.layer-checkbox[type="checkbox"]');
  if (!originalCheckbox) return;

  const newCheckbox = originalCheckbox.cloneNode(true);
  originalCheckbox.parentNode.replaceChild(newCheckbox, originalCheckbox);

  const { variable: baseVariable, estado, isHistorical, selectorVariables } = capaConfig;
  let currentVariable = baseVariable || (selectorVariables ? selectorVariables.default : null);

  let wrapper = null;

  if (selectorVariables) {
    wrapper = document.createElement("div");
    wrapper.className = "layer-variable-selector";

    const label = document.createElement("label");
    label.textContent = "Variable: ";
    const select = document.createElement("select");
    select.className = "layer-variable-select";

    selectorVariables.opciones.forEach((op) => {
      const opt = document.createElement("option");
      opt.value = op.valor;
      opt.textContent = op.label;
      select.appendChild(opt);
    });
    select.value = currentVariable;

    label.appendChild(select);
    wrapper.appendChild(label);
    capaLi.appendChild(wrapper);

    select.addEventListener("change", () => {
      currentVariable = select.value;
      if (newCheckbox.checked) {
        const date = isHistorical ? getDate(layerId) : null;
        loadLayer(layerId, currentVariable, appState.map, { date, estado });
        if (isHistorical) updateDateSelector(wrapper, currentVariable, layerId);
      }
    });
  }

  // Date picker
  if (isHistorical) {
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.className = "layer-variable-selector";
      capaLi.appendChild(wrapper);
    }
    attachDateSelector(wrapper, appState.map, layerId, (newDate) => {
      if (newCheckbox.checked) {
        loadLayer(layerId, currentVariable, appState.map, { date: newDate, estado });
      }
    });
    updateDateSelector(wrapper, currentVariable, layerId);
  }

  newCheckbox.addEventListener("change", () => {
    if (newCheckbox.checked) {
      if (wrapper) wrapper.style.display = "";
      const date = isHistorical ? getDate(layerId) : null;
      loadLayer(layerId, currentVariable, appState.map, { date, estado });
    } else {
      if (wrapper) wrapper.style.display = "none";
      clearLayer(layerId, appState.map);
    }
  });

  if (newCheckbox.checked) {
    if (wrapper) wrapper.style.display = "";
    const date = isHistorical ? getDate(layerId) : null;
    loadLayer(layerId, currentVariable, appState.map, { date, estado });
  }
}

function attachChoroplethSelector(capaLi, capaConfig, layerId, temaKey, temasConfig) {
  const state = {
    season: capaConfig.defaultSeason || "annual",
    scenarioKey: capaConfig.defaultScenario || "future$ssp245",
  };

  const applyChoropleth = () => {
    const field = `$CLIMA$${capaConfig.indicatorId}$${state.season}$${state.scenarioKey}`;
    const isDelta = state.scenarioKey.startsWith("delta");
    const scale = capaConfig.scales[isDelta ? "delta" : "absolute"];
    
    updateChoropleth(layerId, field, scale, capaConfig);
    
    if (capaConfig.coloresByType) {
      capaConfig.colores = capaConfig.coloresByType[isDelta ? "delta" : "absolute"];
      if (temasConfig) actualizarLeyenda(temaKey, temasConfig);
    }
  };

  const wrapper = document.createElement("div");
  wrapper.className = "layer-variable-selector";
  wrapper.style.padding = "4px 8px 8px 24px";

  // Dropdown 1: Escenario
  const scenarioLabel = document.createElement("label");
  scenarioLabel.textContent = "Escenario: ";
  scenarioLabel.style.fontSize = "12px";
  scenarioLabel.style.color = "var(--text-secondary)";
  
  const scenarioSelect = document.createElement("select");
  scenarioSelect.className = "layer-variable-select";
  scenarioSelect.style.marginLeft = "4px";
  scenarioSelect.style.width = "calc(100% - 80px)";
  scenarioSelect.style.marginBottom = "6px";
  
  capaConfig.scenarioOptions.forEach((op) => {
    const opt = document.createElement("option");
    opt.value = op.key;
    opt.textContent = op.label;
    scenarioSelect.appendChild(opt);
  });
  scenarioSelect.value = state.scenarioKey;
  
  scenarioLabel.appendChild(scenarioSelect);
  wrapper.appendChild(scenarioLabel);

  // Dropdown 2: Temporada (solo si hay más de 1 opción)
  let seasonSelect = null;
  if (capaConfig.seasonOptions && capaConfig.seasonOptions.length > 1) {
    const seasonLabel = document.createElement("label");
    seasonLabel.textContent = "Temporada: ";
    seasonLabel.style.fontSize = "12px";
    seasonLabel.style.color = "var(--text-secondary)";
    seasonLabel.style.display = "block";
    
    seasonSelect = document.createElement("select");
    seasonSelect.className = "layer-variable-select";
    seasonSelect.style.marginLeft = "4px";
    seasonSelect.style.width = "calc(100% - 80px)";
    
    capaConfig.seasonOptions.forEach((op) => {
      const opt = document.createElement("option");
      opt.value = op.value;
      opt.textContent = op.label;
      seasonSelect.appendChild(opt);
    });
    seasonSelect.value = state.season;
    
    seasonLabel.appendChild(seasonSelect);
    wrapper.appendChild(seasonLabel);
  }

  capaLi.appendChild(wrapper);

  scenarioSelect.addEventListener("change", () => {
    state.scenarioKey = scenarioSelect.value;
    applyChoropleth();
  });

  if (seasonSelect) {
    seasonSelect.addEventListener("change", () => {
      state.season = seasonSelect.value;
      applyChoropleth();
    });
  }

  applyChoropleth();
}