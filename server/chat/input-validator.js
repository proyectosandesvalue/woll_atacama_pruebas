/**
 * Validación de input del chat.
 *
 * Valida el body recibido en POST /api/chat ANTES de pasarlo al orquestador.
 * Rechaza con un mensaje específico cuando algo no cumple.
 *
 * Es defensivo: el endpoint está público y cualquiera puede mandar basura.
 * Preferimos rechazar temprano (400) que dejar que el LLM procese input
 * malformado o gigante.
 */

const MAX_TEXT_LENGTH = 1000;
const MAX_HISTORY_ITEMS = 20;
const MAX_HISTORY_ITEM_LENGTH = 2000;
const ALLOWED_ROLES = new Set(["user", "assistant"]);

/**
 * Valida el campo `text`.
 *
 * @param {*} text
 * @returns {{ok: true, text: string} | {ok: false, error: string}}
 */
function validateText(text) {
  if (typeof text !== "string") {
    return { ok: false, error: "El campo 'text' debe ser un string." };
  }

  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return { ok: false, error: "El campo 'text' no puede estar vacío." };
  }

  if (trimmed.length > MAX_TEXT_LENGTH) {
    return {
      ok: false,
      error: `El campo 'text' supera el máximo permitido de ${MAX_TEXT_LENGTH} caracteres.`,
    };
  }

  // Debe contener al menos una letra o número (bloquea "..." o "???").
  if (!/[a-záéíóúñ0-9]/i.test(trimmed)) {
    return {
      ok: false,
      error: "El campo 'text' debe contener al menos una letra o número.",
    };
  }

  return { ok: true, text: trimmed };
}

/**
 * Valida el campo `history`.
 *
 * @param {*} history
 * @returns {{ok: true, history: Array} | {ok: false, error: string}}
 */
function validateHistory(history) {
  if (history === undefined || history === null) {
    return { ok: true, history: [] };
  }

  if (!Array.isArray(history)) {
    return { ok: false, error: "El campo 'history' debe ser un array." };
  }

  if (history.length > MAX_HISTORY_ITEMS) {
    return {
      ok: false,
      error: `El campo 'history' no puede tener más de ${MAX_HISTORY_ITEMS} items.`,
    };
  }

  const cleaned = [];
  for (let i = 0; i < history.length; i++) {
    const item = history[i];

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return {
        ok: false,
        error: `El item ${i} de 'history' no es un objeto válido.`,
      };
    }

    const { role, content } = item;

    if (typeof role !== "string" || !ALLOWED_ROLES.has(role)) {
      return {
        ok: false,
        error: `El item ${i} de 'history' tiene un 'role' inválido. Debe ser 'user' o 'assistant'.`,
      };
    }

    if (typeof content !== "string") {
      return {
        ok: false,
        error: `El item ${i} de 'history' tiene 'content' que no es string.`,
      };
    }

    if (content.length > MAX_HISTORY_ITEM_LENGTH) {
      return {
        ok: false,
        error: `El item ${i} de 'history' supera los ${MAX_HISTORY_ITEM_LENGTH} caracteres.`,
      };
    }

    cleaned.push({ role, content });
  }

  return { ok: true, history: cleaned };
}

/**
 * Valida el campo `sessionId` (opcional).
 *
 * Si viene, debe ser un string corto (≤ 100 chars). Si no viene, se
 * devuelve null y el driver generará uno efímero.
 */
function validateSessionId(sessionId) {
  if (sessionId === undefined || sessionId === null) {
    return { ok: true, sessionId: null };
  }
  if (typeof sessionId !== "string") {
    return { ok: false, error: "El campo 'sessionId' debe ser un string." };
  }
  if (sessionId.length === 0 || sessionId.length > 100) {
    return { ok: false, error: "El campo 'sessionId' tiene longitud inválida." };
  }
  return { ok: true, sessionId };
}


/**
 * Valida el body completo.
 *
 * @param {object} body
 * @returns {{ok: true, text: string, history: Array} | {ok: false, error: string}}
 */
export function validateChatInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "El body debe ser un objeto JSON." };
  }

  const textResult = validateText(body.text);
  if (!textResult.ok) return textResult;

  const historyResult = validateHistory(body.history);
  if (!historyResult.ok) return historyResult;

  const sessionResult = validateSessionId(body.sessionId);
  if (!sessionResult.ok) return sessionResult;

  return {
    ok: true,
    text: textResult.text,
    history: historyResult.history,
    sessionId: sessionResult.sessionId,
  };
}

export const LIMITS = {
  MAX_TEXT_LENGTH,
  MAX_HISTORY_ITEMS,
  MAX_HISTORY_ITEM_LENGTH,
};