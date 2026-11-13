/**
 * Tabla de atributos server-side (Sprint 08-D).
 *
 * Para capas con `source.type: "postgis"` y API disponible:
 * - pide páginas de 100 features a `/api/layer-features`;
 * - busca y ordena en el servidor;
 * - hace scroll infinito con `IntersectionObserver`;
 * - mantiene `currentFeatures` (en el módulo de la tabla) con las páginas
 *   cargadas para el clic/zoom de una fila.
 *
 * Las capas GeoJSON siguen usando el renderer local de `attributeTableUtils`.
 *
 * @module utils/serverTable
 */

import { createContextLogger } from "./logger.js";
import { escapeHtml } from "./helpers.js";

const log = createContextLogger("ServerTable");
const PAGE_SIZE = 100;

function normalizeKey(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, " ")
    .trim();
}

function columnsFromConfig(configCapa) {
  const alias = configCapa?.alias || {};
  const hasAlias = Object.keys(alias).length > 0;
  if (!hasAlias) return null;

  if (Array.isArray(configCapa.popupCampos) && configCapa.popupCampos.length > 0) {
    return {
      columns: configCapa.popupCampos,
      labels: configCapa.popupCampos.map((key) => alias[key] || key),
    };
  }
  return {
    columns: Object.keys(alias),
    labels: Object.values(alias),
  };
}

/**
 * @param {{
 *   capaNombre: string,
 *   configCapa: object,
 *   elements: {headEl: HTMLElement, bodyEl: HTMLElement, countEl: HTMLElement, loadingEl?: HTMLElement},
 *   getFilter: () => object|null,
 *   onFeatures: (features: object[]) => void,
 *   onColumns: (columns: string[], labels: string[]) => void
 * }} options
 */
