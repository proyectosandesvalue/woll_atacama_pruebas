/**
 * chatUI.js — Panel de chat con el asistente IA
 *
 * Icono en la navbar + sidebar deslizante desde el derecho (mismo patrón
 * visual que el sidebar de Leyenda). Renderiza la conversación y envía las
 * consultas a `chatAssistant`, que delega en /api/chat.
 *
 * El chat puede adjuntar `chart` y `geojson` en la respuesta.
 * El geojson se pinta en el mapa vía `chatMapUtils`.
 *
 * Ubicación: /js/ui/chatUI.js
 * @module ui/chatUI
 */

import { sendMessage } from "../utils/chatAssistant.js";
import { createContextLogger } from "../utils/logger.js";
import { showResults, clearResults } from "../utils/chatMapUtils.js";
import { appState } from "../store/appState.js";

const log = createContextLogger("ChatUI");

// ── Estado local del módulo ────────────────────────────────────
let chatSidebar = null;
let chatBtn = null;
let closeBtn = null;
let clearBtn = null;
let clearResultsBtn = null;
let messagesEl = null;
let inputEl = null;
let sendBtn = null;

let isOpen = false;
let isSending = false;
let messageHistory = [];

const TRANSITION_MS = 300;
const MAX_HISTORY = 12;

function isMobile() {
  return window.innerWidth < 769;
}

/**
 * El `.main-layout` es un contenedor con `overflow: hidden` que puede
 * desplazarse si el navegador hace scroll para enfocar un elemento fuera
 * de vista. Se fuerza el reset para que el panel nunca "corra" de sitio.
 */
function resetLayoutScroll() {
  const layout = document.querySelector(".main-layout");
  if (layout && (layout.scrollLeft !== 0 || layout.scrollTop !== 0)) {
    layout.scrollLeft = 0;
    layout.scrollTop = 0;
  }
}

// ── Render de mensajes ─────────────────────────────────────────

function scrollToBottom() {
  if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
}

/**
 * Renderiza un mensaje en la conversación.
 * Soporta: **negrita**, tablas markdown simples, listas con guiones,
 * saltos de línea. Sanitización estructural (textContent + nodos).
 */
function addMessage(payload, sender) {
  const msg = document.createElement("div");
  msg.className = `ai-message ${sender}`;

  const text = typeof payload === "string" ? payload : payload?.reply || "";

  renderRichText(text, msg);

  // Si hay más de 1 chart, mostramos un separador visual.
  if (Array.isArray(payload?.charts) && payload.charts.length > 1) {
    const divider = document.createElement("div");
    divider.className = "ai-charts-divider";
    divider.textContent = `${payload.charts.length} gráficos`;
    msg.appendChild(divider);
  }

  // Render de gráficos.
  if (typeof payload === "object" && payload) {
    const chartsList =
      Array.isArray(payload.charts) && payload.charts.length > 0
        ? payload.charts
        : payload.chart
          ? [payload.chart]
          : [];

    for (const chart of chartsList) {
      if (chart && typeof chart === "object") {
        renderChart(chart, msg);
      }
    }
  }

  messagesEl.appendChild(msg);
  scrollToBottom();
  return msg;
}

/**
 * Renderiza texto enriquecido en el contenedor.
 * Procesa línea por línea detectando:
 *   - Tablas markdown (| col | col |)
 *   - Listas (- item)
 *   - Párrafos normales
 *   - **negrita** inline
 */
