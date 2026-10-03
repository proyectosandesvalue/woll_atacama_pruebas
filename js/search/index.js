import { appState, isLayerLoaded } from "../store/appState.js";
import { logger } from "../utils/logger.js";
import allTemasConfig from "../config/allTemasConfig.js";
import { fetchLayerData } from "../utils/layerUtils.js";

export const CONFIG = {
    MAX_VISIBLE_RESULTS: 20,
    MAX_MARKERS_ON_MAP: 50,
    DEBOUNCE_DELAY: 300,
    CACHE_SIZE: 20,
    BACKGROUND_BATCH_SIZE: 2,
    BACKGROUND_DELAY: 200,
    PRIORITY_LAYERS: [
        'hidrografia', 'derechos_agua_2025', 'cuencas_dga', 'glaciares',
        'yacimientos_mineros', 'relaves', 'distritos_mineros',
        'energia_linea_transmision', 'subestaciones',
        'agricultura_regiones', 'uso_suelo'
    ]
};

export let searchIndex = [];
export let indexedLayers = new Set();
let isIndexing = false;
const searchCache = new Map();
const configCache = new Map();
const themeCache = new Map();
let _indexAbortController = null;

export let searchFilters = {
    capaTipo: 'todos',
    soloVisibles: false
};

const normalizeText = (text) =>
  String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`´]/g, "'")   // comillas tipográficas → simple
    .replace(/[“”]/g, '"')     // comillas dobles tipográficas
    .replace(/[–—]/g, "-")     // guiones largos → guion simple
    .replace(/\s+/g, " ")
    .trim();

const tiposMap = {
    'agua_glaciares': 'agua', 'agua_laguna_embalses_tranques': 'agua', 'agua_derechos_agua': 'agua', 'agua_red_hidrografica': 'agua',
    'energia_linea_transmision': 'energia', 'energia_plantas_eolicas': 'energia', 'energia_plantas_solares': 'energia',
    'energia_hidroelectricas': 'energia', 'energia_termoelectricas': 'energia', 'energia_bioenergia': 'energia',
    'energia_almacenamiento_combustibles': 'energia', 'energia_oleoducto': 'energia', 'energia_potencial_fotovoltaico': 'energia',
    'energia_potencial_geotermico': 'energia', 'energia_potencial_hidrobombeo': 'energia', 'energia_potencial_eolico': 'energia',
    'energia_potencial_hidroelectrico': 'energia', 'energia_subestaciones': 'energia',
    'mineria_gran_mineria': 'mineria', 'mineria_instalaciones_mineras': 'mineria', 'mineria_yacimientos': 'mineria',
    'mineria_relaves_mineros': 'mineria', 'mineria_distritos_mineros': 'mineria',
    'agricultura_plantas_embalaje': 'suelo', 'agricultura_camaras_frio': 'suelo', 'agricultura_variedad_fruticolas1': 'suelo',
    'agricultura_variedad_fruticolas2': 'suelo', 'agricultura_especies_fruticolas': 'suelo', 'agricultura_agroindustrias': 'suelo',
    'empresas_energias_renovables': 'gestion', 'empresas_electromovilidad': 'gestion', 'empresas_data_centers': 'gestion',
    'empresas_agroindustria_avanzada': 'gestion', 'empresas_seguridad_alimentaria': 'gestion', 'empresas_mineria_bajo_impacto': 'gestion',
    'empresas_economia_circular': 'gestion', 'empresas_experiencias_turisticas': 'gestion', 'empresas_inversion_inmobiliaria': 'gestion',
    'turismo_infraestructura': 'planificacion', 'turismo_zoit': 'planificacion', 'turismo_rutas_patrimoniales': 'planificacion',
    'turismo_atractivos_turisticos': 'planificacion', 'turismo_snaspe': 'conservacion', 'turismo_monumentos_nacionales': 'conservacion',
    'inversion_agropecuario': 'planificacion', 'inversion_energia': 'planificacion', 'inversion_equipamiento': 'planificacion',
    'inversion_hidraulica': 'planificacion', 'inversion_inmobiliarios': 'planificacion', 'inversion_fabriles': 'planificacion',
    'inversion_mineria': 'planificacion', 'inversion_otros': 'planificacion', 'inversion_planificacion': 'planificacion',
    'inversion_saneamiento': 'planificacion', 'limite_comunal_linea': 'territorio', 'toponimia': 'territorio'
};
const capaTipoCache = new Map();

function getCacheKey(query, filters) {
    return `${query.toLowerCase()}_${filters.capaTipo}_${filters.soloVisibles}`;
}

function getCachedResults(query) {
    const key = getCacheKey(query, searchFilters);
    if (searchCache.has(key)) {
        // Mover al final para implementar verdadero LRU
        const value = searchCache.get(key);
        searchCache.delete(key);
        searchCache.set(key, value);
    }
    return searchCache.get(key);
}

function setCachedResults(query, results) {
    const key = getCacheKey(query, searchFilters);
    // Reinsertar al final = marcarlo como el más recientemente usado
    if (searchCache.has(key)) {
        searchCache.delete(key);
    } else if (searchCache.size >= CONFIG.CACHE_SIZE) {
        // Eliminar la entrada más antigua (LRU real: primera clave insertada)
        const firstKey = searchCache.keys().next().value;
        searchCache.delete(firstKey);
    }
    searchCache.set(key, results);
}

export function clearSearchCache() {
    searchCache.clear();
    logger.debug('[SearchControl] Caché de búsqueda limpiado');
}

export function getCapaConfig(capaName, temaName) {
    if (!capaName) return null;
    const cacheKey = temaName ? `${temaName}:${capaName}` : capaName;
    if (configCache.has(cacheKey)) {
        return configCache.get(cacheKey);
    }
    let result = null;
    if (temaName && allTemasConfig[temaName]?.estilo?.[capaName]) {
        result = allTemasConfig[temaName].estilo[capaName];
    }
    if (!result) {
        for (const key of Object.keys(allTemasConfig)) {
            if (allTemasConfig[key]?.estilo?.[capaName]) {
                result = allTemasConfig[key].estilo[capaName];
                break;
            }
        }
    }
    configCache.set(cacheKey, result);
    return result;
}

export function getLayerTheme(capaName) {
    if (themeCache.has(capaName)) {
        return themeCache.get(capaName);
    }
    let result = null;
    for (const [temaKey, temaConfig] of Object.entries(allTemasConfig)) {
        if (temaConfig.estilo && temaConfig.estilo[capaName]) {
            result = temaKey;
            break;
        }
    }
    themeCache.set(capaName, result);
    return result;
}

export function getCapaTipo(capaName) {
    if (!capaName) return 'otros';
    if (capaTipoCache.has(capaName)) {
        return capaTipoCache.get(capaName);
    }
    const capaLower = capaName.toLowerCase();
    for (const [key, value] of Object.entries(tiposMap)) {
        if (capaLower.includes(key)) {
            capaTipoCache.set(capaName, value);
            return value;
        }
    }
    capaTipoCache.set(capaName, 'otros');
    return 'otros';
}

export function buildSearchableFields(props, capaConfig) {
    const searchableFields = {};
    if (capaConfig?.alias) {
        for (const [key, aliasValue] of Object.entries(capaConfig.alias)) {
            const propValue = props[key];
            if (propValue != null && propValue !== '') {
                searchableFields[key] = String(propValue);
                searchableFields[`alias_${key}`] = aliasValue;
                searchableFields[`aliasValue_${key}`] = String(propValue);
            }
        }
    }
    const camposComunes = ['NOMBRE', 'nombre', 'Name', 'name', 'NOM_COMUNA', 'nom_comuna', 'TIPO', 'tipo', 'Type', 'type', 'TIPO_PLANTA', 'COMUNA', 'comuna', 'REGION', 'region', 'NOM_REGION', 'PROVINCIA', 'provincia', 'NOM_PROVIN', 'CUENCA', 'cuenca', 'NOM_CUEN', 'nom_cuen', 'SUBCUENCA', 'subcuenca', 'nom_subc', 'ESTADO', 'estado', 'Estado'];
    for (const campo of camposComunes) {
        const value = props[campo];
        if (value != null && value !== '') {
            searchableFields[campo] = String(value);
        }
    }
    return searchableFields;
}

export async function buildSearchIndex() {
  if (isIndexing) return;
  isIndexing = true;
  logger.log("[SearchControl] Iniciando construcción de índice optimizado");

  // Cancelar fetches previos si los hubiera.
  if (_indexAbortController) {
    _indexAbortController.abort();
  }
  _indexAbortController = new AbortController();

  searchIndex = [];
  indexedLayers.clear();
  searchCache.clear();
  configCache.clear();
  themeCache.clear();
  capaTipoCache.clear();

  try {
    indexAllLayersMetadata();
    indexLoadedLayers();
    await indexPriorityLayersBackground(_indexAbortController.signal);
  } finally {
    isIndexing = false;
  }
}


function indexAllLayersMetadata() {
    const metadataIds = new Set();
    for (const [temaKey, temaConfig] of Object.entries(allTemasConfig)) {
        if (!temaConfig.estilo) continue;
        for (const [capaName, config] of Object.entries(temaConfig.estilo)) {
            const nombrePersonalizado = config.nombrePersonalizado || capaName;
            const metadataId = `meta_${capaName}`;
            if (metadataIds.has(metadataId)) continue;
            metadataIds.add(metadataId);
            searchIndex.push({
                id: metadataId,
                isMetadata: true,
                layer: null,
                capaName: capaName,
                capaConfig: config,
                nombreCapa: nombrePersonalizado,
                displayName: `📂 Capa: ${nombrePersonalizado}`,
                searchText: `${nombrePersonalizado} ${capaName}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
                tipoCategoria: getCapaTipo(capaName),
                tema: temaKey,
                isVisible: false,
                searchableFields: {}
            });
        }
    }
    logger.log(`[SearchControl] Metadata indexada: ${searchIndex.length} capas`);
}

