/**
 * Utilidades para el mapa dinámico de estaciones.
 */

export const VARIABLES = {
  // ── Variables climáticas en vivo (DGAC / Agromet / RedMeteo) ──
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

  // ── Variables históricas DGA: clima ──
  temp_min_diaria:    { label: "Temperatura mínima del día",       unit: "°C",  scale: [] },
  temp_max_diaria:    { label: "Temperatura máxima del día",       unit: "°C",  scale: [] },
  temp_media_diaria:  { label: "Temperatura media del día",        unit: "°C",  scale: [] },
  temp_media_mensual: { label: "Temperatura media del mes",        unit: "°C",  scale: [] },
  precip_diaria:      { label: "Precipitación acumulada del día",  unit: "mm",  scale: [] },
  precip_mensual:     { label: "Precipitación acumulada del mes",  unit: "mm",  scale: [] },
  precip_max_anual:   { label: "Precipitación máxima 24h del año", unit: "mm",  scale: [] },

  // ── Variables históricas DGA: hidrología ──
  caudal_diario:        { label: "Caudal medio del día",            unit: "m³/s", scale: [] },
  caudal_mensual:       { label: "Caudal medio del mes",            unit: "m³/s", scale: [] },
  sedimentos_integrado: { label: "Sedimentos (muestreo integrado)", unit: "mg/L", scale: [] },
  sedimentos_rutinario: { label: "Sedimentos (muestreo rutinario)", unit: "mg/L", scale: [] },
  nivel_estatico_pozo:  { label: "Nivel estático del pozo",         unit: "m",    scale: [] },
};

// ── Helpers ────────────────────────────────────────────────

/**
 * Devuelve el label y unit de un indicador.
 * Si no está en VARIABLES y empieza con calidad_, formatea el nombre.
 */
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
      .replace(/^Cloruro/, "Cloruro")
      .replace(/^Sulfato/, "Sulfato")
      .replace(/^Nitrato/, "Nitrato")
      .replace(/^Nitrito/, "Nitrito")
      .replace(/^Silice/, "Sílice")
      .replace(/^Ph$/, "pH")
      .replace(/^Boro$/, "Boro");

    return { label: name, unit: fallbackUnit || "mg/L", scale: [] };
  }

  return { label: indicatorId || "—", unit: fallbackUnit || "", scale: [] };
}

/**
 * Formatea el período de un valor según el tipo de indicador.
 *  - *_anual   → "2025"
 *  - *_mensual → "Ago 2026"
 *  - resto     → "30-08-2026"
 */
