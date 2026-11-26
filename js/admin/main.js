/**
 * Panel admin — lógica de UI (Sprint 15).
 *
 * Solo lectura. Todo dato de la API se inserta con textContent; no se usa
 * innerHTML para contenido dinámico.
 */

import { api, setCsrfToken } from "./api.js";

const VIEW_META = {
  config: { eyebrow: "Operación / Configuración", title: "Configuración del visor", mode: "solo lectura" },
  layers: { eyebrow: "Operación / Capas", title: "Gestor de capas", mode: "editable" },
  rag: { eyebrow: "Operación / Documentos", title: "Ingesta RAG", mode: "editable" },
  apis: { eyebrow: "Operación / Integraciones", title: "Conexiones externas", mode: "editable" },
  taxonomy: { eyebrow: "Operación / Taxonomía", title: "Dimensiones y capas", mode: "editable" },
  chat: { eyebrow: "Operación / Chat IA", title: "Prompts y mensajes", mode: "editable" },
  demand: { eyebrow: "Operación / Demanda", title: "Preguntas sin respuesta", mode: "editable" },
  audit: { eyebrow: "Operación / Trazabilidad", title: "Auditoría", mode: "solo lectura" },
};

let pendingChallengeId = null;
let pendingResetToken = null;

const state = {
  view: "config",
  role: "editor",
  layers: [],
  loaded: { config: false, layers: false, rag: false, apis: false, taxonomy: false, chat: false, demand: false, audit: false },
  layerManager: {
    data: null,
    loading: false,
    pollTimer: null,
  },
  chat: {
    prompts: [],
    settings: [],
    messages: [],
    unavailable: [],
    golden: [],
    tools: [],
  },
  rag: {
    data: null,
    loading: false,
    pollTimer: null,
    editingSlug: null,
    chunksDocumentId: null,
  },
  apis: {
    data: null,
    loading: false,
    reload: false,
  },
  taxonomy: {
    data: null,
    loading: false,
    selectedDimensionId: null,
    selectedGroupId: null,
  },
  demand: {
    items: [],
    total: 0,
    stats: null,
    loading: false,
    reload: false,
    selectedId: null,
  },
};

const $ = (selector, root = document) => root.querySelector(selector);
const THEME_KEY = "woll-theme";

function applyTheme(theme, persist = true) {
  const next = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  const icon = next === "dark" ? "light_mode" : "dark_mode";
  for (const id of ["themeIcon", "loginThemeIcon"]) {
    const node = document.getElementById(id);
    if (node) node.textContent = icon;
  }
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Sin localStorage (modo privado): el tema vale solo para esta sesión.
    }
  }
}

function initTheme() {
  let saved = "dark";
  try {
    saved = localStorage.getItem(THEME_KEY) || "dark";
  } catch {
    saved = "dark";
  }
  applyTheme(saved, false);
}

function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  if (options.title) node.title = options.title;
  if (options.attrs) {
    for (const [name, value] of Object.entries(options.attrs)) {
      if (value === undefined || value === null) continue;
      node.setAttribute(name, String(value));
    }
  }
  for (const child of children) {
    if (child) node.appendChild(child);
  }
  return node;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatDay(value) {
  if (!value) return "—";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : String(value);
}

function shortHash(value) {
  if (!value) return "—";
  return String(value).slice(0, 16) + "…";
}

const HELP_MARGIN = 8;
const HELP_MIN_HEIGHT_ABOVE = 220;

function clearHelpPosition(popover) {
  if (!popover) return;
  for (const prop of [
    "position",
    "zIndex",
    "width",
    "left",
    "right",
    "top",
    "bottom",
    "maxHeight",
  ]) {
    popover.style[prop] = "";
  }
  const home = popover._helpHome;
  if (home) {
    delete popover._helpHome;
    home.parent.insertBefore(popover, home.next);
  }
}

/**
 * Los popovers del chat se mueven al body mientras están abiertos para que
 * position: fixed use el viewport y queden por encima del header sticky.
 * Así se abren hacia arriba sin tapar la lista de abajo; si no hay espacio
 * suficiente arriba, se abren abajo con scroll interno.
 */
function positionHelpPopover(button, popover) {
  if (!popover.classList.contains("help-popover-chat")) return;

  if (!popover._helpHome) {
    popover._helpHome = {
      parent: popover.parentElement,
      next: popover.nextSibling,
    };
    document.body.appendChild(popover);
  }

  const rect = button.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth - 24);
  const left = Math.max(
    12,
    Math.min(rect.right - width, window.innerWidth - width - 12)
  );
  const spaceAbove = rect.top - HELP_MARGIN;
  const spaceBelow = window.innerHeight - rect.bottom - HELP_MARGIN;
  const openAbove = spaceAbove >= HELP_MIN_HEIGHT_ABOVE || spaceAbove >= spaceBelow;
  const available = Math.max(140, (openAbove ? spaceAbove : spaceBelow) - HELP_MARGIN);

  popover.style.position = "fixed";
  popover.style.zIndex = "1200";
  popover.style.width = `${width}px`;
  popover.style.left = `${left}px`;
  popover.style.right = "auto";
  popover.style.maxHeight = `${available}px`;
  if (openAbove) {
    popover.style.top = "auto";
    popover.style.bottom = `${Math.max(
      HELP_MARGIN,
      window.innerHeight - rect.top + HELP_MARGIN
    )}px`;
  } else {
    popover.style.bottom = "auto";
    popover.style.top = `${rect.bottom + HELP_MARGIN}px`;
  }
}

function closeHelpPopovers(exceptId = null) {
  for (const popover of document.querySelectorAll(".help-popover")) {
    if (popover.id === exceptId) continue;
    popover.hidden = true;
    clearHelpPosition(popover);
  }
  for (const button of document.querySelectorAll("[data-help]")) {
    const open = exceptId !== null && button.dataset.help === exceptId;
    button.setAttribute("aria-expanded", open ? "true" : "false");
  }
}

function bindHelpPopovers() {
  for (const button of document.querySelectorAll("[data-help]")) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const id = button.dataset.help;
      const popover = document.getElementById(id);
      if (!popover) return;
      const willOpen = popover.hidden;
      closeHelpPopovers(willOpen ? id : null);
      popover.hidden = !willOpen;
      if (willOpen) positionHelpPopover(button, popover);
      else clearHelpPosition(popover);
      button.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".help-wrap") && !event.target.closest(".help-popover")) {
      closeHelpPopovers();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeHelpPopovers();
  });
  window.addEventListener("resize", () => closeHelpPopovers(), { passive: true });
}

function setDrawerOpen(id, open, { focus = true } = {}) {
  const drawer = document.getElementById(id);
  if (!drawer) return;
  drawer.hidden = !open;

  const toggles = [...document.querySelectorAll(`[data-form-toggle="${id}"]`)];
  for (const button of toggles) {
    button.setAttribute("aria-expanded", open ? "true" : "false");
  }
  const layoutId = toggles[0]?.dataset.drawerLayout;
  if (layoutId) {
    const layout = document.getElementById(layoutId);
    layout?.classList.toggle("is-single", !open);
  }
  if (open && focus) {
    drawer
      .querySelector("input:not([type=hidden]), select, textarea, button")
      ?.focus();
  }
}

function bindFormDrawers() {
  for (const button of document.querySelectorAll("[data-form-toggle]")) {
    button.addEventListener("click", () => {
      const id = button.dataset.formToggle;
      const drawer = document.getElementById(id);
      if (!drawer) return;
      setDrawerOpen(id, drawer.hidden);
    });
  }
  for (const button of document.querySelectorAll("[data-form-close]")) {
    button.addEventListener("click", () => {
      setDrawerOpen(button.dataset.formClose, false, { focus: false });
    });
  }
}

function setStatus(message, kind = "ok") {
  const status = $("#globalStatus");
  if (!status) return;
  status.textContent = message || "";
  status.hidden = !message;
  status.classList.toggle("is-error", kind === "error");
}

function setLoginError(message) {
  const error = $("#loginError");
  if (!error) return;
  error.textContent = message || "";
  error.hidden = !message;
}

function showLogin() {
  $("#adminView").hidden = true;
  $("#loginView").hidden = false;
  setCsrfToken(null);
  pendingChallengeId = null;
  $("#loginTitle").textContent = "Ingresar";
  $("#loginForm").hidden = false;
  $("#loginCodeForm").hidden = true;
  $("#loginCodeError").hidden = true;
  $("#forgotForm").hidden = true;
  $("#resetForm").hidden = true;
  $("#forgotMessage").hidden = true;
  $("#resetError").hidden = true;
  $("#resetOk").hidden = true;
  $("#adminUsername")?.focus();
}

function showForgot() {
  $("#loginTitle").textContent = "Recuperar contraseña";
  $("#loginForm").hidden = true;
  $("#loginCodeForm").hidden = true;
  $("#resetForm").hidden = true;
  $("#forgotForm").hidden = false;
  $("#forgotMessage").hidden = true;
  $("#forgotEmail").value = "";
  $("#forgotEmail").focus();
}

function showReset() {
  $("#adminView").hidden = true;
  $("#loginView").hidden = false;
  setCsrfToken(null);
  $("#loginTitle").textContent = "Nueva contraseña";
  $("#loginForm").hidden = true;
  $("#loginCodeForm").hidden = true;
  $("#forgotForm").hidden = true;
  $("#resetForm").hidden = false;
  $("#resetError").hidden = true;
  $("#resetOk").hidden = true;
  $("#resetPassword").value = "";
  $("#resetPassword2").value = "";
  $("#resetPassword").focus();
}

function showLoginCode(challengeId) {
  pendingChallengeId = challengeId;
  $("#loginTitle").textContent = "Verifica tu correo";
  $("#loginForm").hidden = true;
  $("#loginCodeForm").hidden = false;
  $("#loginCode").value = "";
  $("#loginCodeError").hidden = true;
  $("#loginCode").focus();
}

function showApp(session) {
  $("#loginView").hidden = true;
  $("#adminView").hidden = false;
  state.role = session.role === "owner" ? "owner" : "editor";
  $("#sessionUser").textContent = session.user || "—";
  $("#sessionExpiry").textContent = session.expiresAt
    ? `vence ${formatDate(session.expiresAt)}`
    : "—";
  setStatus("");
  applyRoleUi();
  selectView(state.view);
  loadDemandBadge().catch(() => {});
}

function applyRoleUi() {
  const owner = state.role === "owner";
  document.body.dataset.role = state.role;
  for (const element of document.querySelectorAll('[data-requires="owner"]')) {
    element.hidden = !owner;
  }
  if (!owner && ["apis", "chat", "audit"].includes(state.view)) {
    state.view = "config";
  }
}

function selectView(view) {
  if (!VIEW_META[view]) return;
  const navButton = document.querySelector(`.nav-item[data-view="${view}"]`);
  if (navButton?.dataset.requires === "owner" && state.role !== "owner") {
    return;
  }
  state.view = view;

  for (const button of document.querySelectorAll(".nav-item")) {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  for (const section of document.querySelectorAll(".view")) {
    section.hidden = section.id !== `view-${view}`;
  }

  $("#viewEyebrow").textContent = VIEW_META[view].eyebrow;
  $("#viewTitle").textContent = VIEW_META[view].title;
  const mode = VIEW_META[view].mode || "solo lectura";
  const modeChip = $("#viewModeChip");
  if (modeChip) {
    modeChip.classList.toggle("chip-live", mode === "editable");
    const modeText = document.getElementById("viewModeText");
    if (modeText) modeText.textContent = mode;
  }
  setStatus("");

  if (view === "config" && !state.loaded.config) loadConfig();
  if (view === "layers") loadLayerManager();
  if (view === "rag") loadRag();
  if (view === "apis") loadApis();
  if (view === "taxonomy") loadTaxonomy();
  if (view === "chat" && !state.loaded.chat) loadChat();
  if (view === "demand") loadDemand();
  if (view === "audit") loadAudit();
  if (view !== "rag") stopRagPolling();
  if (view !== "layers") stopLayerPolling();
}

async function withAuth(promise) {
  try {
    return await promise;
  } catch (err) {
    if (err.status === 401) {
      showLogin();
      setLoginError("La sesión expiró. Vuelve a ingresar.");
      return null;
    }
    throw err;
  }
}

// ── Configuración ─────────────────────────────────────────

async function loadConfig() {
  setStatus("Cargando configuración…");
  try {
    const data = await withAuth(api.config());
    if (!data) return;

    const snapshot = data.snapshot || {};
    const layers = Array.isArray(data.layers) ? data.layers : [];
    state.layers = layers;
    state.loaded.config = true;

    const master = layers.filter((layer) => layer.scope === "master");
    $("#metricVersion").textContent = snapshot.version ? `v${snapshot.version}` : "—";
    $("#metricDate").textContent = snapshot.generatedAt
      ? formatDate(snapshot.generatedAt)
      : "—";
    $("#metricLayers").textContent = String(master.length);
    $("#metricRows").textContent = String(layers.length);
    $("#metricChecksum").textContent = snapshot.checksum
      ? shortHash(snapshot.checksum)
      : "—";
    $("#metricChecksum").title = snapshot.checksum || "";
    $("#snapshotChip").textContent = snapshot.version
      ? `Snapshot v${snapshot.version}`
      : "Snapshot —";

    const dimensions = [...new Set(layers.map((layer) => layer.dimension_key))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "es"));
    const select = $("#dimensionFilter");
    select.replaceChildren(el("option", { text: "Todas las dimensiones", attrs: { value: "" } }));
    for (const dimension of dimensions) {
      select.appendChild(el("option", { text: dimension, attrs: { value: dimension } }));
    }

    renderLayers();
    setStatus("");
  } catch (err) {
    setStatus(`No se pudo cargar la configuración: ${err.message}`, "error");
  }
}

