/**
 * Constructor de PDFs mínimos para tests. Genera un PDF válido de una o
 * varias páginas con texto en Helvetica (WinAnsi), sin dependencias
 * externas. Parte el texto en líneas para que pdfjs no lo recorte al
 * salir del ancho de página.
 */

function escapePdfText(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrap(text, width = 80) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    if (current && current.length + 1 + word.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function contentStream(text) {
  const lines = wrap(text);
  const body = lines
    .map((line, index) => `${index === 0 ? "" : "0 -14 Td "}(${escapePdfText(line)}) Tj`)
    .join("\n");

  return `BT /F1 12 Tf 72 720 Td\n${body}\nET`;
}

/**
 * @param {string[]|string} pages texto por página (o una sola página)
 * @returns {Buffer}
 */
export function buildPdf(pages) {
  const pageTexts = Array.isArray(pages) ? pages : [pages];
  const count = pageTexts.length;

  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";

  const kids = [];
  for (let i = 0; i < count; i++) kids.push(`${4 + i * 2} 0 R`);
  objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${count} >>`;
  objects[3] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

  for (let i = 0; i < count; i++) {
    const pageId = 4 + i * 2;
    const contentId = pageId + 1;
    const text = pageTexts[i] ?? "";
    const stream = text ? contentStream(text) : "";

    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;

    objects[contentId] =
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\n` +
      `stream\n${stream}\nendstream`;
  }

  let out = "%PDF-1.4\n";
  const offsets = [0];

  for (let i = 1; i < objects.length; i++) {
    offsets[i] = Buffer.byteLength(out, "latin1");
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) {
    out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(out, "latin1");
}
