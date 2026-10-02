/**
 * Asistente IA del Visor — cliente ligero del backend.
 *
 * Fase 1: el chat consulta datos reales en Supabase vía tool-calling.
 * Este módulo SOLO envía la pregunta al backend y devuelve la respuesta
 * estructurada {reply, chart, geojson}. La lógica de orquestación,
 * conexión a BD y selección de tools vive en /api/chat (server-side).
 *
 * Cambios respecto a la versión anterior:
 *   - Muere startChatPreload() y la precarga de 270 MB de GeoJSON.
 *   - Muere extractRichStatistics / buildEnrichedContext / correlaciones.
 *   - Muere metadataExtractor.js (la BD tiene su propio catálogo).
 *   - sendMessage() ahora es un wrapper fino sobre POST /api/chat.
 */

import { createContextLogger } from "./logger.js";

const log = createContextLogger("ChatIA");

/**
 * Envía un mensaje al asistente.
 *
 * @param {string} text - Consulta del usuario
 * @param {Array<{role:string, content:string}>} [history] - Historial reciente (último turno)
 * @returns {Promise<{reply: string, chart?: object|null, geojson?: object|null}>}
 */
export async function sendMessage(text, history = []) {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, history }),
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
          "El servicio de IA no está disponible en este entorno. " +
          "Despliega el visor en Vercel con SUPABASE_SERVICE_KEY y LLM_API_KEY configuradas."
        );
      }
      throw new Error(detail || `Error ${response.status} al consultar la IA.`);
    }

    const data = await response.json();
    return {
      reply: typeof data.reply === "string" ? data.reply : "Sin respuesta.",
      chart: data.chart ?? null,
      geojson: data.geojson ?? null,
    };
  } catch (err) {
    log.error("[ChatIA] sendMessage error:", err);
    throw err;
  }
}
