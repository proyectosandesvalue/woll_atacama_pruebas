/**
 * Utilidades para el mapa dinámico de estaciones.
 *
 * Soporta múltiples capas activas simultáneamente (una por variable).
 * Cada capa es independiente y puede tener su propia fecha histórica.
 */

// ── Configuración de variables ─────────────────────────────

export const VARIABLES = {
  // ── Online (DGAC / Agromet / RedMeteo) ──
  temp_avg:   { label: "Temperatura actual",   unit: "°C",     scale: [[0, "#1e40af"], [20, "#fbbf24"], [40, "#dc2626"]] },
  temp_max:   { label: "Temperatura máxima",  unit: "°C",     scale: [[0, "#1e40af"], [20, "#fbbf24"], [40, "#dc2626"]] },
  temp_min:   { label: "Temperatura mínima",  unit: "°C",     scale: [[-10, "#1e40af"], [10, "#fbbf24"], [30, "#dc2626"]] },
  humedad:    { label: "Humedad",             unit: "%",      scale: [[0, "#f59e0b"], [100, "#3b82f6"]] },
  radiacion:  { label: "Radiación solar",     unit: "W/m2",   scale: [[0, "#1e3a8a"], [1000, "#fbbf24"]] },
  precip:     { label: "Precipitación",       unit: "mm",     scale: [[0, "#10b981"], [50, "#2563eb"]] },
  viento_vel: { label: "Velocidad del viento", unit: "km/h",   scale: [[0, "#10b981"], [75, "#dc2626"]] },
  viento_dir: { label: "Dirección del viento", unit: "°",      scale: [[0, "#10b981"], [360, "#3b82f6"]] },
  uvb_max:    { label: "Índice UVB",          unit: "índice", scale: [[0, "#10b981"], [11, "#dc2626"]] },
  presion:    { label: "Presión atmosférica", unit: "hPa",    scale: [[980, "#10b981"], [1020, "#3b82f6"]] },

  // ── Históricas DGA: clima ──
  temp_min_diaria:    { label: "Temperatura mínima del día",       unit: "°C",  scale: [[-10, "#1e40af"], [10, "#fbbf24"], [30, "#dc2626"]] },
  temp_max_diaria:    { label: "Temperatura máxima del día",       unit: "°C",  scale: [[0, "#1e40af"], [20, "#fbbf24"], [40, "#dc2626"]] },
  temp_media_diaria:  { label: "Temperatura media del día",        unit: "°C",  scale: [[0, "#1e40af"], [20, "#fbbf24"], [40, "#dc2626"]] },
  temp_media_mensual: { label: "Temperatura media del mes",        unit: "°C",  scale: [[0, "#1e40af"], [20, "#fbbf24"], [40, "#dc2626"]] },
  precip_diaria:      { label: "Precipitación acumulada del día",  unit: "mm",  scale: [[0, "#fef3c7"], [50, "#1e40af"]] },
  precip_mensual:     { label: "Precipitación acumulada del mes",  unit: "mm",  scale: [[0, "#fef3c7"], [200, "#1e40af"]] },
  precip_max_anual:   { label: "Precipitación máxima 24h del año", unit: "mm",  scale: [[0, "#fef3c7"], [100, "#1e40af"]] },

  // ── Históricas DGA: hidrología ──
  caudal_diario:        { label: "Caudal medio del día",            unit: "m³/s", scale: [[0, "#e0f2fe"], [50, "#0369a1"]] },
  caudal_mensual:       { label: "Caudal medio del mes",            unit: "m³/s", scale: [[0, "#e0f2fe"], [50, "#0369a1"]] },
  sedimentos_integrado: { label: "Sedimentos (muestreo integrado)", unit: "mg/L", scale: [[0, "#fef9c3"], [500, "#a16207"]] },
  sedimentos_rutinario: { label: "Sedimentos (muestreo rutinario)", unit: "mg/L", scale: [[0, "#fef9c3"], [500, "#a16207"]] },
  nivel_estatico_pozo:  { label: "Nivel estático del pozo",         unit: "m",    scale: [[0, "#dcfce7"], [100, "#14532d"]] },

  arclim_riesgo_calor: {
    label: "Días Calurosos (>30°C)",
    unit: "días",
    scale: [
      [0, "#ffffcc"],
      [2, "#ffeda0"],
      [5, "#feb24c"],
      [10, "#f03b20"],
      [20, "#bd0026"],
      [40, "#800026"]
    ],
  }
};

