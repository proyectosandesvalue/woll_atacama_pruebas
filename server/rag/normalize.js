/**
 * Normalización de texto extraído de PDFs.
 *
 * Todo es puro y determinista: el mismo PDF produce exactamente los
 * mismos chunks y, por lo tanto, el mismo sha256 de contenido.
 *
 * El texto de salida usa "\n\n" como separador de párrafos.
 */

// Caracteres de formato invisibles (zero-width, marcas direccionales,
// separadores de palabra, BOM).
const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

// Controles C0/C1 excepto \n y \t (que se tratan más abajo).
// eslint-disable-next-line no-control-regex -- limpiar controles es el propósito de esta regex.
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

// "3", "pág. 3", "Página 3 de 10", "3/10".
const PAGE_NUMBER_RE = /^\s*(p[áa]g(?:ina)?\.?\s*)?\d+(?:\s*(?:de|\/)\s*\d+)?\s*$/i;

/**
 * Limpia una cadena y reconstruye párrafos.
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeText(raw) {
  if (typeof raw !== "string") return "";

  let t = raw.normalize("NFC").replace(/\r\n?/g, "\n");

  // Guion blando al final de línea: desaparece sin dejar espacio.
  t = t.replace(/\u00AD\n/g, "").replace(/\u00AD/g, "");

  t = t.replace(INVISIBLE_RE, "").replace(CONTROL_RE, "");

  // Espacios especiales y tabuladores → espacio simple.
  t = t.replace(/[\u00A0\u2007\u202F\t]/g, " ");

  // Palabra cortada con guion: "infor-\nmación" → "información".
  t = t.replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2");

  // Salto simple → espacio; se conservan los saltos de párrafo.
  t = t.replace(/([^\n])\n(?!\n)/g, "$1 ");

  return t
    .replace(/ {2,}/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Quita números de página y líneas cortas repetidas en al menos `ratio`
 * de las páginas (encabezados y pies). Opera sobre el texto crudo, antes
 * de normalizar, porque necesita conservar la estructura por línea.
 *
 * @param {string[]} pages
 * @param {{minPages?:number, ratio?:number, maxLen?:number}} [opts]
 * @returns {string[]}
 */
export function stripRepeatedLines(pages, opts = {}) {
  const { minPages = 4, ratio = 0.5, maxLen = 80 } = opts;
  if (!Array.isArray(pages)) return [];

  // Clave para detectar encabezados/pies: se quita solo el número de
  // página del final. NO se normalizan todos los dígitos: una línea de
  // cuerpo como "Contenido 3 del documento" no debe colapsar con la de
  // otra página.
  const key = (line) =>
    line
      .trim()
      .replace(/\s*[-–—|]?\s*(p[áa]g(?:ina)?\.?\s*)?\d+(?:\s*(?:de|\/)\s*\d+)?\s*$/i, "")
      .toLowerCase();
  const isShort = (line) => {
    const s = line.trim();
    return s.length > 0 && s.length <= maxLen;
  };

  const repeated = new Set();

  if (pages.length >= minPages) {
    const counts = new Map();

    for (const page of pages) {
      const seenOnPage = new Set();
      for (const line of String(page ?? "").split("\n")) {
        if (isShort(line)) seenOnPage.add(key(line));
      }
      for (const k of seenOnPage) counts.set(k, (counts.get(k) || 0) + 1);
    }

    const threshold = Math.ceil(pages.length * ratio);
    for (const [k, n] of counts) {
      if (n >= threshold) repeated.add(k);
    }
  }

  return pages.map((page) =>
    String(page ?? "")
      .split("\n")
      .filter((line) => {
        if (PAGE_NUMBER_RE.test(line)) return false;
        return !(isShort(line) && repeated.has(key(line)));
      })
      .join("\n")
  );
}
