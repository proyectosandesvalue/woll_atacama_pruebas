/**
 * Clasificador de dominio y extracción de intent/slots.
 *
 * Es la CAPA 2 del sistema de bloqueo. Recibe una pregunta y devuelve:
 *   - domain: "IN" | "OUT"
 *   - intent: "dato_simple" | "analisis_receta" | "contexto_documental" | "fuera_de_alcance"
 *   - pipeline: id del pipeline o null
 *   - slots: { layer_id?, filters?, group_by?, color_by?, ... }
 *   - confidence: número entre 0 y 1
 *
 * Si el LLM devuelve algo inválido o no se puede parsear, devuelve
 * confidence: 0 y domain: "IN" (fail-open). El router degrada al ciclo
 * actual de tools.
 *
 * Cache en memoria por texto (5 min) para evitar clasificar dos veces.
 */

import { getLLM } from "../llm/provider.js";
import { createContextLogger } from "../../js/utils/logger.js";

const log = createContextLogger("DomainClassifier");

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_SIZE = 200;

/** @type {Map<string, {result: object, expires: number}>} */
const cache = new Map();

const CLASSIFIER_SYSTEM_PROMPT = `Eres un clasificador de consultas del Visor Territorial de Atacama.
Devuelve SIEMPRE un JSON con esta forma:
{
  "domain": "IN" | "OUT",
  "intent": "dato_simple" | "analisis_receta" | "contexto_documental" | "fuera_de_alcance",
  "pipeline": "listado_con_mapa" | "ubicacion_con_distribucion" | "distribucion_con_elementos" | "proximidad_conteo" | null,
  "slots": { "layer_id": string|null, "filters": object|null, "group_by": string|null, "color_by": string|null, "layer_id_source": string|null, "layer_id_targets": string|null, "distance_m": number|null },
  "confidence": número entre 0 y 1
}

REGLAS:
1. domain = "IN" si la pregunta es sobre el visor de Atacama (agua,
   minería, glaciares, humedales, derechos de agua, plantas desaladoras,
   volcanes, yacimientos, comunas de Atacama, etc.).
   domain = "OUT" si es de otra región, programación, precios, chistes,
   hora/fecha, etc.
2. intent = "dato_simple" si es una pregunta que se responde con una
   tool atómica (conteo, listado, ubicación, coloreo, proximidad).
   intent = "fuera_de_alcance" si el dato no existe en el visor.
   Los otros intents (analisis_receta, contexto_documental) los usarán
   los Sprints 41 y 43.
3. pipeline = el pipeline específico que mejor resuelve la pregunta:
   - "listado_con_mapa": para "¿cuáles son los X?" o "lista los X"
     (listado de elementos concretos, no conteo).
   - "ubicacion_con_distribucion": para "¿dónde están los X?"
     (ubicación visual en el mapa).
   - "distribucion_con_elementos": para "¿cuántos X por <campo>?"
     (conteo con agrupación por una columna o por admin).
   - "proximidad_conteo": para "¿cuántos X a menos de N metros de Y?"
     (conteo por proximidad espacial).
   - null: si la pregunta no encaja en ninguno (análisis de
     concentración, comparación entre capas, conteo total simple,
     preguntas en inglés que no son listados, etc.).

IMPORTANTE — DIFERENCIA ENTRE group_by:
- "por comuna" → group_by = "COMUNA" (el pipeline usará aggregate_by_admin).
- "por provincia" → group_by = "PROVINCIA".
- "por región" → group_by = "REGION".
- "por tipo" / "por clasificación" / "por uso" / "por estado" → group_by
  = la columna correspondiente (TIPO, CLASIFICACION, USO, ESTADO, etc.).
En todos estos casos, el pipeline es "distribucion_con_elementos".

CONTRAEJEMPLOS (pipeline = null porque el orquestador lo resuelve mejor):
- "¿Dónde hay más concentración de derechos?" → null (agregación, no listado).
- "How many glaciers are in Atacama?" → null (conteo en inglés).
- "Compara glaciares y humedales" → null (comparación entre capas).
- "¿Cuál es el río más largo?" → null (ordenamiento, no listado).

REGLA CRÍTICA: si la pregunta contiene "cerca de", "a menos de",
"concentración", "más grande", "compara", o está en inglés,
pipeline = null (excepto proximidad_conteo, que sí matchea "a menos de N metros de Y").

4. slots = datos concretos que podés extraer de la pregunta:
   - layer_id: el id de la capa (ej: "derechos_agua_2025"). Si no
     estás seguro, null.
   - filters: filtros como {"Cuenca": "Copiapó"}. Si no hay, null.
   - group_by: campo para agrupar (ej: "COMUNA", "TIPO", "CLASIFICACION"). Si no hay, null.
   - color_by: campo para colorear (ej: "COMUNA", "CLASIFICACION"). Si no hay, null.
   - layer_id_source: capa origen (para proximidad). Si no hay, null.
   - layer_id_targets: capa destino (para proximidad). Si no hay, null.
   - distance_m: distancia en metros (para proximidad). Si no hay, null.
5. confidence: 0.0 a 1.0. Alta (0.8+) si estás seguro de la
   clasificación, pipeline y slots. Baja (<0.5) si hay ambigüedad.
6. Si no podés llenar un slot con seguridad, poné null y bajá
   confidence. NO inventes valores.

EJEMPLOS:

Pregunta: "¿Cuáles son los glaciares?"
{"domain":"IN","intent":"dato_simple","pipeline":"listado_con_mapa","slots":{"layer_id":"glaciares","filters":null,"group_by":null,"color_by":null},"confidence":0.95}

Pregunta: "¿Dónde están las plantas desaladoras?"
{"domain":"IN","intent":"dato_simple","pipeline":"ubicacion_con_distribucion","slots":{"layer_id":"plantas_desaladoras_puntos","filters":null,"group_by":null,"color_by":null},"confidence":0.92}

Pregunta: "¿Cuántos glaciares por tipo?"
{"domain":"IN","intent":"dato_simple","pipeline":"distribucion_con_elementos","slots":{"layer_id":"glaciares","filters":null,"group_by":"CLASIFICA","color_by":"CLASIFICA"},"confidence":0.90}

Pregunta: "¿Cuántos humedales hay por comuna?"
{"domain":"IN","intent":"dato_simple","pipeline":"distribucion_con_elementos","slots":{"layer_id":"humedales","filters":null,"group_by":"COMUNA","color_by":"COMUNA"},"confidence":0.92}

Pregunta: "¿Cuántos derechos de agua hay por provincia?"
{"domain":"IN","intent":"dato_simple","pipeline":"distribucion_con_elementos","slots":{"layer_id":"derechos_agua_2025","filters":null,"group_by":"PROVINCIA","color_by":"PROVINCIA"},"confidence":0.92}

Pregunta: "¿Cuántos humedales hay por clasificación?"
{"domain":"IN","intent":"dato_simple","pipeline":"distribucion_con_elementos","slots":{"layer_id":"humedales","filters":null,"group_by":"CLASIFICACION","color_by":"CLASIFICACION"},"confidence":0.92}

Pregunta: "Derechos consuntivos en la cuenca Copiapó"
{"domain":"IN","intent":"dato_simple","pipeline":"listado_con_mapa","slots":{"layer_id":"derechos_agua_2025","filters":{"Cuenca":"Copiapó","Tipo Derecho":"Consuntivo"},"group_by":null,"color_by":null},"confidence":0.88}

Pregunta: "Dame los derechos de agua de la cuenca Copiapó pero solo los consuntivos"
{"domain":"IN","intent":"dato_simple","pipeline":"listado_con_mapa","slots":{"layer_id":"derechos_agua_2025","filters":{"Cuenca":"Copiapó","Tipo Derecho":"Consuntivo"},"group_by":null,"color_by":null},"confidence":0.88}

Pregunta: "¿Cuántos derechos de agua hay a menos de 1 km de un río?"
{"domain":"IN","intent":"dato_simple","pipeline":"proximidad_conteo","slots":{"layer_id_source":"derechos_agua_2025","layer_id_targets":"red_hidrografica","distance_m":1000},"confidence":0.85}

Pregunta: "¿Dónde hay más concentración de derechos de agua?"
{"domain":"IN","intent":"dato_simple","pipeline":null,"slots":{"layer_id":"derechos_agua_2025","filters":null,"group_by":null,"color_by":null},"confidence":0.85}

Pregunta: "How many glaciers are in Atacama?"
{"domain":"IN","intent":"dato_simple","pipeline":null,"slots":{"layer_id":"glaciares","filters":null,"group_by":null,"color_by":null},"confidence":0.85}

Pregunta: "¿Cuántos kilos de jojoba se producen al año?"
{"domain":"IN","intent":"fuera_de_alcance","pipeline":null,"slots":{"layer_id":null,"filters":null,"group_by":null,"color_by":null},"confidence":0.85}

Pregunta: "¿Qué día es hoy?"
{"domain":"OUT","intent":"fuera_de_alcance","pipeline":null,"slots":null,"confidence":0.99}

Pregunta: "¿Cuánto cuesta un iPhone?"
{"domain":"OUT","intent":"fuera_de_alcance","pipeline":null,"slots":null,"confidence":0.99}

Pregunta: "Lista los humedales"
{"domain":"IN","intent":"dato_simple","pipeline":"listado_con_mapa","slots":{"layer_id":"humedales","filters":null,"group_by":null,"color_by":null},"confidence":0.92}

Pregunta: "Distribución de humedales por clasificación"
{"domain":"IN","intent":"dato_simple","pipeline":"distribucion_con_elementos","slots":{"layer_id":"humedales","filters":null,"group_by":"SubClase","color_by":"SubClase"},"confidence":0.88}

Responde SOLO con el JSON. Nada más.`;

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
 * Intenta parsear el JSON de la respuesta del LLM.
 * Tolera texto extra, cercas de código, etc.
 */
