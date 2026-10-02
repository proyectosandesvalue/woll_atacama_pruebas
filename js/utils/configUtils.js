/**
 * Utilidades para manejo de configuración de temas y capas
 * @module utils/configUtils
 */

/**
 * Obtiene las capas que deben cargarse inicialmente según la configuración del tema.
 * Soporta: grupos, capas individuales, o ambos combinados.
 *
 * @param {Object} temaConfig - Configuración del tema
 * @returns {string[]} Array con nombres de capas a cargar inicialmente
 */
export function obtenerCapasParaCargaInicial(temaConfig) {
  const cargaInicial = temaConfig.cargaInicial || {};
  const capasFinales = new Set();

  // 1. PROCESAR GRUPOS
  if (
    cargaInicial.grupos &&
    cargaInicial.grupos.length > 0 &&
    temaConfig.grupos
  ) {
    cargaInicial.grupos.forEach((grupoKey) => {
      if (temaConfig.grupos[grupoKey]) {
        const capasDelGrupo = temaConfig.grupos[grupoKey].capas || [];
        capasDelGrupo.forEach((capa) => capasFinales.add(capa));
      } else {
        console.warn(
          `[configUtils] El grupo "${grupoKey}" configurado en cargaInicial no existe en los grupos del tema.`
        );
      }
    });
  }

  // 2. PROCESAR CAPAS INDIVIDUALES
  if (cargaInicial.capas && cargaInicial.capas.length > 0) {
    cargaInicial.capas.forEach((capa) => capasFinales.add(capa));
  }

  // 3. SI NO HAY CONFIGURACIÓN, CARGAR TODAS
  if (capasFinales.size === 0) {
    if (temaConfig.grupos && Object.keys(temaConfig.grupos).length > 0) {
      Object.values(temaConfig.grupos).forEach((grupo) => {
        (grupo.capas || []).forEach((capa) => capasFinales.add(capa));
      });
    } else {
      (temaConfig.capas || []).forEach((capa) => capasFinales.add(capa));
    }
  }

  return Array.from(capasFinales).filter((capa) => capa);
}

/**
 * Obtiene todas las capas de una dimensión (incluyendo las agrupadas)
 *
 * @param {Object} temaConfig - Configuración del tema
 * @returns {string[]} Array con nombres de todas las capas
 */
export function obtenerTodasLasCapasDeDimension(temaConfig) {
  if (temaConfig.grupos && Object.keys(temaConfig.grupos).length > 0) {
    const capas = [];
    Object.values(temaConfig.grupos).forEach((grupo) => {
      capas.push(...grupo.capas);
    });
    return capas;
  }
  return temaConfig.capas || [];
}

/**
 * Encuentra el tema al que pertenece una capa
 *
 * @param {string} capaNombre - Nombre de la capa
 * @param {Object} temasConfig - Configuración global de temas
 * @returns {string|null} Clave del tema o null si no se encuentra
 */
export function encontrarTemaParaCapa(capaNombre, temasConfig) {
  if (!temasConfig || typeof temasConfig !== "object") return null;

  for (const temaKey of Object.keys(temasConfig)) {
    const tema = temasConfig[temaKey];
    if (tema && Array.isArray(tema.capas) && tema.capas.includes(capaNombre)) {
      return temaKey;
    }
  }
  return null;
}

/**
 * Obtiene el nombre personalizado de una capa
 *
 * @param {string} capaNombre - Nombre de la capa
 * @param {string} temaActivo - Tema activo
 * @param {Object} temasConfig - Configuración de temas
 * @returns {string} Nombre personalizado o nombre original
 */
export function obtenerNombrePersonalizado(capaNombre, temaActivo, temasConfig) {
  if (temasConfig[temaActivo]?.estilo?.[capaNombre]?.nombrePersonalizado) {
    return temasConfig[temaActivo].estilo[capaNombre].nombrePersonalizado;
  }

  for (const tema in temasConfig) {
    if (temasConfig[tema]?.estilo?.[capaNombre]?.nombrePersonalizado) {
      return temasConfig[tema].estilo[capaNombre].nombrePersonalizado;
    }
  }

  return capaNombre;
}

/**
 * Obtiene la configuración de estilo de una capa dado su nombre y el tema.
 *
 * Importante: las capas WMS declaran `tipo: 'wms'` + `servicio: 'x'` en
 * lugar de `url`. Este helper devuelve la config tal cual; es
 * `layerUtils.cargarCapaIndividual` quien decide cómo renderizarla.
 *
 * @param {string} capaNombre
 * @param {string} temaKey
 * @param {Object} temasConfig
 * @returns {Object|null} Configuración de estilo o null
 */
export function getCapaConfig(capaNombre, temaKey, temasConfig) {
  const configTema = temasConfig[temaKey];
  if (!configTema) return null;

  if (configTema.estilo && configTema.estilo[capaNombre]) {
    return configTema.estilo[capaNombre];
  }

  if (configTema.grupos) {
    // Los grupos actualmente no definen estilo propio, pero se reserva
    // este camino para extensibilidad futura (grupos con estilos independientes).
    for (const grupo of Object.values(configTema.grupos)) {
      if (grupo.estilo && grupo.estilo[capaNombre]) {
        return grupo.estilo[capaNombre];
      }
    }
  }

  return null;
}

/**
 * Comprueba si una capa es WMS (tipo 'wms').
 * @param {object} configCapa
 * @returns {boolean}
 */
export function isCapaWMS(configCapa) {
  return (
    configCapa?.tipo === "wms" ||
    configCapa?.type === "wms" ||
    (configCapa?.servicio && !configCapa?.url)
  );
}