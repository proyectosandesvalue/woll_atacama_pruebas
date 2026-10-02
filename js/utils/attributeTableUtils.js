/**
 * Utilidades para el panel de tabla de atributos
 * @module utils/attributeTableUtils
 */

import {
  appState,
  markLayerAsLoaded,
  getLayerData,
  setDataFilter,
  getDataFilter,
  clearDataFilter,
  hasDataFilter,
} from "../store/appState.js";
import { cargarCapaIndividual, mostrarCapa, updateLayerFilter } from "./layerUtils.js";
import { createContextLogger } from "./logger.js";
import { escapeHtml } from "./helpers.js";
import {
  encontrarTemaParaCapa,
  obtenerNombrePersonalizado,
  getCapaConfig,
} from "./configUtils.js";

const log = createContextLogger("AttributeTable");

const panel = document.getElementById("attribute-table-panel");
const closeBtn = document.getElementById("closeAttributeTableBtn");
const fullscreenBtn = document.getElementById("fullscreenAttributeTableBtn");
const fullscreenIcon = document.getElementById("fullscreenAttributeTableIcon");
const panelResizer = document.getElementById("attribute-table-resizer");
const titleEl = document.getElementById("attribute-table-title");
const countEl = document.getElementById("attribute-table-count");
const loadingEl = document.getElementById("attribute-table-loading");
const headEl = document.getElementById("attribute-table-head");
const bodyEl = document.getElementById("attribute-table-body-content");
const sidebarRight = document.getElementById("sidebarRight");

let isInitialized = false;
let isFullscreen = false;
let highlightLayer = null;
let sidebarRightWasVisible = false;
let currentFeatures = [];
let currentCapaNombre = null;
let currentTemasConfig = null;
let searchActive = false;
let searchQuery = "";
let searchField = null;
let preSearchFeatures = [];
let columnasBusqueda = [];

const normalizedKeysCache = new Map();
const uniqueValuesCache = new Map();

const normalizeKey = (s) => {
  if (normalizedKeysCache.has(s)) {
    return normalizedKeysCache.get(s);
  }
  const result = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, " ")
    .trim();
  normalizedKeysCache.set(s, result);
  return result;
};

// Delegación de eventos para la tabla de atributos
bodyEl.addEventListener("click", (e) => {
  const tr = e.target.closest("tr");
  if (!tr || !tr.dataset.featureIndex) return;

  const allRows = bodyEl.querySelectorAll("tr");
  allRows.forEach((row) => row.classList.remove("row-active"));
  tr.classList.add("row-active");

  const index = parseInt(tr.dataset.featureIndex, 10);
  const feature = currentFeatures[index];

  if (!feature) return;

  if (window.turf && appState.map) {
    try {
      const bbox = turf.bbox(feature);
      const bounds = [
        [bbox[1], bbox[0]],
        [bbox[3], bbox[2]],
      ];
      appState.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });

      if (highlightLayer) {
        appState.map.removeLayer(highlightLayer);
      }

      highlightLayer = L.geoJSON(feature, {
        pointToLayer: function (f, latlng) {
          return L.circleMarker(latlng, {
            radius: 12,
            fillColor: "#ffeb3b",
            color: "#000000",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9,
          });
        },
        style: function () {
          return {
            color: "#00e5ff",
            weight: 6,
            opacity: 1,
            fillColor: "#00e5ff",
            fillOpacity: 0.4,
          };
        },
      }).addTo(appState.map);
    } catch (err) {
      log.error("Error calculando bbox con Turf:", err);
    }
  }
});

function initAttributeTable() {
  if (isInitialized) return;
  if (closeBtn) {
    closeBtn.addEventListener("click", closeAttributeTable);
  }
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener("click", toggleFullscreen);
  }
  if (panelResizer) {
    initPanelResize();
  }
  const filterBtn = document.getElementById("filterAttributeTableBtn");
  if (filterBtn) {
    filterBtn.addEventListener("click", () => {
      if (currentCapaNombre && currentTemasConfig) {
        openFilterModal(currentCapaNombre, currentTemasConfig);
      }
    });
  }
  const searchBtn = document.getElementById("searchAttributeTableBtn");
  if (searchBtn) {
    searchBtn.addEventListener("click", toggleSearchBar);
  }
  isInitialized = true;
}

function toggleFullscreen() {
  isFullscreen = !isFullscreen;
  if (isFullscreen) {
    panel.classList.add("fullscreen");
    if (fullscreenIcon) fullscreenIcon.textContent = "close_fullscreen";
  } else {
    panel.classList.remove("fullscreen");
    if (fullscreenIcon) fullscreenIcon.textContent = "open_in_full";
  }
}

