/**
 * Capas ráster precalculadas (Sprint 49).
 *
 * El visor no calcula pendientes, sombras ni MCDA: consume tiles WebP/PNG
 * publicados con `raster:publish` y muestra la ficha metodológica del manifest.
 * No hay tabla de atributos ni filtros por atributo para este tipo de capa.
 */

import { appState } from "../store/appState.js";
import { escapeHtml } from "./helpers.js";
import { createContextLogger } from "./logger.js";

const log = createContextLogger("RasterUtils");

export function isRasterLayer(configCapa) {
  return (
    configCapa?.tipo === "raster" ||
    configCapa?.type === "raster" ||
    configCapa?.source?.type === "raster"
  );
}

function rasterConfig(configCapa) {
  return configCapa?.source?.raster || configCapa?.raster || {};
}

async function fetchManifest(configCapa) {
  const raster = rasterConfig(configCapa);
  if (!raster.manifest) {
    throw new Error("La capa ráster no declara source.raster.manifest.");
  }
  const response = await fetch(raster.manifest, {
    headers: { Accept: "application/json" },
    cache: "no-cache",
  });
  if (!response.ok) {
    throw new Error(`No se pudo leer el manifest (${response.status}).`);
  }
  return response.json();
}

function boundsFromManifest(manifest) {
  const bbox = manifest?.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4) return null;
  const [west, south, east, north] = bbox.map(Number);
  if (![west, south, east, north].every(Number.isFinite)) return null;
  return [
    [south, west],
    [north, east],
  ];
}

/**
 * Crea la capa Leaflet de tiles ráster.
 * @param {string} capaNombre
 * @param {object} configCapa
 * @returns {Promise<L.TileLayer>}
 */
export async function createRasterLayer(capaNombre, configCapa) {
  const raster = rasterConfig(configCapa);
  const manifest = await fetchManifest(configCapa);
  const bounds = boundsFromManifest(manifest);
  const urlTemplate = raster.urlTemplate || manifest.tile_url_template;
  if (!urlTemplate) {
    throw new Error("El manifest no declara tile_url_template.");
  }

  const layer = L.tileLayer(urlTemplate, {
    pane: "overlayPane",
    minZoom: Number(manifest.tiles?.minzoom ?? raster.minZoom ?? 8),
    maxZoom: appState.map?.getMaxZoom ? appState.map.getMaxZoom() : 18,
    maxNativeZoom: Number(manifest.tiles?.maxzoom ?? raster.maxZoom ?? 13),
    bounds: bounds || undefined,
    opacity: Number.isFinite(Number(raster.opacity)) ? Number(raster.opacity) : 0.75,
    attribution: raster.attribution || manifest.source?.attribution || "",
    tileSize: 256,
    keepBuffer: 2,
    updateWhenIdle: true,
  });

  layer._isRaster = true;
  layer._rasterManifest = manifest;
  layer._configCapa = configCapa;
  layer._capaNombre = capaNombre;

  // L.TileLayer no expone getBounds(); el botón "Zoom a la capa" lo usa.
  if (bounds) {
    const latLngBounds = L.latLngBounds(bounds);
    layer.getBounds = () => latLngBounds;
  }

  layer.on("tileerror", (event) => {
    const status = event?.error?.status ?? event?.status;
    if (status && status !== 404) {
      log.warn(
        `Tile ráster ${event?.coords?.z}/${event?.coords?.x}/${event?.coords?.y} falló (${status})`
      );
    }
  });

  return layer;
}

export async function getRasterManifest(capaNombre, configCapa) {
  const layer = appState.layers.byName.get(capaNombre);
  if (layer?._rasterManifest) return layer._rasterManifest;
  return fetchManifest(configCapa);
}

function formatNumber(value, decimals = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("es-CL", {
    maximumFractionDigits: decimals,
  }).format(number);
}