export function createServerTable({
  capaNombre,
  configCapa,
  elements,
  getFilter,
  onFeatures,
  onColumns,
}) {
  const { headEl, bodyEl, countEl, loadingEl } = elements;

  let columns = [];
  let labels = [];
  let features = [];
  let total = 0;
  let sort = null;
  let order = "asc";
  let search = "";
  let searchField = "";
  let loading = false;
  let pendingReset = false;
  let destroyed = false;
  let observer = null;
  let sentinel = null;
  let scrollRoot = null;
  let scrollHandler = null;

  const initial = columnsFromConfig(configCapa);
  if (initial) {
    columns = initial.columns;
    labels = initial.labels;
    onColumns(columns, labels);
  }

  function clearSentinel() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (scrollRoot && scrollHandler) {
      scrollRoot.removeEventListener("scroll", scrollHandler);
    }
    scrollRoot = null;
    scrollHandler = null;
    if (sentinel && sentinel.parentElement) sentinel.remove();
    sentinel = null;
  }

  function countText() {
    if (total === 0 && !loading) {
      countEl.textContent = "0 registros";
    } else {
      countEl.textContent = `${total} registros`;
    }
  }

  function buildHead() {
    headEl.innerHTML = "";
    if (columns.length === 0) return;
    const tr = document.createElement("tr");
    columns.forEach((column, index) => {
      const th = document.createElement("th");
      th.textContent = labels[index] || column;
      th.title = "Ordenar por esta columna";
      th.style.cursor = "pointer";
      th.dataset.sortColumn = column;
      th.addEventListener("click", () => {
        if (sort === column) {
          order = order === "asc" ? "desc" : "asc";
        } else {
          sort = column;
          order = "asc";
        }
        updateHeadIndicators();
        fetchPage(true);
      });
      tr.appendChild(th);
    });
    headEl.appendChild(tr);
    updateHeadIndicators();
  }

  function updateHeadIndicators() {
    headEl.querySelectorAll("th[data-sort-column]").forEach((th) => {
      const column = th.dataset.sortColumn;
      const base = th.textContent.replace(/\s*[▲▼]$/, "");
      th.textContent =
        sort === column ? `${base} ${order === "asc" ? "▲" : "▼"}` : base;
    });
  }

  function appendRows(pageFeatures, startIndex) {
    const fragment = document.createDocumentFragment();
    pageFeatures.forEach((feature, index) => {
      const tr = document.createElement("tr");
      tr.dataset.featureIndex = startIndex + index;

      const properties = feature.properties || {};
      const normalized = new Map(
        Object.keys(properties).map((key) => [normalizeKey(key), key])
      );

      columns.forEach((column) => {
        const td = document.createElement("td");
        let value = properties[column];
        if (value === undefined) {
          const original = normalized.get(normalizeKey(column));
          if (original !== undefined) value = properties[original];
        }
        td.textContent =
          value === null || value === undefined ? "-" : String(value);
        tr.appendChild(td);
      });

      fragment.appendChild(tr);
    });
    bodyEl.appendChild(fragment);
  }

  function addSentinel() {
    clearSentinel();
    if (features.length >= total) return;

    sentinel = document.createElement("tr");
    sentinel.innerHTML = `<td colspan="${Math.max(columns.length, 1)}" style="text-align:center; padding:10px;"><span class="loading-indicator">...</span></td>`;
    bodyEl.appendChild(sentinel);

    scrollRoot = bodyEl.closest(".table-responsive");
    if (scrollRoot) {
      scrollHandler = () => {
        if (features.length >= total) return;
        if (
          scrollRoot.scrollTop + scrollRoot.clientHeight >=
          scrollRoot.scrollHeight - 24
        ) {
          clearSentinel();
          fetchPage(false);
        }
      };
      scrollRoot.addEventListener("scroll", scrollHandler, { passive: true });
    }

    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          clearSentinel();
          fetchPage(false);
        }
      },
      { root: scrollRoot || null }
    );
    observer.observe(sentinel);
  }

  function buildUrl(offset) {
    const params = new URLSearchParams({
      layer_id: capaNombre,
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (search) {
      params.set("search", search);
      if (searchField) params.set("search_field", searchField);
    }
    if (sort) {
      params.set("sort", sort);
      params.set("order", order);
    }
    const filter = getFilter();
    if (filter) params.set("filter", JSON.stringify(filter));
    return `/api/layer-features?${params.toString()}`;
  }

  async function fetchPage(reset) {
    if (destroyed) return;
    if (loading) {
      pendingReset = pendingReset || reset;
      return;
    }

    loading = true;
    if (reset && loadingEl) loadingEl.style.display = "flex";

    try {
      const offset = reset ? 0 : features.length;
      const res = await fetch(buildUrl(offset), {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const page = await res.json();
      const pageFeatures = Array.isArray(page.features) ? page.features : [];
      total = Number(page.total ?? pageFeatures.length);

      if (reset) {
        features = [];
        bodyEl.innerHTML = "";
        clearSentinel();

        if (columns.length === 0 && pageFeatures[0]?.properties) {
          columns = Object.keys(pageFeatures[0].properties);
          labels = [...columns];
          onColumns(columns, labels);
          buildHead();
        }
      }

      const startIndex = features.length;
      features = features.concat(pageFeatures);
      onFeatures(features);
      appendRows(pageFeatures, startIndex);
      countText();

      if (features.length < total) {
        addSentinel();
      } else {
        clearSentinel();
      }

      if (total === 0) {
        bodyEl.innerHTML = `<tr><td colspan="${Math.max(columns.length, 1)}" style="text-align:center; padding:16px;">Sin resultados</td></tr>`;
      }
    } catch (err) {
      log.error(`Error cargando la tabla de ${capaNombre}`, err);
      countEl.textContent = "Error";
      bodyEl.innerHTML = `<tr><td colspan="${Math.max(columns.length, 1)}" style="text-align:center; color:var(--color-danger); padding:16px;">Error: ${escapeHtml(String(err.message || err))}</td></tr>`;
    } finally {
      loading = false;
      if (loadingEl) loadingEl.style.display = "none";
      if (pendingReset) {
        pendingReset = false;
        fetchPage(true);
      }
    }
  }

  if (initial) buildHead();
  fetchPage(true);

  return {
    search(query, field) {
      search = String(query || "").trim();
      searchField = String(field || "");
      fetchPage(true);
    },
    clearSearch() {
      search = "";
      searchField = "";
      fetchPage(true);
    },
    refresh() {
      fetchPage(true);
    },
    destroy() {
      destroyed = true;
      clearSentinel();
    },
  };
}