function indexLoadedLayers() {
    if (!appState.map) return;
    let featuresIndexed = 0;
    appState.map.eachLayer((layer) => {
        if (layer.feature && layer.feature.properties) {
            const capaName = layer.options?.layerName || layer.options?.capaName;
            if (!capaName) return;
            addToIndex(layer.feature, capaName, layer);
            featuresIndexed++;
        }
    });
    logger.log(`[SearchControl] Features indexados de capas cargadas: ${featuresIndexed}`);
}

async function indexPriorityLayersBackground(signal) {
  logger.log("[SearchControl] Iniciando indexación prioritaria en background");
  const capasAIndexar = [];

  for (const [temaKey, temaConfig] of Object.entries(allTemasConfig)) {
    if (!temaConfig.estilo) continue;
    for (const [capaName, config] of Object.entries(temaConfig.estilo)) {
      if (
        CONFIG.PRIORITY_LAYERS.includes(capaName) &&
        !isLayerLoaded(capaName) &&
        !capaName.startsWith("wms_") &&
        !indexedLayers.has(capaName)
      ) {
        capasAIndexar.push({ capaName, temaKey, config });
      }
    }
  }

  logger.log(`[SearchControl] ${capasAIndexar.length} capas prioritarias para indexar`);

  for (let i = 0; i < capasAIndexar.length; i += CONFIG.BACKGROUND_BATCH_SIZE) {
    if (signal?.aborted) {
      logger.debug("[SearchControl] Indexación cancelada");
      return;
    }
    const lote = capasAIndexar.slice(i, i + CONFIG.BACKGROUND_BATCH_SIZE);
    for (const item of lote) {
      try {
        if (signal?.aborted) return;
        if (isLayerLoaded(item.capaName) || indexedLayers.has(item.capaName)) continue;
        const data = await fetchLayerData(item.capaName, item.config);
        if (data?.features) {
          data.features.forEach((feature) => {
            addToIndex(feature, item.capaName, null, item.temaKey);
          });
          indexedLayers.add(item.capaName);
        }
      } catch (err) {
        if (err?.name === "AbortError") return;
        /* resto de errores: ignorar y continuar */
      }
    }
    await new Promise((resolve) => {
      if (window.requestIdleCallback) {
        window.requestIdleCallback(resolve, { timeout: 2000 });
      } else {
        setTimeout(resolve, CONFIG.BACKGROUND_DELAY);
      }
    });
  }
  logger.log(`[SearchControl] Indexación prioritaria completada. Total: ${searchIndex.length}`);
}

