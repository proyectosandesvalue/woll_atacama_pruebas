/**
 * GetFeatureInfo para capas WMS de Copernicus.
 *
 * Al hacer clic en el mapa:
 *   1. Busca capas WMS visibles con `wmsFeatureInfo` en su configuración.
 *   2. Consulta GetFeatureInfo JSON para el píxel clickeado.
 *   3. Muestra nombre del indicador, descripción, valores y metadatos de la
 *      escena en `#sidebarInfo`.
 *
 * Los valores de las capas de visualización (NDVI, Agriculture, Moisture)
 * son RGB; para un índice numérico hace falta una capa de 1 banda.
 */

import { appState } from "../store/appState.js";
import { fetchCopernicusFeatureInfo } from "./externalServices.js";
import { escapeHtml } from "./helpers.js";
import { createContextLogger } from "./logger.js";

const log = createContextLogger("WmsFeatureInfo");

let activeController = null;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getDisplayName(config, fallback) {
  return config?.wmsFeatureInfo?.title || config?.nombrePersonalizado || fallback;
}

function getVisibleCopernicusLayers(map) {
  const layers = [];

  for (const [name, layer] of appState.layers.byName.entries()) {
    if (!layer?._isWMS) continue;
    if (!map.hasLayer(layer)) continue;

    const config = layer._configCapa;
    if (!config?.wmsFeatureInfo) continue;
    if (!String(config.servicio || "").startsWith("copernicus_")) continue;

    layers.push({ name, layer, config });
  }

  return layers;
}

function getMaxcc(layer) {
  const query = layer?._url?.split("?")[1];
  if (!query) return null;
  return new URLSearchParams(query).get("MAXCC");
}

function formatValue(value, config) {
  const number = Number(value);
  if (!Number.isFinite(number)) return escapeHtml(String(value ?? "—"));
  const decimals = config?.wmsFeatureInfo?.decimals;
  return Number.isInteger(decimals) ? number.toFixed(decimals) : String(number);
}

function showInfo(title, html) {
  const sidebar = document.getElementById("sidebarInfo");
  const titleEl = document.getElementById("sidebarInfoTitle");
  const content = document.getElementById("sidebarInfoContent");
  if (!sidebar || !titleEl || !content) return;

  titleEl.innerHTML = `
    <span class="material-symbols-outlined" style="font-size: 18px;">satellite_alt</span>
    ${escapeHtml(title)}
  `;
  content.innerHTML = html;
  sidebar.classList.add("active");
}

function buildRangeBar(legend) {
  if (!legend || legend.type !== "gradient" || !Array.isArray(legend.stops)) return "";

  const values = legend.stops
    .map((stop) => Number(stop.value))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return "";

  const min = Number.isFinite(legend.min) ? legend.min : Math.min(...values);
  const max = Number.isFinite(legend.max) ? legend.max : Math.max(...values);
  const span = max - min || 1;
  const background = legend.stops
    .map((stop) => {
      const pct = Math.min(100, Math.max(0, ((Number(stop.value) - min) / span) * 100));
      return `${stop.color} ${pct}%`;
    })
    .join(", ");

  const labels = Array.isArray(legend.labels)
    ? legend.labels
        .map((label) => `<span>${escapeHtml(String(label))}</span>`)
        .join("")
    : "";

  return `
    <div class="legend-gradient-bar" style="background: linear-gradient(to right, ${background}); margin-top: 8px;"></div>
    ${labels ? `<div class="legend-gradient-labels">${labels}</div>` : ""}
  `;
}

