// ─────────────────────────────────────────────────────────────
// chartModal.js — versión corregida
// ─────────────────────────────────────────────────────────────

let _currentStation = null;
let _currentRanges = {};
let _generation = 0;

const _seriesCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const _cardState = new WeakMap();

const CHART_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6",
];

const CATEGORIES = [
  { label: "Precipitaciones", prefixes: ["precip_"] },
  { label: "Temperaturas", prefixes: ["temp_"] },
  { label: "Hidrología", prefixes: ["caudal_", "sedimentos_", "nivel_"] },
  { label: "Calidad del agua", prefixes: ["calidad_"] },
];

const TEMP_DAILY_IDS = ["temp_max_diaria", "temp_min_diaria", "temp_media_diaria"];

const HINTS = {
  year: "Haz clic en un año para ver sus meses",
  month: "Haz clic en un mes para ver sus días",
  day: "Haz clic en un día para ver sus horas",
  hour: "Estás viendo el detalle por hora. Usa '← Volver' para regresar",
};

function categorizeIndicator(id) {
  for (const cat of CATEGORIES) {
    if (cat.prefixes.some((p) => id.startsWith(p))) return cat.label;
  }
  return "Otros";
}

export function openChartModal(station, data) {
  // ⚠️ FIX 2: invalidar renders en vuelo desde el INICIO, no solo al cerrar
  _generation++;
  _seriesCache.clear();

  _currentStation = station;
  const values = data.values || [];
  _currentRanges = data.ranges || {};

  const modal = document.getElementById("chartModal");
  const title = document.getElementById("chartModalTitle");
  const body = document.getElementById("chartModalBody");
  if (!modal || !body) return;

  title.textContent = `Series históricas · ${station.nombre_estacion}`;

  const tempDailyPresent = TEMP_DAILY_IDS.filter((id) =>
    values.some((v) => v.indicator_id === id)
  );
  const otherValues = values.filter((v) => !TEMP_DAILY_IDS.includes(v.indicator_id));

  const grouped = {};
  otherValues.forEach((v) => {
    const cat = categorizeIndicator(v.indicator_id);
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(v);
  });

  body.style.background = "var(--bg-surface-2)";

  body.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid var(--border-subtle);">
      <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: center;">
        <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-secondary); white-space: nowrap;">Temporalidad:</span>
        <div style="display: flex; gap: 4px; background: var(--bg-surface); padding: 4px; border-radius: 6px; border: 1px solid var(--border-subtle);">
          <button class="gran-btn active" data-value="year" style="padding: 6px 14px; border: none; border-radius: 4px; font-size: 0.80rem; font-weight: 600; cursor: pointer; background: var(--color-brand-text); color: white; white-space: nowrap;">Anual</button>
          <button class="gran-btn" data-value="month" style="padding: 6px 14px; border: none; border-radius: 4px; font-size: 0.80rem; font-weight: 500; cursor: pointer; background: transparent; color: var(--text-secondary); white-space: nowrap;">Mensual</button>
          <button class="gran-btn" data-value="day" style="padding: 6px 14px; border: none; border-radius: 4px; font-size: 0.80rem; font-weight: 500; cursor: pointer; background: transparent; color: var(--text-secondary); white-space: nowrap;">Diario</button>
        </div>
      </div>
      <div id="chartHint" style="font-size: 0.72rem; color: var(--text-tertiary); font-style: italic; text-align: center; min-height: 18px;">
        ${HINTS.year}
      </div>
    </div>
    <div id="chartsGrid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; width: 100%;"></div>
  `;

  const grid = document.getElementById("chartsGrid");
  const buttons = body.querySelectorAll(".gran-btn");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => {
        b.classList.remove("active");
        b.style.background = "transparent";
        b.style.color = "var(--text-secondary)";
        b.style.fontWeight = "500";
      });
      btn.classList.add("active");
      btn.style.background = "var(--color-brand-text)";
      btn.style.color = "white";
      btn.style.fontWeight = "600";
      updateHint(btn.dataset.value);
      resetAllCards(btn.dataset.value);
    });
  });

  const categoryOrder = ["Precipitaciones", "Temperaturas", "Hidrología", "Calidad del agua", "Otros"];
  let colorIndex = 0;

  categoryOrder.forEach((catLabel) => {
    const indicators = grouped[catLabel];
    if (!indicators || indicators.length === 0) return;

    const header = document.createElement("div");
    header.style.cssText = "grid-column: 1 / -1; margin-top: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--border-subtle);";
    const range = computeSectionRange(indicators, _currentRanges);
    header.innerHTML = `
      <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.05em;">${catLabel}</div>
      <div style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 2px;">Datos disponibles desde: ${range}</div>
    `;
    grid.appendChild(header);

    const precipIndicators = indicators.filter((i) => i.indicator_id.startsWith("precip_"));
    const otherIndicators = indicators.filter((i) => !i.indicator_id.startsWith("precip_"));
    const precipOrder = ["precip_diaria", "precip_mensual", "precip_max_anual"];
    precipIndicators.sort((a, b) => precipOrder.indexOf(a.indicator_id) - precipOrder.indexOf(b.indicator_id));

    precipIndicators.forEach((ind) => {
      grid.appendChild(buildSingleCard(ind, CHART_COLORS[colorIndex++ % CHART_COLORS.length]));
    });

    if (catLabel === "Temperaturas" && tempDailyPresent.length > 0) {
      grid.appendChild(buildCombinedTempCard(tempDailyPresent));
    }

    otherIndicators.forEach((ind) => {
      grid.appendChild(buildSingleCard(ind, CHART_COLORS[colorIndex++ % CHART_COLORS.length]));
    });
  });

  resetAllCards("year");
  if (!modal.open) modal.showModal();
}

function updateHint(granularity) {
  const hint = document.getElementById("chartHint");
  if (hint) hint.textContent = HINTS[granularity] || "";
}

function buildSingleCard(ind, color) {
  const card = document.createElement("div");
  card.dataset.chartCard = "true";
  card.dataset.chartType = "single";
  card.dataset.indicator = ind.indicator_id;
  card.dataset.color = color;
  card.style.cssText = "background: var(--bg-surface); border-radius: 8px; padding: 16px; border: 1px solid var(--border-subtle); box-shadow: 0 2px 4px rgba(0,0,0,0.02);";

  card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <h4 style="margin: 0; font-size: 0.85rem; color: var(--text-primary); font-weight: 600;">${formatLabel(ind.indicator_id)}</h4>
      <button class="chart-back-btn" style="display: none; padding: 2px 8px; border: 1px solid var(--border-subtle); background: var(--bg-surface-2); border-radius: 4px; font-size: 0.70rem; cursor: pointer; color: var(--text-secondary);">← Volver</button>
    </div>
    <div style="position: relative; height: 220px; width: 100%;">
      <canvas title="Click para explorar el detalle"></canvas>
    </div>
    <div class="chart-empty-msg" style="display: none; height: 220px; align-items: center; justify-content: center; color: var(--text-tertiary); font-size: 0.80rem; text-align: center; padding: 20px;">Sin datos suficientes</div>
  `;

  _cardState.set(card, { stack: [], chart: null, type: "single", renderToken: 0 });

  const backBtn = card.querySelector(".chart-back-btn");
  backBtn.addEventListener("click", () => {
    const state = _cardState.get(card);
    if (state.stack.length > 1) {
      state.stack.pop();
      updateHint(state.stack[state.stack.length - 1].granularity);
      renderCard(card);
    }
  });

  return card;
}

