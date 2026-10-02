/**
 * Extracción de metadatos de capas para el Chat IA
 *
 * Construye el inventario de capas del visor a partir de `allTemasConfig`
 * para que el asistente sepa qué datos territoriales tiene disponibles.
 *
 * Misma responsabilidad que `js/utils/metadataExtractor.js` del repositorio
 * origen (visor_woll_atacama), adaptado a la estructura local de configuración:
 *   { dimension: { capas: [...], grupos: {...}, estilo: { capa: { url, type } } } }
 *
 * @module utils/metadataExtractor
 */

import { getCapaConfig, obtenerTodasLasCapasDeDimension } from "./configUtils.js";

/**
 * Devuelve la lista plana de todas las capas cargables del visor.
 *
 * Cada entrada resuelve la configuración de estilo (`url`, `type`, alias,
 * campos de popup) necesaria para descargar y analizar la capa.
 * Las capas sin fuente local (WMS, servicios externos) se omiten.
 *
 * @param {Object} allTemasConfig - Configuración global de dimensiones
 * @returns {Array<Object>} Lista de configuraciones de capas
 *
 * @example
 * const capas = getAllLayerConfigs(allTemasConfig);
 * // [{ name: 'hidrografia', nombrePersonalizado: 'Red Hidrografica',
 * //    dimension: 'agua', url: 'hidrografia.geojson', type: 'line', ... }]
 */
export function getAllLayerConfigs(allTemasConfig) {
  const layerConfigs = [];
  const vistos = new Set();

  if (!allTemasConfig || typeof allTemasConfig !== "object") return layerConfigs;

  Object.entries(allTemasConfig).forEach(([temaKey, temaConfig]) => {
    if (!temaConfig) return;

    // Lista maestra de capas de la dimensión (fallback: capas agrupadas)
    const capas = Array.isArray(temaConfig.capas) && temaConfig.capas.length > 0
      ? temaConfig.capas
      : obtenerTodasLasCapasDeDimension(temaConfig);

    capas.forEach((capaNombre) => {
      if (!capaNombre || vistos.has(capaNombre)) return;

      const estilo = getCapaConfig(capaNombre, temaKey, allTemasConfig);
      if (!estilo || !estilo.url) return; // Sin fuente GeoJSON local → fuera del índice

      vistos.add(capaNombre);
      layerConfigs.push({
        name: capaNombre,
        nombrePersonalizado: estilo.nombrePersonalizado || capaNombre,
        dimension: temaKey,
        url: estilo.url,
        type: estilo.type || "polygon",
        atributo: estilo.atributo || null,
        popupCampos: Array.isArray(estilo.popupCampos) ? estilo.popupCampos : [],
        alias: estilo.alias || {},
      });
    });
  });

  return layerConfigs;
}

/**
 * Busca la configuración de una capa por su nombre (sin conocer la dimensión).
 *
 * @param {string} capaNombre - Identificador de la capa
 * @param {Object} allTemasConfig - Configuración global de dimensiones
 * @returns {Object|null} Configuración encontrada o null
 */
export function getLayerConfigByName(capaNombre, allTemasConfig) {
  if (!capaNombre || !allTemasConfig) return null;

  for (const [temaKey, temaConfig] of Object.entries(allTemasConfig)) {
    const capas = Array.isArray(temaConfig?.capas) ? temaConfig.capas : [];
    if (capas.includes(capaNombre)) {
      const estilo = getCapaConfig(capaNombre, temaKey, allTemasConfig);
      if (estilo && estilo.url) {
        return {
          name: capaNombre,
          nombrePersonalizado: estilo.nombrePersonalizado || capaNombre,
          dimension: temaKey,
          url: estilo.url,
          type: estilo.type || "polygon",
        };
      }
    }
  }

  return null;
}

/**
 * Lista de dimensiones disponibles en la configuración.
 *
 * @param {Object} allTemasConfig - Configuración global de dimensiones
 * @returns {string[]} Claves de dimensión (agua, mineria, ...)
 */
export function getDimensionKeys(allTemasConfig) {
  return Object.keys(allTemasConfig || {});
}
