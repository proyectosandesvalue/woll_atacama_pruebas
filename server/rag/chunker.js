/**
 * Chunker consciente de estructura (párrafos, oraciones, encabezados
 * legales: Artículo, Título, Capítulo, Sección, Párrafo).
 *
 * Entrada: [{ page, text }] con texto ya normalizado ("\n\n" entre
 * párrafos). Salida: [{ ordinal, content, page_start, page_end, section,
 * token_estimate }].
 *
 * Garantías:
 *  - Ningún chunk supera `maxTokens` (por defecto 1.5 × objetivo).
 *  - El solape (hasta `overlapTokens`) solo ocurre dentro de la misma
 *    sección.
 *  - Un cambio de sección cierra el chunk si ya alcanzó `minTokens`.
 *  - No se pierde contenido: cada átomo (oración o trozo) aparece al
 *    menos en un chunk.
 *
 * Los tokens se estiman con chars/4. Es una aproximación documentada,
 * no el tokenizador real del modelo (ver ADR 022).
 */

export const estimateTokens = (text) =>
  typeof text === "string" && text.length > 0 ? Math.ceil(text.length / 4) : 0;

const HEADING_RE =
  /^(art[íi]culo|t[íi]tulo|cap[íi]tulo|p[áa]rrafo|secci[óo]n)\s+[\dIVXLCivxlc]+/i;

const SEP_PARAGRAPH = "\n\n";
const SEP_SENTENCE = " ";

/**
 * @param {string} paragraph
 * @returns {boolean}
 */
function isHeading(paragraph) {
  if (paragraph.length > 120) return false;
  if (HEADING_RE.test(paragraph)) return true;
  // Encabezado en mayúsculas y corto ("GLOSARIO", "ANEXO A").
  return paragraph.length <= 80 && paragraph === paragraph.toUpperCase() && /\p{L}{3}/u.test(paragraph);
}

/**
 * @param {string} paragraph
 * @returns {string[]}
 */
function splitSentences(paragraph) {
  return paragraph
    .split(/(?<=[.!?…])\s+(?=[A-ZÁÉÍÓÚÑÜ¿¡"“(])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parte un texto sin puntos de corte natural en trozos de hasta
 * `maxChars`, sin romper palabras salvo que una palabra sola sea más
 * larga que el máximo.
 *
 * @param {string} text
 * @param {number} maxChars
 * @returns {string[]}
 */
function hardSplit(text, maxChars) {
  if (text.length <= maxChars) return [text];

  const out = [];
  let current = "";

  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (word.length > maxChars) {
      if (current) {
        out.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += maxChars) {
        out.push(word.slice(i, i + maxChars));
      }
      continue;
    }

    if (current && current.length + 1 + word.length > maxChars) {
      out.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }

  if (current) out.push(current);
  return out;
}

/**
 * Convierte páginas en átomos ordenados. Un átomo es una oración (o un
 * trozo de oración si excede el máximo). Guarda el separador que lo une
 * al átomo anterior para reconstruir el texto sin ambigüedad.
 *
 * @param {{page:number, text:string}[]} pages
 * @param {number} maxTokens
 */
function buildAtoms(pages, maxTokens) {
  const atoms = [];
  let section = null;

  for (const { page, text } of pages) {
    for (const raw of String(text ?? "").split(/\n{2,}/)) {
      const paragraph = raw.trim();
      if (!paragraph) continue;

      if (isHeading(paragraph)) section = paragraph.slice(0, 120);

      const sentences = splitSentences(paragraph);
      sentences.forEach((sentence, sentenceIndex) => {
        for (const [pieceIndex, piece] of hardSplit(sentence, maxTokens * 4).entries()) {
          atoms.push({
            text: piece,
            sep: sentenceIndex === 0 && pieceIndex === 0 ? SEP_PARAGRAPH : SEP_SENTENCE,
            page: Number.isFinite(page) ? page : 1,
            section,
            tokens: estimateTokens(piece),
          });
        }
      });
    }
  }

  return atoms;
}

/**
 * Coste en tokens de un átomo incluyendo su separador. Es una cota
 * superior de `estimateTokens(content)`, lo que garantiza el límite
 * `maxTokens` sin recalcular el chunk completo.
 */
const atomCost = (atom) => atom.tokens + estimateTokens(atom.sep);

/**
 * @param {object[]} atoms
 * @param {number} ordinal
 * @param {number} newStart índice del primer átomo propio (no solape)
 */
function makeChunk(atoms, ordinal, newStart) {
  const content = atoms
    .map((atom, index) => (index === 0 ? atom.text : atom.sep + atom.text))
    .join("");

  const pages = atoms.map((atom) => atom.page);
  const section = atoms[newStart]?.section ?? atoms[0]?.section ?? null;

  return {
    ordinal,
    content,
    page_start: Math.min(...pages),
    page_end: Math.max(...pages),
    section,
    token_estimate: estimateTokens(content),
  };
}

/**
 * @param {{page:number, text:string}[]} pages
 * @param {{targetTokens?:number, overlapTokens?:number, maxTokens?:number,
 *   minTokens?:number}} [opts]
 * @returns {{ordinal:number, content:string, page_start:number,
 *   page_end:number, section:string|null, token_estimate:number}[]}
 */
export function chunkPages(pages, opts = {}) {
  const target = opts.targetTokens ?? 450;
  const overlap = opts.overlapTokens ?? 60;
  const max = opts.maxTokens ?? Math.round(target * 1.5);
  const min = opts.minTokens ?? Math.round(target * 0.3);

  if (!(target > 0)) throw new RangeError("targetTokens debe ser mayor que 0");
  if (overlap < 0) throw new RangeError("overlapTokens no puede ser negativo");
  if (overlap >= target) throw new RangeError("overlapTokens debe ser menor que targetTokens");
  if (max < target) throw new RangeError("maxTokens debe ser >= targetTokens");

  if (!Array.isArray(pages) || pages.length === 0) return [];

  const atoms = buildAtoms(pages, max);
  if (atoms.length === 0) return [];

  /** @type {object[]} */
  let current = [];
  let currentTokens = 0;
  let newCount = 0; // átomos propios del chunk actual (sin solape)
  const chunks = [];

  const flush = (withOverlap) => {
    if (newCount === 0) return;

    const newStart = current.length - newCount;
    chunks.push(makeChunk(current, chunks.length, newStart));

    let carry = [];
    if (withOverlap && overlap > 0) {
      let carryTokens = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        const cost = atomCost(current[i]);
        if (carryTokens + cost > overlap) break;
        carryTokens += cost;
        carry.unshift(current[i]);
      }
    }

    current = carry;
    currentTokens = carry.reduce((sum, atom) => sum + atomCost(atom), 0);
    newCount = 0;
  };

  for (const atom of atoms) {
    const last = current[current.length - 1];

    // Cambio de sección: cerrar sin solape para no mezclar artículos.
    if (newCount > 0 && last && atom.section !== last.section && currentTokens >= min) {
      flush(false);
    }

    // Objetivo alcanzado: cerrar con solape.
    if (newCount > 0 && currentTokens + atomCost(atom) > target) {
      flush(true);
    }

    // Un átomo que por sí solo excede el máximo (caso raro): descartar
    // el solape acumulado antes de agregarlo.
    if (current.length > 0 && currentTokens + atomCost(atom) > max) {
      current = [];
      currentTokens = 0;
      newCount = 0;
    }

    current.push(atom);
    currentTokens += atomCost(atom);
    newCount += 1;
  }

  flush(false);
  return chunks;
}
