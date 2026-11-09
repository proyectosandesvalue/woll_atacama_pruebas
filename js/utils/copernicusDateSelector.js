/**
 * Selector de fecha para capas WMS de Copernicus.
 *
 * Flujo:
 *   1. Al abrir el calendario consulta el WFS para el mes visible (y los
 *      meses vecinos) y el viewport actual.
 *   2. Marca en el calendario los días con imágenes disponibles.
 *   3. Al navegar a otro mes, consulta y marca ese mes. Hay caché por
 *      mes + bbox para no repetir consultas.
 *   4. Al elegir un día, aplica `TIME=YYYY-MM-DD/YYYY-MM-DD` a la capa
 *      WMS y redibuja. El botón “x” vuelve a la imagen más reciente.
 *
 * El rango histórico llega hasta `wmsHistoryStart` (por defecto
 * 2017-01-01), para poder comparar con imágenes de años anteriores.
 *
 * La consulta WFS pasa por `/api/proxy`; el INSTANCE_ID no llega al
 * navegador.
 */

/* global flatpickr */

import { appState, getLayer } from "../store/appState.js";
import { fetchCopernicusFootprints } from "./externalServices.js";
import { createContextLogger } from "./logger.js";

const log = createContextLogger("CopernicusDateSelector");

const AVAILABILITY_TTL_MS = 5 * 60 * 1000;
const DEFAULT_HISTORY_START = "2017-01-01";
const MAX_PAGES = 3;
const MAX_CACHE_ENTRIES = 36;

function localDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysAgo(days, base = new Date()) {
  const date = new Date(base);
  date.setDate(date.getDate() - days);
  return localDateStr(date);
}

function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthKey(date) {
  return localDateStr(date).slice(0, 7);
}

function monthLabel(date) {
  return new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
  }).format(date);
}

/**
 * WFS 2.0 con EPSG:4326 usa lat,lon (sur,oeste,norte,este).
 */
function bboxFromMap(map) {
  if (!map || typeof map.getBounds !== "function") return null;
  const bounds = map.getBounds();
  return [
    bounds.getSouth().toFixed(5),
    bounds.getWest().toFixed(5),
    bounds.getNorth().toFixed(5),
    bounds.getEast().toFixed(5),
  ].join(",");
}

function applyWmsTime(capaNombre, capaConfig, date) {
  if (date) {
    capaConfig.wmsTime = `${date}/${date}`;
  } else {
    delete capaConfig.wmsTime;
  }

  const layer = getLayer(capaNombre);
  if (!layer?._isWMS) return;

  if (date) {
    layer.wmsParams.TIME = `${date}/${date}`;
  } else {
    delete layer.wmsParams.TIME;
  }

  if (typeof layer.redraw === "function") layer.redraw();
}

/**
 * Actualiza la leyenda del calendario según el estado de la consulta WFS.
 */
function setLegendState(state, status, count = 0) {
  const legend = state.legend;
  if (!legend) return;

  legend.dataset.state = status;
  legend.replaceChildren();

  if (status === "available") {
    const dot = document.createElement("span");
    dot.className = "legend-dot";
    legend.appendChild(dot);
  }

  const label = state.monthLabel || "el mes visible";
  const text = document.createElement("span");
  text.textContent = {
    idle: "Días con imágenes en el área visible",
    loading: `Buscando fechas de ${label}…`,
    available: `${count} ${count === 1 ? "fecha" : "fechas"} con imágenes en ${label}`,
    empty: `Sin imágenes en ${label} para el área visible`,
    error: `No se pudieron cargar las fechas de ${label}`,
  }[status] || "";

  legend.appendChild(text);
}

function mergeDates(state, dates) {
  if (!state.picker) return;
  if (!(state.picker._availableDates instanceof Set)) {
    state.picker._availableDates = new Set();
  }
  dates.forEach((date) => state.picker._availableDates.add(date));
  state.picker.redraw();
}