function parseClassifierResponse(raw) {
  if (!raw || typeof raw !== "string") return null;

  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Valida y normaliza el resultado del clasificador.
 * Si algo falta o es inválido, devuelve confidence: 0.
 */
function normalizeClassifierResult(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return {
      domain: "IN",
      intent: "dato_simple",
      pipeline: null,
      slots: null,
      confidence: 0,
    };
  }

  const domain =
    typeof parsed.domain === "string" && parsed.domain.toUpperCase() === "OUT"
      ? "OUT"
      : "IN";

  const validIntents = new Set([
    "dato_simple",
    "analisis_receta",
    "contexto_documental",
    "fuera_de_alcance",
  ]);
  const intent =
    typeof parsed.intent === "string" && validIntents.has(parsed.intent)
      ? parsed.intent
      : "dato_simple";

  const validPipelines = new Set([
    "listado_con_mapa",
    "ubicacion_con_distribucion",
    "distribucion_con_elementos",
    "proximidad_conteo",
  ]);
  const pipeline =
    typeof parsed.pipeline === "string" && validPipelines.has(parsed.pipeline)
      ? parsed.pipeline
      : null;

  let slots = null;
  if (parsed.slots && typeof parsed.slots === "object" && !Array.isArray(parsed.slots)) {
    slots = {
      layer_id:
        typeof parsed.slots.layer_id === "string" ? parsed.slots.layer_id : null,
      filters:
        parsed.slots.filters && typeof parsed.slots.filters === "object"
          ? parsed.slots.filters
          : null,
      group_by:
        typeof parsed.slots.group_by === "string" ? parsed.slots.group_by : null,
      color_by:
        typeof parsed.slots.color_by === "string" ? parsed.slots.color_by : null,
      layer_id_source:
        typeof parsed.slots.layer_id_source === "string"
          ? parsed.slots.layer_id_source
          : null,
      layer_id_targets:
        typeof parsed.slots.layer_id_targets === "string"
          ? parsed.slots.layer_id_targets
          : null,
      distance_m:
        typeof parsed.slots.distance_m === "number" ? parsed.slots.distance_m : null,
    };
  }

  const confidence =
    typeof parsed.confidence === "number" &&
    parsed.confidence >= 0 &&
    parsed.confidence <= 1
      ? parsed.confidence
      : 0;

  return { domain, intent, pipeline, slots, confidence };
}

