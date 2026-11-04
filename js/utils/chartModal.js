// ─────────────────────────────────────────────────────────────
// chartModal.js — versión final (dashboard con tabla y calendario)
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

function categorizeIndicator(id) {
  for (const cat of CATEGORIES) {
    if (cat.prefixes.some((p) => id.startsWith(p))) return cat.label;
  }
  return "Otros";
}

function getCardConfigs(indicatorId, ranges) {
  const r = ranges[indicatorId];
  let y = new Date().getUTCFullYear();
  let m = new Date().getUTCMonth() + 1;

  if (r && r.max) {
    const d = new Date(r.max);
    if (!isNaN(d)) {
      y = d.getUTCFullYear();
      m = d.getUTCMonth() + 1;
    }
  }

  if (indicatorId === 'temp_media_mensual') {
    return [];
  }

  if (indicatorId.endsWith('_anual')) {
    return [{ granularity: 'year' }];
  }
  
  if (indicatorId.endsWith('_mensual')) {
    return [
      { granularity: 'year' },
      { granularity: 'month', yearStart: y, yearEnd: y }
    ];
  }
  
  return [
    { granularity: 'year' },
    { granularity: 'month', yearStart: y, yearEnd: y },
    { granularity: 'day', yearStart: y, month: m }
  ];
}

function getChartTitle(indicatorId, state) {
  let base = formatLabel(indicatorId);
  base = base.replace(/\s+(diaria|diario|mensual|anual)$/i, '');
  
  let title = base;
  if (state.granularity === 'year') title += ' anual';
  else if (state.granularity === 'month') title += ' mensual';
  else if (state.granularity === 'day') title += ' diaria';
  else if (state.granularity === 'hour') title += ' por hora';

  if (state.month) {
    const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    title += ` (${months[state.month - 1]} ${state.yearStart})`;
  } else if (state.yearStart) {
    title += ` (${state.yearStart})`;
  }
  return title;
}

function getMonthName(monthNumber) {
  const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return months[monthNumber - 1] || "";
}

