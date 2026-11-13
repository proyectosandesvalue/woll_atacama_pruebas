/**
 * Panel admin — lógica de UI (Sprint 15).
 *
 * Solo lectura. Todo dato de la API se inserta con textContent; no se usa
 * innerHTML para contenido dinámico.
 */

import { api, setCsrfToken } from "./api.js";

const VIEW_META = {
  config: { eyebrow: "Operación / Configuración", title: "Configuración del visor" },
  chat: { eyebrow: "Operación / Chat IA", title: "Prompts y mensajes" },
  audit: { eyebrow: "Operación / Trazabilidad", title: "Auditoría" },
};

const state = {
  view: "config",
  layers: [],
  loaded: { config: false, chat: false, audit: false },
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

function shortHash(value) {
  if (!value) return "—";
  return String(value).slice(0, 16) + "…";
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
  $("#adminUsername")?.focus();
}

function showApp(session) {
  $("#loginView").hidden = true;
  $("#adminView").hidden = false;
  $("#sessionUser").textContent = session.user || "—";
  $("#sessionExpiry").textContent = session.expiresAt
    ? `vence ${formatDate(session.expiresAt)}`
    : "—";
  setStatus("");
  selectView("config");
}

function selectView(view) {
  if (!VIEW_META[view]) return;
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
  setStatus("");

  if (view === "config" && !state.loaded.config) loadConfig();
  if (view === "chat" && !state.loaded.chat) loadChat();
  if (view === "audit") loadAudit();
}

async function withAuth(promise) {
  try {
    return await promise;
  } catch (err) {
    if (err.status === 401) {
      showLogin();
      setLoginError("La sesión expiró. Volvé a ingresar.");
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

// ── Chat ──────────────────────────────────────────────────

function renderEmpty(container, message) {
  container.replaceChildren(el("p", { className: "empty", text: message }));
}

async function loadChat() {
  setStatus("Cargando configuración del chat…");
  try {
    const [prompts, settings, messages, unavailable] = await Promise.all([
      withAuth(api.prompts()),
      withAuth(api.settings()),
      withAuth(api.messages()),
      withAuth(api.unavailable()),
    ]);
    if (!prompts || !settings || !messages || !unavailable) return;

    renderPrompts(prompts.items || []);
    renderSettings(settings.items || []);
    renderMessages(messages.items || []);
    renderUnavailable(unavailable.items || []);
    state.loaded.chat = true;
    setStatus("");
  } catch (err) {
    setStatus(`No se pudo cargar el chat: ${err.message}`, "error");
  }
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
        el("p", { className: "item-meta", text: `${item.motivo || "—"} · ${layers} · verificado ${item.verificado_en || "—"}` }),
      ])
    );
  }
  container.replaceChildren(fragment);
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
    const totp = $("#adminTotp").value.trim();

    setLoginError("");
    button.disabled = true;
    button.textContent = "Verificando…";

    try {
      const session = await api.login(username, password, totp);
      setCsrfToken(session.csrfToken);
      $("#loginForm").reset();
      showApp(session);
    } catch (err) {
      const retry = err.retryAfter ? ` Reintentá en ${err.retryAfter}s.` : "";
      setLoginError(`${err.message}${retry}`);
      $("#adminTotp").value = "";
      $("#adminTotp").focus();
    } finally {
      button.disabled = false;
      button.textContent = "Verificar identidad";
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
}

async function boot() {
  initTheme();
  bindEvents();
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
    setLoginError("El panel no está disponible. Revisá la configuración del servidor.");
  }
}

document.addEventListener("DOMContentLoaded", boot);
