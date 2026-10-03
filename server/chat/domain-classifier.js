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

// ═══════════════════════════════════════════════════════════════
// AQUÍ VA EL PROMPT NUEVO (Fix B)
// ═══════════════════════════════════════════════════════════════
const CLASSIFIER_SYSTEM_PROMPT = `Eres un clasificador binario. Tu ÚNICA tarea es decidir si la consulta del usuario es ESPECÍFICAMENTE sobre el Visor Territorial de Atacama (Región de Atacama, Chile) o sobre sus datos geoespaciales.

CRITERIO DE DOMINIO: una consulta es del dominio si y solo si:
  1. El TEMA es del visor (agua, clima, energía, minería, agricultura, riesgos, suelo, planificación, etc.), Y
  2. El TERRITORIO es la Región de Atacama (Chile): sus comunas (Copiapó, Vallenar, Diego de Almagro, Tierra Amarilla, Alto del Carmen, Huasco, Freirina, Chañaral, Caldera) o la región en general.

DOMINIO — responde "IN":
- Capas y datos del visor: agua, energía, minería, agricultura, clima (de Atacama), riesgos, suelo, planificación territorial, áreas protegidas, hidrografía.
- Comunas de Atacama: Copiapó, Vallenar, Diego de Almagro, Tierra Amarilla, Alto del Carmen, Huasco, Freirina, Chañaral, Caldera.
- Elementos territoriales EN Atacama: plantas desaladoras, derechos de agua, yacimientos, glaciares, humedales, salares, cuencas, embalses, plantas solares, líneas de transmisión, relaves.
- Estadísticas y análisis de esas capas.

FUERA DE DOMINIO — responde "OUT" (CUALQUIER otra cosa):
- Tema del visor pero territorio NO Atacama (ej: "clima en Valdivia", "población de Santiago", "glaciares de Argentina").
- Hora, fecha, día actual ("qué día es hoy", "qué hora es").
- Geografía general del mundo que NO sea Atacama.
- Programación, código, scripts, funciones.
- Precios de productos.
- Chistes, entretenimiento, consejos personales.
- Noticias, política, deportes, matemáticas generales.
- Conversación casual ("cómo estás", "quién eres", "qué puedes hacer").

REGLA CRÍTICA: si dudás, responde "OUT".

EJEMPLOS:
- "¿cuántas lagunas hay por comuna?" → IN
- "¿cómo estará el clima mañana en Copiapó?" → IN
- "¿cómo estará el clima mañana en Valdivia?" → OUT
- "¿cuántos glaciares hay en Argentina?" → OUT
- "que dia es hoy" → OUT
- "qué hora es en China" → OUT
- "cómo estás" → OUT
- "quién eres" → OUT
- "qué puedes hacer" → OUT
- "cuánto cuesta un iPhone" → OUT
- "muéstrame los glaciares de Atacama" → IN
- "clima en Italia" → OUT
- "dónde queda París" → OUT
- "¿cuál es la población de Copiapó?" → IN
- "¿cuál es la población de Santiago?" → OUT

Responde SOLO con "IN" o "OUT". Nada más.`;
// ═══════════════════════════════════════════════════════════════
// FIN DEL PROMPT NUEVO
// ═══════════════════════════════════════════════════════════════

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
export async function classifyDomain(text, sessionId = null) {
  if (typeof text !== "string" || text.trim().length === 0) {
    return "IN";
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
      sessionId,
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