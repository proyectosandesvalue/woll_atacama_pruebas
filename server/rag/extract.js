import { RagError } from "./errors.js";

/**
 * Extrae texto página a página con pdfjs-dist.
 *
 * Reconstruye saltos de línea y párrafos usando la posición vertical de
 * cada fragmento. No hace OCR: si una página es una imagen, devuelve
 * texto vacío y el pipeline la marcará `needs_ocr`.
 *
 * @param {Buffer|Uint8Array} buffer
 * @param {{maxPages:number}} opts
 * @returns {Promise<{pages:string[], pageCount:number}>}
 */
export async function extractPdf(buffer, { maxPages }) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true,
      verbosity: 0,
    }).promise;
  } catch (err) {
    throw new RagError("PDF_UNREADABLE", "No se pudo abrir el PDF (corrupto o protegido).", {
      cause: err,
    });
  }

  try {
    if (doc.numPages > maxPages) {
      throw new RagError(
        "TOO_MANY_PAGES",
        `El PDF tiene ${doc.numPages} páginas (máximo ${maxPages}).`
      );
    }

    const pages = [];

    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();

      let text = "";
      let lastY = null;
      let lastHeight = 10;

      for (const item of content.items) {
        if (typeof item.str !== "string") continue;

        const y = item.transform?.[5] ?? 0;
        const height = item.height || lastHeight;

        let addedBreak = false;
        if (lastY !== null && Math.abs(y - lastY) > 1) {
          // Salto grande → párrafo; salto pequeño → línea. Se normalizan
          // los saltos previos para no duplicar el de `hasEOL`.
          const isParagraph = Math.abs(y - lastY) > 1.8 * height;
          text = text.replace(/\n+$/, "");
          text += isParagraph ? "\n\n" : "\n";
          addedBreak = true;
        }

        text += item.str;

        // hasEOL marca fin de línea; no duplicar si ya lo agregó el delta.
        if (item.hasEOL && !addedBreak && !text.endsWith("\n")) text += "\n";

        lastY = y;
        lastHeight = height;
      }

      pages.push(text);
      page.cleanup();
    }

    return { pages, pageCount: doc.numPages };
  } finally {
    await doc.destroy();
  }
}
