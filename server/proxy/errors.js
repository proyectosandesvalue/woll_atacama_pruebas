/**
 * Error de dominio del proxy de servicios externos.
 */
export class ProxyError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {{ status?: number, cause?: unknown }} [opts]
   */
  constructor(code, message, opts = {}) {
    super(message, opts);
    this.name = "ProxyError";
    this.code = code;
    this.status = opts.status ?? 502;
  }
}