function legendHtml(legend) {
  if (!legend || typeof legend !== "object") return "";

  if (legend.type === "gradient" && Array.isArray(legend.stops)) {
    const values = legend.stops
      .map((stop) => Number(stop.value))
      .filter((value) => Number.isFinite(value));
    const min = Number.isFinite(Number(legend.min)) ? Number(legend.min) : Math.min(...values);
    const max = Number.isFinite(Number(legend.max)) ? Number(legend.max) : Math.max(...values);
    const span = max - min || 1;
    const background = legend.stops
      .map((stop) => {
        const pct = Math.min(100, Math.max(0, ((Number(stop.value) - min) / span) * 100));
        return `${escapeHtml(String(stop.color))} ${pct}%`;
      })
      .join(", ");
    const labels = Array.isArray(legend.labels)
      ? legend.labels.map((label) => `<span>${escapeHtml(String(label))}</span>`).join("")
      : "";
    return `
      <div class="legend-gradient-bar" style="background: linear-gradient(to right, ${background}); margin-top: 8px;"></div>
      ${labels ? `<div class="legend-gradient-labels">${labels}</div>` : ""}
    `;
  }

  if (legend.type === "classes" && Array.isArray(legend.classes)) {
    const rows = legend.classes
      .map(
        (item) => `
        <div class="legend-item d-flex align-items-center mb-1">
          <span style="display:inline-block;width:18px;height:18px;border:1px solid #ccc;border-radius:2px;background:${escapeHtml(
            String(item.color)
          )};margin-right:8px;flex-shrink:0;"></span>
          <span class="small">${escapeHtml(String(item.label || ""))}</span>
        </div>`
      )
      .join("");
    return rows;
  }

  return "";
}

function modelHtml(model) {
  if (!model || !Array.isArray(model.criteria) || model.criteria.length === 0) return "";
  const rows = model.criteria
    .map(
      (criterion) => `
      <tr>
        <td style="padding:3px 0;color:var(--text-secondary);">${escapeHtml(
          String(criterion.variable || "")
        )}</td>
        <td style="padding:3px 0;text-align:right;font-variant-numeric:tabular-nums;">${formatNumber(
          criterion.weight,
          3
        )}</td>
        <td style="padding:3px 0;text-align:right;color:var(--text-tertiary);font-size:0.75rem;">${escapeHtml(
          String(criterion.source || "")
        )}</td>
      </tr>`
    )
    .join("");
  const constraints = Array.isArray(model.constraints) && model.constraints.length > 0
    ? `<p style="margin:8px 0 0;font-size:0.75rem;color:var(--text-tertiary);">Restricciones: ${model.constraints
        .map((item) => escapeHtml(String(item)))
        .join(", ")}</p>`
    : "";
  return `
    <div style="font-size:0.7rem;text-transform:uppercase;color:var(--text-tertiary);font-weight:700;letter-spacing:0.05em;margin-bottom:4px;">Modelo</div>
    <table style="width:100%;font-size:0.8rem;border-collapse:collapse;margin-bottom:10px;">
      <thead><tr><th style="text-align:left;font-weight:600;padding-bottom:4px;">Variable</th><th style="text-align:right;font-weight:600;padding-bottom:4px;">Peso</th><th style="text-align:right;font-weight:600;padding-bottom:4px;">Fuente</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${constraints}
  `;
}

function statsHtml(payload) {
  const rows = payload?.data?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return `<p style="margin:0;font-size:0.8rem;color:var(--text-tertiary);">Sin estadísticas publicadas.</p>`;
  }
  const shown = rows.slice(0, 20);
  const body = shown
    .map(
      (row) => `
      <tr>
        <td style="padding:3px 0;">${escapeHtml(String(row.admin_name || ""))}</td>
        <td style="padding:3px 0;text-align:right;font-variant-numeric:tabular-nums;">${formatNumber(
          row.hectares,
          0
        )}</td>
        <td style="padding:3px 0;text-align:right;font-variant-numeric:tabular-nums;">${formatNumber(
          row.mean,
          3
        )}</td>
      </tr>`
    )
    .join("");
  const note =
    rows.length > shown.length
      ? `<p style="margin:6px 0 0;font-size:0.72rem;color:var(--text-tertiary);">Mostrando ${shown.length} de ${rows.length} filas.</p>`
      : "";
  return `
    <table style="width:100%;font-size:0.8rem;border-collapse:collapse;">
      <thead><tr><th style="text-align:left;font-weight:600;padding-bottom:4px;">Comuna</th><th style="text-align:right;font-weight:600;padding-bottom:4px;">Hectáreas</th><th style="text-align:right;font-weight:600;padding-bottom:4px;">Media</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    ${note}
  `;
}