export async function openChartModal(station, data, layerContext = null) {
  _generation++;
  const myGen = _generation;
  _seriesCache.clear();

  const modal = document.getElementById("chartModal");
  const title = document.getElementById("chartModalTitle");
  const body = document.getElementById("chartModalBody");
  if (!modal || !body) return;

  let stationSelectorHtml = "";
  let availableStations = [];

  if (layerContext) {
    if (layerContext.stations) {
      availableStations = layerContext.stations;
    } else {
      try {
        const url = `/api/stations-map?variable=${layerContext.variable}${layerContext.estado ? `&estado=${layerContext.estado}` : ''}`;
        const res = await fetch(url);
        const json = await res.json();
        availableStations = (json.stations || []).filter(s => s.has_data);
        layerContext.stations = availableStations;
      } catch (err) {
        console.error("[chartModal] Error al cargar estaciones:", err);
      }
    }

    const options = availableStations.map(s => 
      `<option value="${s.codigo_nacional}" ${station && station.codigo_nacional === s.codigo_nacional ? 'selected' : ''}>${s.nombre_estacion}</option>`
    ).join("");

        stationSelectorHtml = `
      <div style="margin: 0 auto 24px auto; max-width: 450px; width: 100%; display: flex; align-items: center; gap: 12px; background: var(--bg-surface); padding: 10px 16px; border-radius: 8px; border: 1px solid var(--border-subtle); box-shadow: 0 2px 4px rgba(0,0,0,0.02); box-sizing: border-box;">
        <label style="font-weight: 700; font-size: 0.9rem; color: var(--text-primary); white-space: nowrap;">Estación:</label>
        <select id="modalStationSelect" style="flex: 1; min-width: 0; box-sizing: border-box; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border-subtle); background: var(--bg-surface-2); color: var(--text-primary); font-size: 0.9rem; font-weight: 600; cursor: pointer;">
          <option value="" disabled ${!station ? 'selected' : ''}>-- Seleccione una estación --</option>
          ${options}
        </select>
      </div>
    `;
  }

  if (!station) {
    title.textContent = `Series históricas`;
    body.style.background = "var(--bg-surface-2)";
    body.innerHTML = `
      ${stationSelectorHtml}
      <div style="display: flex; align-items: center; justify-content: center; padding: 60px 20px; text-align: center;">
        <p style="color: var(--text-tertiary); font-size: 0.9rem; max-width: 400px; line-height: 1.6;">
          ${availableStations.length === 0 
            ? "No hay estaciones con datos disponibles para esta capa." 
            : "Seleccione una estación de la lista superior para visualizar sus datos históricos."}
        </p>
      </div>
    `;
    if (!modal.open) modal.showModal();
    setupStationSelector(availableStations, layerContext);
    return;
  }

  _currentStation = station;
  _currentRanges = data.ranges || {};

  // Detectar si es un panel de múltiples variables (Calidad o Sedimentos)
  const isQuality = (layerContext && layerContext.variable.startsWith('calidad_')) || 
                    (!layerContext && data.values?.some(v => v.indicator_id.startsWith('calidad_')));
  
  const isSediments = (layerContext && layerContext.variable.startsWith('sedimentos_')) ||
                      (!layerContext && data.values?.some(v => v.indicator_id.startsWith('sedimentos_')));

  if (isQuality || isSediments) {
    let filteredValues = data.values || [];
    if (isQuality) filteredValues = filteredValues.filter(v => v.indicator_id.startsWith('calidad_'));
    if (isSediments) filteredValues = filteredValues.filter(v => v.indicator_id.startsWith('sedimentos_'));

    const latestMap = new Map();
    filteredValues.forEach(v => {
      const existing = latestMap.get(v.indicator_id);
      if (!existing || new Date(v.period_start) > new Date(existing.period_start)) {
        latestMap.set(v.indicator_id, v);
      }
    });
    const latestValues = Array.from(latestMap.values()).sort((a, b) => a.indicator_id.localeCompare(b.indicator_id));

    title.textContent = `Series históricas · ${station.nombre_estacion}`;
    
    const renderDashboard = () => {
      let html = `
        ${stationSelectorHtml}
        <div style="margin-bottom: 16px;">
          <h3 style="font-size: 1rem; font-weight: 700; margin-bottom: 8px;">Últimas mediciones</h3>
          <p style="font-size: 0.85rem; color: var(--text-tertiary); margin-bottom: 16px;">Haz clic en un parámetro para ver su serie histórica.</p>
          <table style="width: 100%; border-collapse: collapse; text-align: left; background: var(--bg-surface); border-radius: 8px; overflow: hidden; border: 1px solid var(--border-subtle);">
            <thead>
              <tr style="background: var(--bg-surface-2); border-bottom: 1px solid var(--border-subtle);">
                <th style="padding: 12px; font-weight: 700;">Parámetro</th>
                <th style="padding: 12px; font-weight: 700; text-align: right;">Valor</th>
                <th style="padding: 12px; font-weight: 700; text-align: right;">Fecha</th>
              </tr>
            </thead>
            <tbody>
      `;

      latestValues.forEach(v => {
        html += `
          <tr class="param-row" data-id="${v.indicator_id}" style="border-bottom: 1px solid var(--border-subtle); cursor: pointer; transition: background 0.2s;">
            <td style="padding: 12px; font-weight: 600;">${formatLabel(v.indicator_id)}</td>
            <td style="padding: 12px; text-align: right; font-weight: 700; color: var(--color-brand-text);">${Number(v.value).toFixed(4)} ${v.unit || ""}</td>
            <td style="padding: 12px; text-align: right; color: var(--text-tertiary);">${formatDateLabel(v.period_start, 'day')}</td>
          </tr>
        `;
      });
      
      html += `</tbody></table></div>`;
      body.innerHTML = html;

      body.querySelectorAll(".param-row").forEach(row => {
        row.addEventListener("click", (e) => {
          const indicatorId = e.currentTarget.dataset.id;
          renderChartView(indicatorId);
        });
        row.addEventListener("mouseenter", (e) => e.currentTarget.style.background = "var(--bg-surface-2)");
        row.addEventListener("mouseleave", (e) => e.currentTarget.style.background = "transparent");
      });

      setupStationSelector(availableStations, layerContext);
    };

      const renderChartView = async (indicatorId) => {
      body.innerHTML = `
        ${stationSelectorHtml}
        <div style="margin-bottom: 16px;">
          <button id="backToTableBtn" style="padding: 8px 16px; border: 1px solid var(--border-subtle); background: transparent; border-radius: 6px; cursor: pointer; font-weight: 600; color: var(--text-secondary);">← Volver a la tabla</button>
        </div>
        <!-- Cambiamos overflow-x: auto por flex-wrap: wrap para que bajen a la siguiente línea -->
        <div id="calendarStrip" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; padding-bottom: 8px; align-items: center;"></div>
        <div id="chartsGrid" style="display: flex; flex-direction: column; gap: 20px; width: 100%;"></div>
      `;

      const grid = document.getElementById("chartsGrid");
      const ind = { indicator_id: indicatorId };
      const baseState = { granularity: 'day' }; 
      const card = buildSingleCard(ind, "#3b82f6", baseState);
      grid.appendChild(card);

      const canvas = card.querySelector("canvas");
      const empty = card.querySelector(".chart-empty-msg");
      const titleEl = card.querySelector(".chart-title");
      
      const indicatorValues = data.values
        .filter(v => v.indicator_id === indicatorId)
        .sort((a, b) => new Date(a.period_start) - new Date(b.period_start));

      const unit = indicatorValues[0]?.unit || "";
      let chartInstance = null;

      const drawChart = (filterYear = null) => {
        const filtered = filterYear 
          ? indicatorValues.filter(v => new Date(v.period_start).getUTCFullYear() === filterYear)
          : indicatorValues;

        titleEl.textContent = filterYear 
          ? `${formatLabel(indicatorId)} (${filterYear})` 
          : `${formatLabel(indicatorId)} (Histórico completo)`;

        if (filtered.length === 0) {
          canvas.style.display = "none";
          empty.style.display = "flex";
          empty.innerHTML = "<div>Sin datos para este período.</div>";
          if (chartInstance) chartInstance.destroy();
          return;
        }

        canvas.style.display = "block";
        empty.style.display = "none";

        const labels = filtered.map(v => {
          const d = new Date(v.period_start);
          if (filterYear) {
            return `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
          } else {
            return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;
          }
        });
        const values = filtered.map(v => v.value);

        if (chartInstance) chartInstance.destroy();
        
        chartInstance = new Chart(canvas.getContext("2d"), {
          type: "line",
          data: {
            labels,
            datasets: [{
              label: formatLabel(indicatorId),
              data: values,
              borderColor: "#3b82f6",
              backgroundColor: hexToRgba("#3b82f6", 0.1),
              borderWidth: 2,
              pointRadius: filtered.length > 100 ? 0 : 3,
              tension: 0.3,
              fill: true,
            }]
          },
          options: buildChartOptions(unit, false, 'day', null, false, "Fecha"),
        });
        
        const state = _cardState.get(card);
        if (state) state.chart = chartInstance;
      };

      drawChart(null);

      // Renderizar el "Calendario" (tira de años + botón "Todos")
      const calendarStrip = document.getElementById("calendarStrip");
      
      // ORDENAMOS DE MENOR A MAYOR (más antiguo primero)
      const years = [...new Set(indicatorValues.map(v => new Date(v.period_start).getUTCFullYear()))].sort((a,b) => a-b);

      if (years.length > 0) {
        // Añadimos un label al principio
        const labelSpan = document.createElement("span");
        labelSpan.style.cssText = "font-size: 0.85rem; color: var(--text-tertiary); margin-right: 4px; font-weight: 600;";
        labelSpan.textContent = "Años:";
        calendarStrip.appendChild(labelSpan);

        // Botón "Todos"
        const allButton = document.createElement("button");
        allButton.className = "cal-year-btn";
        allButton.dataset.year = "all";
        allButton.textContent = "Todos";
        allButton.style.cssText = "padding: 6px 12px; border-radius: 4px; border: 1px solid var(--color-brand-text); background: var(--color-brand-text); color: white; cursor: pointer; font-weight: 600; font-size: 0.85rem;";
        calendarStrip.appendChild(allButton);

        // Botones de los años ordenados
        years.forEach(y => {
          const btn = document.createElement("button");
          btn.className = "cal-year-btn";
          btn.dataset.year = y;
          btn.textContent = y;
          btn.style.cssText = "padding: 6px 12px; border-radius: 4px; border: 1px solid var(--border-subtle); background: var(--bg-surface); cursor: pointer; font-weight: 600; font-size: 0.85rem;";
          calendarStrip.appendChild(btn);
        });

        // Listener de clics
        calendarStrip.querySelectorAll(".cal-year-btn").forEach(btn => {
          btn.addEventListener("click", () => {
            const val = btn.dataset.year;
            const y = val === "all" ? null : parseInt(val);
            
            // Actualizar estilos visuales
            calendarStrip.querySelectorAll(".cal-year-btn").forEach(b => {
              b.style.background = "var(--bg-surface)";
              b.style.color = "var(--text-primary)";
              b.style.borderColor = "var(--border-subtle)";
            });
            btn.style.background = "var(--color-brand-text)";
            btn.style.color = "white";
            btn.style.borderColor = "var(--color-brand-text)";
            
            drawChart(y);
          });
        });
      }

      document.getElementById("backToTableBtn").addEventListener("click", renderDashboard);
      setupStationSelector(availableStations, layerContext);
    };

    renderDashboard();
    if (!modal.open) modal.showModal();
    return;
  }

  // ── FLUJO NORMAL PARA CAPAS DE UNA SOLA VARIABLE (Caudal, Pozos, etc.) ──
  let values = data.values || [];
  if (layerContext) {
    values = values.filter(v => v.indicator_id === layerContext.variable);
  }

  title.textContent = `Series históricas · ${station.nombre_estacion}`;

  if (values.length === 0) {
    body.innerHTML = `
      ${stationSelectorHtml}
      <div style="display: flex; align-items: center; justify-content: center; padding: 60px 20px; text-align: center;">
        <p style="color: var(--text-tertiary); font-size: 0.9rem; max-width: 400px; line-height: 1.6;">
          No hay datos históricos disponibles para esta estación.
        </p>
      </div>
    `;
    if (!modal.open) modal.showModal();
    setupStationSelector(availableStations, layerContext);
    return;
  }

  body.style.background = "var(--bg-surface-2)";
  body.innerHTML = `
    ${stationSelectorHtml}
    <div id="chartsGrid" style="display: flex; flex-direction: column; gap: 20px; width: 100%;"></div>
  `;
  setupStationSelector(availableStations, layerContext);

  const grid = document.getElementById("chartsGrid");
  const ind = { indicator_id: layerContext ? layerContext.variable : values[0].indicator_id };
  const baseState = getCardConfigs(ind.indicator_id, _currentRanges)[0] || { granularity: 'year' };
  
  grid.appendChild(buildSingleCard(ind, CHART_COLORS[0], baseState));
  const card = grid.firstChild;
  await renderSingleChart(card);

  if (!modal.open) modal.showModal();
  if (myGen !== _generation) return;
}

function setupStationSelector(availableStations, layerContext) {
  document.getElementById("modalStationSelect")?.addEventListener("change", async (e) => {
    const codigo = e.target.value;
    if (!codigo) return;
    const selectedStation = availableStations.find(s => s.codigo_nacional === codigo);
    if (!selectedStation) return;

    document.getElementById("chartModalBody").innerHTML = `<div style="display: flex; align-items: center; justify-content: center; padding: 60px; color: var(--text-tertiary); font-weight: 600;">Cargando datos...</div>`;

    try {
      const detailsRes = await fetch(`/api/station-details?codigo=${codigo}`);
      const detailsData = await detailsRes.json();
      openChartModal(selectedStation, detailsData, layerContext);
    } catch (err) {
      console.error("[chartModal] Error al cargar detalles:", err);
    }
  });
}

function buildSingleCard(ind, color, baseState) {
  const card = document.createElement("div");
  card.dataset.chartCard = "true";
  card.style.cssText = "background: var(--bg-surface); border-radius: 8px; padding: 16px; border: 1px solid var(--border-subtle); box-shadow: 0 2px 4px rgba(0,0,0,0.02); width: 100%; box-sizing: border-box;";

  const title = getChartTitle(ind.indicator_id, baseState);

  card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <h4 class="chart-title" style="margin: 0; font-size: 0.95rem; color: var(--text-primary); font-weight: 700;">${title}</h4>
      <div style="display: flex; gap: 6px; align-items: center;">
        <button class="chart-back-btn" style="display: none; padding: 4px 8px; border: 1px solid var(--border-subtle); background: var(--bg-surface-2); border-radius: 4px; font-size: 0.70rem; cursor: pointer; color: var(--text-secondary); font-weight: 600;">← Volver</button>
        <button class="expand-btn" style="padding: 4px 8px; border: 1px solid var(--border-subtle); background: var(--bg-surface); border-radius: 4px; cursor: pointer; font-size: 1rem; color: var(--text-secondary);" title="Agrandar gráfico">⤢</button>
        <button class="download-btn" style="padding: 4px 8px; border: 1px solid var(--border-subtle); background: var(--bg-surface); border-radius: 4px; cursor: pointer; font-size: 1rem; color: var(--text-secondary);" title="Descargar gráfico">⬇</button>
      </div>
    </div>
    <div style="position: relative; height: 250px; width: 100%;">
      <canvas></canvas>
    </div>
    <div class="chart-empty-msg" style="display: none; height: 250px; align-items: center; justify-content: center; color: var(--text-tertiary); font-size: 0.80rem; text-align: center; padding: 20px;">Sin datos suficientes</div>
  `;

  _cardState.set(card, {
    indicator: ind.indicator_id,
    color: color,
    baseState: { ...baseState },
    currentState: { ...baseState },
    chart: null
  });

  const backBtn = card.querySelector(".chart-back-btn");
  backBtn.addEventListener("click", () => {
    const state = _cardState.get(card);
    state.currentState = { ...state.baseState };
    backBtn.style.display = "none";
    card.querySelector(".chart-title").textContent = getChartTitle(state.indicator, state.baseState);
    renderSingleChart(card);
  });

  card.querySelector(".expand-btn").addEventListener("click", () => {
    const state = _cardState.get(card);
    if (state.chart) openExpandModal(state.chart, card.querySelector(".chart-title").textContent, state.lastUnit || "", false, state.lastGranularity || "year");
  });

  card.querySelector(".download-btn").addEventListener("click", () => {
    const state = _cardState.get(card);
    if (state.chart) downloadChart(state.chart, card.querySelector(".chart-title").textContent);
  });

  return card;
}

function buildCombinedTempCard(presentIds, baseState) {
  const card = document.createElement("div");
  card.dataset.chartCard = "true";
  card.style.cssText = "background: var(--bg-surface); border-radius: 8px; padding: 16px; border: 1px solid var(--border-subtle); box-shadow: 0 2px 4px rgba(0,0,0,0.02); width: 100%; box-sizing: border-box;";

  const series = [
    { indicator: "temp_max_diaria", label: "Máxima", color: "#dc2626" },
    { indicator: "temp_min_diaria", label: "Mínima", color: "#1e40af" },
    { indicator: "temp_media_diaria", label: "Media", color: "#10b981" },
  ].filter((s) => presentIds.includes(s.indicator));

  const suffix = baseState.granularity === 'year' ? 'anual' : baseState.granularity === 'month' ? 'mensual' : 'diaria';
  const title = `Temperatura ${suffix}${baseState.month ? ` (${getMonthName(baseState.month)} ${baseState.yearStart})` : baseState.yearStart ? ` (${baseState.yearStart})` : ''} (máx, mín, media)`;

  card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <h4 class="chart-title" style="margin: 0; font-size: 0.95rem; color: var(--text-primary); font-weight: 700;">${title}</h4>
      <div style="display: flex; gap: 6px; align-items: center;">
        <button class="chart-back-btn" style="display: none; padding: 4px 8px; border: 1px solid var(--border-subtle); background: var(--bg-surface-2); border-radius: 4px; font-size: 0.70rem; cursor: pointer; color: var(--text-secondary); font-weight: 600;">← Volver</button>
        <button class="expand-btn" style="padding: 4px 8px; border: 1px solid var(--border-subtle); background: var(--bg-surface); border-radius: 4px; cursor: pointer; font-size: 1rem; color: var(--text-secondary);" title="Agrandar gráfico">⤢</button>
        <button class="download-btn" style="padding: 4px 8px; border: 1px solid var(--border-subtle); background: var(--bg-surface); border-radius: 4px; cursor: pointer; font-size: 1rem; color: var(--text-secondary);" title="Descargar gráfico">⬇</button>
      </div>
    </div>
    <div style="position: relative; height: 250px; width: 100%;">
      <canvas></canvas>
    </div>
    <div class="chart-empty-msg" style="display: none; height: 250px; align-items: center; justify-content: center; color: var(--text-tertiary); font-size: 0.80rem; text-align: center; padding: 20px;">Sin datos suficientes</div>
  `;

  _cardState.set(card, {
    series: series,
    baseState: { ...baseState },
    currentState: { ...baseState },
    chart: null
  });

  const backBtn = card.querySelector(".chart-back-btn");
  backBtn.addEventListener("click", () => {
    const state = _cardState.get(card);
    state.currentState = { ...state.baseState };
    backBtn.style.display = "none";
    const suffix = state.baseState.granularity === 'year' ? 'anual' : state.baseState.granularity === 'month' ? 'mensual' : 'diaria';
    card.querySelector(".chart-title").textContent = `Temperatura ${suffix}${state.baseState.month ? ` (${getMonthName(state.baseState.month)} ${state.baseState.yearStart})` : state.baseState.yearStart ? ` (${state.baseState.yearStart})` : ''} (máx, mín, media)`;
    renderCombinedChart(card);
  });

  card.querySelector(".expand-btn").addEventListener("click", () => {
    const state = _cardState.get(card);
    if (state.chart) openExpandModal(state.chart, card.querySelector(".chart-title").textContent, state.lastUnit || "°C", true, state.lastGranularity || "year");
  });

  card.querySelector(".download-btn").addEventListener("click", () => {
    const state = _cardState.get(card);
    if (state.chart) downloadChart(state.chart, card.querySelector(".chart-title").textContent);
  });

  return card;
}

function buildOscillationCard(baseState) {
  const card = document.createElement("div");
  card.dataset.chartCard = "true";
  card.style.cssText = "background: var(--bg-surface); border-radius: 8px; padding: 16px; border: 1px solid var(--border-subtle); box-shadow: 0 2px 4px rgba(0,0,0,0.02); width: 100%; box-sizing: border-box;";

  const suffix = baseState.granularity === 'year' ? 'anual' : baseState.granularity === 'month' ? 'mensual' : 'diaria';
  const title = `Oscilación térmica ${suffix}${baseState.month ? ` (${getMonthName(baseState.month)} ${baseState.yearStart})` : baseState.yearStart ? ` (${baseState.yearStart})` : ''}`;

  card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <h4 class="chart-title" style="margin: 0; font-size: 0.95rem; color: var(--text-primary); font-weight: 700;">${title}</h4>
      <div style="display: flex; gap: 6px; align-items: center;">
        <button class="chart-back-btn" style="display: none; padding: 4px 8px; border: 1px solid var(--border-subtle); background: var(--bg-surface-2); border-radius: 4px; font-size: 0.70rem; cursor: pointer; color: var(--text-secondary); font-weight: 600;">← Volver</button>
        <button class="expand-btn" style="padding: 4px 8px; border: 1px solid var(--border-subtle); background: var(--bg-surface); border-radius: 4px; cursor: pointer; font-size: 1rem; color: var(--text-secondary);" title="Agrandar gráfico">⤢</button>
        <button class="download-btn" style="padding: 4px 8px; border: 1px solid var(--border-subtle); background: var(--bg-surface); border-radius: 4px; cursor: pointer; font-size: 1rem; color: var(--text-secondary);" title="Descargar gráfico">⬇</button>
      </div>
    </div>
    <div style="position: relative; height: 250px; width: 100%;">
      <canvas></canvas>
    </div>
    <div class="chart-empty-msg" style="display: none; height: 250px; align-items: center; justify-content: center; color: var(--text-tertiary); font-size: 0.80rem; text-align: center; padding: 20px;">Sin datos suficientes</div>
  `;

  _cardState.set(card, {
    isOscillation: true,
    baseState: { ...baseState },
    currentState: { ...baseState },
    chart: null
  });

  const backBtn = card.querySelector(".chart-back-btn");
  backBtn.addEventListener("click", () => {
    const state = _cardState.get(card);
    state.currentState = { ...state.baseState };
    backBtn.style.display = "none";
    const suffix = state.baseState.granularity === 'year' ? 'anual' : state.baseState.granularity === 'month' ? 'mensual' : 'diaria';
    card.querySelector(".chart-title").textContent = `Oscilación térmica ${suffix}${state.baseState.month ? ` (${getMonthName(state.baseState.month)} ${state.baseState.yearStart})` : state.baseState.yearStart ? ` (${state.baseState.yearStart})` : ''}`;
    renderOscillationChart(card);
  });

  card.querySelector(".expand-btn").addEventListener("click", () => {
    const state = _cardState.get(card);
    if (state.chart) openExpandModal(state.chart, card.querySelector(".chart-title").textContent, state.lastUnit || "°C", false, state.lastGranularity || "year");
  });

  card.querySelector(".download-btn").addEventListener("click", () => {
    const state = _cardState.get(card);
    if (state.chart) downloadChart(state.chart, card.querySelector(".chart-title").textContent);
  });

  return card;
}

function buildHeladasCard(baseState) {
  const card = document.createElement("div");
  card.dataset.chartCard = "true";
  card.style.cssText = "background: var(--bg-surface); border-radius: 8px; padding: 16px; border: 1px solid var(--border-subtle); box-shadow: 0 2px 4px rgba(0,0,0,0.02); width: 100%; box-sizing: border-box;";

  const suffix = baseState.granularity === 'year' ? 'anuales' : baseState.granularity === 'month' ? 'mensuales' : 'diarias';
  const title = `Heladas ${suffix}${baseState.month ? ` (${getMonthName(baseState.month)} ${baseState.yearStart})` : baseState.yearStart ? ` (${baseState.yearStart})` : ''}`;

  card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <h4 class="chart-title" style="margin: 0; font-size: 0.95rem; color: var(--text-primary); font-weight: 700;">${title}</h4>
      <div style="display: flex; gap: 6px; align-items: center;">
        <button class="chart-back-btn" style="display: none; padding: 4px 8px; border: 1px solid var(--border-subtle); background: var(--bg-surface-2); border-radius: 4px; font-size: 0.70rem; cursor: pointer; color: var(--text-secondary); font-weight: 600;">← Volver</button>
        <button class="expand-btn" style="padding: 4px 8px; border: 1px solid var(--border-subtle); background: var(--bg-surface); border-radius: 4px; cursor: pointer; font-size: 1rem; color: var(--text-secondary);" title="Agrandar gráfico">⤢</button>
        <button class="download-btn" style="padding: 4px 8px; border: 1px solid var(--border-subtle); background: var(--bg-surface); border-radius: 4px; cursor: pointer; font-size: 1rem; color: var(--text-secondary);" title="Descargar gráfico">⬇</button>
      </div>
    </div>
    <div style="position: relative; height: 250px; width: 100%;">
      <canvas></canvas>
    </div>
    <div class="chart-empty-msg" style="display: none; height: 250px; align-items: center; justify-content: center; color: var(--text-tertiary); font-size: 0.80rem; text-align: center; padding: 20px;">Sin datos suficientes</div>
  `;

  _cardState.set(card, {
    isHeladas: true,
    baseState: { ...baseState },
    currentState: { ...baseState },
    chart: null
  });

  const backBtn = card.querySelector(".chart-back-btn");
  backBtn.addEventListener("click", () => {
    const state = _cardState.get(card);
    state.currentState = { ...state.baseState };
    backBtn.style.display = "none";
    const suffix = state.baseState.granularity === 'year' ? 'anuales' : state.baseState.granularity === 'month' ? 'mensuales' : 'diarias';
    card.querySelector(".chart-title").textContent = `Heladas ${suffix}${state.baseState.month ? ` (${getMonthName(state.baseState.month)} ${state.baseState.yearStart})` : state.baseState.yearStart ? ` (${state.baseState.yearStart})` : ''}`;
    renderHeladasChart(card);
  });

  card.querySelector(".expand-btn").addEventListener("click", () => {
    const state = _cardState.get(card);
    if (state.chart) openExpandModal(state.chart, card.querySelector(".chart-title").textContent, state.lastUnit || "Días", false, state.lastGranularity || "year");
  });

  card.querySelector(".download-btn").addEventListener("click", () => {
    const state = _cardState.get(card);
    if (state.chart) downloadChart(state.chart, card.querySelector(".chart-title").textContent);
  });

  return card;
}

function downloadChart(chart, title) {
  const url = chart.toBase64Image();
  const a = document.createElement('a');
  a.href = url;
  const safeTitle = title.replace(/[^a-z0-9áéíóúñ]/gi, '_').toLowerCase();
  a.download = `${safeTitle}.png`;
  a.click();
}

function openExpandModal(originalChart, title, unit, showLegend, granularity) {
  const dialog = document.createElement("dialog");
  dialog.style.cssText = `
    width: 95vw; height: 95vh; max-width: none; max-height: none; padding: 0;
    border: none; border-radius: 8px; background: var(--bg-surface);
    margin: auto; display: flex; flex-direction: column; overflow: hidden;
  `;

  dialog.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid var(--border-subtle); flex-shrink: 0;">
      <h3 style="margin: 0; font-size: 1.2rem; color: var(--text-primary); font-weight: 700;">${title}</h3>
      <button id="closeExpandBtn" style="padding: 8px 16px; border: none; border-radius: 6px; background: var(--color-brand-text); color: white; cursor: pointer; font-weight: 700;">Cerrar</button>
    </div>
    <div style="flex: 1; position: relative; width: 100%; padding: 24px; box-sizing: border-box; min-height: 0;">
      <canvas></canvas>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `dialog::backdrop { background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(3px); }`;
  dialog.appendChild(style);
  
  document.body.appendChild(dialog);
  dialog.showModal();

  const clonedData = {
    labels: [...originalChart.data.labels],
    datasets: originalChart.data.datasets.map((ds) => ({
      label: ds.label, data: [...ds.data], borderColor: ds.borderColor,
      backgroundColor: ds.backgroundColor, borderWidth: ds.borderWidth,
      pointRadius: ds.pointRadius, pointHoverRadius: ds.pointHoverRadius,
      tension: ds.tension, fill: ds.fill, spanGaps: ds.spanGaps,
      borderDash: ds.borderDash, borderRadius: ds.borderRadius,
    })),
  };

  const newCtx = dialog.querySelector("canvas").getContext("2d");
  new Chart(newCtx, {
    type: originalChart.config.type,
    data: clonedData,
    options: buildChartOptions(unit || "", showLegend, granularity, null, originalChart.config.type === 'bar'),
  });

  dialog.querySelector("#closeExpandBtn").onclick = () => {
    dialog.close();
    dialog.remove();
  };

  dialog.addEventListener("close", () => dialog.remove());
}

async function renderSingleChart(card) {
  const state = _cardState.get(card);
  if (!state) return;

  const canvas = card.querySelector("canvas");
  const empty = card.querySelector(".chart-empty-msg");
  const titleEl = card.querySelector(".chart-title");
  const { indicator, color, currentState } = state;

  try {
    const data = await fetchSeriesCached(_currentStation.codigo_nacional, indicator, currentState);
    if (!document.body.contains(card)) return;

    const points = data.points || [];
    
    if (points.length === 1) {
      // Mostrar valor único en lugar de ocultar la tarjeta
      card.style.display = "";
      canvas.style.display = "none";
      empty.style.display = "flex";
      empty.innerHTML = `
        <div>
          <span style="display: block; font-size: 0.9rem; margin-bottom: 8px;">Último registro:</span>
          <strong style="font-size: 1.4rem; color: var(--text-primary);">${points[0].value} ${data.unit || ""}</strong>
          <span style="display: block; margin-top: 8px; font-size: 0.8rem;">${formatDateLabel(points[0].date, currentState.granularity)}</span>
        </div>
      `;
      if (state.chart) { try { state.chart.destroy(); } catch (_) {} state.chart = null; }
      return;
    }

    if (points.length === 0) {
      if (state.currentState.granularity !== state.baseState.granularity || state.currentState.month !== state.baseState.month || state.currentState.yearStart !== state.baseState.yearStart) {
        state.currentState = { ...state.baseState };
        titleEl.textContent = getChartTitle(indicator, state.baseState);
        card.querySelector(".chart-back-btn").style.display = "none";
        renderSingleChart(card);
        return;
      } else {
        card.style.display = "none";
        return;
      }
    }

    card.style.display = "";
    canvas.style.display = "block";
    empty.style.display = "none";

    if (state.chart) { state.chart.destroy(); state.chart = null; }

    const labels = points.map((p) => formatDateLabel(p.date, currentState.granularity));
    const values = points.map((p) => p.value);

    state.chart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: formatLabel(indicator), data: values,
          borderColor: color, backgroundColor: hexToRgba(color, 0.1),
          borderWidth: 2, pointRadius: points.length > 100 ? 0 : 3,
          tension: 0.3, fill: true,
        }],
      },
      options: buildChartOptions(data.unit || "", false, currentState.granularity, (label) => {
        const next = computeNextState(currentState, label);
        if (!next) return;
        state.currentState = next;
        card.querySelector(".chart-back-btn").style.display = "inline-block";
        titleEl.textContent = getChartTitle(indicator, next);
        renderSingleChart(card);
      }),
    });
    state.lastUnit = data.unit || "";
    state.lastGranularity = currentState.granularity;
  } catch (err) {
    console.error("[chartModal] Error:", err);
    card.style.display = "none";
  }
}

async function renderCombinedChart(card) {
  const state = _cardState.get(card);
  if (!state) return;

  const canvas = card.querySelector("canvas");
  const empty = card.querySelector(".chart-empty-msg");
  const titleEl = card.querySelector(".chart-title");
  const { series, currentState } = state;

  try {
    const results = await Promise.all(
      series.map(async (s) => {
        const data = await fetchSeriesCached(_currentStation.codigo_nacional, s.indicator, currentState);
        return { ...s, points: data.points || [], unit: data.unit || "°C" };
      })
    );
    if (!document.body.contains(card)) return;

    const reference = results.reduce((longest, r) => (r.points.length > longest.points.length ? r : longest), results[0]);

    if (reference.points.length < 2) {
      if (state.currentState.granularity !== state.baseState.granularity || state.currentState.month !== state.baseState.month || state.currentState.yearStart !== state.baseState.yearStart) {
        state.currentState = { ...state.baseState };
        const suffix = state.baseState.granularity === 'year' ? 'anual' : state.baseState.granularity === 'month' ? 'mensual' : 'diaria';
        titleEl.textContent = `Temperatura ${suffix}${state.baseState.month ? ` (${getMonthName(state.baseState.month)} ${state.baseState.yearStart})` : state.baseState.yearStart ? ` (${state.baseState.yearStart})` : ''} (máx, mín, media)`;
        card.querySelector(".chart-back-btn").style.display = "none";
        renderCombinedChart(card);
        return;
      } else {
        card.style.display = "none";
        return;
      }
    }

    card.style.display = "";
    canvas.style.display = "block";
    empty.style.display = "none";

    if (state.chart) { state.chart.destroy(); state.chart = null; }

    const labels = reference.points.map((p) => formatDateLabel(p.date, currentState.granularity));
    const datasets = results.map((r) => {
      const dateToValue = new Map(r.points.map((p) => [p.date, p.value]));
      const data = reference.points.map((p) => dateToValue.get(p.date) ?? null);
      return {
        label: r.label, data,
        borderColor: r.color, backgroundColor: hexToRgba(r.color, 0.05),
        borderWidth: 2, pointRadius: 0, tension: 0.3, fill: false, spanGaps: true,
      };
    });

    state.chart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: { labels, datasets },
      options: buildChartOptions(reference.unit || "°C", true, currentState.granularity, (label) => {
        const next = computeNextState(currentState, label);
        if (!next) return;
        state.currentState = next;
        card.querySelector(".chart-back-btn").style.display = "inline-block";
        const suffix = next.granularity === 'year' ? 'anual' : next.granularity === 'month' ? 'mensual' : 'diaria';
        titleEl.textContent = `Temperatura ${suffix}${next.month ? ` (${getMonthName(next.month)} ${next.yearStart})` : next.yearStart ? ` (${next.yearStart})` : ''} (máx, mín, media)`;
        renderCombinedChart(card);
      }),
    });
    state.lastUnit = reference.unit || "°C";
    state.lastGranularity = currentState.granularity;
  } catch (err) {
    console.error("[chartModal] Error combined:", err);
    card.style.display = "none";
  }
}

async function renderOscillationChart(card) {
  const state = _cardState.get(card);
  if (!state) return;

  const canvas = card.querySelector("canvas");
  const empty = card.querySelector(".chart-empty-msg");
  const titleEl = card.querySelector(".chart-title");
  const { currentState } = state;

  try {
    const [maxData, minData] = await Promise.all([
      fetchSeriesCached(_currentStation.codigo_nacional, 'temp_max_diaria', currentState),
      fetchSeriesCached(_currentStation.codigo_nacional, 'temp_min_diaria', currentState)
    ]);
    
    if (!document.body.contains(card)) return;

    const maxPoints = maxData.points || [];
    const minPoints = minData.points || [];
    const minMap = new Map(minPoints.map(p => [p.date, p.value]));

    const oscPoints = [];
    for (const p of maxPoints) {
      if (minMap.has(p.date)) {
        oscPoints.push({ date: p.date, value: p.value - minMap.get(p.date) });
      }
    }

    if (oscPoints.length < 2) {
      if (state.currentState.granularity !== state.baseState.granularity || state.currentState.month !== state.baseState.month || state.currentState.yearStart !== state.baseState.yearStart) {
        state.currentState = { ...state.baseState };
        const suffix = state.baseState.granularity === 'year' ? 'anual' : state.baseState.granularity === 'month' ? 'mensual' : 'diaria';
        titleEl.textContent = `Oscilación térmica ${suffix}${state.baseState.month ? ` (${getMonthName(state.baseState.month)} ${state.baseState.yearStart})` : state.baseState.yearStart ? ` (${state.baseState.yearStart})` : ''}`;
        card.querySelector(".chart-back-btn").style.display = "none";
        renderOscillationChart(card);
        return;
      } else {
        card.style.display = "none";
        return;
      }
    }

    card.style.display = "";
    canvas.style.display = "block";
    empty.style.display = "none";

    if (state.chart) { state.chart.destroy(); state.chart = null; }

    const labels = oscPoints.map((p) => formatDateLabel(p.date, currentState.granularity));
    const values = oscPoints.map((p) => p.value);
    const color = "#8b5cf6";

    state.chart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Oscilación (máx - mín)",
          data: values,
          borderColor: color,
          backgroundColor: hexToRgba(color, 0.1),
          borderWidth: 2,
          pointRadius: oscPoints.length > 100 ? 0 : 3,
          tension: 0.3,
          fill: true,
        }],
      },
      options: buildChartOptions("°C", false, currentState.granularity, (label) => {
        const next = computeNextState(currentState, label);
        if (!next) return;
        state.currentState = next;
        card.querySelector(".chart-back-btn").style.display = "inline-block";
        const suffix = next.granularity === 'year' ? 'anual' : next.granularity === 'month' ? 'mensual' : 'diaria';
        titleEl.textContent = `Oscilación térmica ${suffix}${next.month ? ` (${getMonthName(next.month)} ${next.yearStart})` : next.yearStart ? ` (${next.yearStart})` : ''}`;
        renderOscillationChart(card);
      }),
    });
    state.lastUnit = "°C";
    state.lastGranularity = currentState.granularity;
  } catch (err) {
    console.error("[chartModal] Error oscillation:", err);
    card.style.display = "none";
  }
}

async function renderHeladasChart(card) {
  const state = _cardState.get(card);
  if (!state) return;

  const canvas = card.querySelector("canvas");
  const empty = card.querySelector(".chart-empty-msg");
  const titleEl = card.querySelector(".chart-title");
  const { currentState } = state;

  try {
    const fetchState = { ...currentState, granularity: 'day' };
    if (currentState.granularity === 'year') {
      fetchState.yearStart = null;
      fetchState.yearEnd = null;
    }

    const data = await fetchSeriesCached(_currentStation.codigo_nacional, 'temp_min_diaria', fetchState);
    if (!document.body.contains(card)) return;

    const points = data.points || [];
    if (points.length === 0) {
      card.style.display = "none";
      return;
    }

    let labels = [];
    let values = [];
    let yAxisTitle = "Días con heladas";
    let isBar = true;

    if (currentState.granularity === 'year') {
      const yearMap = new Map();
      points.forEach(p => {
        const y = new Date(p.date).getUTCFullYear();
        if (!yearMap.has(y)) yearMap.set(y, 0);
        if (p.value <= 0) yearMap.set(y, yearMap.get(y) + 1);
      });
      labels = Array.from(yearMap.keys()).sort().map(String);
      values = labels.map(y => yearMap.get(parseInt(y)));
    } else if (currentState.granularity === 'month') {
      const monthMap = new Map();
      points.forEach(p => {
        const m = new Date(p.date).getUTCMonth();
        if (!monthMap.has(m)) monthMap.set(m, 0);
        if (p.value <= 0) monthMap.set(m, monthMap.get(m) + 1);
      });
      const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
      labels = Array.from(monthMap.keys()).sort((a,b)=>a-b).map(m => months[m]);
      values = labels.map((_, i) => monthMap.get(i) || 0);
    } else {
      labels = points.map(p => formatDateLabel(p.date, 'day'));
      values = points.map(p => p.value);
      yAxisTitle = "°C";
      isBar = false;
    }

    card.style.display = "";
    canvas.style.display = "block";
    empty.style.display = "none";

    if (state.chart) { state.chart.destroy(); state.chart = null; }

    const color = "#06b6d4";

    const datasets = [{
      label: isBar ? "Días con heladas" : "Temp. mínima",
      data: values,
      backgroundColor: isBar ? hexToRgba(color, 0.6) : hexToRgba(color, 0.1),
      borderColor: color,
      borderWidth: 2,
      borderRadius: isBar ? 4 : 0,
      pointRadius: isBar ? 0 : (values.length > 100 ? 0 : 3),
      tension: 0.3,
      fill: !isBar,
    }];

    if (!isBar) {
      datasets.push({
        label: "Umbral de helada (0°C)",
        data: labels.map(() => 0),
        borderColor: "#ef4444",
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
      });
    }

    state.chart = new Chart(canvas.getContext("2d"), {
      type: isBar ? "bar" : "line",
      data: { labels, datasets },
      options: buildChartOptions(yAxisTitle, !isBar, currentState.granularity, (label) => {
        const next = computeNextState(currentState, label);
        if (!next) return;
        state.currentState = next;
        card.querySelector(".chart-back-btn").style.display = "inline-block";
        const suffix = next.granularity === 'year' ? 'anuales' : next.granularity === 'month' ? 'mensuales' : 'diarias';
        titleEl.textContent = `Heladas ${suffix}${next.month ? ` (${getMonthName(next.month)} ${next.yearStart})` : next.yearStart ? ` (${next.yearStart})` : ''}`;
        renderHeladasChart(card);
      }, isBar),
    });
    state.lastUnit = yAxisTitle;
    state.lastGranularity = currentState.granularity;
  } catch (err) {
    console.error("[chartModal] Error heladas:", err);
    card.style.display = "none";
  }
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
  return null; // No bajamos a "hour" desde aquí
}

function cleanupEmptySections() {
  const headers = document.querySelectorAll("[data-category-header='true']");
  headers.forEach((header) => {
    let hasVisibleCard = false;
    let el = header.nextElementSibling;
    while (el && el.dataset.categoryHeader === undefined) {
      if (el.dataset.chartCard && el.style.display !== "none") {
        hasVisibleCard = true;
        break;
      }
      el = el.nextElementSibling;
    }
    header.style.display = hasVisibleCard ? "" : "none";
  });
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

function buildChartOptions(unit, showLegend, granularity, onClickLabel, beginAtZero = false, xTitleOverride = null) {
  const xTitles = { year: "Año", month: "Mes", day: "Día", hour: "Hora" };
  const xAxisTitle = xTitleOverride !== null ? xTitleOverride : (xTitles[granularity] || "");

  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    onClick: onClickLabel ? (event, elements) => {
      if (elements.length === 0) return;
      const idx = elements[0].index;
      const chart = elements[0].element.$context.chart;
      onClickLabel(chart.data.labels[idx]);
    } : undefined,
    onHover: onClickLabel ? (event, elements) => {
      event.native.target.style.cursor = elements.length > 0 ? "pointer" : "default";
    } : undefined,
    plugins: {
      legend: { display: showLegend, position: "bottom", labels: { boxWidth: 12, boxHeight: 12, font: { size: 12, weight: "bold" }, padding: 12 } },
      tooltip: {
        enabled: true,
        backgroundColor: "rgba(0,0,0,0.85)",
        titleFont: { size: 14, weight: "bold" },
        bodyFont: { size: 13, weight: "bold" },
        padding: 10,
        displayColors: showLegend,
        callbacks: { label: (ctx) => `${ctx.dataset.label ? ctx.dataset.label + ": " : ""}${ctx.parsed.y} ${unit}` },
      },
    },
    scales: {
      y: { 
        beginAtZero: beginAtZero,
        title: { display: true, text: unit, font: { size: 12, weight: "bold" } }, 
        grid: { color: "rgba(0,0,0,0.05)" }, 
        ticks: { font: { size: 11, weight: "bold" } } 
      },
      x: { 
        title: { display: true, text: xAxisTitle, font: { size: 12, weight: "bold" } }, 
        ticks: { 
          maxTicksLimit: 12, 
          font: { size: 10, weight: "bold" },
          maxRotation: 45,
          minRotation: 45
        }, 
        grid: { display: false } 
      },
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

  modal.addEventListener("close", () => {
    _generation++;
    _seriesCache.clear();
  });

  if (close) {
    close.addEventListener("click", () => modal.close());
  }
}