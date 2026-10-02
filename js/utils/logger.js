/**
 * Sistema de logging centralizado
 * @module utils/logger
 */

import { LOG_CONFIG } from "../config/constants.js";

/**
 * Determina si estamos en modo debug
 * En producción, solo se mostrarán warnings y errors
 */
const DEBUG = LOG_CONFIG.ENABLE_DEBUG;

/**
 * Niveles de log
 * @enum {string}
 */
export const LogLevel = {
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
};


// Logger centralizado
export const logger = {
    /**
     * Log de debug (solo en modo desarrollo)
     * @param {...any} args - Argumentos a loggear
     */
    debug(...args) {
        if (DEBUG) {
            console.log(`[${LogLevel.DEBUG}]`, ...args);
        }
    },

    /**
     * Log informativo (solo en modo desarrollo)
     * @param {...any} args - Argumentos a loggear
     */
    log(...args) {
        if (DEBUG) {
            console.log(`[${LogLevel.INFO}]`, ...args);
        }
    },

    /**
     * Warning (siempre se muestra)
     * @param {...any} args - Argumentos a loggear
     */
    warn(...args) {
        console.warn(`[${LogLevel.WARN}]`, ...args);
    },

    /**
     * Error (siempre se muestra)
     * @param {...any} args - Argumentos a loggear
     */
    error(...args) {
        console.error(`[${LogLevel.ERROR}]`, ...args);
    },

    /**
     * Log con contexto específico
     * @param {string} context - Contexto del log (ej: 'LayerUtils', 'SidebarUtils')
     * @param {string} level - Nivel de log
     * @param {...any} args - Argumentos a loggear
     */
    withContext(context, level, ...args) {
        const logFn = this[level.toLowerCase()] || this.log;
        logFn(`[${context}]`, ...args);
    },
};

/**
 * Crea un logger con contexto predefinido
 * @param {string} context - Contexto del logger
 * @returns {Object} Logger con contexto
 * 
 * @example
 * const log = createContextLogger('LayerUtils');
 * log.debug('Cargando capa:', capaNombre);
 * log.error('Error al cargar:', error);
 */
export function createContextLogger(context) {
    return {
        debug: (...args) => logger.withContext(context, LogLevel.DEBUG, ...args),
        log: (...args) => logger.withContext(context, LogLevel.INFO, ...args),
        warn: (...args) => logger.withContext(context, LogLevel.WARN, ...args),
        error: (...args) => logger.withContext(context, LogLevel.ERROR, ...args),
    };
}
