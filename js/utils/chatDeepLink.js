/**
 * chatDeepLink.js — Apertura del chat desde una URL.
 *
 * Permite que los enlaces externos abran el panel del asistente al cargar
 * el visor. Formatos aceptados:
 *   - ?chat=1
 *   - #chat
 *
 * Es una función pura para poder probarla sin DOM.
 */

/**
 * @param {string} [search] location.search
 * @param {string} [hash] location.hash
 * @returns {boolean}
 */
export function shouldOpenChatFromUrl(search = "", hash = "") {
  const params = new URLSearchParams(search || "");
  return params.get("chat") === "1" || hash === "#chat";
}
