/**
 * Error HTTP con status y mensaje público.
 */
export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   * @param {{cause?: unknown}} [opts]
   */
  constructor(status, message, opts = {}) {
    super(message, opts);
    this.name = "HttpError";
    this.status = status;
  }
}