function trimCache(cache) {
  while (cache.size > MAX_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
}

/**
 * Consulta las fechas con imágenes de un mes y sus vecinos.
 * Incluir los meses vecinos permite marcar los días de los extremos del
 * calendario sin una consulta adicional.
 */
async function fetchMonthDates(capaConfig, monthDate, bbox, signal) {
  const from = localDateStr(
    new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1)
  );
  const to = localDateStr(
    new Date(monthDate.getFullYear(), monthDate.getMonth() + 2, 0)
  );

  const features = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await fetchCopernicusFootprints({
      typename: capaConfig.wmsCollection || "DSS2",
      bbox,
      time: `${from}/${to}`,
      maxFeatures: 100,
      featureOffset: page * 100,
      maxcc: capaConfig.wmsMaxcc ?? 30,
      signal,
    });
    const batch = data.features || [];
    features.push(...batch);
    if (batch.length < 100) break;
  }

  return [
    ...new Set(
      features
        .map((feature) => feature?.properties?.date)
        .filter(
          (date) =>
            typeof date === "string" &&
            date.length === 10 &&
            date >= from &&
            date <= to
        )
    ),
  ].sort();
}

async function loadMonth(capaNombre, capaConfig, state, date, force = false) {
  if (!state.picker) return;

  const target = monthStart(date);
  const key = monthKey(target);
  const label = monthLabel(target);
  const bbox = bboxFromMap(appState.map);
  if (!bbox) return;

  // Si cambió el viewport, las fechas anteriores dejan de ser válidas.
  if (state.lastBbox && state.lastBbox !== bbox) {
    state.cache.clear();
    state.picker._availableDates = new Set();
    state.picker.redraw();
  }
  state.lastBbox = bbox;
  state.monthKey = key;
  state.monthLabel = label;

  // Si hay una consulta de otro mes en curso, se descarta.
  if (state.loading && state.loadingKey !== key) {
    state.controller?.abort();
    state.requestId += 1;
    state.loading = false;
    state.loadingKey = null;
  }

  // `onMonthChange` y `onYearChange` pueden dispararse juntos.
  if (!force && state.loading && state.loadingKey === key) return;

  const cacheKey = `${bbox}|${key}`;
  const cached = state.cache.get(cacheKey);
  if (!force && cached && Date.now() - cached.at < AVAILABILITY_TTL_MS) {
    const visibleDates = cached.dates.filter((d) => d.startsWith(key));
    mergeDates(state, cached.dates);
    setLegendState(
      state,
      visibleDates.length > 0 ? "available" : "empty",
      visibleDates.length
    );
    return;
  }

  state.controller?.abort();
  state.controller = new AbortController();
  const requestId = ++state.requestId;

  state.loading = true;
  state.loadingKey = key;
  state.displayInput.placeholder = "Buscando fechas...";
  setLegendState(state, "loading");

  try {
    const dates = await fetchMonthDates(
      capaConfig,
      target,
      bbox,
      state.controller.signal
    );
    if (requestId !== state.requestId) return;

    state.cache.set(cacheKey, { dates, at: Date.now() });
    trimCache(state.cache);

    const visibleDates = dates.filter((d) => d.startsWith(key));
    mergeDates(state, dates);
    setLegendState(
      state,
      visibleDates.length > 0 ? "available" : "empty",
      visibleDates.length
    );
    state.displayInput.placeholder = "Más reciente";
  } catch (err) {
    if (err?.name === "AbortError") return;
    if (requestId !== state.requestId) return;
    log.warn(`No se pudieron cargar fechas de ${capaNombre} (${key}): ${err.message}`);
    state.displayInput.placeholder = "Error al buscar fechas";
    setLegendState(state, "error");
  } finally {
    if (requestId === state.requestId) {
      state.loading = false;
      state.loadingKey = null;
    }
  }
}

/**
 * Agrega el selector de fecha a un `<li>` de capa WMS.
 *
 * @param {HTMLLIElement} capaLi
 * @param {{capaNombre:string, capaConfig:object}} opts
 * @returns {HTMLDivElement|null}
 */
