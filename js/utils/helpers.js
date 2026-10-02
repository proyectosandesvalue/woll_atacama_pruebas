// js/utils/helpers.js
/**
 * Escapa caracteres HTML especiales en una cadena.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"'`=\/]/g, function (m) {
        switch (m) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#39;';
            case '/': return '&#x2F;';
            case '`': return '&#x60;';
            case '=': return '&#x3D;';
            default: return m;
        }
    });
}

/**
 * Sanitiza contenido HTML usando DOMPurify si está disponible.
 * @param {string} html
 * @returns {string}
 */
export function safeHTML(html) {
    if (!html) return '';
    return window.DOMPurify ? window.DOMPurify.sanitize(html) : html;
}