function toggleSearchBar() {
  searchActive = !searchActive;
  const btn = document.getElementById("searchAttributeTableBtn");
  if (btn) {
    btn.style.color = searchActive ? "var(--accent-primary)" : "";
  }
  if (!searchActive && searchQuery) {
    clearSearch();
  }
  renderSearchBar();
}

function renderSearchBar() {
  const existingBar = document.getElementById("attribute-table-search-bar");
  if (existingBar) existingBar.remove();

  if (!searchActive) return;

  const bar = document.createElement("div");
  bar.id = "attribute-table-search-bar";
  bar.className = "attribute-table-search-bar active";

  const select = document.createElement("select");
  select.className = "search-field-select";
  select.innerHTML = '<option value="">Todos los campos</option>';
  columnasBusqueda.forEach((col) => {
    const option = document.createElement("option");
    option.value = col.key;
    option.textContent = col.label;
    select.appendChild(option);
  });
  if (searchField !== null) select.value = searchField;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "search-input";
  input.placeholder = "Buscar en la tabla...";
  input.value = searchQuery;

  const clearBtn = document.createElement("button");
  clearBtn.className = "search-clear-btn";
  clearBtn.title = "Limpiar búsqueda";
  clearBtn.innerHTML =
    '<span class="material-symbols-outlined" style="font-size:18px;">close</span>';

  bar.appendChild(select);
  bar.appendChild(input);
  bar.appendChild(clearBtn);

  const header = panel.querySelector(".attribute-table-header");
  if (header) header.after(bar);

  select.addEventListener("change", (e) => {
    searchField = e.target.value || null;
    performSearch();
  });

  let debounceTimer;
  input.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(performSearch, 300);
  });

  clearBtn.addEventListener("click", () => {
    clearSearch();
  });

  input.focus();
}

function performSearch() {
  if (!searchQuery.trim()) {
    if (preSearchFeatures.length > 0) {
      currentFeatures = preSearchFeatures;
      preSearchFeatures = [];
    }
    renderSearchResults();
    return;
  }

  const query = searchQuery.toLowerCase().trim();
  const filtered = currentFeatures.filter((feature) => {
    const propKeys = feature.properties ? Object.keys(feature.properties) : [];
    const normalizedMap = new Map(propKeys.map((k) => [normalizeKey(k), k]));

    if (searchField !== null) {
      const originalKey = normalizedMap.get(normalizeKey(searchField));
      const val =
        originalKey !== undefined ? feature.properties[originalKey] : undefined;
      if (val !== undefined && val !== null) {
        return String(val).toLowerCase().includes(query);
      }
      return false;
    }
    for (const col of columnasBusqueda) {
      const origKey = normalizedMap.get(normalizeKey(col.key));
      const val = origKey !== undefined ? feature.properties[origKey] : undefined;
      if (val !== undefined && val !== null) {
        if (String(val).toLowerCase().includes(query)) return true;
      }
    }
    return false;
  });

  if (preSearchFeatures.length === 0) {
    preSearchFeatures = [...currentFeatures];
  }
  currentFeatures = filtered;
  renderSearchResults();
}

function clearSearch() {
  searchQuery = "";
  searchField = null;
  if (preSearchFeatures.length > 0) {
    currentFeatures = preSearchFeatures;
    preSearchFeatures = [];
  }
  const input = document.querySelector(".search-input");
  const select = document.querySelector(".search-field-select");
  if (input) input.value = "";
  if (select) select.value = "";
  renderSearchResults();

  searchActive = false;
  const existingBar = document.getElementById("attribute-table-search-bar");
  if (existingBar) existingBar.remove();
  const searchBtn = document.getElementById("searchAttributeTableBtn");
  if (searchBtn) searchBtn.style.color = "";
}

function renderSearchResults() {
  const totalFeatures = currentFeatures.length;
  countEl.textContent = `${totalFeatures} registros`;

  if (totalFeatures === 0) {
    bodyEl.innerHTML =
      '<tr><td colspan="100%" style="text-align: center; padding: 16px;">Sin resultados para la búsqueda</td></tr>';
    return;
  }

  const fragmentBody = document.createDocumentFragment();
  currentFeatures.forEach((feature, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.featureIndex = idx;
    const propKeys = feature.properties ? Object.keys(feature.properties) : [];
    const normalizedMap = new Map(propKeys.map((k) => [normalizeKey(k), k]));

    columnasBusqueda.forEach((col) => {
      const td = document.createElement("td");
      let val = feature.properties?.[col.key];
      if (val === undefined) {
        const origKey = normalizedMap.get(normalizeKey(col.key));
        if (origKey !== undefined) val = feature.properties[origKey];
      }
      td.textContent = val === null || val === undefined ? "-" : String(val);
      tr.appendChild(td);
    });
    fragmentBody.appendChild(tr);
  });

  bodyEl.innerHTML = "";
  bodyEl.appendChild(fragmentBody);
}