export function attachCopernicusDateSelector(capaLi, { capaNombre, capaConfig }) {
  if (!capaLi || !capaConfig) return null;

  const container = document.createElement("div");
  container.className = "layer-date-selector";
  container.style.display = "flex";
  container.innerHTML = `
    <label class="layer-date-label" title="Los días resaltados tienen imágenes disponibles en el área visible">
      <span class="material-symbols-outlined">calendar_month</span>
      <span>Fecha de imagen</span>
    </label>
    <input type="text" class="layer-date-input" placeholder="Más reciente" readonly />
    <button type="button" class="layer-date-clear" title="Ver la imagen más reciente" style="display: none;">
      <span class="material-symbols-outlined">close</span>
    </button>
  `;

  const input = container.querySelector(".layer-date-input");
  const clearBtn = container.querySelector(".layer-date-clear");
  const initialDate =
    typeof capaConfig.wmsTime === "string" && capaConfig.wmsTime.length >= 10
      ? capaConfig.wmsTime.slice(0, 10)
      : null;
  const state = {
    container,
    input,
    displayInput: input,
    clearBtn,
    controller: null,
    picker: null,
    legend: null,
    cache: new Map(),
    monthKey: null,
    monthLabel: "",
    requestId: 0,
    loading: false,
    loadingKey: null,
    lastBbox: null,
  };

  capaLi.appendChild(container);
  container._copernicusState = state;

  if (window.flatpickr) {
    if (flatpickr.l10ns?.es) flatpickr.localize(flatpickr.l10ns.es);

    state.picker = flatpickr(input, {
      dateFormat: "Y-m-d",
      altInput: true,
      altFormat: "d/m/Y",
      disableMobile: true,
      locale: "es",
      minDate: capaConfig.wmsHistoryStart || DEFAULT_HISTORY_START,
      maxDate: new Date(),
      defaultDate: initialDate || undefined,
      onChange: (_selectedDates, dateStr) => {
        const date = dateStr || null;
        applyWmsTime(capaNombre, capaConfig, date);
        clearBtn.style.display = date ? "flex" : "none";
      },
      onOpen: () => {
        const picker = state.picker;
        if (!picker) return;
        loadMonth(
          capaNombre,
          capaConfig,
          state,
          new Date(picker.currentYear, picker.currentMonth, 1)
        );
      },
      onMonthChange: (dObj) => {
        const picker = state.picker;
        if (!picker) return;
        const date =
          dObj instanceof Date
            ? dObj
            : new Date(picker.currentYear, picker.currentMonth, 1);
        loadMonth(capaNombre, capaConfig, state, date);
      },
      onYearChange: (dObj) => {
        const picker = state.picker;
        if (!picker) return;
        const date =
          dObj instanceof Date
            ? dObj
            : new Date(picker.currentYear, picker.currentMonth, 1);
        loadMonth(capaNombre, capaConfig, state, date);
      },
      onDayCreate: (_dObj, _dStr, picker, dayElem) => {
        const dateStr = localDateStr(dayElem.dateObj);
        if (picker._availableDates?.has(dateStr)) {
          dayElem.classList.add("has-data-satellite");
        }
      },
    });

    state.legend = document.createElement("div");
    state.legend.className = "flatpickr-availability-legend";
    state.picker.calendarContainer.appendChild(state.legend);
    setLegendState(state, "idle");

    state.displayInput = state.picker.altInput || input;
    if (initialDate) clearBtn.style.display = "flex";
  } else {
    // Fallback sin flatpickr: input nativo.
    input.removeAttribute("readonly");
    input.type = "date";
    input.min =
      capaConfig.wmsHistoryStart ||
      daysAgo(capaConfig.wmsDateRangeDays || 180);
    input.max = localDateStr(new Date());
    if (initialDate) {
      input.value = initialDate;
      clearBtn.style.display = "flex";
    }
    state.displayInput = input;
    input.addEventListener("change", () => {
      const date = input.value || null;
      applyWmsTime(capaNombre, capaConfig, date);
      clearBtn.style.display = date ? "flex" : "none";
    });
  }

  clearBtn.addEventListener("click", () => {
    if (state.picker) {
      state.picker.clear();
    } else {
      input.value = "";
    }
    applyWmsTime(capaNombre, capaConfig, null);
    clearBtn.style.display = "none";
  });

  // No consultar WFS al activar la capa: compite con la carga de tiles.
  // La disponibilidad se carga al abrir el calendario y al cambiar de mes.
  return container;
}

/**
 * Destruye los pickers de un contenedor antes de re-renderizar el sidebar.
 * Evita acumular instancias de flatpickr y listeners entre cambios de tema.
 *
 * @param {HTMLElement} root
 */
export function cleanupCopernicusDateSelectors(root) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll(".layer-date-selector").forEach((element) => {
    const state = element._copernicusState;
    try {
      state?.controller?.abort();
      state?.picker?.destroy?.();
    } catch {
      // El picker ya fue destruido.
    }
    delete element._copernicusState;
  });
}