function renderLayers() {
  const body = $("#layersBody");
  const empty = $("#layersEmpty");
  if (!body || !empty) return;

  const term = ($("#layerSearch")?.value || "").trim().toLowerCase();
  const dimension = $("#dimensionFilter")?.value || "";

  const rows = state.layers.filter((layer) => {
    if (dimension && layer.dimension_key !== dimension) return false;
    if (!term) return true;
    return [
      layer.dimension_key,
      layer.group_key,
      layer.subgroup_key,
      layer.layer_key,
      layer.nombre,
      layer.tipo,
      layer.source_type,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  });

  const fragment = document.createDocumentFragment();
  for (const layer of rows) {
    const location = [layer.scope, layer.group_key, layer.subgroup_key]
      .filter(Boolean)
      .join(" / ");

    fragment.appendChild(
      el("tr", {}, [
        el("td", { className: "dim", text: layer.dimension_key || "—" }),
        el("td", { className: "dim", text: location || "—" }),
        el("td", {}, [el("code", { text: layer.layer_key || "—" })]),
        el("td", { className: "layer-name", text: layer.nombre || "—" }),
        el("td", { text: layer.tipo || "—" }),
        el("td", {}, [
          el("span", { text: layer.source_type || "—" }),
          layer.has_tiles
            ? el("span", { className: "badge badge-ok", text: "tiles" })
            : null,
        ]),
      ])
    );
  }

  body.replaceChildren(fragment);
  empty.hidden = rows.length > 0;
}

// ── Taxonomía ─────────────────────────────────────────────

function taxSetStatus(message, kind = "ok") {
  const node = $("#taxStatus");
  if (!node) return;
  node.textContent = message || "";
  node.hidden = !message;
  node.classList.toggle("is-error", kind === "error");
}

function taxDimension() {
  return state.taxonomy.data?.dimensions?.find(
    (item) => Number(item.id) === Number(state.taxonomy.selectedDimensionId)
  ) || null;
}

function taxGroup() {
  return state.taxonomy.data?.groups?.find(
    (item) => Number(item.id) === Number(state.taxonomy.selectedGroupId)
  ) || null;
}

function taxGroupRows(dimensionId) {
  return (state.taxonomy.data?.groups || []).filter(
    (item) => Number(item.dimension_id) === Number(dimensionId)
  );
}

function taxSubgroupRows(groupId) {
  return (state.taxonomy.data?.subgroups || []).filter(
    (item) => Number(item.group_id) === Number(groupId)
  );
}

async function loadTaxonomy({ silent = false } = {}) {
  if (state.taxonomy.loading) return;
  state.taxonomy.loading = true;
  if (!silent) setStatus("Cargando taxonomía…");
  try {
    const data = await withAuth(api.taxonomy());
    if (!data) return;
    state.taxonomy.data = data;
    state.loaded.taxonomy = true;

    if (
      state.taxonomy.selectedDimensionId &&
      !data.dimensions.some(
        (item) => Number(item.id) === Number(state.taxonomy.selectedDimensionId)
      )
    ) {
      state.taxonomy.selectedDimensionId = null;
    }
    if (!state.taxonomy.selectedDimensionId && data.dimensions.length > 0) {
      state.taxonomy.selectedDimensionId = data.dimensions[0].id;
    }
    if (
      state.taxonomy.selectedGroupId &&
      !data.groups.some(
        (item) => Number(item.id) === Number(state.taxonomy.selectedGroupId)
      )
    ) {
      state.taxonomy.selectedGroupId = null;
    }

    renderTaxonomy(data);
    if (!silent) setStatus("");
  } catch (err) {
    setStatus(`No se pudo cargar la taxonomía: ${err.message}`, "error");
  } finally {
    state.taxonomy.loading = false;
  }
}

function taxActionButton(label, action, id) {
  return el("button", {
    className: "btn btn-secondary btn-mini",
    text: label,
    attrs: { type: "button", "data-tax-action": action, "data-id": id },
  });
}

function taxDeleteButton(action, id) {
  return el("button", {
    className: "btn btn-secondary btn-mini",
    text: "Quitar",
    attrs: { type: "button", "data-tax-delete": action, "data-id": id },
  });
}

function renderTaxonomy(data) {
  $("#taxMetricDimensions").textContent = String(data.dimensions.length);
  $("#taxMetricGroups").textContent = String(data.groups.length);
  $("#taxMetricSubgroups").textContent = String(data.subgroups.length);
  $("#taxMetricLayers").textContent = String(data.layers.length);

  renderTaxDimensions(data.dimensions);
  renderTaxLayerSelects(data.layers);
  renderTaxDetail();
}

function renderTaxDimensions(dimensions) {
  const body = $("#taxDimensionsBody");
  const empty = $("#taxDimensionsEmpty");
  const fragment = document.createDocumentFragment();

  for (const dimension of dimensions) {
    const selected = Number(dimension.id) === Number(state.taxonomy.selectedDimensionId);
    const rows = [];
    rows.push(el("td", {}, [el("code", { text: dimension.key })]));
    rows.push(el("td", { className: "layer-name", text: dimension.nombre }));
    rows.push(el("td", { text: dimension.orden }));
    rows.push(el("td", {}, [
      el("span", {
        className: dimension.activo ? "badge badge-ok" : "badge",
        text: dimension.activo ? "activa" : "inactiva",
      }),
    ]));
    rows.push(el("td", {}, [
      el("div", { className: "row-actions" }, [
        el("button", {
          className: "btn btn-secondary btn-mini",
          text: selected ? "Seleccionada" : "Abrir",
          attrs: { type: "button", "data-tax-action": "select-dimension", "data-id": dimension.id },
        }),
        taxActionButton("Editar", "edit-dimension", dimension.id),
        taxDeleteButton("dimension", dimension.id),
      ]),
    ]));
    const tr = el("tr", { className: selected ? "is-selected" : "" }, rows);
    fragment.appendChild(tr);
  }

  body.replaceChildren(fragment);
  empty.hidden = dimensions.length > 0;
}

function renderTaxLayerSelects(layers) {
  const select = $("#taxAssignLayer");
  if (!select) return;
  const current = select.value;
  const options = layers
    .filter((layer) => layer.activo !== false)
    .map((layer) =>
      el("option", {
        text: `${layer.nombre} (${layer.layer_key})`,
        attrs: { value: layer.id },
      })
    );
  select.replaceChildren(
    el("option", { text: "Seleccionar capa…", attrs: { value: "" } }),
    ...options
  );
  if ([...select.options].some((option) => option.value === current)) {
    select.value = current;
  }
}

function renderTaxAssignDestinations(dimension) {
  const select = $("#taxAssignDestination");
  if (!select) return;
  const current = select.value;
  const options = [
    el("option", {
      text: "Dimensión general (nivel superior)",
      attrs: { value: "master" },
    }),
  ];

  for (const group of taxGroupRows(dimension.id)) {
    options.push(
      el("option", {
        text: `Grupo · ${group.nombre}`,
        attrs: { value: `group:${group.id}` },
      })
    );
    for (const subgroup of taxSubgroupRows(group.id)) {
      options.push(
        el("option", {
          text: `Subgrupo · ${group.nombre} / ${subgroup.nombre}`,
          attrs: { value: `subgroup:${subgroup.id}` },
        })
      );
    }
  }

  select.replaceChildren(...options);
  if ([...select.options].some((option) => option.value === current)) {
    select.value = current;
  }
}

function renderTaxDetail() {
  const detail = $("#taxDimensionDetail");
  const dimension = taxDimension();
  if (!dimension) {
    detail.hidden = true;
    return;
  }
  detail.hidden = false;
  $("#taxDimensionTitle").textContent = dimension.nombre === dimension.key
    ? dimension.nombre
    : `${dimension.nombre} · ${dimension.key}`;

  const groups = taxGroupRows(dimension.id);
  renderTaxAssignDestinations(dimension);
  if (
    state.taxonomy.selectedGroupId &&
    !groups.some((group) => Number(group.id) === Number(state.taxonomy.selectedGroupId))
  ) {
    state.taxonomy.selectedGroupId = null;
  }
  const groupsBody = $("#taxGroupsBody");
  const groupsEmpty = $("#taxGroupsEmpty");
  const fragment = document.createDocumentFragment();
  for (const group of groups) {
    const subgroups = taxSubgroupRows(group.id);
    const selected = Number(group.id) === Number(state.taxonomy.selectedGroupId);
    const placements = (state.taxonomy.data.placements || []).filter(
      (item) => Number(item.group_id) === Number(group.id)
    );
    fragment.appendChild(
      el("tr", { className: selected ? "is-selected" : "" }, [
        el("td", {}, [el("code", { text: group.key })]),
        el("td", { className: "layer-name", text: group.nombre }),
        el("td", { text: group.orden }),
        el("td", {}, [
          el("span", {
            className: group.activo ? "badge badge-ok" : "badge",
            text: group.activo ? "activo" : "inactivo",
          }),
          el("small", { className: "item-meta", text: ` · ${subgroups.length} subgrupos · ${placements.length} capas` }),
        ]),
        el("td", {}, [
          el("div", { className: "row-actions" }, [
            el("button", {
              className: "btn btn-secondary btn-mini",
              text: selected ? "Seleccionado" : "Abrir",
              attrs: { type: "button", "data-tax-action": "select-group", "data-id": group.id },
            }),
            taxActionButton("Editar", "edit-group", group.id),
            taxDeleteButton("group", group.id),
          ]),
        ]),
      ])
    );
  }
  groupsBody.replaceChildren(fragment);
  groupsEmpty.hidden = groups.length > 0;

  renderTaxGroupDetail();
  renderTaxMaster(dimension);
}

function renderTaxGroupDetail() {
  const detail = $("#taxGroupDetail");
  const group = taxGroup();
  if (!group) {
    detail.hidden = true;
    return;
  }
  detail.hidden = false;
  $("#taxGroupTitle").textContent = group.nombre === group.key
    ? group.nombre
    : `${group.nombre} · ${group.key}`;

  const subgroups = taxSubgroupRows(group.id);
  const subgroupBody = $("#taxSubgroupsBody");
  const subgroupEmpty = $("#taxSubgroupsEmpty");
  const fragment = document.createDocumentFragment();
  for (const subgroup of subgroups) {
    fragment.appendChild(
      el("tr", {}, [
        el("td", {}, [el("code", { text: subgroup.key })]),
        el("td", { className: "layer-name", text: subgroup.nombre }),
        el("td", { text: subgroup.orden }),
        el("td", {}, [
          el("span", {
            className: subgroup.activo ? "badge badge-ok" : "badge",
            text: subgroup.activo ? "activo" : "inactivo",
          }),
        ]),
        el("td", {}, [
          el("div", { className: "row-actions" }, [
            taxActionButton("Editar", "edit-subgroup", subgroup.id),
            taxDeleteButton("subgroup", subgroup.id),
          ]),
        ]),
      ])
    );
  }
  subgroupBody.replaceChildren(fragment);
  subgroupEmpty.hidden = subgroups.length > 0;

  const placements = (state.taxonomy.data.placements || []).filter(
    (item) => Number(item.group_id) === Number(group.id)
  );
  const placementBody = $("#taxPlacementsBody");
  const placementEmpty = $("#taxPlacementsEmpty");
  const placementFragment = document.createDocumentFragment();
  for (const placement of placements) {
    const subgroup = (state.taxonomy.data.subgroups || []).find(
      (item) => Number(item.id) === Number(placement.subgroup_id)
    );
    placementFragment.appendChild(
      el("tr", {}, [
        el("td", { className: "layer-name", text: placement.layer_nombre || placement.layer_key }),
        el("td", { text: subgroup ? subgroup.nombre : "Grupo directo" }),
        el("td", { text: placement.orden }),
        el("td", {}, [
          el("button", {
            className: "btn btn-secondary btn-mini",
            text: "Quitar",
            attrs: { type: "button", "data-tax-placement": placement.id },
          }),
        ]),
      ])
    );
  }
  placementBody.replaceChildren(placementFragment);
  placementEmpty.hidden = placements.length > 0;
}

function renderTaxMaster(dimension) {
  const placements = (state.taxonomy.data.placements || []).filter(
    (item) =>
      Number(item.dimension_id) === Number(dimension.id) &&
      item.scope === "master"
  );
  const body = $("#taxMasterBody");
  const empty = $("#taxMasterEmpty");
  const fragment = document.createDocumentFragment();
  for (const placement of placements) {
    fragment.appendChild(
      el("tr", {}, [
        el("td", { className: "layer-name", text: placement.layer_nombre || placement.layer_key }),
        el("td", { text: placement.orden }),
        el("td", {}, [
          el("button", {
            className: "btn btn-secondary btn-mini",
            text: "Quitar",
            attrs: { type: "button", "data-tax-placement": placement.id },
          }),
        ]),
      ])
    );
  }
  body.replaceChildren(fragment);
  empty.hidden = placements.length > 0;
}

function editTaxDimension(id) {
  setDrawerOpen("taxDimensionDrawer", true, { focus: false });
  const dimension = state.taxonomy.data?.dimensions?.find(
    (item) => Number(item.id) === Number(id)
  );
  if (!dimension) return;
  $("#taxDimId").value = dimension.id;
  $("#taxDimKey").value = dimension.key;
  $("#taxDimKey").readOnly = true;
  $("#taxDimNombre").value = dimension.nombre;
  $("#taxDimIcono").value = dimension.icono || "";
  $("#taxDimOrder").value = dimension.orden;
  $("#taxDimActivo").checked = dimension.activo !== false;
  $("#taxDimensionForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

function newTaxDimension() {
  $("#taxDimensionForm").reset();
  $("#taxDimId").value = "";
  $("#taxDimKey").readOnly = false;
  $("#taxDimActivo").checked = true;
  $("#taxDimOrder").value = "0";
}

async function saveTaxDimension(event) {
  event.preventDefault();
  const payload = {
    id: $("#taxDimId").value || undefined,
    key: $("#taxDimKey").value.trim().toLowerCase(),
    nombre: $("#taxDimNombre").value.trim(),
    icono: $("#taxDimIcono").value.trim(),
    orden: Number.parseInt($("#taxDimOrder").value, 10) || 0,
    activo: $("#taxDimActivo").checked,
  };
  try {
    const result = await api.taxonomySaveDimension(payload);
    state.taxonomy.selectedDimensionId = result.item.id;
    taxSetStatus("Dimensión guardada. Publica el snapshot para aplicarla al visor.");
    setDrawerOpen("taxDimensionDrawer", false, { focus: false });
    await loadTaxonomy({ silent: true });
  } catch (err) {
    taxSetStatus(err.message, "error");
  }
}

function editTaxGroup(id) {
  setDrawerOpen("taxGroupDrawer", true, { focus: false });
  const group = state.taxonomy.data?.groups?.find((item) => Number(item.id) === Number(id));
  if (!group) return;
  $("#taxGroupId").value = group.id;
  $("#taxGroupKey").value = group.key;
  $("#taxGroupKey").readOnly = true;
  $("#taxGroupNombre").value = group.nombre;
  $("#taxGroupOrder").value = group.orden;
  $("#taxGroupActivo").checked = group.activo !== false;
}

function newTaxGroup() {
  $("#taxGroupForm").reset();
  $("#taxGroupId").value = "";
  $("#taxGroupKey").readOnly = false;
  $("#taxGroupActivo").checked = true;
  $("#taxGroupOrder").value = "0";
}

async function saveTaxGroup(event) {
  event.preventDefault();
  const dimension = taxDimension();
  if (!dimension) return;
  const payload = {
    id: $("#taxGroupId").value || undefined,
    dimension_id: dimension.id,
    key: $("#taxGroupKey").value.trim().toLowerCase(),
    nombre: $("#taxGroupNombre").value.trim(),
    orden: Number.parseInt($("#taxGroupOrder").value, 10) || 0,
    activo: $("#taxGroupActivo").checked,
  };
  try {
    const result = await api.taxonomySaveGroup(payload);
    state.taxonomy.selectedGroupId = result.item.id;
    taxSetStatus("Grupo guardado. Publica el snapshot para aplicarlo.");
    setDrawerOpen("taxGroupDrawer", false, { focus: false });
    await loadTaxonomy({ silent: true });
  } catch (err) {
    taxSetStatus(err.message, "error");
  }
}

function editTaxSubgroup(id) {
  setDrawerOpen("taxSubgroupDrawer", true, { focus: false });
  const subgroup = state.taxonomy.data?.subgroups?.find((item) => Number(item.id) === Number(id));
  if (!subgroup) return;
  $("#taxSubgroupId").value = subgroup.id;
  $("#taxSubgroupKey").value = subgroup.key;
  $("#taxSubgroupKey").readOnly = true;
  $("#taxSubgroupNombre").value = subgroup.nombre;
  $("#taxSubgroupOrder").value = subgroup.orden;
  $("#taxSubgroupActivo").checked = subgroup.activo !== false;
}

function newTaxSubgroup() {
  $("#taxSubgroupForm").reset();
  $("#taxSubgroupId").value = "";
  $("#taxSubgroupKey").readOnly = false;
  $("#taxSubgroupActivo").checked = true;
  $("#taxSubgroupOrder").value = "0";
}

async function saveTaxSubgroup(event) {
  event.preventDefault();
  const group = taxGroup();
  if (!group) return;
  const payload = {
    id: $("#taxSubgroupId").value || undefined,
    group_id: group.id,
    key: $("#taxSubgroupKey").value.trim().toLowerCase(),
    nombre: $("#taxSubgroupNombre").value.trim(),
    orden: Number.parseInt($("#taxSubgroupOrder").value, 10) || 0,
    activo: $("#taxSubgroupActivo").checked,
  };
  try {
    await api.taxonomySaveSubgroup(payload);
    taxSetStatus("Subgrupo guardado. Publica el snapshot para aplicarlo.");
    setDrawerOpen("taxSubgroupDrawer", false, { focus: false });
    await loadTaxonomy({ silent: true });
  } catch (err) {
    taxSetStatus(err.message, "error");
  }
}

async function saveTaxAssignment(event) {
  event.preventDefault();
  const dimension = taxDimension();
  const layerId = $("#taxAssignLayer").value;
  const destination = $("#taxAssignDestination").value;
  if (!dimension || !layerId || !destination) {
    taxSetStatus("Elige una capa y un destino.", "error");
    return;
  }

  let scope = "master";
  let groupId = null;
  let subgroupId = null;

  if (destination.startsWith("group:")) {
    scope = "group";
    groupId = Number(destination.slice("group:".length));
  } else if (destination.startsWith("subgroup:")) {
    scope = "subgroup";
    subgroupId = Number(destination.slice("subgroup:".length));
    const subgroup = (state.taxonomy.data?.subgroups || []).find(
      (item) => Number(item.id) === subgroupId
    );
    groupId = subgroup ? Number(subgroup.group_id) : null;
  }

  if (scope !== "master" && !groupId) {
    taxSetStatus("El destino no tiene un grupo válido.", "error");
    return;
  }
  if (scope === "subgroup" && !subgroupId) {
    taxSetStatus("El destino no tiene un subgrupo válido.", "error");
    return;
  }

  try {
    await api.taxonomySavePlacement({
      layer_id: layerId,
      dimension_id: dimension.id,
      group_id: groupId,
      subgroup_id: subgroupId,
      scope,
      orden: Number.parseInt($("#taxAssignOrder").value, 10) || 0,
    });
    taxSetStatus("Capa ubicada. Publica el snapshot para verla en el sidebar.");
    setDrawerOpen("taxAssignDrawer", false, { focus: false });
    await loadTaxonomy({ silent: true });
  } catch (err) {
    taxSetStatus(err.message, "error");
  }
}

async function deleteTaxEntity(kind, id) {
  const labels = {
    dimension: "la dimensión y todo su contenido",
    group: "el grupo y sus subgrupos/asignaciones",
    subgroup: "el subgrupo y sus asignaciones",
  };
  if (!window.confirm(`¿Quitar ${labels[kind] || kind}?`)) return;
  try {
    if (kind === "dimension") await api.taxonomyDeleteDimension(id);
    if (kind === "group") await api.taxonomyDeleteGroup(id);
    if (kind === "subgroup") await api.taxonomyDeleteSubgroup(id);
    if (kind === "dimension" && Number(state.taxonomy.selectedDimensionId) === Number(id)) {
      state.taxonomy.selectedDimensionId = null;
      state.taxonomy.selectedGroupId = null;
    }
    if (kind === "group" && Number(state.taxonomy.selectedGroupId) === Number(id)) {
      state.taxonomy.selectedGroupId = null;
    }
    taxSetStatus("Elemento quitado. Publica el snapshot para aplicarlo.");
    await loadTaxonomy({ silent: true });
  } catch (err) {
    taxSetStatus(err.message, "error");
  }
}

async function deleteTaxPlacement(id) {
  try {
    await api.taxonomyDeletePlacement(id);
    taxSetStatus("Asignación quitada. Publica el snapshot para aplicarla.");
    await loadTaxonomy({ silent: true });
  } catch (err) {
    taxSetStatus(err.message, "error");
  }
}

async function publishTaxonomy() {
  const button = $("#taxPublishBtn");
  button.disabled = true;
  taxSetStatus("Publicando snapshot…");
  try {
    const result = await api.taxonomyPublish();
    state.loaded.config = false;
    taxSetStatus(`Snapshot publicado. ${String(result.output || "").split("\n").slice(-2).join(" ").trim()}`);
    await loadTaxonomy({ silent: true });
  } catch (err) {
    taxSetStatus(String(err.output || err.message).slice(0, 800), "error");
  } finally {
    button.disabled = false;
  }
}

// ── APIs externas ─────────────────────────────────────────

const API_KIND_LABELS = {
  proxy: "Proxy cerrado",
  http: "HTTP",
  embeddings: "Embeddings",
};

function apiSetStatus(message, kind = "ok") {
  const node = $("#apiEditorStatus");
  if (!node) return;
  node.textContent = message || "";
  node.hidden = !message;
  node.classList.toggle("is-error", kind === "error");
}

async function loadApis({ silent = false } = {}) {
  if (state.apis.loading) {
    state.apis.reload = true;
    return;
  }
  state.apis.loading = true;
  if (!silent) setStatus("Cargando conexiones externas…");
  try {
    const data = await withAuth(api.apisList());
    if (!data) return;
    state.apis.data = data;
    state.loaded.apis = true;
    renderApis(data);
    if (!silent) setStatus("");
  } catch (err) {
    setStatus(`No se pudieron cargar las APIs: ${err.message}`, "error");
  } finally {
    state.apis.loading = false;
    if (state.apis.reload) {
      state.apis.reload = false;
      loadApis({ silent: true });
    }
  }
}

function apiProbeBadge(item) {
  if (!item.last_check_at) {
    return { label: "Sin probar", className: "badge" };
  }
  if (item.last_status === null || item.last_status === undefined) {
    return { label: "Error de red", className: "badge badge-fail" };
  }
  const ok = item.last_status >= 200 && item.last_status < 400;
  return {
    label: `HTTP ${item.last_status}`,
    className: ok ? "badge badge-ok" : "badge badge-fail",
  };
}

function renderApis(data) {
  const items = Array.isArray(data.items) ? data.items : [];
  const counts = data.counts || {};
  $("#apisMetricTotal").textContent = String(counts.total ?? items.length);
  $("#apisMetricActive").textContent = String(counts.active ?? 0);
  $("#apisMetricEnv").textContent = String(counts.envReady ?? 0);
  const failing = items.filter(
    (item) => item.last_status && item.last_status >= 400
  ).length;
  $("#apisMetricError").textContent = failing > 0 ? `${failing} con error` : "Sin errores";

  const body = $("#apisBody");
  const empty = $("#apisEmpty");
  const fragment = document.createDocumentFragment();

  for (const item of items) {
    const probe = apiProbeBadge(item);
    const envBadges = (item.env || []).map((variable) =>
      el("span", {
        className: variable.present ? "badge badge-ok" : "badge badge-fail",
        text: variable.name,
        title: variable.present ? "Variable presente" : "Variable ausente",
      })
    );

    const testButton = el("button", {
      className: "btn btn-secondary btn-mini",
      text: "Probar",
      attrs: { type: "button", "data-api-test": item.key },
    });
    const editButton = el("button", {
      className: "btn btn-secondary btn-mini",
      text: "Editar",
      attrs: { type: "button", "data-api-edit": item.key },
    });
    const toggleButton = el("button", {
      className: "btn btn-secondary btn-mini",
      text: item.activo === false ? "Reactivar" : "Archivar",
      attrs: { type: "button", "data-api-toggle": item.key },
    });

    fragment.appendChild(
      el("tr", {}, [
        el("td", {}, [
          el("strong", { className: "layer-name", text: item.label }),
          item.activo === false
            ? el("span", { className: "badge badge-warn", text: "archivada" })
            : null,
          el("small", { className: "item-meta", text: ` ${item.key}` }),
          item.description
            ? el("small", { className: "item-meta", text: ` · ${item.description}` })
            : null,
        ]),
        el("td", {}, [
          el("span", { className: "badge", text: API_KIND_LABELS[item.kind] || item.kind }),
        ]),
        el("td", {}, [
          el("span", {
            className: "dim",
            text: item.baseUrl || "—",
            title: item.baseUrl || "",
          }),
        ]),
        el("td", {}, [
          envBadges.length
            ? el("div", { className: "env-badges" }, envBadges)
            : el("span", { className: "dim", text: "sin variables" }),
        ]),
        el("td", {}, [
          el("span", { text: item.last_check_at ? formatDate(item.last_check_at) : "—" }),
          item.last_latency_ms !== null && item.last_latency_ms !== undefined
            ? el("small", { className: "item-meta", text: ` · ${item.last_latency_ms} ms` })
            : null,
        ]),
        el("td", {}, [
          el("span", { className: probe.className, text: probe.label, title: item.last_error || "" }),
        ]),
        el("td", {}, [
          el("div", { className: "row-actions" }, [testButton, editButton, toggleButton]),
        ]),
      ])
    );
  }

  body.replaceChildren(fragment);
  empty.hidden = items.length > 0;
}

function editApi(key) {
  const item = state.apis.data?.items?.find((entry) => entry.key === key);
  if (!item) return;
  $("#apiEditorKey").value = item.key;
  $("#apiEditorTitle").textContent = `Editar ${item.label}`;
  $("#apiEditorLabel").value = item.label || "";
  $("#apiEditorTimeout").value = String(item.timeout_ms || 15000);
  $("#apiEditorRate").value = item.rate_limit || "";
  $("#apiEditorActive").checked = item.activo !== false;
  apiSetStatus("");
  const editor = $("#apiEditor");
  editor.hidden = false;
  editor.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveApiEditor(event) {
  event.preventDefault();
  const key = $("#apiEditorKey").value;
  const label = $("#apiEditorLabel").value.trim();
  const timeout = Number.parseInt($("#apiEditorTimeout").value, 10);
  const rate = $("#apiEditorRate").value.trim();
  const activo = $("#apiEditorActive").checked;

  if (!key || !label) {
    apiSetStatus("Completa el nombre visible.", "error");
    return;
  }
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 120000) {
    apiSetStatus("El timeout debe estar entre 1000 y 120000 ms.", "error");
    return;
  }

  const button = $("#apiEditorSave");
  button.disabled = true;
  try {
    await api.apisUpdate({ key, label, timeout_ms: timeout, rate_limit: rate, activo });
    apiSetStatus("Conexión actualizada.");
    await loadApis({ silent: true });
  } catch (err) {
    apiSetStatus(err.message, "error");
  } finally {
    button.disabled = false;
  }
}

async function testApi(key, button) {
  if (button) button.disabled = true;
  setStatus(`Probando ${key}…`);
  try {
    const result = await api.apisTest(key);
    setStatus(
      result.ok
        ? `${key}: OK (HTTP ${result.status}, ${result.latency_ms} ms).`
        : `${key}: ${result.error || `HTTP ${result.status}`}.`,
      result.ok ? "ok" : "error"
    );
    await loadApis({ silent: true });
  } catch (err) {
    setStatus(`No se pudo probar ${key}: ${err.message}`, "error");
  } finally {
    if (button) button.disabled = false;
  }
}

async function toggleApi(key, button) {
  const item = state.apis.data?.items?.find((entry) => entry.key === key);
  if (!item) return;
  const nextActive = item.activo === false;
  if (!nextActive && !window.confirm(
    `¿Archivar ${item.label}? Dejará de usarse en el backend, pero su definición de código no se borra.`
  )) {
    return;
  }
  if (button) button.disabled = true;
  try {
    await api.apisUpdate({
      key,
      label: item.label,
      timeout_ms: item.timeout_ms,
      rate_limit: item.rate_limit || "",
      activo: nextActive,
    });
    setStatus(nextActive ? `${item.label} reactivada.` : `${item.label} archivada.`);
    await loadApis({ silent: true });
  } catch (err) {
    setStatus(`No se pudo cambiar el estado de ${key}: ${err.message}`, "error");
  } finally {
    if (button) button.disabled = false;
  }
}

// ── Demanda no satisfecha (Sprint 50) ─────────────────────

const DEMAND_STATUS = {
  pending: "Pendiente",
  reviewing: "En revisión",
  in_progress: "En revisión",
  accepted: "Aceptada",
  planned: "Planificada",
  resolved: "Resuelta",
  rejected: "Rechazada",
  wont_fix: "Rechazada",
  duplicate: "Duplicada",
  archived: "Archivada",
};

const DEMAND_REASON = {
  no_data: "Sin dato",
  no_recipe: "Sin receta",
  no_tool: "Sin tool",
  no_document: "Sin documento",
  out_of_scope: "Fuera de alcance",
  unknown: "Desconocida",
};

const DEMAND_PRIORITY = { alta: "Alta", media: "Media", baja: "Baja" };

const DEMAND_DECISION = {
  new_tool: "Nueva tool",
  new_layer: "Nueva capa",
  new_document: "Nuevo documento RAG",
  improve_prompt: "Mejorar prompt",
  unavailable: "Dato inexistente",
  out_of_scope: "Fuera de alcance",
  wont_fix: "No se hará",
  duplicate: "Duplicada",
};

function demandStatusBadge(status) {
  if (status === "pending") return "badge badge-warn";
  if (["reviewing", "in_progress"].includes(status)) return "badge";
  if (["accepted", "planned", "resolved"].includes(status)) return "badge badge-ok";
  return "badge";
}

function demandPriorityBadge(priority) {
  if (priority === "alta") return "badge badge-fail";
  if (priority === "media") return "badge badge-warn";
  return "badge";
}

function setDemandBadge(count) {
  const badge = $("#demandBadge");
  if (!badge) return;
  const value = Number(count) || 0;
  badge.textContent = value > 99 ? "99+" : String(value);
  badge.hidden = value === 0;
}

async function loadDemandBadge() {
  const stats = await withAuth(api.unansweredStats());
  if (stats) setDemandBadge(stats.pending ?? 0);
}

function demandFilters() {
  return {
    q: $("#demandSearch")?.value.trim() || "",
    status: $("#demandStatus")?.value || "all",
    reason: $("#demandReason")?.value || "all",
    priority: $("#demandPriority")?.value || "all",
    sort: $("#demandSort")?.value || "last_seen_at",
    limit: 100,
    offset: 0,
  };
}

async function loadDemand({ silent = false } = {}) {
  if (state.demand.loading) {
    state.demand.reload = true;
    return;
  }
  state.demand.loading = true;
  if (!silent) setStatus("Cargando demanda…");
  try {
    const params = demandFilters();
    const [list, stats] = await Promise.all([
      withAuth(api.unansweredList(params)),
      withAuth(api.unansweredStats()),
    ]);
    if (!list || !stats) return;

    state.demand.items = list.items || [];
    state.demand.total = list.total ?? 0;
    state.demand.stats = stats;
    state.loaded.demand = true;
    renderDemand();
    setDemandBadge(stats.pending ?? 0);
    if (!silent) setStatus("");
  } catch (err) {
    setStatus(`No se pudo cargar la demanda: ${err.message}`, "error");
  } finally {
    state.demand.loading = false;
    if (state.demand.reload) {
      state.demand.reload = false;
      loadDemand({ silent: true });
    }
  }
}

function renderDemand() {
  const stats = state.demand.stats || {};
  $("#demandMetricPending").textContent = String(stats.pending ?? 0);
  $("#demandMetricReviewing").textContent = String(stats.reviewing ?? 0);
  $("#demandMetricAccepted").textContent = String(
    (stats.accepted ?? 0) + (stats.planned ?? 0)
  );
  $("#demandMetricResolved").textContent = String(stats.resolved ?? 0);

  const body = $("#demandBody");
  const empty = $("#demandEmpty");
  const meta = $("#demandMeta");
  const items = state.demand.items || [];
  const fragment = document.createDocumentFragment();
  for (const item of items) fragment.appendChild(demandRow(item));
  body.replaceChildren(fragment);
  empty.hidden = items.length > 0;
  if (meta) {
    meta.hidden = items.length === 0;
    meta.textContent = `Mostrando ${items.length} de ${state.demand.total} preguntas.`;
  }
}

function demandRow(item) {
  const pipeline = item.route?.pipeline;
  return el("tr", {}, [
    el("td", {}, [
      el("span", {
        className: "demand-question",
        text: item.question || "—",
        title: item.question || "",
      }),
    ]),
    el("td", {}, [
      el("span", { className: "badge", text: `×${item.occurrences ?? 1}` }),
    ]),
    el("td", {}, [
      el("span", { text: DEMAND_REASON[item.reason] || item.reason || "—" }),
    ]),
    el("td", {}, [
      el("span", { text: item.classification?.intent || "—" }),
      pipeline
        ? el("small", { className: "item-meta", text: ` · ${pipeline}` })
        : null,
    ]),
    el("td", {}, [
      el("span", {
        className: demandStatusBadge(item.status),
        text: DEMAND_STATUS[item.status] || item.status || "—",
      }),
    ]),
    el("td", {}, [
      item.priority
        ? el("span", {
            className: demandPriorityBadge(item.priority),
            text: DEMAND_PRIORITY[item.priority] || item.priority,
          })
        : el("span", { className: "dim", text: "—" }),
    ]),
    el("td", {}, [
      el("span", {
        text: DEMAND_DECISION[item.decision] || item.decision || "—",
      }),
    ]),
    el("td", {}, [
      el("span", {
        text: item.last_seen_at ? formatDate(item.last_seen_at) : "—",
      }),
    ]),
    el("td", {}, [
      el("div", { className: "row-actions" }, [
        el("button", {
          className: "btn btn-secondary btn-mini",
          text: "Ver",
          attrs: { type: "button", "data-demand-view": item.id },
        }),
        el("button", {
          className: "btn btn-secondary btn-mini",
          text: "Brief",
          attrs: { type: "button", "data-demand-brief": item.id },
        }),
      ]),
    ]),
  ]);
}

function demandFormStatus(message, kind = "ok") {
  const node = $("#demandFormMsg");
  if (!node) return;
  node.textContent = message || "";
  node.hidden = !message;
  node.classList.toggle("is-error", kind === "error");
}

function openDemandDetail(id) {
  const item = state.demand.items.find((entry) => entry.id === id);
  if (!item) return;

  state.demand.selectedId = id;
  $("#demandId").value = item.id;
  $("#demandDetailSubtitle").textContent = `ID ${item.id}`;
  $("#demandDetailQuestion").textContent = item.question || "—";

  const entries = [
    ["Ocurrencias", String(item.occurrences ?? 1)],
    ["Primera vez", item.first_seen_at ? formatDate(item.first_seen_at) : "—"],
    ["Última vez", item.last_seen_at ? formatDate(item.last_seen_at) : "—"],
    ["Razón", DEMAND_REASON[item.reason] || item.reason || "—"],
    ["Estado", DEMAND_STATUS[item.status] || item.status || "—"],
    ["Prioridad", item.priority ? DEMAND_PRIORITY[item.priority] : "sin definir"],
    ["Decisión", item.decision ? DEMAND_DECISION[item.decision] : "sin definir"],
    ["Sprint", item.sprint_target || "sin definir"],
  ];
  $("#demandDetailMeta").replaceChildren(
    ...entries.map(([label, value]) =>
      el("div", { className: "demand-meta-item" }, [
        el("span", { className: "demand-meta-label", text: label }),
        el("span", { text: value }),
      ])
    )
  );

  $("#demandDetailTechnical").textContent = JSON.stringify(
    { classification: item.classification || {}, route: item.route || {} },
    null,
    2
  );

  const statusValue =
    item.status === "in_progress"
      ? "reviewing"
      : item.status === "wont_fix"
        ? "rejected"
        : item.status || "pending";
  $("#demandFormStatus").value = statusValue;
  $("#demandFormPriority").value = item.priority || "";
  $("#demandFormDecision").value = item.decision || "";
  $("#demandFormSprint").value = item.sprint_target || "";
  $("#demandFormNotes").value = item.notes || "";
  $("#demandFormResolutionType").value = item.resolution_type || "";
  $("#demandFormResolutionNote").value = item.resolution_note || "";
  demandFormStatus("");

  const panel = $("#demandDetail");
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveDemand(event) {
  if (event) event.preventDefault();
  const id = $("#demandId").value;
  if (!id) return;

  const payload = {
    id,
    status: $("#demandFormStatus").value,
    priority: $("#demandFormPriority").value || null,
    decision: $("#demandFormDecision").value || null,
    sprint_target: $("#demandFormSprint").value.trim() || null,
    notes: $("#demandFormNotes").value.trim() || null,
    resolution_type: $("#demandFormResolutionType").value || null,
    resolution_note: $("#demandFormResolutionNote").value.trim() || null,
  };

  const button = $("#demandForm button[type=submit]");
  if (button) button.disabled = true;
  demandFormStatus("Guardando…");
  try {
    await api.unansweredUpdate(payload);
    demandFormStatus("Triage guardado.");
    setStatus("Triage guardado.");
    await loadDemand({ silent: true });
    openDemandDetail(id);
  } catch (err) {
    demandFormStatus(err.message, "error");
  } finally {
    if (button) button.disabled = false;
  }
}

async function downloadDemandBrief(id) {
  try {
    const data = await withAuth(api.unansweredBrief(id));
    if (!data?.markdown) return;
    const blob = new Blob([data.markdown], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = data.filename || `demanda-${id}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus("Brief descargado.");
  } catch (err) {
    setStatus(`No se pudo descargar el brief: ${err.message}`, "error");
  }
}

async function demandQuick(status, decision) {
  const id = $("#demandId").value;
  if (!id) return;
  $("#demandFormStatus").value = status;
  if (decision !== undefined) $("#demandFormDecision").value = decision;
  await saveDemand();
}

// ── Gestor de capas ───────────────────────────────────────

const LAYER_KEY_RE = /^[a-z][a-z0-9_]{1,60}$/;

function layerSetStatus(message, kind = "ok") {
  const node = $("#layersStatus");
  if (!node) return;
  node.textContent = message || "";
  node.hidden = !message;
  node.classList.toggle("is-error", kind === "error");
}

function layerImportSetStatus(message, kind = "ok") {
  const node = $("#layerImportStatus");
  if (!node) return;
  node.textContent = message || "";
  node.hidden = !message;
  node.classList.toggle("is-error", kind === "error");
}

async function loadLayerManager({ silent = false } = {}) {
  if (state.layerManager.loading) return;
  state.layerManager.loading = true;
  if (!silent) setStatus("Cargando capas…");
  try {
    const data = await withAuth(api.layersList());
    if (!data) return;
    state.layerManager.data = data;
    state.loaded.layers = true;
    renderLayerManager(data);
    if (!silent) setStatus("");
  } catch (err) {
    setStatus(`No se pudieron cargar las capas: ${err.message}`, "error");
  } finally {
    state.layerManager.loading = false;
  }
}

function renderLayerManager(data) {
  const layers = Array.isArray(data.layers) ? data.layers : [];
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  const activeJobs = jobs.filter((job) => job.status === "queued" || job.status === "running");

  $("#layersMetricTotal").textContent = String(layers.length);
  $("#layersMetricActive").textContent = String(layers.filter((layer) => layer.activo).length);
  $("#layersMetricTiles").textContent = String(layers.filter((layer) => layer.has_tiles).length);
  $("#layersMetricJobs").textContent = String(activeJobs.length);
  $("#layersWorkerSeen").textContent = data.worker
    ? `layer-worker activo ${relativeAge(data.worker.last_seen_at)}`
    : "layer-worker sin heartbeat";

  populateLayerSelects(layers, data.dimensions || []);
  renderLayerTable(layers, data.placements || []);
  renderLayerJobs(jobs);

  if (activeJobs.length > 0) ensureLayerPolling();
  else stopLayerPolling();
}

function populateLayerSelects(layers, dimensions) {
  const importable = layers.filter(
    (layer) => layer.activo !== false && LAYER_KEY_RE.test(layer.layer_key || "")
  );
  const currentLayer = $("#layerImportKey")?.value;
  const layerSelect = $("#layerImportKey");
  if (layerSelect) {
    layerSelect.replaceChildren(
      el("option", { text: "Seleccionar capa…", attrs: { value: "" } }),
      ...importable.map((layer) =>
        el("option", {
          text: `${layer.nombre} (${layer.layer_key})`,
          attrs: { value: layer.layer_key },
        })
      )
    );
    if ([...layerSelect.options].some((option) => option.value === currentLayer)) {
      layerSelect.value = currentLayer;
    }
  }

  const dimensionSelect = $("#layerImportDimension");
  if (dimensionSelect) {
    const currentDimension = dimensionSelect.value;
    dimensionSelect.replaceChildren(
      ...dimensions.map((dimension) =>
        el("option", {
          text: `${dimension.nombre} (${dimension.key})`,
          attrs: { value: dimension.key },
        })
      )
    );
    if ([...dimensionSelect.options].some((option) => option.value === currentDimension)) {
      dimensionSelect.value = currentDimension;
    } else if ([...dimensionSelect.options].some((option) => option.value === "otros")) {
      dimensionSelect.value = "otros";
    }
  }
}

function layerSourceLabel(layer) {
  if (layer.has_tiles) return "PostGIS + tiles";
  return layer.source_type || "—";
}

function renderLayerTable(layers, placements) {
  const body = $("#layerManagerBody");
  const empty = $("#layerManagerEmpty");
  const term = ($("#layerSearch")?.value || "").trim().toLowerCase();
  const countByLayer = new Map();
  for (const placement of placements) {
    const id = Number(placement.layer_id);
    countByLayer.set(id, (countByLayer.get(id) || 0) + 1);
  }

  const rows = layers.filter((layer) => {
    if (!term) return true;
    return [layer.layer_key, layer.nombre, layer.tipo, layer.source_type]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  });

  const fragment = document.createDocumentFragment();
  for (const layer of rows) {
    const validKey = LAYER_KEY_RE.test(layer.layer_key || "");
    const actions = [
      el("button", {
        className: "btn btn-secondary btn-mini",
        text: "Editar",
        attrs: { type: "button", "data-layer-action": "edit", "data-id": layer.id },
      }),
    ];
    if (validKey) {
      actions.push(
        el("button", {
          className: "btn btn-secondary btn-mini",
          text: "Importar",
          attrs: { type: "button", "data-layer-action": "import", "data-key": layer.layer_key },
        })
      );
    }
    if (layer.activo) {
      actions.push(
        el("button", {
          className: "btn btn-secondary btn-mini",
          text: "Archivar",
          attrs: { type: "button", "data-layer-action": "archive", "data-id": layer.id },
        })
      );
    }

    fragment.appendChild(
      el("tr", {}, [
        el("td", {}, [el("code", { text: layer.layer_key })]),
        el("td", { className: "layer-name", text: layer.nombre }),
        el("td", { text: layer.tipo || "—" }),
        el("td", { text: layerSourceLabel(layer) }),
        el("td", {}, [
          el("span", {
            className: layer.has_tiles ? "badge badge-ok" : "badge",
            text: layer.has_tiles ? "sí" : "no",
          }),
        ]),
        el("td", { text: countByLayer.get(Number(layer.id)) || 0 }),
        el("td", {}, [
          el("span", {
            className: layer.file?.exists ? "badge badge-ok" : "badge",
            text: layer.file?.exists ? "subido" : layer.upload?.exists ? "ZIP" : "—",
            title: layer.file?.file || layer.upload?.file || "",
          }),
        ]),
        el("td", {}, [el("div", { className: "row-actions" }, actions)]),
      ])
    );
  }

  body.replaceChildren(fragment);
  empty.hidden = rows.length > 0;
}

function renderLayerJobs(jobs) {
  const body = $("#layerJobsBody");
  const empty = $("#layerJobsEmpty");
  const fragment = document.createDocumentFragment();
  for (const job of jobs) {
    const badge = ragBadge(job.status);
    const result = job.result || {};
    const summary = result.version
      ? `v${result.version}${result.tiles ? " · tiles" : ""}`
      : job.error_code || job.error_message || "—";
    const cancel = job.status === "queued"
      ? el("button", {
          className: "btn btn-secondary btn-mini",
          text: "Cancelar",
          attrs: { type: "button", "data-layer-cancel": job.id },
        })
      : null;
    fragment.appendChild(
      el("tr", {}, [
        el("td", { text: `#${job.id}` }),
        el("td", {}, [el("code", { text: job.layer_key })]),
        el("td", { text: job.action }),
        el("td", {}, [el("span", { className: badge.className, text: badge.label })]),
        el("td", { text: formatDate(job.started_at || job.created_at) }),
        el("td", { className: "dim", text: summary }),
        el("td", {}, cancel ? [cancel] : []),
      ])
    );
  }
  body.replaceChildren(fragment);
  empty.hidden = jobs.length > 0;
}

function stopLayerPolling() {
  if (state.layerManager.pollTimer) {
    clearInterval(state.layerManager.pollTimer);
    state.layerManager.pollTimer = null;
  }
}

function ensureLayerPolling() {
  if (state.layerManager.pollTimer) return;
  state.layerManager.pollTimer = setInterval(() => {
    if (state.view === "layers" && !state.layerManager.loading) {
      loadLayerManager({ silent: true });
    }
  }, 3000);
}

function editLayer(id) {
  const layer = state.layerManager.data?.layers?.find(
    (item) => Number(item.id) === Number(id)
  );
  if (!layer) return;
  setDrawerOpen("layerFormDrawer", true, { focus: false });
  $("#layerId").value = layer.id;
  $("#layerKey").value = layer.layer_key;
  $("#layerKey").readOnly = true;
  $("#layerName").value = layer.nombre || "";
  $("#layerType").value = layer.tipo || "polygon";
  $("#layerSourceType").value = layer.source_type || "geojson";
  $("#layerConfig").value = JSON.stringify(layer.config || {}, null, 2);
  $("#layerActive").checked = layer.activo !== false;
  $("#layerHasTiles").checked = layer.has_tiles === true;
  layerSetStatus("");
}

function newLayer() {
  setDrawerOpen("layerFormDrawer", true, { focus: false });
  $("#layerForm").reset();
  $("#layerId").value = "";
  $("#layerKey").readOnly = false;
  $("#layerType").value = "polygon";
  $("#layerSourceType").value = "geojson";
  $("#layerActive").checked = true;
  $("#layerHasTiles").checked = false;
  layerSetStatus("");
}

async function saveLayer(event) {
  event.preventDefault();
  const id = $("#layerId").value;
  const key = $("#layerKey").value.trim().toLowerCase();
  const nombre = $("#layerName").value.trim();
  if (!LAYER_KEY_RE.test(key)) {
    layerSetStatus("La clave debe empezar con minúscula y usar solo minúsculas, números y guion bajo.", "error");
    return;
  }
  if (!nombre) {
    layerSetStatus("El nombre es obligatorio.", "error");
    return;
  }
  let config;
  try {
    config = $("#layerConfig").value.trim() ? JSON.parse($("#layerConfig").value) : {};
  } catch {
    layerSetStatus("La configuración debe ser JSON válido.", "error");
    return;
  }

  try {
    await api.layerSave({
      id: id || undefined,
      key,
      nombre,
      tipo: $("#layerType").value,
      source_type: $("#layerSourceType").value,
      has_tiles: $("#layerHasTiles").checked,
      activo: $("#layerActive").checked,
      config,
    });
    layerSetStatus("Capa guardada. Publica el snapshot para aplicarla al visor.");
    setStatus("Capa guardada. Publica el snapshot para aplicarla al visor.");
    setDrawerOpen("layerFormDrawer", false, { focus: false });
    await loadLayerManager({ silent: true });
  } catch (err) {
    layerSetStatus(err.message, "error");
  }
}

async function archiveLayer(id) {
  if (!window.confirm("¿Archivar esta capa? No se borra la tabla PostGIS ni los tiles.")) return;
  try {
    await api.layerArchive(id);
    layerSetStatus("Capa archivada. Publica el snapshot para quitarla del visor.");
    await loadLayerManager({ silent: true });
  } catch (err) {
    layerSetStatus(err.message, "error");
  }
}

function openLayerImport(key = "") {
  setDrawerOpen("layerImportDrawer", true, { focus: false });
  const select = $("#layerImportKey");
  if (key && [...select.options].some((option) => option.value === key)) {
    select.value = key;
  }
  const layer = state.layerManager.data?.layers?.find((item) => item.layer_key === key);
  $("#layerImportName").value = layer?.nombre || "";
  $("#layerImportFile").value = "";
  layerImportSetStatus("");
}

async function submitLayerImport(event) {
  event.preventDefault();
  const key = $("#layerImportKey").value;
  const file = $("#layerImportFile").files?.[0];
  const dimension = $("#layerImportDimension").value;
  const name = $("#layerImportName").value.trim();
  const tiles = $("#layerImportTiles").checked;
  if (!key) {
    layerImportSetStatus("Elige una capa.", "error");
    return;
  }
  if (!file) {
    layerImportSetStatus("Selecciona un archivo GeoJSON o un ZIP de Shapefile.", "error");
    return;
  }

  const isZip = /\.zip$/i.test(file.name) || /zip/i.test(file.type);
  const button = $("#layerImportSubmit");
  button.disabled = true;
  layerImportSetStatus(isZip ? "Subiendo Shapefile…" : "Subiendo GeoJSON…");
  try {
    const uploaded = await api.layerUpload(key, file, name || key);
    const job = await api.layerQueue({
      layer_key: key,
      dimension_key: dimension || "otros",
      display_name: name || uploaded.item?.nombre || key,
      tiles,
    });
    const message =
      uploaded.format === "shapefile"
        ? `Shapefile subido (${(uploaded.bytes / 1024 / 1024).toFixed(1)} MB). Trabajo #${job.job.id} encolado.`
        : `GeoJSON subido (${uploaded.features} features). Trabajo #${job.job.id} encolado.`;
    layerImportSetStatus(message);
    setStatus(message);
    setDrawerOpen("layerImportDrawer", false, { focus: false });
    await loadLayerManager({ silent: true });
  } catch (err) {
    layerImportSetStatus(err.message, "error");
  } finally {
    button.disabled = false;
  }
}

async function publishLayers() {
  const button = $("#layersPublishBtn");
  button.disabled = true;
  layerSetStatus("Publicando snapshot…");
  try {
    const result = await api.taxonomyPublish();
    state.loaded.config = false;
    const message = `Snapshot publicado. ${String(result.output || "").split("\n").slice(-2).join(" ").trim()}`;
    layerSetStatus(message);
    setStatus(message);
    await loadLayerManager({ silent: true });
  } catch (err) {
    layerSetStatus(String(err.output || err.message).slice(0, 800), "error");
  } finally {
    button.disabled = false;
  }
}

// ── RAG ───────────────────────────────────────────────────

const RAG_STATUS = {
  queued: { label: "En cola", className: "badge" },
  running: { label: "Ejecutando", className: "badge badge-warn" },
  succeeded: { label: "Listo", className: "badge badge-ok" },
  skipped: { label: "Sin cambios", className: "badge" },
  needs_ocr: { label: "Necesita OCR", className: "badge badge-warn" },
  rejected: { label: "Rechazado", className: "badge badge-fail" },
  failed: { label: "Falló", className: "badge badge-fail" },
  cancelled: { label: "Cancelado", className: "badge" },
  ready: { label: "Ready", className: "badge badge-ok" },
  superseded: { label: "Reemplazado", className: "badge" },
};

function ragBadge(status) {
  return RAG_STATUS[status] || { label: status || "—", className: "badge" };
}

function ragValue(id) {
  return document.getElementById(id)?.value?.trim() || "";
}

function ragSetStatus(message, kind = "ok") {
  const node = $("#ragFormStatus");
  if (!node) return;
  node.textContent = message || "";
  node.hidden = !message;
  node.classList.toggle("is-error", kind === "error");
}

function relativeAge(iso) {
  if (!iso) return "sin heartbeat";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "sin heartbeat";
  if (diff < 60_000) return "hace menos de 1 min";
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `hace ${hours} h`;
}

function collectRagEntry() {
  const slug = ragValue("ragSlug").toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(slug)) {
    throw new Error("Slug inválido: usa minúsculas, números y guiones.");
  }
  const title = ragValue("ragTitle");
  const sourceUrl = ragValue("ragSourceUrl");
  const license = ragValue("ragLicense");
  if (!title || !sourceUrl || !license) {
    throw new Error("Completa título, URL de origen y licencia.");
  }
  if (!/^https:\/\//i.test(sourceUrl)) {
    throw new Error("La URL de origen debe empezar con https://.");
  }
  if (!$("#ragCopyright")?.checked) {
    throw new Error("Tienes que declarar que la licencia permite indexar el documento.");
  }
  const tags = ragValue("ragTags")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    slug,
    title,
    source_url: sourceUrl,
    publisher: ragValue("ragPublisher") || null,
    license,
    language: ragValue("ragLanguage") || "es",
    published_at: ragValue("ragPublishedAt") || null,
    copyright_cleared: true,
    tags,
  };
}

