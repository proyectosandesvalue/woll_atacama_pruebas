/**
 * Fast path determinístico para preguntas de proximidad.
 *
 * Evita la llamada al clasificador LLM (~1,5 s) cuando la pregunta sigue
 * un patrón explícito:
 *
 *   "¿Cuántos <fuente> hay a menos de <N> km/m de <target>?"
 *
 * Es conservador: solo aplica en el primer turno (sin historial), con una
 * fuente y un target reconocidos y una distancia explícita. Cualquier otra
 * pregunta sigue usando el clasificador LLM.
 */

const SOURCES = [
  [/derechos?\s+de\s+agua/i, "derechos_agua_2025"],
  [/\bglaciares?\b/i, "glaciares"],
  [/\bhumedales?\b/i, "humedales"],
  [/\bdesaladoras?\b/i, "plantas_desaladoras_puntos"],
  [/\bsalares?\b/i, "salares"],
  [/\blagunas?\b|\bembalses?\b/i, "lagunas_embalses"],
  [/\byacimientos?\b/i, "yacimientos"],
  [/\bvolcanes?\b/i, "volcanes"],
];

const TARGETS = [
  [/\br[ií]os?\b|\bhidrograf/i, "hidrografia"],
  [/\bhumedal/i, "humedales"],
  [/\bglaciar/i, "glaciares"],
  [/\blagunas?\b|\bembalses?\b/i, "lagunas_embalses"],
  [/\bsalares?\b/i, "salares"],
  [/\bvolcan/i, "volcanes"],
  [/\b(fuente|cuerpo)s?\s+de\s+agua\b|\bagua\s+superficial\b/i, "agua_superficial"],
];

function firstMatch(list, text) {
  for (const [regex, value] of list) {
    if (regex.test(text)) return value;
  }
  return null;
}

/**
 * @param {string} text
 * @param {Array<{role:string, content:string}>} [history]
 * @returns {object|null} Clasificación compatible con `classifyDomain`.
 */
export function fastClassify(text, history = []) {
  if (typeof text !== "string" || text.trim().length === 0) return null;
  if (Array.isArray(history) && history.length > 0) return null;

  if (!/a\s+menos\s+de|dentro\s+de|cerca\s+de/i.test(text)) return null;

  const distanceMatch = text.match(
    /(\d+(?:[.,]\d+)?)\s*(km|kil[oó]metros?|m|metros?)\b/i
  );
  if (!distanceMatch) return null;

  const value = Number(distanceMatch[1].replace(",", "."));
  const unit = distanceMatch[2].toLowerCase();
  const distance_m = Math.round(value * (/^k/i.test(unit) ? 1000 : 1));

  if (!Number.isFinite(distance_m) || distance_m <= 0 || distance_m > 100000) {
    return null;
  }

  const layer_id_source = firstMatch(SOURCES, text);
  const layer_id_targets = firstMatch(TARGETS, text);
  if (!layer_id_source || !layer_id_targets) return null;

  return {
    domain: "IN",
    intent: "dato_simple",
    pipeline: "proximidad_conteo",
    slots: {
      layer_id: null,
      filters: null,
      group_by: null,
      color_by: null,
      layer_id_source,
      layer_id_targets: [layer_id_targets],
      distance_m,
    },
    confidence: 0.95,
    fast: true,
  };
}
