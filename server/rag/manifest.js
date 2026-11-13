/**
 * Validación y utilidades del manifiesto RAG.
 *
 * Este módulo es puro (sin pdfjs) para que el API pueda validar metadatos y
 * manejar uploads sin cargar el extractor de PDFs. El worker sí importa el
 * pipeline completo.
 *
 * Sprint 45-A (docs/specs/45-panel-admin-operaciones/00-spec-madre.md).
 */

import { RagError } from "./errors.js";

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,80}$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida una entrada del manifiesto. Lanza RagError con un `code` estable.
 *
 * @param {any} entry
 */
export function validateEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new RagError("BAD_ENTRY", "Entrada de manifiesto inválida.");
  }

  if (!SLUG_RE.test(entry.slug || "")) {
    throw new RagError("BAD_SLUG", `slug inválido: ${entry.slug ?? "(vacío)"}`);
  }

  for (const field of ["file", "title", "source_url", "license"]) {
    if (typeof entry[field] !== "string" || !entry[field].trim()) {
      throw new RagError("MISSING_FIELD", `${entry.slug}: falta '${field}'.`);
    }
  }

  if (!/\.pdf$/i.test(entry.file)) {
    throw new RagError("BAD_FILE_TYPE", `${entry.slug}: el archivo debe ser .pdf.`);
  }

  if (!/^https:\/\//i.test(entry.source_url)) {
    throw new RagError("BAD_SOURCE_URL", `${entry.slug}: source_url debe usar https://.`);
  }

  if (entry.copyright_cleared !== true) {
    throw new RagError(
      "COPYRIGHT_NOT_CLEARED",
      `${entry.slug}: copyright_cleared debe ser true y estar respaldado por la licencia.`
    );
  }

  if (entry.published_at !== undefined && entry.published_at !== null) {
    if (typeof entry.published_at !== "string" || !DATE_RE.test(entry.published_at)) {
      throw new RagError("BAD_DATE", `${entry.slug}: published_at debe ser YYYY-MM-DD.`);
    }
  }

  if (entry.tags !== undefined) {
    if (!Array.isArray(entry.tags) || entry.tags.some((t) => typeof t !== "string")) {
      throw new RagError("BAD_TAGS", `${entry.slug}: tags debe ser un arreglo de strings.`);
    }
  }

  if (entry.language !== undefined && typeof entry.language !== "string") {
    throw new RagError("BAD_LANGUAGE", `${entry.slug}: language debe ser un string.`);
  }
}

/**
 * Normaliza una entrada para el manifiesto (sin campos ajenos).
 * @param {object} entry
 * @returns {object}
 */
export function normalizeEntry(entry) {
  return {
    file: entry.file,
    slug: entry.slug,
    title: entry.title,
    source_url: entry.source_url,
    publisher: entry.publisher || null,
    license: entry.license,
    language: entry.language || "es",
    published_at: entry.published_at || null,
    copyright_cleared: entry.copyright_cleared === true,
    tags: Array.isArray(entry.tags) ? entry.tags.filter(Boolean) : [],
  };
}