// ── Helpers ────────────────────────────────────────────────

function getVariableConfig(indicatorId, fallbackUnit) {
  if (VARIABLES[indicatorId]) return VARIABLES[indicatorId];

  if (indicatorId && indicatorId.startsWith("calidad_")) {
    let name = indicatorId
      .replace(/^calidad_/, "")
      .replace(/_total$/, " (total)")
      .replace(/_disuelto$/, " (disuelto)")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    name = name
      .replace(/^Arsenico/, "Arsénico")
      .replace(/^Silice/, "Sílice")
      .replace(/^Ph$/, "pH");
    return { label: name, unit: fallbackUnit || "mg/L", scale: [] };
  }

  return { label: indicatorId || "—", unit: fallbackUnit || "", scale: [] };
}

function formatPeriod(periodStart, indicatorId) {
  if (!periodStart) return "—";
  const d = new Date(periodStart);
  if (isNaN(d)) return String(periodStart).slice(0, 10);

  const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  if (indicatorId && indicatorId.endsWith("_anual")) return String(d.getUTCFullYear());
  if (indicatorId && indicatorId.endsWith("_mensual")) return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${d.getUTCFullYear()}`;
}

function getTooltip(indicatorId) {
  const tooltips = {
    precip_diaria: "Suma acumulada de lluvia en 24 horas",
    precip_mensual: "Suma acumulada de lluvia durante el mes",
    precip_max_anual: "Máxima precipitación en 24h registrada en el año",
    caudal_diario: "Promedio de los caudales medidos durante el día",
    caudal_mensual: "Promedio de los caudales medios diarios del mes",
    temp_media_diaria: "Promedio de las temperaturas del día",
    temp_media_mensual: "Promedio de las temperaturas medias diarias del mes",
    nivel_estatico_pozo: "Lectura puntual del nivel del agua en el pozo",
  };
  return tooltips[indicatorId] || "";
}

// ── Estado global multi-capa ───────────────────────────────

/** Map<layerId, { layer: L.GeoJSON, variable, date, estado }> */
const _layers = new Map();

let legendObserver = null;

// ── API pública de estado ──────────────────────────────────

export function getActiveLayers() {
  return Array.from(_layers.entries()).map(([layerId, data]) => ({
    layerId,
    variable: data.variable,
    date: data.date,
    estado: data.estado,
  }));
}

export function getVariableAvailability(variable) {
  return fetch(`/api/variable-availability?variable=${variable}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}

// ── Carga de capas ─────────────────────────────────────────

export async function loadLayer(layerId, variable, map, options = {}) {
  if (!map) return;

  const { date = null, estado = null } = options;

  try {
    const params = new URLSearchParams({ variable });
    if (date) params.set("date", date);
    if (estado) params.set("estado", estado);

    const res = await fetch(`/api/stations-map?${params.toString()}`);
    if (!res.ok) {
      clearLayer(layerId, map);
      return;
    }

    const json = await res.json();
    const stations = json.stations || [];
    if (stations.length === 0) {
      clearLayer(layerId, map);
      return;
    }

    const activeStations = stations.filter(
      (s) => s.has_data && s.value !== null && s.value !== undefined
    );
    if (activeStations.length === 0) {
      clearLayer(layerId, map);
      return;
    }

    const features = activeStations.map((s) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.longitud, s.latitud] },
      properties: s,
    }));

    const geojson = { type: "FeatureCollection", features };
    const config = getVariableConfig(variable);

    // Remover capa anterior si existía
    if (_layers.has(layerId)) {
      map.removeLayer(_layers.get(layerId).layer);
    }

    const layer = L.geoJSON(geojson, {
      pointToLayer: (feature, latlng) => {
        const s = feature.properties;
        const color = getColorFromScale(s.value, config.scale);

        const marker = L.circleMarker(latlng, {
          radius: 8,
          fillColor: color,
          color: "#fff",
          weight: 2,
          fillOpacity: 0.9,
        });

        let displayValue = s.value;
        let displayUnit = s.unit || config.unit;
        if (variable === "viento_dir") {
          displayValue = Math.round(s.value);
          displayUnit = "°";
        } else if (variable === "viento_vel") {
          displayValue = (s.value * 1.852).toFixed(1);
        } else {
          displayValue = Number(s.value).toFixed(1);
        }

        let tooltipText = `${displayValue} ${displayUnit}`;
        if (s.dias_diferencia && s.dias_diferencia > 0) {
          tooltipText += ` (hace ${s.dias_diferencia}d)`;
        }

        marker.bindTooltip(tooltipText, {
          permanent: true,
          direction: "top",
          className: "station-label",
          offset: [0, -10],
        });

        marker.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          openStationSidebar(s);
        });

        return marker;
      },
    }).addTo(map);

    _layers.set(layerId, { layer, variable, date, estado });
    setupLegendObserver();
    updateLegend();

    return stations;
  } catch (err) {
    console.error(`[stations] Error al cargar ${layerId}:`, err);
  }
}