export function addToIndex(feature, capaName, layerInstance = null, temaKey = null) {
    const props = feature.properties;
    if (!props) return;
    const temaActual = temaKey || getLayerTheme(capaName);
    const capaConfig = getCapaConfig(capaName, temaActual);
    const nombreCapa = capaConfig?.nombrePersonalizado || capaName;
    const capaTipo = getCapaTipo(capaName);
    const searchableFields = buildSearchableFields(props, capaConfig);
    searchableFields['_nombreCapa'] = nombreCapa;
    const searchText = Object.values(searchableFields).filter(Boolean).join(' ').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!searchText.trim()) return;
    let center = null;
    let bounds = null;
    if (layerInstance?.getBounds) {
        bounds = layerInstance.getBounds();
        center = bounds.getCenter();
    } else if (feature.geometry) {
        try {
            if (window.turf) {
                const bbox = window.turf.bbox(feature);
                bounds = L.latLngBounds([bbox[1], bbox[0]], [bbox[3], bbox[2]]);
                center = bounds.getCenter();
            }
        } catch (e) { /* ignore */ }
    }
    let displayName = nombreCapa;
    const nombreFields = ['NOMBRE', 'nombre', 'Name', 'name', 'NOM_COMUNA', 'Nombre', 'sector', 'Sector'];
    for (const field of nombreFields) {
        if (props[field]) {
            displayName = `${props[field]} <small>(${nombreCapa})</small>`;
            break;
        }
    }
    searchIndex.push({
        layer: layerInstance,
        feature: feature,
        properties: props,
        searchText: searchText,
        searchableFields: searchableFields,
        displayName: displayName,
        nombreCapa: nombreCapa,
        capaName: capaName,
        tema: temaActual,
        tipoCategoria: capaTipo,
        center: center,
        bounds: bounds,
        isVisible: !!layerInstance,
        capaConfig: capaConfig
    });
}