function renderFeature(name, config, feature, { showHeader }) {
  const props = feature?.properties || {};
  const bands = config?.wmsFeatureInfo?.bands || {};
  const outEntries = Object.entries(props).filter(
    ([key, value]) => /^out\d+$/i.test(key) && value !== null && value !== undefined
  );

  const primaryKey =
    config?.wmsFeatureInfo?.primary ||
    (config?.wmsFeatureInfo?.kind === "value" ? outEntries[0]?.[0] : null);
  const primaryValue = primaryKey ? props[primaryKey] : null;
  const primaryLabel =
    config?.wmsFeatureInfo?.primaryLabel || bands[primaryKey] || "Valor";

  const displayName = getDisplayName(config, name);
  const description = config?.wmsFeatureInfo?.description || "";

  const headerHtml = showHeader
    ? `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <span class="material-symbols-outlined" style="font-size: 18px; color: var(--color-brand-text);">satellite_alt</span>
        <strong style="font-size: 0.95rem;">${escapeHtml(displayName)}</strong>
      </div>
    `
    : "";

  const descriptionHtml = description
    ? `<p style="margin: 0 0 14px; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.55;">${escapeHtml(description)}</p>`
    : "";

  const range = config?.wmsFeatureInfo?.range;
  const rangeHtml = range?.text
    ? `
      <div style="background: var(--bg-surface-2); padding: 10px 12px; border-radius: 8px; margin-bottom: 14px;">
        ${
          Number.isFinite(range.min) && Number.isFinite(range.max)
            ? `<div style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-tertiary); font-weight: 700; letter-spacing: 0.05em; margin-bottom: 4px;">Rango: ${range.min} a ${range.max}</div>`
            : ""
        }
        <p style="margin: 0; font-size: 0.78rem; color: var(--text-secondary); line-height: 1.5;">${escapeHtml(range.text)}</p>
        ${buildRangeBar(config?.wmsLegend)}
      </div>
    `
    : "";

  const primaryHtml =
    primaryValue !== null && primaryValue !== undefined
      ? `
        <div style="background: var(--bg-surface-2); padding: 14px 16px; border-radius: 8px; border-left: 4px solid var(--color-brand-text); margin-bottom: 14px;">
          <span style="display: block; font-size: 0.7rem; text-transform: uppercase; color: var(--text-tertiary); font-weight: 700; letter-spacing: 0.05em; margin-bottom: 2px;">
            ${escapeHtml(primaryLabel)}
          </span>
          <span style="font-size: 1.7rem; font-weight: 800; color: var(--color-brand-text);">
            ${formatValue(primaryValue, config)}
          </span>
        </div>
      `
      : "";

  const rows = outEntries
    .map(([key, value]) => {
      const label = bands[key] || key.replace(/^out/i, "Valor ");
      return `
        <tr>
          <td style="padding: 3px 0; color: var(--text-secondary);">${escapeHtml(label)}</td>
          <td style="padding: 3px 0; text-align: right; font-variant-numeric: tabular-nums;">${formatValue(value, config)}</td>
        </tr>
      `;
    })
    .join("");

  const rgb = ["out1", "out2", "out3"].map((key) => Number(props[key]));
  const hasRgb = rgb.every((value) => Number.isFinite(value));
  const colorHtml = hasRgb
    ? (() => {
        const channels = rgb.map((value) => Math.round(clamp(value, 0, 1) * 255));
        const hex = `#${channels
          .map((channel) => channel.toString(16).padStart(2, "0"))
          .join("")}`;
        return `
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
            <span style="display: inline-block; width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--border-subtle); background: ${hex};"></span>
            <span style="font-size: 0.8rem; color: var(--text-secondary);">Color del píxel <code style="font-size: 0.75rem;">${hex}</code></span>
          </div>
        `;
      })()
    : "";

  const valueHeading =
    config?.wmsFeatureInfo?.kind === "rgb"
      ? "Componentes del color del píxel"
      : "Valor del píxel";

  const valueTableHtml =
    rows && !(config?.wmsFeatureInfo?.kind === "value" && outEntries.length === 1)
      ? `
      <div style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-tertiary); font-weight: 700; letter-spacing: 0.05em; margin-bottom: 4px;">
        ${valueHeading}
      </div>
      <table style="width: 100%; font-size: 0.8rem; border-collapse: collapse; margin-bottom: 14px;">${rows}</table>
    `
      : "";

  const date = props.date ? escapeHtml(String(props.date)) : "—";
  const time = props.time ? escapeHtml(String(props.time)) : "";
  const cloud =
    props.cloudCoverPercentage !== undefined && props.cloudCoverPercentage !== null
      ? `${escapeHtml(String(props.cloudCoverPercentage))}%`
      : "—";
  const sceneId = props.id ? escapeHtml(String(props.id)) : "—";
  const note = config?.wmsFeatureInfo?.note
    ? `<p style="margin: 10px 0 0; font-size: 0.72rem; color: var(--text-tertiary); line-height: 1.4;">${escapeHtml(config.wmsFeatureInfo.note)}</p>`
    : "";

  return `
    <div class="custom-popup" style="padding: 0;">
      ${headerHtml}
      ${descriptionHtml}
      ${rangeHtml}
      ${primaryHtml}
      ${colorHtml}
      ${valueTableHtml}
      <div style="font-size: 0.78rem; color: var(--text-secondary); line-height: 1.5; border-top: 1px solid var(--border-subtle); padding-top: 8px;">
        <div style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-tertiary); font-weight: 700; letter-spacing: 0.05em; margin-bottom: 4px;">Escena</div>
        <div><strong>Fecha:</strong> ${date}${time ? ` · ${time}` : ""}</div>
        <div><strong>Nubosidad:</strong> ${cloud}</div>
        <div style="word-break: break-all;"><strong>Escena:</strong> ${sceneId}</div>
      </div>
      ${note}
    </div>
  `;
}

function renderError(name, config, message, { showHeader }) {
  const displayName = getDisplayName(config, name);
  return `
    <div class="custom-popup" style="padding: 0;">
      ${
        showHeader
          ? `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <span class="material-symbols-outlined" style="font-size: 18px; color: var(--color-brand-text);">satellite_alt</span>
              <strong style="font-size: 0.95rem;">${escapeHtml(displayName)}</strong>
            </div>`
          : ""
      }
      <p style="margin: 0; font-size: 0.8rem; color: var(--text-tertiary);">${escapeHtml(message)}</p>
    </div>
  `;
}

async function handleMapClick(map, event) {
  const layers = getVisibleCopernicusLayers(map);
  if (layers.length === 0) return;

  const singleLayer = layers.length === 1;
  const panelTitle = singleLayer
    ? getDisplayName(layers[0].config, layers[0].name)
    : "Información del píxel";

  if (activeController) activeController.abort();
  activeController = new AbortController();
  const { signal } = activeController;

  showInfo(
    panelTitle,
    `<p class="text-muted small" style="margin: 0;">Consultando ${layers.length} capa(s)…</p>`
  );

  const size = map.getSize();
  const bounds = map.getBounds();

  const tasks = layers.map(async ({ name, layer, config }) => {
    const crs = layer._crs || map.options.crs;
    const sw = crs.project(bounds.getSouthWest());
    const ne = crs.project(bounds.getNorthEast());
    const point = crs.project(event.latlng);

    // BBOX de un píxel de pantalla alrededor del clic. Es más rápido y
    // estable que pedir la imagen completa del viewport.
    const pixelX = Math.abs(ne.x - sw.x) / Math.max(1, size.x);
    const pixelY = Math.abs(ne.y - sw.y) / Math.max(1, size.y);
    const halfX = Math.max(pixelX / 2, 1e-6);
    const halfY = Math.max(pixelY / 2, 1e-6);
    const bbox = [
      point.x - halfX,
      point.y - halfY,
      point.x + halfX,
      point.y + halfY,
    ].join(",");

    const data = await fetchCopernicusFeatureInfo({
      layer: layer.wmsParams.layers,
      bbox,
      width: 1,
      height: 1,
      i: 0,
      j: 0,
      time: layer.wmsParams.TIME || null,
      crs: layer.wmsParams.crs || crs.code || "EPSG:3857",
      maxcc: getMaxcc(layer) ?? config.wmsMaxcc ?? 30,
      signal,
    });

    return { name, config, data };
  });

  let results;
  try {
    results = await Promise.allSettled(tasks);
  } catch (err) {
    if (err?.name === "AbortError") return;
    log.warn("Error consultando GetFeatureInfo:", err?.message || "desconocido");
    showInfo(
      panelTitle,
      `<p class="text-muted small" style="margin: 0;">No se pudo consultar la información del píxel.</p>`
    );
    return;
  }

  if (signal.aborted) return;

  const sections = results
    .map((result, index) => {
      const layerInfo = layers[index] || {};
      const config = layerInfo.config;
      const name = layerInfo.name || "Capa";

      if (result.status === "rejected") {
        if (result.reason?.name === "AbortError") return "";
        return renderError(name, config, "No se pudo obtener información de esta capa.", {
          showHeader: !singleLayer,
        });
      }

      const feature = result.value?.data?.features?.[0];
      if (!feature) {
        return renderError(
          name,
          config,
          "Sin datos en este píxel para el área y fecha consultadas.",
          { showHeader: !singleLayer }
        );
      }

      return renderFeature(name, config, feature, { showHeader: !singleLayer });
    })
    .filter(Boolean);

  if (sections.length === 0) {
    showInfo(
      panelTitle,
      `<p class="text-muted small" style="margin: 0;">Sin datos en este píxel.</p>`
    );
    return;
  }

  showInfo(
    panelTitle,
    sections.join('<hr style="border: 0; border-top: 1px solid var(--border-subtle); margin: 14px 0;">')
  );
}

/**
 * Registra el handler de clic para GetFeatureInfo.
 *
 * Debe llamarse después de `initSidebarUI(map)` para que el cierre del
 * sidebar por clic no pise la apertura con la información del píxel.
 *
 * @param {L.Map} map
 */
export function initWmsFeatureInfo(map) {
  if (!map) return;
  map.on("click", (event) => {
    void handleMapClick(map, event);
  });
}
