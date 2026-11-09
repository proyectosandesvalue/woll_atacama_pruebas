/**
 * Error de dominio del pipeline RAG.
 *
 * `code` es estable y se guarda en rag.ingestion_runs.error_code; el
 * mensaje se muestra en el reporte del CLI, nunca contenido de documentos.
 */
export class RagError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {{ cause?: unknown }} [opts]
   */
  constructor(code, message, opts = {}) {
    super(message, opts);
    this.name = "RagError";
    this.code = code;
  }
}