function fillRagForm(entry) {
  if (!entry) return;
  setDrawerOpen("ragFormPanel", true, { focus: false });
  $("#ragSlug").value = entry.slug || "";
  $("#ragSlug").readOnly = true;
  $("#ragTitle").value = entry.title || "";
  $("#ragSourceUrl").value = entry.source_url || "";
  $("#ragPublisher").value = entry.publisher || "";
  $("#ragPublishedAt").value = entry.published_at || "";
  $("#ragLicense").value = entry.license || "";
  $("#ragLanguage").value = entry.language || "es";
  $("#ragTags").value = Array.isArray(entry.tags) ? entry.tags.join(", ") : "";
  $("#ragCopyright").checked = entry.copyright_cleared === true;
  state.rag.editingSlug = entry.slug || null;
  $("#ragForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
  ragSetStatus(`Editando ${entry.slug}. El PDF existente no se reemplaza salvo que subas uno nuevo.`);
}

function resetRagForm() {
  $("#ragForm")?.reset();
  $("#ragSlug").readOnly = false;
  $("#ragCopyright").checked = false;
  $("#ragLanguage").value = "es";
  state.rag.editingSlug = null;
  ragSetStatus("");
}

function ragFileSelected() {
  return $("#ragFile")?.files?.[0] || null;
}

function ragEntryExistsWithFile(slug) {
  const entry = state.rag.data?.manifest?.find((item) => item.slug === slug);
  return Boolean(entry?.file_info?.exists);
}

async function saveRagManifest() {
  const entry = collectRagEntry();
  await api.ragSaveManifest(entry);
  state.rag.editingSlug = entry.slug;
  return entry;
}

async function uploadRagPdf() {
  const entry = collectRagEntry();
  const file = ragFileSelected();
  if (!file) throw new Error("Selecciona un PDF para subir.");
  await api.ragUpload(entry.slug, file);
  $("#ragFile").value = "";
  return entry;
}

async function prepareRagDocument({ requireFile = false } = {}) {
  const entry = collectRagEntry();
  const file = ragFileSelected();
  if (requireFile && !file && !ragEntryExistsWithFile(entry.slug)) {
    throw new Error("El documento no tiene PDF. Sube uno antes de encolar la ingesta.");
  }
  await api.ragSaveManifest(entry);
  if (file) await api.ragUpload(entry.slug, file);
  state.rag.editingSlug = entry.slug;
  return entry;
}

async function runRagAction(action) {
  const buttons = [
    "#ragSaveBtn",
    "#ragUploadBtn",
    "#ragDryRunBtn",
    "#ragIngestBtn",
    "#ragNewBtn",
  ].map((selector) => $(selector)).filter(Boolean);
  buttons.forEach((button) => { button.disabled = true; });

  let successMessage = null;
  try {
    if (action === "save") {
      const entry = await saveRagManifest();
      successMessage = `Metadatos de ${entry.slug} guardados.`;
    } else if (action === "upload") {
      await saveRagManifest();
      const entry = await uploadRagPdf();
      successMessage = `PDF de ${entry.slug} subido a rag/inbox/.`;
    } else if (action === "dry_run" || action === "ingest") {
      const entry = await prepareRagDocument({ requireFile: true });
      const result = await api.ragQueue(entry.slug, action, false);
      successMessage = `Trabajo #${result.job.id} encolado para ${entry.slug} (${action === "dry_run" ? "estimación" : "ingesta"}).`;
    } else if (action === "new") {
      resetRagForm();
      return;
    }

    if (successMessage) {
      ragSetStatus(successMessage);
      setStatus(successMessage);
      setDrawerOpen("ragFormPanel", false, { focus: false });
    }
    await loadRag({ silent: true });
  } catch (err) {
    ragSetStatus(err.message, "error");
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function loadRag({ silent = false } = {}) {
  if (state.rag.loading) return;
  state.rag.loading = true;
  if (!silent) setStatus("Cargando estado del RAG…");

  try {
    const data = await withAuth(api.ragOverview());
    if (!data) return;
    state.rag.data = data;
    state.loaded.rag = true;
    renderRag(data);
    setStatus("");
  } catch (err) {
    setStatus(`No se pudo cargar el RAG: ${err.message}`, "error");
  } finally {
    state.rag.loading = false;
  }
}

function renderRag(data) {
  const documents = Array.isArray(data.documents) ? data.documents : [];
  const manifest = Array.isArray(data.manifest) ? data.manifest : [];
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];

  $("#ragMetricDocs").textContent = String(documents.length);
  $("#ragMetricChunks").textContent = String(
    documents.reduce((sum, doc) => sum + Number(doc.chunk_count || 0), 0)
  );
  const activeJobs = jobs.filter((job) => job.status === "queued" || job.status === "running");
  $("#ragMetricJobs").textContent = String(activeJobs.length);

  const worker = data.worker;
  $("#ragMetricWorker").textContent = worker ? "Activo" : "Sin heartbeat";
  $("#ragWorkerSeen").textContent = worker
    ? `última señal ${relativeAge(worker.last_seen_at)}`
    : "inicia rag-worker para procesar la cola";

  renderRagDocuments(manifest, documents);
  renderRagJobs(jobs);

  if (activeJobs.length > 0) ensureRagPolling();
  else stopRagPolling();
}

function ragActionButton(label, action, slug, documentId = "") {
  return el("button", {
    className: "btn btn-secondary btn-mini",
    text: label,
    attrs: {
      type: "button",
      "data-rag-action": action,
      "data-slug": slug,
      "data-document-id": documentId,
    },
  });
}

function renderRagDocuments(manifest, documents) {
  const body = $("#ragDocsBody");
  const empty = $("#ragDocsEmpty");
  if (!body || !empty) return;

  const docsBySlug = new Map(documents.map((doc) => [doc.slug, doc]));
  const rows = [];
  const seen = new Set();

  for (const entry of manifest) {
    rows.push({ entry, doc: docsBySlug.get(entry.slug) || null });
    seen.add(entry.slug);
  }
  for (const doc of documents) {
    if (!seen.has(doc.slug)) rows.push({ entry: null, doc });
  }

  const fragment = document.createDocumentFragment();
  for (const { entry, doc } of rows) {
    const slug = entry?.slug || doc?.slug || "—";
    const title = entry?.title || doc?.title || slug;
    const fileOk = entry?.file_info?.exists !== false;
    const status = doc?.status || (fileOk ? "sin ingestar" : "sin archivo");
    const badge = ragBadge(status);
    const actions = [];

    if (entry) {
      actions.push(ragActionButton("Editar", "edit", slug));
      actions.push(ragActionButton("Estimar", "dry_run", slug));
      actions.push(ragActionButton("Ingestar", "ingest", slug));
      actions.push(ragActionButton("Quitar", "delete", slug));
    }
    if (doc?.document_id) {
      actions.push(ragActionButton("Chunks", "chunks", slug, doc.document_id));
    }

    const actionWrap = el("div", { className: "row-actions" }, actions);
    fragment.appendChild(
      el("tr", {}, [
        el("td", {}, [
          el("strong", { className: "layer-name", text: title }),
          el("small", { className: "item-meta", text: ` ${slug}` }),
          entry?.publisher ? el("small", { className: "item-meta", text: ` · ${entry.publisher}` }) : null,
        ]),
        el("td", {}, [el("span", { className: badge.className, text: badge.label })]),
        el("td", { text: doc?.version ? `v${doc.version}` : "—" }),
        el("td", { text: doc?.page_count ?? "—" }),
        el("td", { text: doc?.chunk_count ?? "—" }),
        el("td", {}, [actionWrap]),
      ])
    );
  }

  body.replaceChildren(fragment);
  empty.hidden = rows.length > 0;
}

function renderRagJobs(jobs) {
  const body = $("#ragJobsBody");
  const empty = $("#ragJobsEmpty");
  if (!body || !empty) return;

  const fragment = document.createDocumentFragment();
  for (const job of jobs) {
    const badge = ragBadge(job.status);
    const result = job.result || {};
    let summary = "";
    if (result.chunks !== undefined) summary = `${result.chunks} chunks`;
    else if (result.pageCount) summary = `${result.pageCount} páginas`;
    else if (job.error_code) summary = job.error_code;
    else if (job.status === "skipped") summary = result.reason || "sin cambios";

    const action = job.status === "queued"
      ? el("button", {
          className: "btn btn-secondary btn-mini",
          text: "Cancelar",
          attrs: { type: "button", "data-rag-cancel": job.id },
        })
      : null;

    fragment.appendChild(
      el("tr", {}, [
        el("td", { text: `#${job.id}` }),
        el("td", {}, [el("code", { text: job.slug })]),
        el("td", { text: job.action }),
        el("td", {}, [el("span", { className: badge.className, text: badge.label })]),
        el("td", { text: formatDate(job.started_at || job.created_at) }),
        el("td", { className: "dim", text: summary || "—" }),
        el("td", {}, action ? [action] : []),
      ])
    );
  }

  body.replaceChildren(fragment);
  empty.hidden = jobs.length > 0;
}

async function showRagChunks(documentId, slug) {
  const panel = $("#ragChunksPanel");
  if (!panel) return;
  panel.hidden = false;
  $("#ragChunksTitle").textContent = `Chunks · ${slug}`;
  $("#ragChunksMeta").textContent = "Cargando…";
  $("#ragChunksBody").replaceChildren();

  try {
    const data = await withAuth(api.ragChunks(documentId, 50, 0));
    if (!data) return;
    $("#ragChunksMeta").textContent = `${data.total} fragmentos · mostrando ${data.items.length}`;
    const fragment = document.createDocumentFragment();
    for (const chunk of data.items) {
      const content = el("details", {}, [
        el("summary", { text: "Ver contenido" }),
        el("pre", { className: "chunk-body", text: chunk.content }),
      ]);
      fragment.appendChild(
        el("tr", {}, [
          el("td", { text: chunk.ordinal + 1 }),
          el("td", { text: `${chunk.page_start}–${chunk.page_end}` }),
          el("td", { text: chunk.section || "—" }),
          el("td", { text: chunk.token_estimate }),
          el("td", {}, [content]),
        ])
      );
    }
    $("#ragChunksBody").replaceChildren(fragment);
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    $("#ragChunksMeta").textContent = err.message;
  }
}

function stopRagPolling() {
  if (state.rag.pollTimer) {
    clearInterval(state.rag.pollTimer);
    state.rag.pollTimer = null;
  }
}

function ensureRagPolling() {
  if (state.rag.pollTimer) return;
  state.rag.pollTimer = setInterval(() => {
    if (state.view === "rag" && !state.rag.loading) loadRag({ silent: true });
  }, 3000);
}

// ── Chat ──────────────────────────────────────────────────

function renderEmpty(container, message) {
  container.replaceChildren(el("p", { className: "empty", text: message }));
}

async function loadChat({ keepStatus = false } = {}) {
  if (!keepStatus) setStatus("Cargando configuración del chat…");
  try {
    const [prompts, settings, messages, unavailable, golden, tools] = await Promise.all([
      withAuth(api.prompts()),
      withAuth(api.settings()),
      withAuth(api.messages()),
      withAuth(api.unavailable()),
      withAuth(api.goldenList()),
      withAuth(api.chatTools()),
    ]);
    if (!prompts || !settings || !messages || !unavailable || !golden || !tools) return;

    state.chat.prompts = prompts.items || [];
    state.chat.settings = settings.items || [];
    state.chat.messages = messages.items || [];
    state.chat.unavailable = unavailable.items || [];
    state.chat.golden = golden.items || [];
    state.chat.tools = tools.items || [];

    renderPrompts(state.chat.prompts);
    renderSettings(state.chat.settings);
    renderMessages(state.chat.messages);
    renderUnavailable(state.chat.unavailable);
    renderGolden(state.chat.golden);
    renderTools(state.chat.tools, tools);
    state.loaded.chat = true;
    if (!keepStatus) setStatus("");
  } catch (err) {
    setStatus(`No se pudo cargar el chat: ${err.message}`, "error");
  }
}

function chatFormStatus(id, message, kind = "ok") {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = message || "";
  node.hidden = !message;
  node.classList.toggle("is-error", kind === "error");
}

function chatAction(label, attrs) {
  return el("button", {
    className: "btn btn-secondary btn-mini",
    text: label,
    attrs: { type: "button", ...attrs },
  });
}

function renderPrompts(items) {
  const container = $("#promptsList");
  if (!container) return;
  if (items.length === 0) {
    renderEmpty(container, "No hay prompts versionados en la base.");
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const prompt of items) {
    const actions = [
      chatAction("Editar como nueva versión", {
        "data-prompt-action": "edit",
        "data-id": prompt.id,
        "data-version": prompt.version,
      }),
    ];
    if (!prompt.activo) {
      actions.push(
        chatAction("Activar", {
          "data-prompt-action": "activate",
          "data-id": prompt.id,
          "data-version": prompt.version,
        }),
        chatAction("Eliminar", {
          "data-prompt-action": "delete",
          "data-id": prompt.id,
          "data-version": prompt.version,
        })
      );
    }

    const summary = el("summary", { className: "item-head" }, [
      el("span", {}, [
        el("strong", { text: `${prompt.id} · v${prompt.version}` }),
        el("span", {
          className: "item-meta",
          text: ` · ${prompt.content?.length || 0} caracteres · ${formatDate(prompt.updated_at)}`,
        }),
      ]),
      prompt.activo
        ? el("span", { className: "badge badge-ok", text: "activo" })
        : el("span", { className: "badge", text: "histórico" }),
    ]);

    const details = el("details", { className: "prompt" }, [
      summary,
      el("div", {
        className: "row-actions",
        attrs: { style: "padding: 0 20px 10px;" },
      }, actions),
      el("pre", { className: "prompt-body", text: prompt.content || "" }),
    ]);
    fragment.appendChild(details);
  }
  container.replaceChildren(fragment);
}

function renderSettings(items) {
  const container = $("#settingsList");
  if (!container) return;
  if (items.length === 0) {
    renderEmpty(container, "No hay settings.");
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const setting of items) {
    const value = typeof setting.value === "string"
      ? setting.value
      : JSON.stringify(setting.value, null, 2);
    fragment.appendChild(
      el("div", { className: "item" }, [
        el("div", { className: "item-head" }, [
          el("strong", { text: setting.key }),
          el("span", { className: "badge", text: setting.type || "—" }),
        ]),
        el("p", { className: "muted", text: setting.description || "" }),
        el("pre", { className: "prompt-body", text: value }),
        el("div", { className: "row-actions" }, [
          chatAction("Editar", { "data-setting-action": "edit", "data-key": setting.key }),
          setting.editable
            ? chatAction("Eliminar", { "data-setting-action": "delete", "data-key": setting.key })
            : null,
        ]),
      ])
    );
  }
  container.replaceChildren(fragment);
}

function renderMessages(items) {
  const container = $("#messagesList");
  if (!container) return;
  if (items.length === 0) {
    renderEmpty(container, "No hay mensajes.");
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const message of items) {
    fragment.appendChild(
      el("div", { className: "item" }, [
        el("div", { className: "item-head" }, [
          el("strong", { text: message.key }),
          el("span", { className: "item-meta", text: formatDate(message.updated_at) }),
        ]),
        el("p", { className: "muted", text: message.content || "" }),
        el("p", { className: "item-meta", text: message.description || "" }),
        el("div", { className: "row-actions" }, [
          chatAction("Editar", { "data-message-action": "edit", "data-key": message.key }),
          chatAction("Eliminar", { "data-message-action": "delete", "data-key": message.key }),
        ]),
      ])
    );
  }
  container.replaceChildren(fragment);
}

function renderUnavailable(items) {
  const container = $("#unavailableList");
  if (!container) return;
  if (items.length === 0) {
    renderEmpty(container, "No hay datos declarados como no disponibles.");
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const layers = Array.isArray(item.capas_relacionadas) && item.capas_relacionadas.length
      ? `Capas: ${item.capas_relacionadas.join(", ")}`
      : "Sin capas relacionadas";
    fragment.appendChild(
      el("div", { className: "item" }, [
        el("div", { className: "item-head" }, [
          el("strong", { text: item.id }),
          el("span", { className: item.activo ? "badge badge-ok" : "badge", text: item.activo ? "activo" : "inactivo" }),
        ]),
        el("p", { className: "muted", text: item.descripcion || "" }),
        el("p", { className: "item-meta", text: `${item.motivo || "—"} · ${layers} · verificado ${formatDay(item.verificado_en)}` }),
        el("div", { className: "row-actions" }, [
          chatAction("Editar", { "data-unavailable-action": "edit", "data-id": item.id }),
          chatAction("Eliminar", { "data-unavailable-action": "delete", "data-id": item.id }),
        ]),
      ])
    );
  }
  container.replaceChildren(fragment);
}

const GOLDEN_ROUTE_LABELS = {
  tool: "tool",
  rag: "rag",
  mixta: "mixta",
  abstencion: "abstención",
  fuera_de_alcance: "fuera de alcance",
};

function renderGolden(items) {
  const container = $("#goldenList");
  if (!container) return;
  if (items.length === 0) {
    renderEmpty(container, "No hay casos. Usa Agregar caso o npm run golden:seed.");
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    fragment.appendChild(
      el("div", { className: "item" }, [
        el("div", { className: "item-head" }, [
          el("strong", { text: `${item.id} · L${item.level}/T${item.tier}` }),
          el("span", { className: item.activo ? "badge badge-ok" : "badge", text: item.activo ? "activo" : "inactivo" }),
        ]),
        el("p", { className: "muted", text: item.question || "" }),
        el("p", {
          className: "item-meta",
          text: `${GOLDEN_ROUTE_LABELS[item.route] || item.route || "sin ruta"} · ${item.category || "—"} · ${item.intent_esperado || "—"} · ${item.fuente_esperada || "—"}`,
        }),
        el("div", { className: "row-actions" }, [
          chatAction("Editar", { "data-golden-action": "edit", "data-id": item.id }),
          chatAction("Eliminar", { "data-golden-action": "delete", "data-id": item.id }),
        ]),
      ])
    );
  }
  container.replaceChildren(fragment);
}

function renderTools(items, response) {
  const container = $("#toolsList");
  if (!container) return;
  if (items.length === 0) {
    renderEmpty(container, "No hay tools registradas.");
    return;
  }

  const note = el("p", {
    className: "muted",
    text: response?.reason || "Las tools son código de solo lectura.",
    attrs: { style: "padding: 12px 20px;" },
  });
  const fragment = document.createDocumentFragment();
  fragment.appendChild(note);
  for (const tool of items) {
    fragment.appendChild(
      el("details", { className: "prompt" }, [
        el("summary", { className: "item-head" }, [
          el("strong", { text: tool.name }),
          el("span", { className: "badge", text: "solo lectura" }),
        ]),
        el("p", { className: "muted", text: tool.description || "" }),
        el("pre", {
          className: "prompt-body",
          text: JSON.stringify(tool.parameters || {}, null, 2),
        }),
      ])
    );
  }
  container.replaceChildren(fragment);
}

// Formularios de configuración del chat

function resetChatForm(formId) {
  const form = document.getElementById(formId);
  form?.reset();
  for (const input of form?.querySelectorAll("input, textarea, select") || []) {
    if (input.type !== "checkbox") input.value = input.defaultValue || "";
    input.readOnly = false;
  }
}

function editPrompt(id) {
  const prompt = state.chat.prompts.find((item) => item.id === id);
  if (!prompt) return;
  setDrawerOpen("promptFormDrawer", true, { focus: false });
  $("#promptId").value = prompt.id;
  $("#promptId").readOnly = true;
  $("#promptContent").value = prompt.content || "";
  $("#promptDescription").value = prompt.description || "";
  chatFormStatus("promptFormStatus", "");
}

function editSetting(key) {
  const setting = state.chat.settings.find((item) => item.key === key);
  if (!setting) return;
  setDrawerOpen("settingFormDrawer", true, { focus: false });
  $("#settingKey").value = setting.key;
  $("#settingKey").readOnly = true;
  $("#settingType").value = setting.type || "string";
  $("#settingValue").value = typeof setting.value === "string"
    ? setting.value
    : JSON.stringify(setting.value, null, 2);
  $("#settingDescription").value = setting.description || "";
  $("#settingEditable").checked = setting.editable !== false;
  chatFormStatus("settingFormStatus", "");
}

function editMessage(key) {
  const message = state.chat.messages.find((item) => item.key === key);
  if (!message) return;
  setDrawerOpen("messageFormDrawer", true, { focus: false });
  $("#messageKey").value = message.key;
  $("#messageKey").readOnly = true;
  $("#messageContent").value = message.content || "";
  $("#messageDescription").value = message.description || "";
  chatFormStatus("messageFormStatus", "");
}

function editUnavailable(id) {
  const item = state.chat.unavailable.find((entry) => entry.id === id);
  if (!item) return;
  setDrawerOpen("unavailableFormDrawer", true, { focus: false });
  $("#unavailableId").value = item.id;
  $("#unavailableId").readOnly = true;
  $("#unavailableDescripcion").value = item.descripcion || "";
  $("#unavailablePalabras").value = (item.palabras || []).join(", ");
  $("#unavailableCapas").value = (item.capas_relacionadas || []).join(", ");
  $("#unavailableExiste").value = item.existe || "";
  $("#unavailableMotivo").value = item.motivo || "dato_inexistente";
  $("#unavailableSource").value = item.source || "manual";
  $("#unavailableActivo").checked = item.activo !== false;
  chatFormStatus("unavailableFormStatus", "");
}

function editGolden(id) {
  const item = state.chat.golden.find((entry) => entry.id === id);
  if (!item) return;
  setDrawerOpen("goldenFormDrawer", true, { focus: false });
  $("#goldenId").value = item.id;
  $("#goldenId").readOnly = true;
  $("#goldenLevel").value = item.level || 1;
  $("#goldenTier").value = item.tier || 1;
  $("#goldenRoute").value = item.route || "tool";
  $("#goldenIntent").value = item.intent_esperado || "";
  $("#goldenFuente").value = item.fuente_esperada || "";
  $("#goldenCategory").value = item.category || "";
  $("#goldenQuestion").value = item.question || "";
  $("#goldenExpected").value = JSON.stringify(item.expected || {}, null, 2);
  $("#goldenNotes").value = item.notes || "";
  $("#goldenHistory").value = item.history ? JSON.stringify(item.history, null, 2) : "";
  $("#goldenActivo").checked = item.activo !== false;
  chatFormStatus("goldenFormStatus", "");
}

function newChatForm(kind) {
  const map = {
    prompt: ["promptForm", "promptFormDrawer", "promptFormStatus"],
    setting: ["settingForm", "settingFormDrawer", "settingFormStatus"],
    message: ["messageForm", "messageFormDrawer", "messageFormStatus"],
    unavailable: ["unavailableForm", "unavailableFormDrawer", "unavailableFormStatus"],
    golden: ["goldenForm", "goldenFormDrawer", "goldenFormStatus"],
  };
  const [formId, drawerId, statusId] = map[kind];
  resetChatForm(formId);
  const form = document.getElementById(formId);
  if (kind === "setting") $("#settingEditable").checked = true;
  if (kind === "unavailable") {
    $("#unavailableMotivo").value = "dato_inexistente";
    $("#unavailableSource").value = "manual";
    $("#unavailableActivo").checked = true;
  }
  if (kind === "golden") {
    $("#goldenLevel").value = "1";
    $("#goldenTier").value = "1";
    $("#goldenRoute").value = "tool";
    $("#goldenExpected").value = "{}";
    $("#goldenActivo").checked = true;
  }
  chatFormStatus(statusId, "");
  setDrawerOpen(drawerId, true);
}

async function savePrompt(event) {
  event.preventDefault();
  try {
    await api.promptSave({
      id: $("#promptId").value.trim(),
      content: $("#promptContent").value,
      description: $("#promptDescription").value.trim(),
    });
    setDrawerOpen("promptFormDrawer", false, { focus: false });
    setStatus("Prompt guardado como versión nueva y activado.");
    await loadChat({ keepStatus: true });
  } catch (err) {
    chatFormStatus("promptFormStatus", err.message, "error");
  }
}

async function saveSetting(event) {
  event.preventDefault();
  const type = $("#settingType").value;
  const raw = $("#settingValue").value;
  let value = raw;
  try {
    if (type === "json") value = JSON.parse(raw);
    else if (type === "number") {
      value = Number(raw);
      if (!Number.isFinite(value)) throw new Error("El valor debe ser numérico.");
    } else if (type === "boolean") {
      value = raw === "true";
    }
  } catch (err) {
    chatFormStatus("settingFormStatus", err.message, "error");
    return;
  }
  try {
    await api.settingSave({
      key: $("#settingKey").value.trim(),
      value,
      type,
      description: $("#settingDescription").value.trim(),
      editable: $("#settingEditable").checked,
    });
    setDrawerOpen("settingFormDrawer", false, { focus: false });
    setStatus("Setting guardado.");
    await loadChat({ keepStatus: true });
  } catch (err) {
    chatFormStatus("settingFormStatus", err.message, "error");
  }
}

async function saveMessage(event) {
  event.preventDefault();
  try {
    await api.messageSave({
      key: $("#messageKey").value.trim(),
      content: $("#messageContent").value,
      description: $("#messageDescription").value.trim(),
    });
    setDrawerOpen("messageFormDrawer", false, { focus: false });
    setStatus("Mensaje guardado.");
    await loadChat({ keepStatus: true });
  } catch (err) {
    chatFormStatus("messageFormStatus", err.message, "error");
  }
}

async function saveUnavailable(event) {
  event.preventDefault();
  try {
    await api.unavailableSave({
      id: $("#unavailableId").value.trim(),
      descripcion: $("#unavailableDescripcion").value.trim(),
      palabras: $("#unavailablePalabras").value,
      capas_relacionadas: $("#unavailableCapas").value,
      existe: $("#unavailableExiste").value.trim(),
      motivo: $("#unavailableMotivo").value,
      source: $("#unavailableSource").value,
      activo: $("#unavailableActivo").checked,
    });
    setDrawerOpen("unavailableFormDrawer", false, { focus: false });
    setStatus("Registro de datos no disponibles guardado.");
    await loadChat({ keepStatus: true });
  } catch (err) {
    chatFormStatus("unavailableFormStatus", err.message, "error");
  }
}

async function saveGolden(event) {
  event.preventDefault();
  let expected;
  let history = null;
  try {
    expected = JSON.parse($("#goldenExpected").value || "{}");
    const historyRaw = $("#goldenHistory").value.trim();
    history = historyRaw ? JSON.parse(historyRaw) : null;
  } catch {
    chatFormStatus("goldenFormStatus", "Expected e historial deben ser JSON válido.", "error");
    return;
  }
  try {
    await api.goldenSave({
      id: $("#goldenId").value.trim(),
      level: Number($("#goldenLevel").value),
      tier: Number($("#goldenTier").value),
      route: $("#goldenRoute").value,
      intent_esperado: $("#goldenIntent").value.trim(),
      fuente_esperada: $("#goldenFuente").value.trim(),
      category: $("#goldenCategory").value.trim(),
      question: $("#goldenQuestion").value.trim(),
      expected,
      notes: $("#goldenNotes").value.trim(),
      history,
      activo: $("#goldenActivo").checked,
    });
    setDrawerOpen("goldenFormDrawer", false, { focus: false });
    setStatus("Caso del golden set guardado.");
    await loadChat({ keepStatus: true });
  } catch (err) {
    chatFormStatus("goldenFormStatus", err.message, "error");
  }
}

async function promptAction(action, id, version) {
  try {
    if (action === "activate") {
      await api.promptActivate(id, version);
      setStatus(`Prompt ${id} v${version} reactivado como versión nueva.`);
      await loadChat({ keepStatus: true });
    } else if (action === "delete") {
      if (!window.confirm(`¿Eliminar ${id} v${version}?`)) return;
      await api.promptDelete(id, version);
      setStatus("Versión eliminada.");
      await loadChat({ keepStatus: true });
    } else if (action === "edit") {
      editPrompt(id);
    }
  } catch (err) {
    setStatus(err.message, "error");
  }
}

async function settingAction(action, key) {
  try {
    if (action === "edit") {
      editSetting(key);
    } else if (action === "delete") {
      if (!window.confirm(`¿Eliminar el setting ${key}?`)) return;
      await api.settingDelete(key);
      setStatus("Setting eliminado.");
      await loadChat({ keepStatus: true });
    }
  } catch (err) {
    setStatus(err.message, "error");
  }
}

async function messageAction(action, key) {
  try {
    if (action === "edit") editMessage(key);
    else if (action === "delete") {
      if (!window.confirm(`¿Eliminar el mensaje ${key}?`)) return;
      await api.messageDelete(key);
      setStatus("Mensaje eliminado.");
      await loadChat({ keepStatus: true });
    }
  } catch (err) {
    setStatus(err.message, "error");
  }
}

async function unavailableAction(action, id) {
  try {
    if (action === "edit") editUnavailable(id);
    else if (action === "delete") {
      if (!window.confirm(`¿Eliminar ${id}?`)) return;
      await api.unavailableDelete(id);
      setStatus("Registro eliminado.");
      await loadChat({ keepStatus: true });
    }
  } catch (err) {
    setStatus(err.message, "error");
  }
}

async function goldenAction(action, id) {
  try {
    if (action === "edit") editGolden(id);
    else if (action === "delete") {
      if (!window.confirm(`¿Eliminar el caso ${id}?`)) return;
      await api.goldenDelete(id);
      setStatus("Caso eliminado.");
      await loadChat({ keepStatus: true });
    }
  } catch (err) {
    setStatus(err.message, "error");
  }
}

// ── Auditoría ─────────────────────────────────────────────

async function loadAudit() {
  setStatus("Cargando auditoría…");
  try {
    const data = await withAuth(api.audit(100));
    if (!data) return;
    const items = Array.isArray(data.items) ? data.items : [];
    const body = $("#auditBody");
    const empty = $("#auditEmpty");

    const fragment = document.createDocumentFragment();
    for (const event of items) {
      fragment.appendChild(
        el("tr", {}, [
          el("td", { text: formatDate(event.at) }),
          el("td", { text: event.actor || "—" }),
          el("td", {}, [el("code", { text: event.action || "—" })]),
          el("td", { text: event.target || "—" }),
          el("td", {}, [
            el("span", {
              className: event.result === "ok" ? "badge badge-ok" : "badge badge-fail",
              text: event.result || "—",
            }),
          ]),
          el("td", { className: "dim", text: event.ip_hash || "—" }),
        ])
      );
    }

    body.replaceChildren(fragment);
    empty.hidden = items.length > 0;
    state.loaded.audit = true;
    setStatus("");
  } catch (err) {
    setStatus(`No se pudo cargar la auditoría: ${err.message}`, "error");
  }
}

// ── Eventos ───────────────────────────────────────────────

function bindEvents() {
  $("#loginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#loginSubmit");
    const username = $("#adminUsername").value.trim();
    const password = $("#adminPassword").value;

    setLoginError("");
    button.disabled = true;
    button.textContent = "Ingresando…";

    try {
      const session = await api.login(username, password);
      if (session.two_factor_required) {
        showLoginCode(session.challenge_id);
        return;
      }
      setCsrfToken(session.csrfToken);
      $("#loginForm").reset();
      showApp(session);
    } catch (err) {
      const retry = err.retryAfter ? ` Reintenta en ${err.retryAfter}s.` : "";
      setLoginError(`${err.message}${retry}`);
      $("#adminPassword").value = "";
      $("#adminPassword").focus();
    } finally {
      button.disabled = false;
      button.textContent = "Ingresar";
    }
  });

  $("#loginCodeForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#loginCodeSubmit");
    const code = $("#loginCode").value.trim();
    $("#loginCodeError").hidden = true;
    button.disabled = true;
    button.textContent = "Verificando…";
    try {
      const session = await api.loginVerify(pendingChallengeId, code);
      setCsrfToken(session.csrfToken);
      $("#loginCodeForm").reset();
      showApp(session);
    } catch (err) {
      $("#loginCodeError").textContent = err.message;
      $("#loginCodeError").hidden = false;
      $("#loginCode").value = "";
      $("#loginCode").focus();
    } finally {
      button.disabled = false;
      button.textContent = "Verificar";
    }
  });

  $("#loginCodeCancel")?.addEventListener("click", () => showLogin());

  $("#forgotLink")?.addEventListener("click", (event) => {
    event.preventDefault();
    showForgot();
  });
  $("#forgotCancel")?.addEventListener("click", () => showLogin());
  $("#forgotForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#forgotSubmit");
    const email = $("#forgotEmail").value.trim();
    button.disabled = true;
    button.textContent = "Enviando…";
    try {
      await api.forgotPassword(email);
    } catch {
      // Respuesta genérica a propósito.
    } finally {
      button.disabled = false;
      button.textContent = "Enviar enlace";
      $("#forgotMessage").textContent =
        "Si el correo existe, recibirás un enlace para restablecer la contraseña. Revisa también spam.";
      $("#forgotMessage").hidden = false;
    }
  });
  $("#resetForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#resetSubmit");
    const password = $("#resetPassword").value;
    const repeat = $("#resetPassword2").value;
    $("#resetError").hidden = true;
    $("#resetOk").hidden = true;
    if (password.length < 8) {
      $("#resetError").textContent = "La contraseña debe tener al menos 8 caracteres.";
      $("#resetError").hidden = false;
      return;
    }
    if (password !== repeat) {
      $("#resetError").textContent = "Las contraseñas no coinciden.";
      $("#resetError").hidden = false;
      return;
    }
    button.disabled = true;
    button.textContent = "Guardando…";
    try {
      await api.resetPassword(pendingResetToken, password);
      $("#resetOk").textContent = "Contraseña actualizada. Ya puedes ingresar.";
      $("#resetOk").hidden = false;
      pendingResetToken = null;
      setTimeout(showLogin, 1800);
    } catch (err) {
      $("#resetError").textContent = err.message;
      $("#resetError").hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = "Guardar contraseña";
    }
  });

  for (const button of document.querySelectorAll(".nav-item")) {
    button.addEventListener("click", () => selectView(button.dataset.view));
  }

  for (const id of ["themeToggle", "loginThemeToggle"]) {
    document.getElementById(id)?.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme");
      applyTheme(current === "dark" ? "light" : "dark");
    });
  }

  $("#logoutBtn")?.addEventListener("click", async () => {
    try {
      await api.logout();
    } catch (err) {
      if (err.status !== 401) setStatus(`No se pudo cerrar sesión: ${err.message}`, "error");
    } finally {
      showLogin();
    }
  });

  $("#layerSearch")?.addEventListener("input", renderLayers);
  $("#dimensionFilter")?.addEventListener("change", renderLayers);
  $("#auditRefresh")?.addEventListener("click", loadAudit);

  // RAG
  $("#ragForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    runRagAction("save");
  });
  for (const [selector, action] of [
    ["#ragSaveBtn", "save"],
    ["#ragUploadBtn", "upload"],
    ["#ragDryRunBtn", "dry_run"],
    ["#ragIngestBtn", "ingest"],
    ["#ragNewBtn", "new"],
  ]) {
    $(selector)?.addEventListener("click", () => runRagAction(action));
  }
  $("#ragRefresh")?.addEventListener("click", () => loadRag());
  $("#ragChunksClose")?.addEventListener("click", () => {
    const panel = $("#ragChunksPanel");
    if (panel) panel.hidden = true;
  });

  $("#ragDocsBody")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-rag-action]");
    if (!button) return;
    const action = button.dataset.ragAction;
    const slug = button.dataset.slug;
    const documentId = button.dataset.documentId;

    try {
      if (action === "edit") {
        const entry = state.rag.data?.manifest?.find((item) => item.slug === slug);
        if (entry) fillRagForm(entry);
        return;
      }
      if (action === "delete") {
        if (!window.confirm(`¿Quitar ${slug} del manifiesto? No se borran las versiones ya ingeridas.`)) {
          return;
        }
        await api.ragDeleteManifest(slug, false);
        if (state.rag.editingSlug === slug) resetRagForm();
        await loadRag({ silent: true });
        return;
      }
      if (action === "chunks") {
        if (documentId) await showRagChunks(documentId, slug);
        return;
      }
      if (action === "dry_run" || action === "ingest") {
        const entry = state.rag.data?.manifest?.find((item) => item.slug === slug);
        if (!entry?.file_info?.exists) {
          throw new Error("El documento no tiene PDF en rag/inbox/.");
        }
        const result = await api.ragQueue(slug, action, false);
        ragSetStatus(`Trabajo #${result.job.id} encolado para ${slug}.`);
        await loadRag({ silent: true });
      }
    } catch (err) {
      ragSetStatus(err.message, "error");
    }
  });

  $("#ragJobsBody")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-rag-cancel]");
    if (!button) return;
    try {
      await api.ragCancel(Number(button.dataset.ragCancel));
      await loadRag({ silent: true });
    } catch (err) {
      ragSetStatus(err.message, "error");
    }
  });

  // APIs
  $("#apisRefresh")?.addEventListener("click", () => loadApis());
  $("#apiEditorClose")?.addEventListener("click", () => {
    const editor = $("#apiEditor");
    if (editor) editor.hidden = true;
  });
  $("#apiEditorForm")?.addEventListener("submit", saveApiEditor);
  $("#apiNewToggle")?.addEventListener("click", () => {
    const panel = $("#apiNewPanel");
    if (!panel) return;
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    $("#apiNewToggle")?.setAttribute("aria-expanded", willOpen ? "true" : "false");
    if (willOpen) panel.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#apiNewClose")?.addEventListener("click", () => {
    const panel = $("#apiNewPanel");
    if (panel) panel.hidden = true;
    $("#apiNewToggle")?.setAttribute("aria-expanded", "false");
  });
  $("#apisBody")?.addEventListener("click", async (event) => {
    const testButton = event.target.closest("[data-api-test]");
    if (testButton) {
      await testApi(testButton.dataset.apiTest, testButton);
      return;
    }
    const toggleButton = event.target.closest("[data-api-toggle]");
    if (toggleButton) {
      await toggleApi(toggleButton.dataset.apiToggle, toggleButton);
      return;
    }
    const editButton = event.target.closest("[data-api-edit]");
    if (editButton) editApi(editButton.dataset.apiEdit);
  });

  // Taxonomía
  $("#taxRefresh")?.addEventListener("click", () => loadTaxonomy());
  $("#taxPublishBtn")?.addEventListener("click", publishTaxonomy);
  $("#taxDimensionForm")?.addEventListener("submit", saveTaxDimension);
  $("#taxGroupForm")?.addEventListener("submit", saveTaxGroup);
  $("#taxSubgroupForm")?.addEventListener("submit", saveTaxSubgroup);
  $("#taxAssignForm")?.addEventListener("submit", saveTaxAssignment);
  $("#taxDimNew")?.addEventListener("click", newTaxDimension);
  $("#taxGroupNew")?.addEventListener("click", newTaxGroup);
  $("#taxSubgroupNew")?.addEventListener("click", newTaxSubgroup);
  $("#taxDimensionClose")?.addEventListener("click", () => {
    state.taxonomy.selectedDimensionId = null;
    state.taxonomy.selectedGroupId = null;
    renderTaxDetail();
  });

  $("#taxDimensionsBody")?.addEventListener("click", (event) => {
    const action = event.target.closest("[data-tax-action]");
    const remove = event.target.closest("[data-tax-delete]");
    if (remove) {
      deleteTaxEntity(remove.dataset.taxDelete, Number(remove.dataset.id));
      return;
    }
    if (!action) return;
    const id = Number(action.dataset.id);
    if (action.dataset.taxAction === "select-dimension") {
      state.taxonomy.selectedDimensionId = id;
      state.taxonomy.selectedGroupId = null;
      renderTaxonomy(state.taxonomy.data);
    } else if (action.dataset.taxAction === "edit-dimension") {
      editTaxDimension(id);
    }
  });

  $("#taxGroupsBody")?.addEventListener("click", (event) => {
    const action = event.target.closest("[data-tax-action]");
    const remove = event.target.closest("[data-tax-delete]");
    if (remove) {
      deleteTaxEntity(remove.dataset.taxDelete, Number(remove.dataset.id));
      return;
    }
    if (!action) return;
    const id = Number(action.dataset.id);
    if (action.dataset.taxAction === "select-group") {
      state.taxonomy.selectedGroupId = id;
      renderTaxDetail();
    } else if (action.dataset.taxAction === "edit-group") {
      editTaxGroup(id);
    }
  });

  $("#taxSubgroupsBody")?.addEventListener("click", (event) => {
    const action = event.target.closest("[data-tax-action]");
    const remove = event.target.closest("[data-tax-delete]");
    if (remove) {
      deleteTaxEntity(remove.dataset.taxDelete, Number(remove.dataset.id));
      return;
    }
    if (action?.dataset.taxAction === "edit-subgroup") {
      editTaxSubgroup(Number(action.dataset.id));
    }
  });

  for (const selector of ["#taxPlacementsBody", "#taxMasterBody"]) {
    $(selector)?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-tax-placement]");
      if (button) deleteTaxPlacement(Number(button.dataset.taxPlacement));
    });
  }

  // Capas
  $("#layerForm")?.addEventListener("submit", saveLayer);
  $("#layerImportForm")?.addEventListener("submit", submitLayerImport);
  $("#layersRefresh")?.addEventListener("click", () => loadLayerManager());
  $("#layersPublishBtn")?.addEventListener("click", publishLayers);
  $("#layerSearch")?.addEventListener("input", () => {
    if (state.layerManager.data) {
      renderLayerTable(state.layerManager.data.layers || [], state.layerManager.data.placements || []);
    }
  });

  $("#layerAddToggle")?.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    const drawer = $("#layerFormDrawer");
    if (drawer.hidden) newLayer();
    else setDrawerOpen("layerFormDrawer", false, { focus: false });
  });
  $("#layerImportToggle")?.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    const drawer = $("#layerImportDrawer");
    if (drawer.hidden) openLayerImport("");
    else setDrawerOpen("layerImportDrawer", false, { focus: false });
  });
  $("#ragAddToggle")?.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    const panel = $("#ragFormPanel");
    if (panel.hidden) {
      resetRagForm();
      setDrawerOpen("ragFormPanel", true);
    } else {
      setDrawerOpen("ragFormPanel", false, { focus: false });
    }
  });

  $("#layersBody")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-layer-action]");
    if (!button) return;
    const action = button.dataset.layerAction;
    if (action === "edit") editLayer(Number(button.dataset.id));
    else if (action === "archive") archiveLayer(Number(button.dataset.id));
    else if (action === "import") openLayerImport(button.dataset.key);
  });

  $("#layerJobsBody")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-layer-cancel]");
    if (!button) return;
    try {
      await api.layerCancel(Number(button.dataset.layerCancel));
      await loadLayerManager({ silent: true });
    } catch (err) {
      layerSetStatus(err.message, "error");
    }
  });

  // Configuración del chat
  $("#promptForm")?.addEventListener("submit", savePrompt);
  $("#settingForm")?.addEventListener("submit", saveSetting);
  $("#messageForm")?.addEventListener("submit", saveMessage);
  $("#unavailableForm")?.addEventListener("submit", saveUnavailable);
  $("#goldenForm")?.addEventListener("submit", saveGolden);

  for (const [toggleId, kind, drawerId] of [
    ["promptAddToggle", "prompt", "promptFormDrawer"],
    ["settingAddToggle", "setting", "settingFormDrawer"],
    ["messageAddToggle", "message", "messageFormDrawer"],
    ["unavailableAddToggle", "unavailable", "unavailableFormDrawer"],
    ["goldenAddToggle", "golden", "goldenFormDrawer"],
  ]) {
    document.getElementById(toggleId)?.addEventListener("click", (event) => {
      event.stopImmediatePropagation();
      const drawer = document.getElementById(drawerId);
      if (drawer.hidden) newChatForm(kind);
      else setDrawerOpen(drawerId, false, { focus: false });
    });
  }

  $("#promptsList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-prompt-action]");
    if (!button) return;
    event.preventDefault();
    promptAction(
      button.dataset.promptAction,
      button.dataset.id,
      Number(button.dataset.version)
    );
  });
  $("#settingsList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-setting-action]");
    if (button) settingAction(button.dataset.settingAction, button.dataset.key);
  });
  $("#messagesList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-message-action]");
    if (button) messageAction(button.dataset.messageAction, button.dataset.key);
  });
  $("#unavailableList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-unavailable-action]");
    if (button) unavailableAction(button.dataset.unavailableAction, button.dataset.id);
  });
  $("#goldenList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-golden-action]");
    if (button) goldenAction(button.dataset.goldenAction, button.dataset.id);
  });

  // Demanda
  $("#demandRefresh")?.addEventListener("click", () => loadDemand());
  $("#demandClear")?.addEventListener("click", () => {
    const search = $("#demandSearch");
    if (search) search.value = "";
    for (const id of ["demandStatus", "demandReason", "demandPriority"]) {
      const select = document.getElementById(id);
      if (select) select.value = "all";
    }
    const sort = $("#demandSort");
    if (sort) sort.value = "last_seen_at";
    loadDemand({ silent: true });
  });

  let demandSearchTimer = null;
  $("#demandSearch")?.addEventListener("input", () => {
    clearTimeout(demandSearchTimer);
    demandSearchTimer = setTimeout(() => loadDemand({ silent: true }), 300);
  });
  for (const id of ["demandStatus", "demandReason", "demandPriority", "demandSort"]) {
    document.getElementById(id)?.addEventListener("change", () => loadDemand({ silent: true }));
  }

  $("#demandBody")?.addEventListener("click", async (event) => {
    const view = event.target.closest("[data-demand-view]");
    if (view) {
      openDemandDetail(view.dataset.demandView);
      return;
    }
    const brief = event.target.closest("[data-demand-brief]");
    if (brief) await downloadDemandBrief(brief.dataset.demandBrief);
  });

  $("#demandDetailClose")?.addEventListener("click", () => {
    const panel = $("#demandDetail");
    if (panel) panel.hidden = true;
    state.demand.selectedId = null;
  });
  $("#demandForm")?.addEventListener("submit", saveDemand);
  $("#demandBriefBtn")?.addEventListener("click", () => {
    const id = $("#demandId").value;
    if (id) downloadDemandBrief(id);
  });
  $("#demandQuickResolve")?.addEventListener("click", () => demandQuick("resolved"));
  $("#demandQuickReject")?.addEventListener("click", () => demandQuick("rejected", "wont_fix"));
  $("#demandQuickArchive")?.addEventListener("click", () => demandQuick("archived"));
}

async function boot() {
  initTheme();
  bindEvents();
  bindHelpPopovers();
  bindFormDrawers();

  const resetToken = new URLSearchParams(window.location.search).get("reset");
  if (resetToken) {
    pendingResetToken = resetToken;
    window.history.replaceState({}, "", window.location.pathname);
    showReset();
    return;
  }

  try {
    const session = await api.session();
    setCsrfToken(session.csrfToken);
    showApp(session);
  } catch (err) {
    if (err.status === 401) {
      showLogin();
      return;
    }
    showLogin();
    setLoginError("El panel no está disponible. Revisa la configuración del servidor.");
  }
}

document.addEventListener("DOMContentLoaded", boot);
