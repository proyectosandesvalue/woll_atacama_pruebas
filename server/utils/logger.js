/**
 * Logger con contexto para el backend.
 *
 * No depende de `js/` (CONTRACT §4.4: server/ no importa de js/).
 * API compatible con `js/utils/logger.js` (`createContextLogger`).
 *
 * Niveles:
 *   - debug: solo con `ORCHESTRATOR_DEBUG=1`.
 *   - log: solo con `ORCHESTRATOR_DEBUG=1`.
 *   - warn: siempre.
 *   - error: siempre.
 *
 * Uso:
 *   import { createContextLogger } from "../utils/logger.js";
 *   const log = createContextLogger("DomainClassifier");
 *   log.debug("Clasificación:", result);
 */

const DEBUG = /^(1|true|yes)$/i.test(process.env.ORCHESTRATOR_DEBUG || "");

const LEVELS = {
  DEBUG: "DEBUG",
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
};

/**
 * Logger central. No se usa directamente; se usa vía `createContextLogger`.
 */
export const logger = {
  debug(...args) {
    if (DEBUG) console.log(`[${LEVELS.DEBUG}]`, ...args);
  },
  log(...args) {
    if (DEBUG) console.log(`[${LEVELS.INFO}]`, ...args);
  },
  warn(...args) {
    console.warn(`[${LEVELS.WARN}]`, ...args);
  },
  error(...args) {
    console.error(`[${LEVELS.ERROR}]`, ...args);
  },
  withContext(context, level, ...args) {
    const fn = this[level.toLowerCase()] || this.log;
    fn(`[${context}]`, ...args);
  },
};

/**
 * Crea un logger con contexto predefinido.
 *
 * @param {string} context - Contexto del logger (ej: "DomainClassifier").
 * @returns {{debug: Function, log: Function, warn: Function, error: Function}}
 */
export function createContextLogger(context) {
  return {
    debug: (...args) => logger.withContext(context, LEVELS.DEBUG, ...args),
    log: (...args) => logger.withContext(context, LEVELS.INFO, ...args),
    warn: (...args) => logger.withContext(context, LEVELS.WARN, ...args),
    error: (...args) => logger.withContext(context, LEVELS.ERROR, ...args),
  };
}

export { LEVELS as LogLevel };