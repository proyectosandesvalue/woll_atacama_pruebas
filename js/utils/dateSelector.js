import { getVariableAvailability } from "./stationsMapUtils.js";

const _dates = new Map();
const _pickers = new Map();

export function getDate(layerId) { return _dates.get(layerId) || null; }
export function setDate(layerId, date) { date ? _dates.set(layerId, date) : _dates.delete(layerId); }

const HISTORICAL_PATTERNS = [/_diaria$/, /_mensual$/, /_anual$/, /^calidad_/];
export function isHistoricalVariable(variable) {
  return HISTORICAL_PATTERNS.some((p) => p.test(variable));
}

export function attachDateSelector(wrapper, map, layerId, onDateChange) {
  const container = document.createElement("div");
  container.className = "layer-date-selector";
  container.style.display = "none";
  container.innerHTML = `
    <label class="layer-date-label">
      <span class="material-symbols-outlined">calendar_month</span>
      <span>Fecha histórica</span>
    </label>
    <input type="text" class="layer-date-input" placeholder="dd/mm/aaaa" readonly />
    <button type="button" class="layer-date-clear" title="Ver datos más recientes" style="display: none;">
      <span class="material-symbols-outlined">close</span>
    </button>
  `;

  const input = container.querySelector(".layer-date-input");
  const clearBtn = container.querySelector(".layer-date-clear");

  const picker = flatpickr(input, {
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "d/m/Y",
    disableMobile: true,
    onChange: (selectedDates, dateStr) => {
      if (dateStr) {
        setDate(layerId, dateStr);
        clearBtn.style.display = "flex";
        if (typeof onDateChange === "function") onDateChange(dateStr);
      }
    },
    onDayCreate: (dObj, dStr, fp, dayElem) => {
      const dateStr = dayElem.dateObj.toISOString().slice(0, 10);
      if (fp._availableDates && fp._availableDates.has(dateStr)) {
        dayElem.style.backgroundColor = "#dbeafe"; // azul claro
        dayElem.style.borderRadius = "50%";
        dayElem.style.fontWeight = "600";
      }
    },
  });

  _pickers.set(layerId, picker);

  clearBtn.addEventListener("click", () => {
    picker.clear();
    setDate(layerId, null);
    clearBtn.style.display = "none";
    if (typeof onDateChange === "function") onDateChange(null);
  });

  wrapper.appendChild(container);
  return container;
}

export async function updateDateSelector(wrapper, variable, layerId, codigo = null) {
  const container = wrapper.querySelector(".layer-date-selector");
  if (!container) return;

  const input = container.querySelector(".layer-date-input");
  const clearBtn = container.querySelector(".layer-date-clear");
  const picker = _pickers.get(layerId);

  const savedDate = getDate(layerId);
  if (picker) {
    if (savedDate) {
      picker.setDate(savedDate, false);
      clearBtn.style.display = "flex";
    } else {
      picker.clear();
      clearBtn.style.display = "none";
    }
  }

  if (!isHistoricalVariable(variable)) {
    container.style.display = "none";
    return;
  }

  const availability = await getVariableAvailability(variable);
  if (!availability || !availability.fecha_min) {
    container.style.display = "none";
    return;
  }

  container.style.display = "flex";
  if (picker) {
    picker.set("minDate", availability.fecha_min);
    picker.set("maxDate", availability.fecha_max);
  }

  // Cargar los días con datos (solo si hay codigo, ej. para el modal)
  if (codigo) {
    try {
      const res = await fetch(`/api/station-available-dates?codigo=${codigo}&indicator=${variable}`);
      const data = await res.json();
      if (picker && data.dates) {
        picker._availableDates = new Set(data.dates);
      }
    } catch (err) {
      console.warn(`[dateSelector] No se pudieron cargar las fechas con datos:`, err);
    }
  }
}