export function clearLayer(layerId, map) {
  if (_layers.has(layerId)) {
    map.removeLayer(_layers.get(layerId).layer);
    _layers.delete(layerId);
    updateLegend();
  }

  // Cerrar sidebar si estaba abierto
  const sidebar = document.getElementById("sidebarInfo");
  if (sidebar) sidebar.classList.remove("active");
}

// ── Leyenda multi-capa ─────────────────────────────────────

function setupLegendObserver() {
  if (legendObserver) return;
  const legendContainer = document.getElementById("sidebar-legend");
  if (!legendContainer) return;

  legendObserver = new MutationObserver(() => {
    if (_layers.size > 0 && !document.getElementById("station-legend-block")) {
      setTimeout(updateLegend, 0);
    }
  });
  legendObserver.observe(legendContainer, { childList: true });
}

export function updateLegend() {
  const legendContainer = document.getElementById("sidebar-legend");
  if (!legendContainer) return;

  const existing = document.getElementById("station-legend-block");
  if (existing) existing.remove();

  if (_layers.size === 0) return;

  const block = document.createElement("div");
  block.id = "station-legend-block";
  block.className = "legend-section";
  block.style.cssText = "display: flex; flex-direction: column; gap: 12px;";

  _layers.forEach(({ variable, date }) => {
    const config = getVariableConfig(variable);
    if (!config) return;

    const layerBlock = document.createElement("div");

    if (!config.scale || config.scale.length === 0) {
      layerBlock.innerHTML = `<div class="legend-title">${config.label}${date ? ` · ${date}` : ""}</div>`;
    } else {
      const min = config.scale[0][0];
      const max = config.scale[config.scale.length - 1][0];
      const range = max - min || 1;
      const gradientStops = config.scale.map((s) => {
        const percent = ((s[0] - min) / range) * 100;
        return `${s[1]} ${percent}%`;
      }).join(", ");
      const labels = config.scale.map((s) => `<span>${s[0]}</span>`).join("");
      layerBlock.innerHTML = `
        <div class="legend-title">${config.label}${date ? ` · ${date}` : ""}</div>
        <div class="legend-gradient-bar" style="background: linear-gradient(to right, ${gradientStops});"></div>
        <div class="bar-label">${labels}</div>
      `;
    }
    block.appendChild(layerBlock);
  });

  legendContainer.appendChild(block);
}

// ── Panel de info con botón de gráficos ────────────────────

