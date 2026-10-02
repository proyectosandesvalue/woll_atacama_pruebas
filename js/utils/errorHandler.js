/**
 * Manejo centralizado de errores
 * @module utils/errorHandler
 */

import { logger } from './logger.js';


/**
 * Error al cargar una capa
 */
export class LayerLoadError extends Error {
    /**
     * @param {string} layerName - Nombre de la capa
     * @param {Error} originalError - Error original
     */
    constructor(layerName, originalError) {
        super(`Error cargando capa: ${layerName}`);
        this.name = 'LayerLoadError';
        this.layerName = layerName;
        this.originalError = originalError;
    }
}

/**
 * Error de configuración
 */
export class ConfigError extends Error {
    /**
     * @param {string} message - Mensaje de error
     * @param {string} configKey - Clave de configuración problemática
     */
    constructor(message, configKey) {
        super(message);
        this.name = 'ConfigError';
        this.configKey = configKey;
    }
}

/**
 * Error de red
 */
export class NetworkError extends Error {
    /**
     * @param {string} url - URL que falló
     * @param {Error} originalError - Error original
     */
    constructor(url, originalError) {
        super(`Error de red al acceder a: ${url}`);
        this.name = 'NetworkError';
        this.url = url;
        this.originalError = originalError;
    }
}

/**
 * Maneja un error de manera centralizada
 * @param {Error} error - Error a manejar
 * @param {string} context - Contexto donde ocurrió el error
 * @param {boolean} [showToUser=false] - Si se debe mostrar al usuario
 */
export function handleError(error, context, showToUser = false) {
    // Log del error
    logger.error(`[${context}]`, error.message);

    if (error.originalError) {
        logger.error('Error original:', error.originalError);
    }

    // Mostrar al usuario si es necesario
    if (showToUser) {
        showErrorNotification(error, context);
    }
}

/**
 * Muestra una notificación de error al usuario
 * @param {Error} error - Error a mostrar
 * @param {string} context - Contexto del error
 */
function showErrorNotification(error, context) {
    // Aquí podrías integrar con un sistema de notificaciones
    // Por ahora, solo mostramos en consola
    console.error(`[${context}] ${error.message}`);


    // Ejemplo: toast, modal, banner, etc.
}

/**
 * Wrapper para funciones async que maneja errores automáticamente
 * @param {Function} fn - Función async a ejecutar
 * @param {string} context - Contexto de la operación
 * @returns {Function} Función wrapped
 * 
 * @example
 * const safeLoadLayer = withErrorHandling(
 *   async (name) => await loadLayer(name),
 *   'LayerLoading'
 * );
 */
export function withErrorHandling(fn, context) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            handleError(error, context, true);
            throw error;
        }
    };
}

/**
 * Valida que un objeto tenga las propiedades requeridas
 * @param {Object} obj - Objeto a validar
 * @param {string[]} requiredProps - Propiedades requeridas
 * @param {string} objectName - Nombre del objeto (para mensajes de error)
 * @throws {ConfigError} Si falta alguna propiedad
 */
export function validateRequiredProps(obj, requiredProps, objectName) {
    const missing = requiredProps.filter(prop => !(prop in obj));

    if (missing.length > 0) {
        throw new ConfigError(
            `${objectName} requiere las propiedades: ${missing.join(', ')}`,
            objectName
        );
    }
}