function formatPeriod(periodStart, indicatorId) {
  if (!periodStart) return "—";
  const d = new Date(periodStart);
  if (isNaN(d)) return String(periodStart).slice(0, 10);

  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  if (indicatorId && indicatorId.endsWith("_anual")) {
    return String(d.getUTCFullYear());
  }
  if (indicatorId && indicatorId.endsWith("_mensual")) {
    return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${d.getUTCFullYear()}`;
}

/**
 * Tooltip explicativo por indicador (para el atributo title).
 */
function getTooltip(indicatorId) {
  const tooltips = {
    precip_diaria: "Suma acumulada de lluvia en 24 horas",
    precip_mensual: "Suma acumulada de lluvia durante el mes",
    precip_max_anual: "Máxima precipitación en 24h registrada en el año",
    caudal_diario: "Promedio de los caudales medidos durante el día",
    caudal_mensual: "Promedio de los caudales medios diarios del mes",
    temp_media_diaria: "Promedio de las temperaturas del día",
    temp_media_mensual: "Promedio de las temperaturas medias diarias del mes",
    temp_min_diaria: "Temperatura mínima registrada en el día",
    temp_max_diaria: "Temperatura máxima registrada en el día",
    nivel_estatico_pozo: "Lectura puntual del nivel del agua en el pozo",
  };
  return tooltips[indicatorId] || "";
}

// ── Capa de estaciones activas ─────────────────────────────

let _stationsLayer = null;
let currentVariable = null;
let isStationLayerActive = false;
let legendObserver = null;
let _refreshInterval = null;
let _selectedStation = null;

export async function loadStations(variable, map) {
  if (!map) return;
  try {
    const res = await fetch(`/api/stations-map?variable=${variable}`);
    if (!res.ok) return;

    const json = await res.json();
    const stations = json.stations || [];
    if (stations.length === 0) return;

    const activeStations = stations.filter(
      (s) => s.has_data && s.value !== null && s.value !== undefined
    );
    if (activeStations.length === 0) {
      console.warn(`[stations] No hay estaciones con datos para ${variable}`);
      return;
    }

    const features = activeStations.map((s) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.longitud, s.latitud] },
      properties: s,
    }));

    const geojson = { type: "FeatureCollection", features };
    const config = VARIABLES[variable] || VARIABLES.temp_avg;

    if (_stationsLayer) map.removeLayer(_stationsLayer);

    _stationsLayer = L.geoJSON(geojson, {
      pointToLayer: (feature, latlng) => {
        const s = feature.properties;
        const hasValue = s.has_data && s.value !== null && s.value !== undefined;
        const color = hasValue ? getColorFromScale(s.value, config.scale) : "#9ca3af";

        const marker = L.circleMarker(latlng, {
          radius: 8,
          fillColor: color,
          color: "#fff",
          weight: 2,
          fillOpacity: 0.9,
        });

        if (hasValue) {
          let displayValue = s.value;
          let displayUnit = s.unit;
          if (variable === "viento_dir") {
            displayValue = Math.round(s.value);
            displayUnit = "°";
          } else if (variable === "viento_vel") {
            displayValue = (s.value * 1.852).toFixed(1);
          } else {
            displayValue = Number(s.value).toFixed(1);
          }
          marker.bindTooltip(`${displayValue} ${displayUnit}`, {
            permanent: true,
            direction: "top",
            className: "station-label",
            offset: [0, -10],
          });
        }

        marker.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          openStationSidebar(s);
        });

        return marker;
      },
    }).addTo(map);

    currentVariable = variable;
    isStationLayerActive = true;
    setupLegendObserver();
    updateLegend();

    if (_refreshInterval) clearInterval(_refreshInterval);
    _refreshInterval = setInterval(() => {
      if (isStationLayerActive) {
        console.log("[stations] Auto-actualizando datos del mapa...");
        loadStations(variable, map);
        if (_selectedStation) openStationSidebar(_selectedStation, true);
      }
    }, 5 * 60 * 1000);

    return stations;
  } catch (err) {
    console.error(`[stations] Error al cargar ${variable}:`, err);
  }
}

export function clearStations(map) {
  if (_refreshInterval) {
    clearInterval(_refreshInterval);
    _refreshInterval = null;
  }
  _selectedStation = null;

  if (_stationsLayer && map) {
    map.removeLayer(_stationsLayer);
    _stationsLayer = null;
  }
  isStationLayerActive = false;
  updateLegend();

  const sidebar = document.getElementById("sidebarInfo");
  if (sidebar) sidebar.classList.remove("active");
}

// ── Leyenda ────────────────────────────────────────────────

function setupLegendObserver() {
  if (legendObserver) return;
  const legendContainer = document.getElementById("sidebar-legend");
  if (!legendContainer) return;

  legendObserver = new MutationObserver(() => {
    if (isStationLayerActive && !document.getElementById("station-legend-block")) {
      setTimeout(updateLegend, 0);
    }
  });
  legendObserver.observe(legendContainer, { childList: true });
}

function updateLegend() {
  const legendContainer = document.getElementById("sidebar-legend");
  if (!legendContainer) return;

  const existing = document.getElementById("station-legend-block");
  if (existing) existing.remove();

  if (!isStationLayerActive || !currentVariable) return;

  const config = VARIABLES[currentVariable];
  if (!config) return;

  const block = document.createElement("div");
  block.id = "station-legend-block";
  block.className = "legend-section";

  const min = config.scale[0][0];
  const max = config.scale[config.scale.length - 1][0];
  const range = max - min || 1;

  const gradientStops = config.scale
    .map((s) => {
      const percent = ((s[0] - min) / range) * 100;
      return `${s[1]} ${percent}%`;
    })
    .join(", ");

  const labels = config.scale.map((s) => `<span>${s[0]}</span>`).join("");

  block.innerHTML = `
    <div class="legend-title">${config.label} (Estaciones)</div>
    <div class="legend-gradient-bar" style="background: linear-gradient(to right, ${gradientStops});"></div>
    <div class="bar-label">${labels}</div>
  `;

  legendContainer.appendChild(block);
}

// ── Panel de info nativo ───────────────────────────────────

async function openStationSidebar(station, isBackground = false) {
  _selectedStation = station;

  const sidebar = document.getElementById("sidebarInfo");
  const title = document.getElementById("sidebarInfoTitle");
  const content = document.getElementById("sidebarInfoContent");

  if (!sidebar || !title || !content) return;

  title.innerHTML = `<span class="material-symbols-outlined" style="font-size: 18px;">info</span> ${station.nombre_estacion}`;

  if (!isBackground || !content.innerHTML.trim()) {
    content.innerHTML = `<div class="custom-popup"><em>Cargando datos...</em></div>`;
  }

  if (!isBackground) sidebar.classList.add("active");

  const TIPOS_ESTACION = {
    "Automática": "Automática (EMA) · Reporta en tiempo real",
    "Convencional": "Convencional · Datos observados manualmente",
    "Mixta": "Mixta · Instrumentos automáticos y observación manual",
  };
  const tipoEstacionTexto = TIPOS_ESTACION[station.tipo_estacion] || station.tipo_estacion;

  try {
    const res = await fetch(`/api/station-details?codigo=${station.codigo_nacional}`);
    const data = await res.json();

    if (!data.values || data.values.length === 0) {
      content.innerHTML = `
        <div class="custom-popup">
          <p><strong>${station.comuna} · ${tipoEstacionTexto}</strong></p>
          <p style="margin-top: 15px; padding: 10px; background: var(--bg-surface-2); border-left: 3px solid var(--color-warning); border-radius: 4px;">
            <em>No hay datos disponibles para esta estación.</em>
          </p>
        </div>
      `;
      return;
    }

    // Calcular rango de datos
    let fechaMin = null;
    let fechaMax = null;
    data.values.forEach((v) => {
      if (!v.period_start) return;
      if (!fechaMin || v.period_start < fechaMin) fechaMin = v.period_start;
      if (!fechaMax || v.period_start > fechaMax) fechaMax = v.period_start;
    });
    const rangoTexto =
      fechaMin && fechaMax ? `${formatPeriod(fechaMin)} – ${formatPeriod(fechaMax)}` : "—";

    let html = `<div class="custom-popup">
      <p><strong>${station.comuna} · ${tipoEstacionTexto}</strong></p>
      <table style="width: 100%; border-collapse: collapse; font-size: 0.85em; margin-top: 10px;">
        <thead>
          <tr style="border-bottom: 1px solid var(--border-subtle); text-align: left; color: var(--text-secondary);">
            <th style="padding: 6px 0;">Variable</th>
            <th style="padding: 6px 0; text-align: right;">Valor</th>
            <th style="padding: 6px 0; text-align: right;">Período</th>
          </tr>
        </thead>
        <tbody>`;

    data.values.forEach((v) => {
      const conf = getVariableConfig(v.indicator_id, v.unit);
      let val = v.value;
      let displayUnit = conf.unit || v.unit;

      if (v.indicator_id === "viento_vel") {
        val = (val * 1.852).toFixed(1);
      } else if (v.indicator_id === "viento_dir") {
        val = Math.round(val);
        displayUnit = "°";
      } else {
        val = Number(val).toFixed(1);
      }

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

    // Fuente dinámica
    let fuenteHtml = "";
    const codigo = station.codigo_nacional || "";
    const propietario = station.propietario || "";

    if (codigo.startsWith("RMCL")) {
      const fechaConsulta = new Date().toLocaleDateString("es-CL", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      fuenteHtml = `
        <p style="margin: 0; font-size: 0.70rem; line-height: 1.4; text-align: left; color: var(--text-tertiary);">
          <strong>Fuente:</strong> Red Meteorológica Aficionada de Chile. (2019). <em>Sitio web RedMeteo. Red Ciudadana De Estaciones Meteorológicas.</em> Consultado el ${fechaConsulta}, desde <a href="https://www.redmeteo.cl/" target="_blank" style="color: var(--color-brand-text); text-decoration: none;">www.redmeteo.cl</a>
        </p>`;
    } else if (
      codigo.startsWith("AGROMET_") ||
      propietario.includes("FDF") ||
      propietario.includes("INIA") ||
      propietario.includes("CAEZA")
    ) {
      fuenteHtml = `
        <p style="margin: 0; font-size: 0.70rem; line-height: 1.4; text-align: left; color: var(--text-tertiary);">
          <strong>Fuente:</strong> Red Agroclimática Nacional (AGROMET). <a href="https://www.agromet.cl" target="_blank" style="color: var(--color-brand-text); text-decoration: none;">www.agromet.cl</a>
        </p>`;
    } else if (propietario.includes("DGA") || propietario.includes("Dirección General de Aguas")) {
      fuenteHtml = `
        <p style="margin: 0; font-size: 0.70rem; line-height: 1.4; text-align: left; color: var(--text-tertiary);">
          <strong>Fuente:</strong> Dirección General de Aguas (DGA). <a href="https://dga.mop.gob.cl/estadisticas-estaciones-dga/" target="_blank" style="color: var(--color-brand-text); text-decoration: none;">dga.mop.gob.cl</a>
        </p>`;
    } else {
      fuenteHtml = `
        <p style="margin: 0;">Fuente: Dirección Meteorológica de Chile (<a href="https://climatologia.meteochile.gob.cl/" target="_blank" style="color: var(--color-brand-text); text-decoration: none;">meteochile.gob.cl</a>)</p>`;
    }

    html += `
      <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--border-subtle); font-size: 0.75rem; color: var(--text-tertiary); text-align: center;">
        <p style="margin: 0 0 6px 0;">Datos disponibles: <strong>${rangoTexto}</strong></p>
        <p style="margin: 0 0 8px 0;">Última actualización: <strong>${formatPeriod(fechaMax)}</strong></p>
        ${fuenteHtml}
      </div>`;

    content.innerHTML = html;
  } catch (err) {
    if (!isBackground) {
      content.innerHTML = `<div class="custom-popup"><p>Error al cargar datos.</p></div>`;
    }
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
  const r1 = parseInt(c1.slice(1, 3), 16),
    g1 = parseInt(c1.slice(3, 5), 16),
    b1 = parseInt(c1.slice(5, 7), 16);
  const r2 = parseInt(c2.slice(1, 3), 16),
    g2 = parseInt(c2.slice(3, 5), 16),
    b2 = parseInt(c2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ── Capa de estaciones históricas ──────────────────────────

let _historicalLayer = null;

export async function loadHistoricalStations(map) {
  if (!map) return;
  try {
    const res = await fetch("/api/historical-stations");
    if (!res.ok) return;
    const json = await res.json();
    const stations = json.stations || [];
    if (stations.length === 0) return;

    const features = stations.map((s) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.longitud, s.latitud] },
      properties: s,
    }));

    if (_historicalLayer) map.removeLayer(_historicalLayer);

    _historicalLayer = L.geoJSON({ type: "FeatureCollection", features }, {
      pointToLayer: (feature, latlng) => {
        return L.circleMarker(latlng, {
          radius: 6,
          fillColor: "#6b7280",
          color: "#fff",
          weight: 1.5,
          fillOpacity: 0.7,
        });
      },
      onEachFeature: (feature, layer) => {
        const s = feature.properties;
        layer.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          openStationSidebar(s);
        });
      },
    }).addTo(map);

    return stations;
  } catch (err) {
    console.error(`[stations] Error al cargar históricas:`, err);
  }
}

export function clearHistoricalStations(map) {
  if (_historicalLayer && map) {
    map.removeLayer(_historicalLayer);
    _historicalLayer = null;
  }
}