async function openStationSidebar(station) {
  const sidebar = document.getElementById("sidebarInfo");
  const title = document.getElementById("sidebarInfoTitle");
  const content = document.getElementById("sidebarInfoContent");

  if (!sidebar || !title || !content) return;

  title.innerHTML = `<span class="material-symbols-outlined" style="font-size: 18px;">info</span> ${station.nombre_estacion}`;
  content.innerHTML = `<div class="custom-popup"><em>Cargando datos...</em></div>`;
  sidebar.classList.add("active");

  const TIPOS = {
    "Automática": "Automática (EMA) · Reporta en tiempo real",
    "Convencional": "Convencional · Datos observados manualmente",
    "Mixta": "Mixta · Instrumentos automáticos y observación manual",
  };
  const tipoTexto = TIPOS[station.tipo_estacion] || station.tipo_estacion;

  try {
    const res = await fetch(`/api/station-details?codigo=${station.codigo_nacional}`);
    const data = await res.json();

    let displayValues = data.values || [];
    const activeLayers = getActiveLayers();
    
    if (activeLayers.length > 0) {
      const activeVars = activeLayers.map(l => l.variable);
      const isQualityActive = activeVars.some(v => v && v.startsWith('calidad_'));
      
      if (isQualityActive) {
        displayValues = displayValues.filter(v => v.indicator_id.startsWith('calidad_'));
      } else {
        const specificVar = activeVars[0];
        if (specificVar) displayValues = displayValues.filter(v => v.indicator_id === specificVar);
      }
    }

    const latestValuesMap = new Map();
    displayValues.forEach(v => {
      const existing = latestValuesMap.get(v.indicator_id);
      if (!existing || new Date(v.period_start) > new Date(existing.period_start)) {
        latestValuesMap.set(v.indicator_id, v);
      }
    });
    displayValues = Array.from(latestValuesMap.values());

    if (!displayValues || displayValues.length === 0) {
      content.innerHTML = `
        <div class="custom-popup">
          <p><strong>${station.comuna} · ${tipoTexto}</strong></p>
          <p style="margin-top: 15px; padding: 10px; background: var(--bg-surface-2); border-left: 3px solid var(--color-warning); border-radius: 4px;">
            <em>No hay datos disponibles para esta capa en esta estación.</em>
          </p>
        </div>
      `;
      return;
    }

    // 1. Calcular fechas y hora máxima
    let fechaMin = null, fechaMax = null;
    let horaMax = null;

    displayValues.forEach((v) => {
      if (!v.period_start) return;
      if (!fechaMin || v.period_start < fechaMin) fechaMin = v.period_start;
      if (!fechaMax || v.period_start > fechaMax) {
        fechaMax = v.period_start;
        const d = new Date(v.period_start);
        if (!isNaN(d)) {
          horaMax = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
        }
      }
    });

    // 2. Determinar si es histórica (DGA) u online
    const codigo = station.codigo_nacional || "";
    const propietario = station.propietario || "";
    const esDGA = propietario.includes("DGA") || propietario.includes("Dirección General de Aguas") || codigo.startsWith("0");

    // 3. Textos dinámicos
    const rangoTexto = esDGA
      ? (fechaMin && fechaMax ? `Data Histórica desde: ${formatPeriod(fechaMin)}` : "—")
      : "Datos en tiempo real";

    const ultimaActualizacion = (!esDGA && horaMax)
      ? `${formatPeriod(fechaMax)} a las ${horaMax} hrs`
      : formatPeriod(fechaMax);

    // 4. Construir tabla (solo con los últimos valores)
    let html = `<div class="custom-popup">
      <p><strong>${station.comuna} · ${tipoTexto}</strong></p>
      <table style="width: 100%; border-collapse: collapse; font-size: 0.85em; margin-top: 10px;">
        <thead>
          <tr style="border-bottom: 1px solid var(--border-subtle); text-align: left; color: var(--text-secondary);">
            <th style="padding: 6px 0;">Variable</th>
            <th style="padding: 6px 0; text-align: right;">Valor</th>
            <th style="padding: 6px 0; text-align: right;">Período</th>
          </tr>
        </thead>
        <tbody>`;

    displayValues.forEach((v) => {
      const conf = getVariableConfig(v.indicator_id, v.unit);
      let val = v.value;
      let displayUnit = conf.unit || v.unit;

      if (v.indicator_id === "viento_vel") val = (val * 1.852).toFixed(1);
      else if (v.indicator_id === "viento_dir") { val = Math.round(val); displayUnit = "°"; }
      else val = Number(val).toFixed(3);

      const periodo = formatPeriod(v.period_start, v.indicator_id);
      const tooltip = getTooltip(v.indicator_id);

      html += `<tr style="border-bottom: 1px solid var(--border-subtle);">
        <td style="padding: 8px 0; color: var(--text-secondary);" title="${tooltip}">${conf.label}</td>
        <td style="padding: 8px 0; text-align: right; font-weight: 600; color: var(--text-primary);">
          ${val} <span style="font-weight: normal; color: var(--text-tertiary);">${displayUnit}</span>
        </td>
        <td style="padding: 8px 0; text-align: right; color: var(--text-tertiary); font-size: 0.9em;">${periodo}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;

    // 5. Botón "Ver serie histórica"
    if (esDGA && displayValues.length > 0) {
      html += `
        <button id="openChartBtn" class="btn btn-primary" style="margin-top: 15px; width: 100%; padding: 8px; border-radius: 4px; border: none; background: var(--color-brand-text); color: white; cursor: pointer; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 6px;">
          <span class="material-symbols-outlined" style="font-size: 18px;">show_chart</span>
          Ver serie histórica
        </button>
      `;
    }

    // 6. Fuente dinámica (se mantiene igual)
    let fuenteHtml = "";
    if (codigo.startsWith("RMCL")) {
      const fechaConsulta = new Date().toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" });
      fuenteHtml = `<p style="margin: 0; font-size: 0.70rem; line-height: 1.4; text-align: left; color: var(--text-tertiary);">
        <strong>Fuente:</strong> Red Meteorológica Aficionada de Chile. (2019). Consultado el ${fechaConsulta}, desde <a href="https://www.redmeteo.cl/" target="_blank" style="color: var(--color-brand-text); text-decoration: none;">www.redmeteo.cl</a>
      </p>`;
    } else if (codigo.startsWith("AGROMET_") || propietario.includes("FDF") || propietario.includes("INIA") || propietario.includes("CAEZA")) {
      fuenteHtml = `<p style="margin: 0; font-size: 0.70rem; line-height: 1.4; text-align: left; color: var(--text-tertiary);">
        <strong>Fuente:</strong> Red Agroclimática Nacional (AGROMET). <a href="https://www.agromet.cl" target="_blank" style="color: var(--color-brand-text); text-decoration: none;">www.agromet.cl</a>
      </p>`;
    } else if (propietario.includes("DGA") || propietario.includes("Dirección General de Aguas")) {
      fuenteHtml = `<p style="margin: 0; font-size: 0.70rem; line-height: 1.4; text-align: left; color: var(--text-tertiary);">
        <strong>Fuente:</strong> Dirección General de Aguas (DGA). <a href="https://dga.mop.gob.cl/estadisticas-estaciones-dga/" target="_blank" style="color: var(--color-brand-text); text-decoration: none;">dga.mop.gob.cl</a>
      </p>`;
    } else {
      fuenteHtml = `<p style="margin: 0;">Fuente: Dirección Meteorológica de Chile (<a href="https://climatologia.meteochile.gob.cl/" target="_blank" style="color: var(--color-brand-text); text-decoration: none;">meteochile.gob.cl</a>)</p>`;
    }

    // 7. Pie de página
    html += `
      <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--border-subtle); font-size: 0.75rem; color: var(--text-tertiary); text-align: center;">
        <p style="margin: 0 0 6px 0;">${rangoTexto}</p>
        <p style="margin: 0 0 8px 0;">Última actualización: <strong>${ultimaActualizacion}</strong></p>
        ${fuenteHtml}
      </div>`;

    content.innerHTML = html;

    // 8. Listener del botón de gráficos
    const chartBtn = document.getElementById("openChartBtn");
    if (chartBtn) {
      chartBtn.addEventListener("click", async () => {
        try {
          const { openChartModal } = await import("./chartModal.js");
          openChartModal(station, data, null);
        } catch (err) {
          console.error("[stations] Error al abrir el modal de gráficos:", err);
        }
      });
    }
  } catch (err) {
    content.innerHTML = `<div class="custom-popup"><p>Error al cargar datos.</p></div>`;
  }
}

// ── Utilidades de color ────────────────────────────────────

function getColorFromScale(value, scale) {
  if (!scale || scale.length === 0) return "#9ca3af";
  if (value <= scale[0][0]) return scale[0][1];
  if (value >= scale[scale.length - 1][0]) return scale[scale.length - 1][1];
  for (let i = 0; i < scale.length - 1; i++) {
    const [v1, c1] = scale[i];
    const [v2, c2] = scale[i + 1];
    if (value >= v1 && value <= v2) {
      return interpolateColor(c1, c2, (value - v1) / (v2 - v1));
    }
  }
  return scale[0][1];
}

function interpolateColor(c1, c2, ratio) {
  const r1 = parseInt(c1.slice(1, 3), 16), g1 = parseInt(c1.slice(3, 5), 16), b1 = parseInt(c1.slice(5, 7), 16);
  const r2 = parseInt(c2.slice(1, 3), 16), g2 = parseInt(c2.slice(3, 5), 16), b2 = parseInt(c2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}