function buildCombinedTempCard(presentIds) {
  const card = document.createElement("div");
  card.dataset.chartCard = "true";
  card.dataset.chartType = "combined-temp";
  card.dataset.series = JSON.stringify(
    [
      { indicator: "temp_max_diaria", label: "Máxima", color: "#dc2626" },
      { indicator: "temp_min_diaria", label: "Mínima", color: "#1e40af" },
      { indicator: "temp_media_diaria", label: "Media", color: "#10b981" },
    ].filter((s) => presentIds.includes(s.indicator))
  );
  // ⚠️ FIX 1: sin `grid-column: span 2` y altura consistente (220px)
  card.style.cssText = "background: var(--bg-surface); border-radius: 8px; padding: 16px; border: 1px solid var(--border-subtle); box-shadow: 0 2px 4px rgba(0,0,0,0.02);";

  card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <h4 style="margin: 0; font-size: 0.85rem; color: var(--text-primary); font-weight: 600;">Temperatura diaria (máx, mín, media)</h4>
      <button class="chart-back-btn" style="display: none; padding: 2px 8px; border: 1px solid var(--border-subtle); background: var(--bg-surface-2); border-radius: 4px; font-size: 0.70rem; cursor: pointer; color: var(--text-secondary);">← Volver</button>
    </div>
    <div style="position: relative; height: 220px; width: 100%;">
      <canvas title="Click para explorar el detalle"></canvas>
    </div>
    <div class="chart-empty-msg" style="display: none; height: 220px; align-items: center; justify-content: center; color: var(--text-tertiary); font-size: 0.80rem; text-align: center; padding: 20px;">Sin datos suficientes</div>
  `;

  _cardState.set(card, { stack: [], chart: null, type: "combined-temp", renderToken: 0 });

  const backBtn = card.querySelector(".chart-back-btn");
  backBtn.addEventListener("click", () => {
    const state = _cardState.get(card);
    if (state.stack.length > 1) {
      state.stack.pop();
      updateHint(state.stack[state.stack.length - 1].granularity);
      renderCard(card);
    }
  });

  return card;
}

function resetAllCards(baseGranularity) {
  const cards = document.querySelectorAll("[data-chart-card='true']");
  cards.forEach((card) => {
    const state = _cardState.get(card);
    if (state) state.stack = [{ granularity: baseGranularity }];
    renderCard(card);
  });
}

async function renderCard(card) {
  const state = _cardState.get(card);
  if (!state || state.stack.length === 0) return;

  // ⚠️ FIX 2: token por card para descartar renders viejos
  state.renderToken = (state.renderToken || 0) + 1;
  const myToken = state.renderToken;

  const currentState = state.stack[state.stack.length - 1];
  const backBtn = card.querySelector(".chart-back-btn");
  backBtn.style.display = state.stack.length > 1 ? "inline-block" : "none";

  if (state.type === "single") await renderSingleCard(card, currentState, state, myToken);
  else if (state.type === "combined-temp") await renderCombinedTempCard(card, currentState, state, myToken);
}

// Resetea el canvas para que Chart.js recalcule el tamaño del contenedor
function resetCanvas(canvas) {
  canvas.removeAttribute("width");
  canvas.removeAttribute("height");
  canvas.style.width = "";
  canvas.style.height = "";
}

async function renderSingleCard(card, currentState, state, myToken) {
  const canvas = card.querySelector("canvas");
  const empty = card.querySelector(".chart-empty-msg");
  const indicator = card.dataset.indicator;
  const color = card.dataset.color;
  const myGen = _generation;

  try {
    const data = await fetchSeriesCached(_currentStation.codigo_nacional, indicator, currentState);
    // ⚠️ FIX 2: descartar render viejo (cambio de granularidad o de modal)
    if (myToken !== state.renderToken || myGen !== _generation) return;

    const points = data.points || [];
    if (points.length < 2) {
      canvas.style.display = "none";
      empty.style.display = "flex";
      if (state.chart) { try { state.chart.destroy(); } catch (_) {} state.chart = null; }
      return;
    }

    canvas.style.display = "block";
    empty.style.display = "none";
    if (state.chart) { try { state.chart.destroy(); } catch (_) {} state.chart = null; }
    resetCanvas(canvas);

    const labels = points.map((p) => formatDateLabel(p.date, currentState.granularity));
    const values = points.map((p) => p.value);

    const chart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: formatLabel(indicator),
          data: values,
          borderColor: color,
          backgroundColor: hexToRgba(color, 0.1),
          borderWidth: 2,
          pointRadius: points.length > 100 ? 0 : 3,
          pointHoverRadius: 6,
          tension: 0.3,
          fill: true,
        }],
      },
      options: buildChartOptions(data.unit || "", false, (label) => drillDown(card, currentState, label)),
    });

    state.chart = chart;
  } catch (err) {
    console.error(`[chartModal] Error:`, err);
    canvas.style.display = "none";
    empty.style.display = "flex";
  }
}

async function renderCombinedTempCard(card, currentState, state, myToken) {
  const canvas = card.querySelector("canvas");
  const empty = card.querySelector(".chart-empty-msg");
  const series = JSON.parse(card.dataset.series);
  const myGen = _generation;

  try {
    const results = await Promise.all(
      series.map(async (s) => {
        const data = await fetchSeriesCached(_currentStation.codigo_nacional, s.indicator, currentState);
        return { ...s, points: data.points || [], unit: data.unit || "°C" };
      })
    );
    if (myToken !== state.renderToken || myGen !== _generation) return;

    const reference = results.reduce(
      (longest, r) => (r.points.length > longest.points.length ? r : longest),
      results[0]
    );

    if (reference.points.length < 2) {
      canvas.style.display = "none";
      empty.style.display = "flex";
      if (state.chart) { try { state.chart.destroy(); } catch (_) {} state.chart = null; }
      return;
    }

    canvas.style.display = "block";
    empty.style.display = "none";
    if (state.chart) { try { state.chart.destroy(); } catch (_) {} state.chart = null; }
    resetCanvas(canvas);

    const labels = reference.points.map((p) => formatDateLabel(p.date, currentState.granularity));
    const datasets = results.map((r) => {
      const dateToValue = new Map(r.points.map((p) => [p.date, p.value]));
      const data = reference.points.map((p) => dateToValue.get(p.date) ?? null);
      return {
        label: r.label,
        data,
        borderColor: r.color,
        backgroundColor: hexToRgba(r.color, 0.05),
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 6,
        tension: 0.3,
        fill: false,
        spanGaps: true,
      };
    });

    const chart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: { labels, datasets },
      options: buildChartOptions(reference.unit || "°C", true, (label) => drillDown(card, currentState, label)),
    });

    state.chart = chart;
  } catch (err) {
    console.error(`[chartModal] Error combined:`, err);
    canvas.style.display = "none";
    empty.style.display = "flex";
  }
}

function drillDown(card, currentState, clickedLabel) {
  const next = computeNextState(currentState, clickedLabel);
  if (!next) return;
  const state = _cardState.get(card);
  state.stack.push(next);
  updateHint(next.granularity);
  renderCard(card);
}

function computeNextState(currentState, label) {
  const g = currentState.granularity;
  if (g === "year") {
    const year = parseInt(label);
    if (isNaN(year)) return null;
    return { granularity: "month", yearStart: year, yearEnd: year };
  }
  if (g === "month") {
    const match = label.match(/^(\w+)\s+(\d{4})$/);
    if (!match) return null;
    const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const month = months.indexOf(match[1]) + 1;
    if (month === 0) return null;
    return { granularity: "day", yearStart: parseInt(match[2]), yearEnd: parseInt(match[2]), month };
  }
  if (g === "day") {
    const match = label.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!match) return null;
    return { granularity: "hour", yearStart: parseInt(match[3]), yearEnd: parseInt(match[3]), month: parseInt(match[2]), day: parseInt(match[1]) };
  }
  return null;
}

async function fetchSeriesCached(codigo, indicator, state) {
  const key = JSON.stringify({ codigo, indicator, state });
  const cached = _seriesCache.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL) return cached.data;

  const params = new URLSearchParams({ codigo, indicator, granularity: state.granularity });
  if (state.yearStart) params.set("year_start", state.yearStart);
  if (state.yearEnd) params.set("year_end", state.yearEnd);
  if (state.month) params.set("month", state.month);
  if (state.day) params.set("day", state.day);

  const res = await fetch(`/api/station-series?${params.toString()}`);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  _seriesCache.set(key, { data, time: Date.now() });
  return data;
}

function buildChartOptions(unit, showLegend, onClickLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    onClick: (event, elements) => {
      if (elements.length === 0) return;
      const idx = elements[0].index;
      const chart = elements[0].element.$context.chart;
      onClickLabel(chart.data.labels[idx]);
    },
    onHover: (event, elements) => {
      event.native.target.style.cursor = elements.length > 0 ? "pointer" : "default";
    },
    plugins: {
      legend: { display: showLegend, position: "bottom", labels: { boxWidth: 12, boxHeight: 12, font: { size: 11 }, padding: 8 } },
      tooltip: {
        enabled: true,
        backgroundColor: "rgba(0,0,0,0.85)",
        titleFont: { size: 13, weight: "bold" },
        bodyFont: { size: 12 },
        padding: 10,
        displayColors: showLegend,
        callbacks: { label: (ctx) => `${ctx.dataset.label ? ctx.dataset.label + ": " : ""}${ctx.parsed.y} ${unit}` },
      },
    },
    scales: {
      y: { beginAtZero: false, title: { display: true, text: unit, font: { size: 10 } }, grid: { color: "rgba(0,0,0,0.05)" }, ticks: { font: { size: 10 } } },
      x: { ticks: { maxTicksLimit: 8, font: { size: 9 } }, grid: { display: false } },
    },
  };
}

function computeSectionRange(indicators, ranges) {
  let minDate = null;
  let maxDate = null;
  indicators.forEach((ind) => {
    const r = ranges[ind.indicator_id];
    if (!r || !r.min || !r.max) return;
    if (!minDate || r.min < minDate) minDate = r.min;
    if (!maxDate || r.max > maxDate) maxDate = r.max;
  });
  if (!minDate || !maxDate) return "sin datos";
  return `${formatDateLabel(minDate, "day")} – ${formatDateLabel(maxDate, "day")}`;
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatLabel(indicatorId) {
  if (indicatorId.startsWith("calidad_")) {
    return indicatorId.replace(/^calidad_/, "").replace(/_total$/, " (total)").replace(/_disuelto$/, " (disuelto)").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  const labels = {
    temp_min_diaria: "Temperatura mínima diaria",
    temp_max_diaria: "Temperatura máxima diaria",
    temp_media_diaria: "Temperatura media diaria",
    temp_media_mensual: "Temperatura media mensual",
    precip_diaria: "Precipitación diaria",
    precip_mensual: "Precipitación mensual",
    precip_max_anual: "Precipitación máxima anual",
    caudal_diario: "Caudal diario",
    caudal_mensual: "Caudal mensual",
    sedimentos_integrado: "Sedimentos (integrado)",
    sedimentos_rutinario: "Sedimentos (rutinario)",
    nivel_estatico_pozo: "Nivel estático del pozo",
  };
  return labels[indicatorId] || indicatorId;
}

function formatDateLabel(dateStr, granularity) {
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  if (granularity === "year") return String(d.getUTCFullYear());
  if (granularity === "month") return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  if (granularity === "hour") return `${day}/${month} ${String(d.getUTCHours()).padStart(2, "0")}:00`;
  return `${day}-${month}-${d.getUTCFullYear()}`;
}

export function initChartModal() {
  const modal = document.getElementById("chartModal");
  const close = document.getElementById("chartModalClose");
  if (!modal) return;

  // ⚠️ FIX 2: cleanup centralizado en el evento "close" (cubre ✕, ESC y backdrop)
  modal.addEventListener("close", () => {
    _generation++;
    _seriesCache.clear();
  });

  if (close) {
    close.addEventListener("click", () => modal.close());
  }
}