export async function ensureLayerIndexed(capaName) {
    if (indexedLayers.has(capaName) || isLayerLoaded(capaName)) {
        return;
    }
    const temaKey = getLayerTheme(capaName);
    const config = getCapaConfig(capaName, temaKey);
    if (!config) return;
    try {
        const data = await fetchLayerData(capaName, config);
        if (data?.features) {
            data.features.forEach(feature => {
                addToIndex(feature, capaName, null, temaKey);
            });
            indexedLayers.add(capaName);
        }
    } catch (err) {
        logger.warn(`[SearchControl] Error indexing layer ${capaName}:`, err);
    }
}

function parseQuery(query) {
    const operators = { tipo: null, capa: null, comuna: null, region: null, provincia: null, cuenca: null };
    const operatorRegex = /(\w+):"([^"]+)"|(\w+):(\S+)/g;
    let match;
    let processedQuery = query.toLowerCase();
    while ((match = operatorRegex.exec(query)) !== null) {
        const key = (match[1] || match[3]).toLowerCase();
        let value = (match[2] || match[4]).toLowerCase();
        if (value.startsWith('"')) value = value.slice(1);
        if (value.endsWith('"')) value = value.slice(0, -1);
        if (Object.hasOwn(operators, key)) {
            operators[key] = value;
        }
        processedQuery = processedQuery.replace(match[0], '').trim();
    }
    operators.textoCompleto = processedQuery.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    return operators;
}

export async function search(query) {
    if (!query || query.length < 2) return [];
    const cached = getCachedResults(query);
    if (cached) {
        logger.debug('[SearchControl] Resultado desde caché');
        return cached;
    }
    const ops = parseQuery(query);
    let results = searchIndex;
    if (searchFilters.capaTipo !== 'todos') {
        results = results.filter(item => item.tipoCategoria === searchFilters.capaTipo);
    }
    if (searchFilters.soloVisibles) {
        results = results.filter(item => isLayerLoaded(item.capaName));
    }
    if (ops.capa) {
        const capaQuery = normalizeText(ops.capa);
        results = results.filter(item => {
            const nombrePersonalizado = normalizeText(item.nombreCapa);
            const nombreInterno = item.capaName.toLowerCase();
            return nombrePersonalizado.includes(capaQuery) || nombreInterno.includes(capaQuery);
        });
        const queryLower = normalizeText(ops.capa);
        const unmatchedMeta = searchIndex.filter(item =>
            item.isMetadata &&
            !results.some(r => r.id === item.id) &&
            (normalizeText(item.nombreCapa).includes(queryLower) || item.capaName.toLowerCase().includes(queryLower))
        );
        if (unmatchedMeta.length > 0) {
            const capasAIndexar = unmatchedMeta.map(m => m.capaName);
            logger.log(`[SearchControl] Indexando ${capasAIndexar.length} capas bajo demanda`);
            await Promise.all(capasAIndexar.map(capaName => ensureLayerIndexed(capaName)));
            results = searchIndex;
            if (searchFilters.capaTipo !== 'todos') {
                results = results.filter(item => item.tipoCategoria === searchFilters.capaTipo);
            }
            if (searchFilters.soloVisibles) {
                results = results.filter(item => isLayerLoaded(item.capaName));
            }
        }
    }
    const commonFields = ['tipo', 'comuna', 'region', 'provincia', 'rut'];
    for (const field of commonFields) {
        if (ops[field]) {
            results = results.filter(item => {
                const val = normalizeText(item.searchableFields[field.toUpperCase()] || item.searchableFields[field] || '');
                return val.includes(normalizeText(ops[field]));
            });
        }
    }
    if (ops.textoCompleto) {
        const normalizedQuery = normalizeText(ops.textoCompleto);
        results = results.filter(item => item.searchText.includes(normalizedQuery));
    }
    results.sort((a, b) => {
        if (a.isMetadata && !b.isMetadata) return -1;
        if (!a.isMetadata && b.isMetadata) return 1;
        if (isLayerLoaded(a.capaName) && !isLayerLoaded(b.capaName)) return -1;
        if (!isLayerLoaded(a.capaName) && isLayerLoaded(b.capaName)) return 1;
        return 0;
    });
    const limitedResults = results.slice(0, 50);
    setCachedResults(query, limitedResults);
    return limitedResults;
}