/**
 * Clasifica una consulta y extrae intent/slots.
 *
 * Fail-open: si algo falla, devuelve { domain: "IN", confidence: 0 }
 * para que el router degrade al ciclo actual.
 *
 * @param {string} text
 * @param {string|null} sessionId
 * @param {string|null} catalogContext
 * @returns {Promise<{domain: "IN"|"OUT", intent: string, pipeline: string|null, slots: object|null, confidence: number}>}
 */
export async function classifyDomain(text, sessionId = null, catalogContext = null) {
  if (typeof text !== "string" || text.trim().length === 0) {
    return { domain: "IN", intent: "dato_simple", pipeline: null, slots: null, confidence: 0 };
  }

  const key = cacheKey(text);
  const cached = getFromCache(key);
  if (cached) {
    log.debug(`Cache hit: ${cached.domain} (confidence ${cached.confidence})`);
    return cached;
  }

  try {
    const llm = await getLLM();
    const userMessage = catalogContext
      ? `Pregunta: ${text}\n\nColumnas disponibles en las capas relevantes:\n${catalogContext}`
      : text;

    const response = await llm.chat({
      system: CLASSIFIER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 700,
      temperature: 0,
      sessionId,
    });

    const raw = (response.content || "").trim();
    const parsed = parseClassifierResponse(raw);
    const result = normalizeClassifierResult(parsed);

    if (!parsed) {
      log.warn(`Clasificador devolvió JSON inválido. Fail-open → IN (confidence 0).`);
    } else {
      log.debug(
        `Clasificación: domain=${result.domain} intent=${result.intent} ` +
          `pipeline=${result.pipeline} confidence=${result.confidence}`
      );
    }

    setInCache(key, result);
    return result;
  } catch (err) {
    log.warn(`Clasificador falló (fail-open → IN, confidence 0): ${err?.message || err}`);
    return { domain: "IN", intent: "dato_simple", pipeline: null, slots: null, confidence: 0 };
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