function renderRichText(text, container) {
  const lines = text.split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // ── Tabla markdown ──
    if (isTableRow(line) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const tableLines = [];
      tableLines.push(line);
      i++;
      i++;
      while (i < lines.length && isTableRow(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      container.appendChild(buildTable(tableLines));
      continue;
    }

    // ── Lista con guiones ──
    if (/^\s*[-*]\s+/.test(line)) {
      const listLines = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        listLines.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      container.appendChild(buildList(listLines));
      continue;
    }

    // ── Línea vacía → espaciador ──
    if (!line.trim()) {
      i++;
      continue;
    }

    // ── Párrafo normal ──
    const p = document.createElement("div");
    p.className = "ai-message-paragraph";
    renderMarkdownLine(line, p);
    container.appendChild(p);
    i++;
  }
}

function isTableRow(line) {
  const trimmed = line.trim();
  return /^\|.*\|$/.test(trimmed) && (trimmed.match(/\|/g) || []).length >= 2;
}

function isSeparatorRow(line) {
  const trimmed = line.trim();
  return /^\|[\s:|-]+\|$/.test(trimmed) && /-/.test(trimmed);
}

/**
 * Construye un elemento <table> desde las líneas markdown.
 */
function buildTable(tableLines) {
  const wrap = document.createElement("div");
  wrap.className = "ai-message-table-wrapper";

  const table = document.createElement("table");
  table.className = "ai-message-table";

  const parseRow = (line) =>
    line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());

  // Cabecera
  const headCells = parseRow(tableLines[0]);
  const thead = document.createElement("thead");
  const trHead = document.createElement("tr");
  headCells.forEach((cell) => {
    const th = document.createElement("th");
    renderMarkdownLine(cell, th);
    trHead.appendChild(th);
  });
  thead.appendChild(trHead);
  table.appendChild(thead);

  // Cuerpo
  const tbody = document.createElement("tbody");
  for (let i = 1; i < tableLines.length; i++) {
    const cells = parseRow(tableLines[i]);
    const tr = document.createElement("tr");
    cells.forEach((cell) => {
      const td = document.createElement("td");
      renderMarkdownLine(cell, td);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  wrap.appendChild(table);
  return wrap;
}

/**
 * Construye un <ul> desde las líneas de una lista.
 */
function buildList(items) {
  const ul = document.createElement("ul");
  ul.className = "ai-message-list";
  items.forEach((item) => {
    const li = document.createElement("li");
    renderMarkdownLine(item, li);
    ul.appendChild(li);
  });
  return ul;
}

/**
 * Renderiza una línea de markdown mínima (**x**).
 */
function renderMarkdownLine(line, container) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  for (const p of parts) {
    if (!p) continue;
    if (p.startsWith("**") && p.endsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = p.slice(2, -2);
      container.appendChild(strong);
    } else {
      container.appendChild(document.createTextNode(p));
    }
  }
}

/**
 * Paleta de colores para gráficos tipo pie.
 */
const CHART_PALETTE = [
  "#1A19CC",
  "#8b8aff",
  "#FFB93D",
  "#2f3562",
  "#eeecff",
  "#262b55",
  "#d6d4f7",
  "#a5a3e0",
  "#ffc973",
  "#ff9e5e",
];

/**
 * Renderiza un gráfico en un contenedor con Chart.js.
 */
function renderChart(chart, container) {
  const wrap = document.createElement("div");
  wrap.className = "ai-chart";

  const title = document.createElement("div");
  title.className = "ai-chart-title";
  title.textContent = chart.title || "Gráfico";
  wrap.appendChild(title);

  if (!window.Chart) {
    log.warn("Chart.js no cargado; se muestra placeholder en lugar del gráfico.");
    const placeholder = document.createElement("div");
    placeholder.className = "ai-chart-placeholder";
    placeholder.textContent = "Gráfico no disponible (Chart.js no cargó).";
    wrap.appendChild(placeholder);
    container.appendChild(wrap);
    scrollToBottom();
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", chart.title || "Gráfico del asistente");
  wrap.appendChild(canvas);

  if (
    typeof chart.totalGroups === "number" &&
    chart.totalGroups > (chart.labels?.length || 0)
  ) {
    const note = document.createElement("div");
    note.className = "ai-chart-note";
    note.textContent = `Mostrando ${chart.labels.length} de ${chart.totalGroups}.`;
    wrap.appendChild(note);
  }

  container.appendChild(wrap);

  const type =
    chart.type === "pie"
      ? "pie"
      : chart.type === "horizontalBar"
        ? "bar"
        : chart.type === "line"
          ? "line"
          : "bar";

  const isHorizontal = chart.type === "horizontalBar";
  const isPie = type === "pie";

  try {
    new window.Chart(canvas.getContext("2d"), {
      type,
      data: {
        labels: chart.labels || [],
        datasets: [
          {
            label: chart.title || "",
            data: chart.values || [],
            backgroundColor: isPie
              ? CHART_PALETTE.slice(0, chart.labels?.length || 0)
              : "#1A19CC",
            borderColor: "#0e0e8e",
            borderWidth: type === "bar" ? 1 : 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: isHorizontal ? "y" : "x",
        plugins: {
          legend: {
            display: isPie,
            position: "bottom",
            labels: {
              padding: 12,
              font: { size: 11 },
              boxWidth: 14,
              boxHeight: 14,
              usePointStyle: true,
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const label = ctx.label || "";
                const val = ctx.parsed?.y ?? ctx.parsed ?? 0;
                return ` ${label}: ${val}`;
              },
            },
          },
        },
        scales: isPie
          ? {}
          : {
              x: {
                beginAtZero: true,
                ticks: { autoSkip: false, font: { size: 10 } },
              },
              y: {
                beginAtZero: true,
                ticks: { font: { size: 10 } },
              },
            },
        layout: {
          padding: { top: 6, bottom: 6, left: 6, right: 6 },
        },
      },
    });
  } catch (err) {
    log.error("Chart.js falló:", err);
    wrap.innerHTML = "";
    const fallback = document.createElement("div");
    fallback.className = "ai-chart-placeholder";
    fallback.textContent = "No se pudo dibujar el gráfico.";
    wrap.appendChild(fallback);
  }

  scrollToBottom();
}

function addTypingIndicator() {
  const typing = document.createElement("div");
  typing.className = "ai-message assistant typing";
  typing.setAttribute("aria-label", "El asistente está escribiendo");
  typing.innerHTML =
    '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
  messagesEl.appendChild(typing);
  scrollToBottom();
  return typing;
}

// ── Apertura / cierre del panel ────────────────────────────────

function openChat() {
  if (isOpen || !chatSidebar) return;
  isOpen = true;

  chatSidebar.classList.add("active");
  chatSidebar.setAttribute("aria-hidden", "false");
  chatSidebar.removeAttribute("inert");
  chatBtn?.setAttribute("aria-expanded", "true");
  chatBtn?.classList.add("icon-btn--active");

  setTimeout(() => {
    inputEl?.focus({ preventScroll: true });
    resetLayoutScroll();
  }, TRANSITION_MS);
  log.debug("Panel de chat abierto");
}

function closeChat() {
  if (!isOpen || !chatSidebar) return;
  isOpen = false;

  chatSidebar.classList.remove("active");
  chatSidebar.setAttribute("aria-hidden", "true");
  chatSidebar.setAttribute("inert", "");
  chatBtn?.setAttribute("aria-expanded", "false");
  chatBtn?.classList.remove("icon-btn--active");

  chatBtn?.focus({ preventScroll: true });
  resetLayoutScroll();
  log.debug("Panel de chat cerrado");

  // NO limpiar resultados al cerrar: el usuario puede querer ver el mapa.
  // Los resultados se limpian al enviar una nueva consulta o al pulsar "Quitar".
}

function toggleChat() {
  if (isOpen) closeChat();
  else openChat();
}

/**
 * Muestra u oculta el botón de "Quitar resultados" según si hay
 * resultados pintados en el mapa.
 */
function updateClearResultsBtn() {
  if (!clearResultsBtn) return;
  const hasResults = appState.chat.resultsLayer !== null;
  if (hasResults) {
    clearResultsBtn.removeAttribute("hidden");
  } else {
    clearResultsBtn.setAttribute("hidden", "");
  }
}

/**
 * Limpia la conversación: borra el historial en memoria y los mensajes
 * renderizados (excepto el mensaje de bienvenida original).
 * También limpia los resultados pintados en el mapa.
 */
function clearConversation() {
  messageHistory = [];

  const firstMessage = messagesEl.querySelector(
    ".ai-message.assistant:not(.typing)"
  );

  messagesEl.innerHTML = "";
  if (firstMessage) {
    messagesEl.appendChild(firstMessage);
  }

  clearResults();
  updateClearResultsBtn();

  log.debug("Conversación limpiada");
}

// ── Envío de consultas ─────────────────────────────────────────

async function handleSend() {
  const text = (inputEl?.value || "").trim();
  if (!text || isSending) return;

  isSending = true;
  if (sendBtn) sendBtn.disabled = true;
  if (inputEl) inputEl.value = "";

  addMessage(text, "user");
  messageHistory.push({ role: "user", content: text });

  // Al enviar una nueva consulta, limpiar los resultados anteriores del mapa.
  clearResults();
  updateClearResultsBtn();

  const typing = addTypingIndicator();

  try {
    const payload = await sendMessage(text, messageHistory.slice(0, -1));
    typing.remove();
    addMessage(payload, "assistant");

    // Si la respuesta trae geojson, pintarlo en el mapa.
    if (payload?.geojson && payload.geojson.type === "FeatureCollection") {
      try {
        const painted = showResults(payload.geojson);
        if (painted) updateClearResultsBtn();
      } catch (err) {
        log.warn("No se pudo pintar el geojson:", err);
      }
    }

    const replyText = payload?.reply || "Sin respuesta.";

    // NO guardar bloqueos de dominio en el historial.
    // Motivo: si el LLM ve un turno previo donde bloqueó una pregunta,
    // se confunde y responde esa pregunta bloqueada en el turno actual
    // (ej: alucinaba la fecha después de que el clasificador la bloqueó).
    const isDomainBlock =
      /^⚠️\s*No puedo responder/i.test(replyText.trim()) ||
      replyText.includes(
        "solo puedo ayudarte con consultas sobre los datos del portal"
      );

    if (!isDomainBlock) {
      messageHistory.push({ role: "assistant", content: replyText });
    } else {
      log.debug("Bloqueo de dominio detectado; no se guarda en el historial.");
    }

    if (messageHistory.length > MAX_HISTORY) {
      messageHistory = messageHistory.slice(-MAX_HISTORY);
    }
  } catch (err) {
    typing.remove();
    addMessage(
      `⚠️ ${err?.message || "Lo siento, hubo un error al procesar tu solicitud."}`,
      "error"
    );
    log.error("Error al enviar consulta al asistente:", err);
  } finally {
    isSending = false;
    if (sendBtn) sendBtn.disabled = false;
    inputEl?.focus({ preventScroll: true });
    resetLayoutScroll();
  }
}

// ── Inicialización ─────────────────────────────────────────────

export function initChatUI() {
  chatSidebar = document.getElementById("chatSidebar");
  chatBtn = document.getElementById("chatSidebarBtn");
  closeBtn = document.getElementById("closeChatSidebarBtn");
  clearBtn = document.getElementById("clearChatBtn");
  clearResultsBtn = document.getElementById("chatClearResultsBtn");
  messagesEl = document.getElementById("ai-chat-messages");
  inputEl = document.getElementById("ai-chat-input");
  sendBtn = document.getElementById("ai-chat-send");

  if (!chatSidebar || !chatBtn || !messagesEl || !inputEl) {
    log.error("No se encontró la estructura del chat en el DOM.");
    return;
  }

  // Normalizar el mensaje de bienvenida.
  Array.from(messagesEl.children).forEach((el) => {
    el.textContent = el.textContent.replace(/\s+/g, " ").trim();
  });

  chatBtn.addEventListener("click", toggleChat);
  closeBtn?.addEventListener("click", closeChat);
  clearBtn?.addEventListener("click", () => {
    if (window.confirm("¿Limpiar la conversación actual?")) {
      clearConversation();
    }
  });

  // Listener del botón "Quitar resultados" (una sola vez).
  clearResultsBtn?.addEventListener("click", () => {
    clearResults();
    updateClearResultsBtn();
  });

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  });
  sendBtn?.addEventListener("click", handleSend);
  document.getElementById("ai-chat-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    handleSend();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen) closeChat();
  });

  document.addEventListener("click", (e) => {
    if (!isOpen || !isMobile()) return;
    const target = e.target;
    if (chatSidebar.contains(target) || chatBtn.contains(target)) return;
    closeChat();
  });

  ["mobileLeftSidebarBtn", "mobileRightSidebarBtn"].forEach((id) => {
    document.getElementById(id)?.addEventListener("click", () => closeChat());
  });

  log.log("UI de Chat IA inicializada");
}