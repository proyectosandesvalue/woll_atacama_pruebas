/**
 * Render de emails (Sprint 26-M).
 *
 * Todo dato dinámico se escapa antes de entrar al HTML. Las plantillas
 * devuelven texto plano y HTML; el código de login nunca se registra.
 */

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * Envuelve contenido en un layout mínimo, sin CSS externo.
 *
 * @param {{ appName: string, title: string, bodyHtml: string }} opts
 * @returns {string}
 */
export function layout({ appName, title, bodyHtml }) {
  return [
    "<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\">",
    `<title>${escapeHtml(title)}</title></head>`,
    "<body style=\"font-family:Arial,sans-serif;color:#1f2933;line-height:1.5\">",
    `<div style="max-width:520px;margin:24px auto;padding:0 16px">`,
    `<h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(appName)}</h2>`,
    bodyHtml,
    `<p style="color:#7b8794;font-size:12px;margin-top:24px">`,
    "Mensaje automático. No respondas a este correo.",
    "</p></div></body></html>",
  ].join("");
}