function showSidebarInfo(title, html) {
  const sidebar = document.getElementById("sidebarInfo");
  const titleEl = document.getElementById("sidebarInfoTitle");
  const content = document.getElementById("sidebarInfoContent");
  if (!sidebar || !titleEl || !content) return;
  titleEl.innerHTML = `
    <span class="material-symbols-outlined" style="font-size: 18px;">grid_on</span>
    ${escapeHtml(title)}
  `;
  content.innerHTML = html;
  sidebar.classList.add("active");
}

/**
 * Abre la ficha metodológica de una capa ráster en el sidebar derecho.
 * @param {string} capaNombre
 * @param {object} configCapa
 */
export async function openRasterInfo(capaNombre, configCapa) {
  const manifest = await getRasterManifest(capaNombre, configCapa);
  const title = manifest.name || configCapa.nombrePersonalizado || capaNombre;
  let stats = null;

  try {
    const layerId = manifest.layer_id || capaNombre;
    const params = new URLSearchParams({
      layer_id: layerId,
      admin_level: "comuna",
    });
    if (manifest.version) params.set("version", manifest.version);
    const response = await fetch(`/api/raster-stats?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (response.ok) stats = await response.json();
  } catch (err) {
    log.warn(`No se pudieron leer las estadísticas de ${capaNombre}`, err);
  }

  const source = manifest.source || {};
  const values = manifest.values || {};
  const description = manifest.description
    ? `<p style="margin:0 0 14px;font-size:0.82rem;color:var(--text-secondary);line-height:1.55;">${escapeHtml(
        manifest.description
      )}</p>`
    : "";

  const html = `
    <div class="custom-popup" style="padding:0;">
      ${description}
      <div style="font-size:0.78rem;color:var(--text-secondary);line-height:1.6;border-top:1px solid var(--border-subtle);padding-top:8px;margin-bottom:12px;">
        <div><strong>Productor:</strong> ${escapeHtml(String(source.producer || "—"))}</div>
        <div><strong>Método:</strong> ${escapeHtml(String(source.method || "—"))}</div>
        <div><strong>Fecha:</strong> ${escapeHtml(String(source.created_at || "—"))}</div>
        <div><strong>Resolución:</strong> ${formatNumber(manifest.resolution_m, 1)} m · ${escapeHtml(
          String(manifest.crs || "—")
        )}</div>
        <div><strong>Licencia:</strong> ${escapeHtml(String(source.license || "—"))}</div>
        <div><strong>Atribución:</strong> ${escapeHtml(String(source.attribution || "—"))}</div>
      </div>
      <div style="font-size:0.78rem;color:var(--text-secondary);line-height:1.6;margin-bottom:12px;">
        <div><strong>Rango:</strong> ${formatNumber(values.min, 3)} a ${formatNumber(
          values.max,
          3
        )} (${escapeHtml(String(values.type || "—"))})</div>
        ${legendHtml(manifest.legend)}
      </div>
      ${modelHtml(manifest.model)}
      <div style="font-size:0.78rem;color:var(--text-secondary);line-height:1.6;border-top:1px solid var(--border-subtle);padding-top:8px;">
        <div style="font-size:0.7rem;text-transform:uppercase;color:var(--text-tertiary);font-weight:700;letter-spacing:0.05em;margin-bottom:4px;">Estadísticas por comuna</div>
        ${statsHtml(stats)}
      </div>
    </div>
  `;

  showSidebarInfo(title, html);
}

/**
 * Renderiza la leyenda del manifest en el contenedor de la sidebar.
 * @param {HTMLElement} container
 * @param {object} legend
 * @returns {boolean}
 */
export function renderRasterLegend(container, legend) {
  if (!container || !legend) return false;
  const html = legendHtml(legend);
  if (!html) return false;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  container.appendChild(wrapper);
  return true;
}