function initPanelResize() {
  let startY, startHeight;

  panelResizer.addEventListener("mousedown", (e) => {
    if (isFullscreen) return;

    startY = e.clientY;
    startHeight = panel.offsetHeight;
    panelResizer.classList.add("resizing");
    document.body.style.userSelect = "none";

    const onMouseMove = (e) => {
      const newHeight = startHeight - (e.clientY - startY);
      const maxHeight = window.innerHeight * 0.9;
      const minHeight = 150;
      if (newHeight >= minHeight && newHeight <= maxHeight) {
        panel.style.height = `${newHeight}px`;
      }
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      panelResizer.classList.remove("resizing");
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
}

export async function openAttributeTable(capaNombre, temasConfig) {
  initAttributeTable();

  currentCapaNombre = capaNombre;
  currentTemasConfig = temasConfig;

  searchActive = false;
  searchQuery = "";
  searchField = null;
  preSearchFeatures = [];
  columnasBusqueda = [];

  const existingBar = document.getElementById("attribute-table-search-bar");
  if (existingBar) existingBar.remove();
  const searchBtn = document.getElementById("searchAttributeTableBtn");
  if (searchBtn) searchBtn.style.color = "";

  // 1. Obtener configuración
  const temaKey = encontrarTemaParaCapa(capaNombre, temasConfig);
  const configCapa = getCapaConfig(capaNombre, temaKey, temasConfig);
  const aliasConfig = configCapa?.alias || null;
  const nombreVisual =
    obtenerNombrePersonalizado(capaNombre, temaKey, temasConfig) || capaNombre;

  titleEl.textContent = nombreVisual;
  countEl.textContent = "...";
  headEl.innerHTML = "";
  bodyEl.innerHTML = "";

  // Limpiar highlight anterior si existiera
  if (highlightLayer && appState.map) {
    appState.map.removeLayer(highlightLayer);
    highlightLayer = null;
  }

  // Guardar estado del sidebar derecho SOLO si la tabla no estaba abierta.
  // (Evita que en la segunda apertura se sobrescriba con "collapsed" y
  //  no se restaure al cerrar.)
  const tableWasOpen = panel.classList.contains("show");
  if (!tableWasOpen && sidebarRight) {
    sidebarRightWasVisible = !sidebarRight.classList.contains("collapsed");
  }
  if (sidebarRight) {
    sidebarRight.classList.add("collapsed");
  }

  // Reiniciar layout automático para calcular el ancho en base al contenido
  const table = document.getElementById("attribute-table");
  if (table) table.style.tableLayout = "auto";

  if (loadingEl) loadingEl.style.display = "flex";
  if (panel) panel.classList.add("show");

  try {
    let geojson = getLayerData(capaNombre);

    if (!geojson) {
      log.log(
        `Datos para ${capaNombre} no encontrados en caché. Descargando en segundo plano...`
      );

      const checkbox = document.querySelector(
        `.layer-checkbox[data-capa="${capaNombre}"]`
      );
      if (checkbox && !checkbox.checked) {
        checkbox.checked = true;
        const listItem = checkbox.closest(".layer-item-container");
        if (listItem) {
          listItem.classList.add("layer-active");
          const nameLabel = listItem.querySelector(".layer-item-name");
          if (nameLabel) {
            nameLabel.dataset.original = nameLabel.innerHTML;
            nameLabel.innerHTML = `${nameLabel.innerHTML} <span class="loading-indicator">...</span>`;
          }
        }
      }

      await cargarCapaIndividual(capaNombre, temaKey, temasConfig);
      markLayerAsLoaded(capaNombre);
      mostrarCapa(capaNombre);

      if (checkbox) {
        const listItem = checkbox.closest(".layer-item-container");
        if (listItem) {
          const nameLabel = listItem.querySelector(".layer-item-name");
          if (nameLabel && nameLabel.dataset.original) {
            nameLabel.innerHTML = nameLabel.dataset.original;
          }
        }
      }

      geojson = getLayerData(capaNombre);
    }

    if (!geojson || !geojson.features) {
      throw new Error("No se encontraron atributos vectoriales para esta capa.");
    }

    // 3. Procesar datos y aplicar filtros si existen
    let allFeatures = geojson.features;
    const dataFilter = getDataFilter(capaNombre);
    if (dataFilter && dataFilter.size > 0) {
      allFeatures = allFeatures.filter((feature) => {
        for (const [attr, allowedValues] of dataFilter.entries()) {
          const featureVal = feature.properties?.[attr];
          if (featureVal === undefined || featureVal === null) return false;
          if (!allowedValues.has(String(featureVal))) return false;
        }
        return true;
      });
    }

    currentFeatures = allFeatures;
    const totalFeatures = currentFeatures.length;

    countEl.textContent = `${totalFeatures} registros`;

    // Si no hay alias, usar todas las propiedades del primer feature
    let columnasAMostrar = [];
    let nombresColumnas = [];

    if (aliasConfig && Object.keys(aliasConfig).length > 0) {
      if (configCapa?.popupCampos && Array.isArray(configCapa.popupCampos)) {
        columnasAMostrar = configCapa.popupCampos;
        nombresColumnas = configCapa.popupCampos.map(
          (key) => aliasConfig[key] || key
        );
      } else {
        columnasAMostrar = Object.keys(aliasConfig);
        nombresColumnas = Object.values(aliasConfig);
      }
    } else {
      if (currentFeatures.length > 0 && currentFeatures[0].properties) {
        columnasAMostrar = Object.keys(currentFeatures[0].properties);
        nombresColumnas = [...columnasAMostrar];
      }
    }

    if (columnasAMostrar.length === 0) {
      bodyEl.innerHTML =
        '<tr><td colspan="100%" style="text-align: center; padding: 16px;">No hay atributos para mostrar</td></tr>';
      return;
    }

    columnasBusqueda = columnasAMostrar.map((key, i) => ({
      key,
      label: nombresColumnas[i] || key,
    }));

    if (searchActive) {
      renderSearchBar();
    }

    // Construir cabeceras con handles de redimensionamiento
    const trHead = document.createElement("tr");
    nombresColumnas.forEach((nombre) => {
      const th = document.createElement("th");
      th.textContent = nombre;

      const resizer = document.createElement("div");
      resizer.classList.add("col-resizer");
      th.appendChild(resizer);

      let startX, startWidth;
      resizer.addEventListener("mousedown", (e) => {
        const tableEl = document.getElementById("attribute-table");

        if (tableEl.style.tableLayout !== "fixed") {
          const allThs = headEl.querySelectorAll("th");
          allThs.forEach((t) => {
            const w = t.offsetWidth;
            t.style.width = `${w}px`;
            t.style.minWidth = `${w}px`;
            t.style.maxWidth = `${w}px`;
          });
          tableEl.style.tableLayout = "fixed";
        }

        startX = e.pageX;
        startWidth = th.offsetWidth;
        resizer.classList.add("resizing");
        document.body.style.userSelect = "none";

        const onMouseMove = (e) => {
          const newWidth = startWidth + (e.pageX - startX);
          if (newWidth > 50) {
            th.style.width = `${newWidth}px`;
            th.style.minWidth = `${newWidth}px`;
            th.style.maxWidth = `${newWidth}px`;
          }
        };

        const onMouseUp = () => {
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
          resizer.classList.remove("resizing");
          document.body.style.userSelect = "";
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        e.stopPropagation();
        e.preventDefault();
      });

      trHead.appendChild(th);
    });
    headEl.appendChild(trHead);

    // Renderizado por lotes (Infinite Scroll)
    let currentChunkIndex = 0;
    const CHUNK_SIZE = 50;

    const renderChunk = () => {
      const fragment = document.createDocumentFragment();
      const start = currentChunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalFeatures);
      const chunk = currentFeatures.slice(start, end);

      chunk.forEach((feature, i) => {
        const tr = document.createElement("tr");

        const propKeys = feature.properties
          ? Object.keys(feature.properties)
          : [];
        const normalizedMap = new Map(
          propKeys.map((k) => [normalizeKey(k), k])
        );
        const featureIndex = start + i;
        tr.dataset.featureIndex = featureIndex;

        columnasAMostrar.forEach((col) => {
          const td = document.createElement("td");
          let val = feature.properties?.[col];
          if (val === undefined) {
            const origKey = normalizedMap.get(normalizeKey(col));
            if (origKey !== undefined) val = feature.properties[origKey];
          }
          if (val === null || val === undefined) {
            td.textContent = "-";
          } else {
            td.textContent = String(val);
          }
          tr.appendChild(td);
        });
        fragment.appendChild(tr);
      });

      bodyEl.appendChild(fragment);

      // Setup observer for next chunk (uno por chunk, se auto-desconecta)
      if (end < totalFeatures) {
        const sentinel = document.createElement("tr");
        sentinel.innerHTML = `<td colspan="${columnasAMostrar.length}" style="text-align:center; padding: 10px;"><span class="loading-indicator">...</span></td>`;
        bodyEl.appendChild(sentinel);

        const observer = new IntersectionObserver((entries, obs) => {
          if (entries[0].isIntersecting) {
            obs.disconnect();
            bodyEl.removeChild(sentinel);
            currentChunkIndex++;
            renderChunk();
          }
        });
        observer.observe(sentinel);
      }
    };

    renderChunk();
  } catch (err) {
    log.error(`Error al cargar datos para la tabla: ${err.message}`);
    bodyEl.innerHTML = `<tr><td colspan="100%" style="text-align: center; color: var(--color-danger); padding: 16px;">Error: ${escapeHtml(err.message)}</td></tr>`;
    countEl.textContent = "Error";
  } finally {
    if (loadingEl) loadingEl.style.display = "none";
  }
}

export function closeAttributeTable() {
  if (panel) panel.classList.remove("show");

  if (sidebarRight && sidebarRightWasVisible) {
    sidebarRight.classList.remove("collapsed");
  }
  sidebarRightWasVisible = false;

  if (highlightLayer && appState.map) {
    appState.map.removeLayer(highlightLayer);
    highlightLayer = null;
  }

  searchActive = false;
  searchQuery = "";
  searchField = null;
  preSearchFeatures = [];
  columnasBusqueda = [];
  currentFeatures = [];
  currentCapaNombre = null;
  currentTemasConfig = null;

  const existingBar = document.getElementById("attribute-table-search-bar");
  if (existingBar) existingBar.remove();
  const searchBtn = document.getElementById("searchAttributeTableBtn");
  if (searchBtn) searchBtn.style.color = "";

  isFullscreen = false;
  if (fullscreenIcon) fullscreenIcon.textContent = "open_in_full";
}

/* ════════════════════════════════════════════════════════════
   MODAL DE FILTRADO DE CAPAS
   ════════════════════════════════════════════════════════════ */
const filterModal = document.getElementById("filterModal");
const filterModalClose = document.getElementById("filterModalClose");
const filterModalLayerName = document.getElementById("filterModalLayerName");
const filterAttributeSelect = document.getElementById("filterAttributeSelect");
const filterValuesContainer = document.getElementById("filterValuesContainer");
const filterValuesList = document.getElementById("filterValuesList");
const filterSelectAllBtn = document.getElementById("filterSelectAll");
const filterDeselectAllBtn = document.getElementById("filterDeselectAll");
const filterActiveFilters = document.getElementById("filterActiveFilters");
const filterActiveList = document.getElementById("filterActiveList");
const filterClearAllBtn = document.getElementById("filterClearAllBtn");
const filterApplyBtn = document.getElementById("filterApplyBtn");

let filterModalCapa = null;
let filterModalTemasConfig = null;
let filterModalGeojson = null;
let filterModalSelectedValues = new Map();
let filterModalCurrentAttribute = null;

function initFilterModal() {
  if (filterModalClose) {
    filterModalClose.addEventListener("click", closeFilterModal);
  }
  if (filterClearAllBtn) {
    filterClearAllBtn.addEventListener("click", clearAllFiltersAction);
  }
  if (filterApplyBtn) {
    filterApplyBtn.addEventListener("click", applyFiltersAction);
  }
  if (filterSelectAllBtn) {
    filterSelectAllBtn.addEventListener("click", selectAllValues);
  }
  if (filterDeselectAllBtn) {
    filterDeselectAllBtn.addEventListener("click", deselectAllValues);
  }
  if (filterAttributeSelect) {
    filterAttributeSelect.addEventListener("change", onAttributeChange);
  }
}

function closeFilterModal() {
  if (filterModal) filterModal.close();
  resetFilterModalState();
}

function resetFilterModalState() {
  filterModalCapa = null;
  filterModalTemasConfig = null;
  filterModalGeojson = null;
  filterModalSelectedValues.clear();
  filterModalCurrentAttribute = null;
  if (filterAttributeSelect) {
    filterAttributeSelect.innerHTML =
      '<option value="">Seleccionar atributo...</option>';
  }
  if (filterValuesContainer) filterValuesContainer.style.display = "none";
  if (filterActiveFilters) filterActiveFilters.style.display = "none";
  if (filterActiveList) filterActiveList.innerHTML = "";
}

export function clearAttributeTableCaches() {
  normalizedKeysCache.clear();
  uniqueValuesCache.clear();
}

function getLayerAliasMap(capaNombre, temasConfig) {
  const temaKey = encontrarTemaParaCapa(capaNombre, temasConfig);
  if (!temaKey) return {};
  const configCapa = getCapaConfig(capaNombre, temaKey, temasConfig);
  const alias = configCapa?.alias || {};
  const normalized = {};
  Object.entries(alias).forEach(([key, value]) => {
    normalized[key.toLowerCase().trim()] = value;
  });
  return normalized;
}

function getAliasForAttribute(attrName, aliasMap) {
  const normalized = aliasMap[attrName.toLowerCase().trim()];
  return normalized || attrName;
}

function getLayerAttributeNames(geojson) {
  if (!geojson || !geojson.features || geojson.features.length === 0) return [];
  const firstProps = geojson.features[0].properties;
  if (!firstProps) return [];
  return Object.keys(firstProps).filter(
    (k) => k !== null && k !== undefined && typeof k === "string"
  );
}

function getUniqueValuesForAttribute(geojson, attribute) {
  const cacheKey = `${currentCapaNombre || "unknown"}:${attribute}`;
  if (uniqueValuesCache.has(cacheKey)) {
    return uniqueValuesCache.get(cacheKey);
  }
  const values = new Set();
  const propKeys = geojson.features[0]?.properties
    ? Object.keys(geojson.features[0].properties)
    : [];
  const normalizedMap = new Map(propKeys.map((k) => [normalizeKey(k), k]));
  const originalKey = normalizedMap.get(normalizeKey(attribute));

  geojson.features.forEach((f) => {
    const val = f.properties?.[originalKey];
    if (val !== null && val !== undefined && val !== "") {
      values.add(String(val));
    }
  });
  const result = Array.from(values).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
  uniqueValuesCache.set(cacheKey, result);
  return result;
}

export function openFilterModal(capaNombre, temasConfig) {
  initFilterModal();

  const geojson = getLayerData(capaNombre);
  if (!geojson || !geojson.features || geojson.features.length === 0) {
    log.warn(`No hay datos para filtrar en la capa ${capaNombre}`);
    return;
  }

  filterModalCapa = capaNombre;
  filterModalTemasConfig = temasConfig;
  filterModalGeojson = geojson;
  filterModalSelectedValues.clear();
  filterModalCurrentAttribute = null;

  const existingFilters = getDataFilter(capaNombre);
  if (existingFilters) {
    existingFilters.forEach((valores, attr) => {
      filterModalSelectedValues.set(attr, new Set(valores));
    });
  }

  const nombreVisual =
    obtenerNombrePersonalizado(
      capaNombre,
      encontrarTemaParaCapa(capaNombre, temasConfig),
      temasConfig
    ) || capaNombre;
  if (filterModalLayerName) filterModalLayerName.textContent = nombreVisual;

  const temaKey = encontrarTemaParaCapa(capaNombre, temasConfig);
  const configCapa = getCapaConfig(capaNombre, temaKey, temasConfig);
  const aliasMap = getLayerAliasMap(capaNombre, temasConfig);

  let filterAttributes = [];
  if (configCapa?.popupCampos && Array.isArray(configCapa.popupCampos)) {
    filterAttributes = configCapa.popupCampos;
  } else {
    filterAttributes = getLayerAttributeNames(geojson);
  }

  if (filterAttributeSelect) {
    filterAttributeSelect.innerHTML =
      '<option value="">Seleccionar atributo...</option>';
    filterAttributes.forEach((attr) => {
      const option = document.createElement("option");
      option.value = attr;
      option.textContent = getAliasForAttribute(attr, aliasMap);
      filterAttributeSelect.appendChild(option);
    });
  }

  updateActiveFiltersDisplay();
  updateFilterButtonState(capaNombre);

  if (filterModal) {
    filterModal.showModal();
  }
}

function onAttributeChange() {
  const attr = filterAttributeSelect?.value;
  if (!attr) {
    if (filterValuesContainer) filterValuesContainer.style.display = "none";
    return;
  }

  filterModalCurrentAttribute = attr;

  if (!filterModalSelectedValues.has(attr)) {
    filterModalSelectedValues.set(attr, new Set());
  }

  const values = getUniqueValuesForAttribute(filterModalGeojson, attr);
  renderFilterValuesList(values, attr);

  if (filterValuesContainer) filterValuesContainer.style.display = "block";
}

function renderFilterValuesList(values, attribute) {
  if (!filterValuesList) return;
  filterValuesList.innerHTML = "";

  const selected = filterModalSelectedValues.get(attribute);

  values.forEach((val) => {
    const item = document.createElement("div");
    item.className = "filter-value-item";

    const checked = selected ? selected.has(val) : false;
    const safeId = `filter-val-${escapeHtml(val).replace(/\s+/g, "-")}`;

    item.innerHTML = `
            <input type="checkbox" id="${safeId}"
                value="${escapeHtml(val)}" ${checked ? "checked" : ""}>
            <label for="${safeId}">${escapeHtml(val)}</label>
        `;

    const checkbox = item.querySelector('input[type="checkbox"]');
    checkbox.addEventListener("change", () => {
      if (!filterModalSelectedValues.has(attribute)) {
        filterModalSelectedValues.set(attribute, new Set());
      }
      const set = filterModalSelectedValues.get(attribute);
      if (checkbox.checked) {
        set.add(checkbox.value);
      } else {
        set.delete(checkbox.value);
      }
    });

    filterValuesList.appendChild(item);
  });
}

function selectAllValues() {
  if (!filterModalCurrentAttribute || !filterValuesList) return;
  const checkboxes = filterValuesList.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach((cb) => {
    cb.checked = true;
  });
  if (!filterModalSelectedValues.has(filterModalCurrentAttribute)) {
    filterModalSelectedValues.set(filterModalCurrentAttribute, new Set());
  }
  const values = Array.from(
    filterValuesList.querySelectorAll('input[type="checkbox"]')
  ).map((cb) => cb.value);
  filterModalSelectedValues.set(filterModalCurrentAttribute, new Set(values));
}

function deselectAllValues() {
  if (!filterModalCurrentAttribute) return;
  filterModalSelectedValues.set(filterModalCurrentAttribute, new Set());
  if (filterValuesList) {
    filterValuesList
      .querySelectorAll('input[type="checkbox"]')
      .forEach((cb) => {
        cb.checked = false;
      });
  }
}

function updateActiveFiltersDisplay() {
  if (!filterActiveList || !filterActiveFilters) return;

  const entries = Array.from(filterModalSelectedValues.entries()).filter(
    ([, vals]) => vals.size > 0
  );

  if (entries.length === 0) {
    filterActiveFilters.style.display = "none";
    return;
  }

  filterActiveFilters.style.display = "block";
  filterActiveList.innerHTML = "";

  entries.forEach(([attr, valores]) => {
    const item = document.createElement("div");
    item.className = "filter-active-item";

    const aliasMap =
      filterModalCapa && filterModalTemasConfig
        ? getLayerAliasMap(filterModalCapa, filterModalTemasConfig)
        : {};
    const displayAttr = getAliasForAttribute(attr, aliasMap);
    const valoresText = Array.from(valores).slice(0, 3).join(", ");
    const extra = valores.size > 3 ? ` +${valores.size - 3}` : "";

    item.innerHTML = `
            <div class="filter-active-item-info">
                <span class="filter-active-attr">${escapeHtml(displayAttr)}</span>
                <span class="filter-active-values">${escapeHtml(valoresText)}${escapeHtml(extra)}</span>
            </div>
            <button class="filter-active-remove" data-attr="${escapeHtml(attr)}" title="Quitar filtro">
                <span class="material-symbols-outlined" style="font-size: 16px;">close</span>
            </button>
        `;

    const removeBtn = item.querySelector(".filter-active-remove");
    removeBtn.addEventListener("click", () => {
      filterModalSelectedValues.delete(attr);
      if (filterModalCurrentAttribute === attr && filterAttributeSelect) {
        filterAttributeSelect.value = "";
      }
      if (filterValuesContainer) filterValuesContainer.style.display = "none";
      updateActiveFiltersDisplay();
    });

    filterActiveList.appendChild(item);
  });
}

function applyFiltersAction() {
  if (!filterModalCapa) return;

  const activeFilters = new Map();
  filterModalSelectedValues.forEach((valores, attr) => {
    if (valores.size > 0) {
      activeFilters.set(attr, valores);
    }
  });

  if (activeFilters.size === 0) {
    clearDataFilter(filterModalCapa);
  } else {
    clearDataFilter(filterModalCapa);
    activeFilters.forEach((valores, attr) => {
      setDataFilter(filterModalCapa, attr, valores);
    });
  }

  updateFilterButtonState(filterModalCapa);

  if (filterModalCapa && appState.layers.loaded.has(filterModalCapa)) {
    applyDataFilterToLayer(filterModalCapa);
  }

  refreshAttributeTableIfOpen(filterModalCapa);

  if (filterModal) filterModal.close();
  resetFilterModalState();
}

function clearAllFiltersAction() {
  if (!filterModalCapa) return;
  clearDataFilter(filterModalCapa);
  filterModalSelectedValues.clear();
  updateActiveFiltersDisplay();
  updateFilterButtonState(filterModalCapa);

  if (filterModalCapa && appState.layers.loaded.has(filterModalCapa)) {
    applyDataFilterToLayer(filterModalCapa);
  }

  refreshAttributeTableIfOpen(filterModalCapa);
}

function refreshAttributeTableIfOpen(capaNombre) {
  if (!panel || !panel.classList.contains("show")) return;
  if (capaNombre && currentCapaNombre !== capaNombre) return;
  if (!currentCapaNombre || !currentTemasConfig) return;

  // Preservar scroll (vertical y horizontal) de la tabla.
  const tableResponsive = panel.querySelector(".table-responsive");
  const previousScrollTop = tableResponsive ? tableResponsive.scrollTop : 0;
  const previousScrollLeft = tableResponsive ? tableResponsive.scrollLeft : 0;

  const geojson = getLayerData(currentCapaNombre);
  if (!geojson || !geojson.features) return;

  const dataFilter = getDataFilter(currentCapaNombre);
  let features = geojson.features;
  if (dataFilter && dataFilter.size > 0) {
    features = features.filter((feature) => {
      for (const [attr, allowedValues] of dataFilter.entries()) {
        const featureVal = feature.properties?.[attr];
        if (featureVal === undefined || featureVal === null) return false;
        if (!allowedValues.has(String(featureVal))) return false;
      }
      return true;
    });
  }
  currentFeatures = features;

  const totalFeatures = currentFeatures.length;
  countEl.textContent = `${totalFeatures} registros`;

  if (totalFeatures === 0) {
    headEl.innerHTML = "";
    bodyEl.innerHTML =
      '<tr><td colspan="100%" style="text-align: center; padding: 16px;">No hay datos para mostrar</td></tr>';
    return;
  }

  const temaKey = encontrarTemaParaCapa(currentCapaNombre, currentTemasConfig);
  const configCapa = getCapaConfig(
    currentCapaNombre,
    temaKey,
    currentTemasConfig
  );
  const aliasConfig = configCapa?.alias || null;

  let columnasAMostrar = [];
  let nombresColumnas = [];
  if (aliasConfig && Object.keys(aliasConfig).length > 0) {
    if (configCapa?.popupCampos && Array.isArray(configCapa.popupCampos)) {
      columnasAMostrar = configCapa.popupCampos;
      nombresColumnas = configCapa.popupCampos.map(
        (key) => aliasConfig[key] || key
      );
    } else {
      columnasAMostrar = Object.keys(aliasConfig);
      nombresColumnas = Object.values(aliasConfig);
    }
  } else {
    if (currentFeatures.length > 0 && currentFeatures[0].properties) {
      columnasAMostrar = Object.keys(currentFeatures[0].properties);
      nombresColumnas = [...columnasAMostrar];
    }
  }

  if (columnasAMostrar.length === 0) {
    headEl.innerHTML = "";
    bodyEl.innerHTML =
      '<tr><td colspan="100%" style="text-align: center; padding: 16px;">No hay atributos para mostrar</td></tr>';
    return;
  }

  columnasBusqueda = columnasAMostrar.map((key, i) => ({
    key,
    label: nombresColumnas[i] || key,
  }));

  if (searchActive) {
    renderSearchBar();
  }

  const fragmentHead = document.createDocumentFragment();
  nombresColumnas.forEach((nombre) => {
    const th = document.createElement("th");
    th.textContent = nombre;
    const resizer = document.createElement("div");
    resizer.classList.add("col-resizer");
    th.appendChild(resizer);
    fragmentHead.appendChild(th);
  });
  headEl.innerHTML = "";
  headEl.appendChild(fragmentHead);

  const table = document.getElementById("attribute-table");
  if (table) table.style.tableLayout = "auto";

  const fragmentBody = document.createDocumentFragment();

  currentFeatures.forEach((feature, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.featureIndex = idx;
    const propKeys = feature.properties ? Object.keys(feature.properties) : [];
    const normalizedMap = new Map(propKeys.map((k) => [normalizeKey(k), k]));

    columnasAMostrar.forEach((col) => {
      const td = document.createElement("td");
      let val = feature.properties?.[col];
      if (val === undefined) {
        const origKey = normalizedMap.get(normalizeKey(col));
        if (origKey !== undefined) val = feature.properties[origKey];
      }
      td.textContent = val === null || val === undefined ? "-" : String(val);
      tr.appendChild(td);
    });
    fragmentBody.appendChild(tr);
  });
  bodyEl.innerHTML = "";
  bodyEl.appendChild(fragmentBody);

  // Restaurar scroll (vertical y horizontal).
  if (tableResponsive) {
    tableResponsive.scrollTop = previousScrollTop;
    tableResponsive.scrollLeft = previousScrollLeft;
  }
}

function applyDataFilterToLayer(capaNombre) {
  updateLayerFilter(capaNombre);
}

function updateFilterButtonState(capaNombre) {
  const menuItem = document.querySelector(
    `.layer-item-container[data-capa-nombre="${capaNombre}"]`
  );
  if (!menuItem) return;
  const filterBtn = menuItem.querySelector('[data-action="filter-data"]');
  if (!filterBtn) return;

  const hasFilter = hasDataFilter(capaNombre);
  const filterCount = getDataFilter(capaNombre)?.size || 0;

  if (hasFilter) {
    filterBtn.innerHTML = `<span class="material-symbols-outlined">filter_alt_off</span> Quitar Filtros (${filterCount})`;
  } else {
    filterBtn.innerHTML = `<span class="material-symbols-outlined">filter_alt</span> Filtrar Datos`;
  }
}