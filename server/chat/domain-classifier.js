/**
 * Clasificador de dominio basado en LLM.
 *
 * Es la CAPA 2 del sistema de bloqueo de consultas fuera de dominio.
 * Recibe una pregunta y devuelve:
 *   - "IN"  → la pregunta es sobre el Visor Territorial de Atacama.
 *   - "OUT" → la pregunta está fuera del dominio.
 *
 * Diseño:
 *   - Usa el mismo proveedor LLM configurado (Groq).
 *   - maxTokens muy bajo (5) → la respuesta es solo "IN" o "OUT".
 *   - Cache en memoria por hash del texto (5 min) para evitar clasificar
 *     el mismo texto dos veces seguidas (defensa anti-spam).
 *   - Fail-open: si el clasificador falla o da una respuesta inesperada,
 *     se deja pasar la consulta al orquestador.
 *
 * Costo estimado: ~50 tokens y ~100ms por request.
 */

import { getLLM } from "../llm/provider.js";
import { createContextLogger } from "../../js/utils/logger.js";

const log = createContextLogger("DomainClassifier");

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_SIZE = 200;

/** @type {Map<string, {result: "IN"|"OUT", expires: number}>} */
const cache = new Map();

const CLASSIFIER_SYSTEM_PROMPT = `Eres un clasificador binario. Tu única tarea es decidir si la consulta del usuario pertenece al dominio del Visor Territorial de Atacama.

DOMINIO (responde IN):
- Geografía, comunas, provincias, regiones de Atacama (Chile).
- Capas del visor: agua, energía, minería, agricultura, clima, riesgos, suelo, planificación, áreas protegidas.
- Estadísticas y análisis de esas capas.
- Ubicaciones, coordenadas, elementos territoriales dentro de Atacama.
- Consultas sobre plantas desaladoras, derechos de agua, yacimientos, glaciares, etc., aunque usen palabras como "cuánto", "cuesta", "vale" — porque son del dominio.

FUERA DE DOMINIO (responde OUT):
- Generación de código, programación, scripts, funciones.
- Precios de productos de consumo (iPhone, autos, casas fuera de Atacama, suscripciones).
- Chistes, entretenimiento, temas personales.
- Noticias generales, política, deportes.
- Matemáticas puras, ciencia general.
- Cualquier tema no relacionado con Atacama o sus datos territoriales.

Responde SOLO con la palabra "IN" o "OUT". Nada más. Sin explicaciones.`;

/**
 * Genera una clave de cache a partir del texto.
 * Simple y suficiente: el texto completo, normalizado.
 */
function cacheKey(text) {
  return text.trim().toLowerCase().slice(0, 500);
}

function getFromCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

function setInCache(key, result) {
  if (cache.size >= CACHE_MAX_SIZE) {
    // Eliminar la entrada más antigua
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, { result, expires: Date.now() + CACHE_TTL_MS });
}

/**
 * Clasifica una consulta como IN (dominio) u OUT (fuera de dominio).
 *
 * Fail-open: si algo falla, devuelve "IN" (deja pasar al orquestador).
 *
 * @param {string} text
 * @returns {Promise<"IN"|"OUT">}
 */
export async function classifyDomain(text) {
  if (typeof text !== "string" || text.trim().length === 0) {
    return "IN"; // sin texto, no hay nada que filtrar
  }

  const key = cacheKey(text);
  const cached = getFromCache(key);
  if (cached) {
    log.debug(`Cache hit: ${cached}`);
    return cached;
  }

  try {
    const llm = await getLLM();
    const response = await llm.chat({
      system: CLASSIFIER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
      maxTokens: 5,
      temperature: 0,
    });

    const raw = (response.content || "").trim().toUpperCase();
    const result = raw.startsWith("OUT") ? "OUT" : "IN";

    log.debug(`Clasificación: ${raw} → ${result}`);
    setInCache(key, result);
    return result;
  } catch (err) {
    log.warn(`Clasificador falló (fail-open → IN): ${err?.message || err}`);
    return "IN";
  }
}

/**
 * Reset del cache. Solo para tests.
 */
export function _resetDomainClassifier() {
  cache.clear();
}

export const CLASSIFIER_CONFIG = {
  CACHE_TTL_MS,
  CACHE_MAX_SIZE,
};