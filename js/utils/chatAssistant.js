/**
 * Asistente IA del Visor — cliente ligero del backend.
 *
 * Envía la pregunta al backend y devuelve la respuesta estructurada
 * {reply, chart, geojson}.
 *
 * Genera un sessionId único por pestaña (persistido en sessionStorage)
 * para que OpenCode Go pueda mantener el caché de prompt entre requests.
 */

import { createContextLogger } from "./logger.js";

const log = createContextLogger("ChatIA");

/**
 * Obtiene (o genera) el sessionId del chat.
 * Persiste en sessionStorage para sobrevivir recargas de la misma pestaña.
 */
function getSessionId() {
  try {
    let id = sessionStorage.getItem("woll-chat-session");
    if (!id) {
      id = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
        ? crypto.randomUUID()
        : `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem("woll-chat-session", id);
    }
    return id;
  } catch {
    // sessionStorage puede fallar en modo privado o contextos restringidos.
    // En ese caso, generamos uno efímero.
    return `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Envía un mensaje al asistente.
 *
 * @param {string} text - Consulta del usuario
 * @param {Array<{role:string, content:string}>} [history]
 * @returns {Promise<{reply: string, chart?: object|null, geojson?: object|null}>}
 */
export async function sendMessage(text, history = []) {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        history,
        sessionId: getSessionId(),
      }),
    });

    if (!response.ok) {
      let detail = "";
      try {
        const errBody = await response.json();
        detail = errBody?.error?.message || errBody?.error || "";
      } catch {
        detail = "";
      }
      if ([404, 501, 502, 503].includes(response.status)) {
        throw new Error(
          detail ||
            "El servicio de IA no está disponible temporalmente. Intenta de nuevo."
        );
      }
      throw new Error(detail || `Error ${response.status} al consultar la IA.`);
    }

    const data = await response.json();
    return {
      reply: typeof data.reply === "string" ? data.reply : "Sin respuesta.",
      notice: data.notice ?? null,
      chart: data.chart ?? null,
      charts: Array.isArray(data.charts) ? data.charts : [],
      geojson: data.geojson ?? null,
      geojson_meta: data.geojson_meta ?? null,
    };
  } catch (err) {
    log.error("[ChatIA] sendMessage error:", err);
    throw err;
  }
}