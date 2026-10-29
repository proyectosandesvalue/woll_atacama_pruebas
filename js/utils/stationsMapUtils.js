/**
 * Utilidades para el mapa dinámico de estaciones.
 */

export const VARIABLES = {
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
};

let _stationsLayer = null;
let currentVariable = null;
let isStationLayerActive = false;
let legendObserver = null;
let _refreshInterval = null; // Temporizador para auto-actualización
let _selectedStation = null; // Guarda la estación abierta en el panel

export async function loadStations(variable, map) {
  if (!map) return;
  try {
    const res = await fetch(`/api/stations-map?variable=${variable}`);
    if (!res.ok) return;
    const json = await res.json();
    const stations = json.stations || [];
    if (stations.length === 0) return;

    const features = stations.map((s) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.longitud, s.latitud] },
      properties: s,
    }));

    const geojson = { type: "FeatureCollection", features };
    const config = VARIABLES[variable] || VARIABLES.temp_avg;

    if (_stationsLayer) {
      map.removeLayer(_stationsLayer);
    }

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
            direction: 'top',
            className: 'station-label',
            offset: [0, -10]
          });
        }

        marker.on('click', (e) => {
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

    // NUEVO: Configurar auto-actualización cada 5 minutos
    if (_refreshInterval) {
      clearInterval(_refreshInterval);
    }
    _refreshInterval = setInterval(() => {
      if (isStationLayerActive) {
        console.log("[stations] Auto-actualizando datos del mapa...");
        loadStations(variable, map); 
        
        // Si hay un panel abierto, actualizarlo también
        if (_selectedStation) {
          openStationSidebar(_selectedStation, true); // true = es background
        }
      }
    }, 5 * 60 * 1000); // 5 minutos

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

// --- LÓGICA DE LA LEYENDA ---

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
  
  const gradientStops = config.scale.map(s => {
    const percent = ((s[0] - min) / range) * 100;
    return `${s[1]} ${percent}%`;
  }).join(", ");

  const labels = config.scale.map(s => `<span>${s[0]}</span>`).join("");

  block.innerHTML = `
    <div class="legend-title">${config.label} (Estaciones)</div>
    <div class="legend-gradient-bar" style="background: linear-gradient(to right, ${gradientStops});"></div>
    <div class="bar-label">${labels}</div>
  `;

  legendContainer.appendChild(block);
}

// --- LÓGICA DEL PANEL DE INFO NATIVO ---

async function openStationSidebar(station, isBackground = false) {
  _selectedStation = station; // Guardar la estación actual
  
  const sidebar = document.getElementById("sidebarInfo");
  const title = document.getElementById("sidebarInfoTitle");
  const content = document.getElementById("sidebarInfoContent");
  
  if (!sidebar || !title || !content) return;
  
  title.innerHTML = `<span class="material-symbols-outlined" style="font-size: 18px;">info</span> ${station.nombre_estacion}`;
  
  // Si es background y el panel ya tiene contenido, no mostramos "Cargando..."
  if (!isBackground || !content.innerHTML.trim()) {
    content.innerHTML = `<div class="custom-popup"><em>Cargando datos...</em></div>`;
  }
  
  if (!isBackground) {
    sidebar.classList.add("active");
  }
  
  const TIPOS_ESTACION = {
    "Automática": "Automática (EMA) · Reporta en tiempo real",
    "Convencional": "Convencional · Datos observados manualmente",
    "Mixta": "Mixta · Instrumentos automáticos y observación manual"
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
            <em>No hay datos en tiempo real disponibles para esta estación.</em>
          </p>
        </div>
      `;
      return;
    }

    let ultimaFecha = "";
    data.values.forEach(v => {
      if (v.period_start && v.period_start > ultimaFecha) {
        ultimaFecha = v.period_start;
      }
    });
    
    let fechaFormateada = "Desconocida";
    if (ultimaFecha) {
      const d = new Date(ultimaFecha);
      if (!isNaN(d)) {
        fechaFormateada = d.toLocaleString('es-CL', { 
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit'
        });
      } else {
        fechaFormateada = ultimaFecha;
      }
    }
    
    let html = `<div class="custom-popup">
      <p><strong>${station.comuna} · ${tipoEstacionTexto}</strong></p>
      <table style="width: 100%; border-collapse: collapse; font-size: 0.9em; margin-top: 10px;">
        <thead>
          <tr style="border-bottom: 1px solid var(--border-subtle); text-align: left; color: var(--text-secondary);">
            <th style="padding: 6px 0;">Variable</th>
            <th style="padding: 6px 0; text-align: right;">Valor</th>
          </tr>
        </thead>
        <tbody>`;
        
    data.values.forEach(v => {
      const conf = VARIABLES[v.indicator_id] || { label: v.indicator_id, unit: v.unit };
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
      
      html += `<tr style="border-bottom: 1px solid var(--border-subtle);">
        <td style="padding: 8px 0; color: var(--text-secondary);">${conf.label}</td>
        <td style="padding: 8px 0; text-align: right; font-weight: 600; color: var(--text-primary);">
          ${val} <span style="font-weight: normal; color: var(--text-tertiary);">${displayUnit}</span>
        </td>
      </tr>`;
    });
    html += `</tbody></table></div>`;

        // LÓGICA DE FUENTE DINÁMICA (RedMeteo vs Agromet vs MeteoChile)
    let fuenteHtml = "";
    const codigo = station.codigo_nacional || "";
    const propietario = station.propietario || "";

    if (codigo.startsWith('RMCL')) {
      const fechaConsulta = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
      fuenteHtml = `
        <p style="margin: 0; font-size: 0.70rem; line-height: 1.4; text-align: left; color: var(--text-tertiary);">
          <strong>Fuente:</strong> Red Meteorológica Aficionada de Chile. (2019). <em>Sitio web RedMeteo. Red Ciudadana De Estaciones Meteorológicas.</em> Consultado el ${fechaConsulta}, desde <a href="https://www.redmeteo.cl/" target="_blank" style="color: var(--color-brand-text); text-decoration: none;">www.redmeteo.cl</a>
        </p>
      `;
    } else if (codigo.startsWith('AGROMET_') || propietario.includes('FDF') || propietario.includes('INIA') || propietario.includes('CAEZA')) {
      fuenteHtml = `
        <p style="margin: 0; font-size: 0.70rem; line-height: 1.4; text-align: left; color: var(--text-tertiary);">
          <strong>Fuente:</strong> Red Agroclimática Nacional (AGROMET). <a href="https://www.agromet.cl" target="_blank" style="color: var(--color-brand-text); text-decoration: none;">www.agromet.cl</a>
        </p>
      `;
    } else {
      fuenteHtml = `
        <p style="margin: 0;">Fuente: Dirección Meteorológica de Chile (<a href="https://climatologia.meteochile.gob.cl/" target="_blank" style="color: var(--color-brand-text); text-decoration: none;">meteochile.gob.cl</a>)</p>
      `;
    }
    
    content.innerHTML = html;
  } catch (err) {
    if (!isBackground) {
      content.innerHTML = `<div class="custom-popup"><p>Error al cargar datos.</p></div>`;
    }
  }
}

// --- UTILIDADES DE COLOR ---

function getColorFromScale(value, scale) {
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