/**
 * Retrieval de capas: elige las N capas más relevantes del catálogo
 * para una pregunta dada.
 *
 * Estrategia:
 *   - Normaliza el texto (minúsculas, sin tildes, sin plurales simples).
 *   - Puntúa cada capa por coincidencia de términos con display_name,
 *     dimension y nombres de atributos.
 *   - Devuelve las topK capas + un flag de confianza.
 *
 * Si el mejor puntaje es bajo, `confident` es false y el prompt usa
 * el catálogo completo (comportamiento actual).
 */

const STOPWORDS = new Set([
  "de", "la", "el", "los", "las", "un", "una", "unos", "unas",
  "y", "o", "en", "por", "para", "con", "sin", "del", "al",
  "que", "cual", "cuales", "cuanto", "cuanta", "cuantos", "cuantas",
  "donde", "como", "es", "son", "hay", "dame", "muestra", "muestrame",
  "lista", "listar", "ver", "quiero", "necesito", "sobre", "segun",
  "por", "favor", "region", "atacama", "chile",
]);

/**
 * Normaliza un texto: minúsculas, sin tildes, sin plurales simples.
 */
function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // quitar tildes
    .replace(/[^a-z0-9\s]/g, " ")     // solo letras, números y espacios
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    .map((w) => w.replace(/(es|s)$/, ""))  // plural simple
    .filter(Boolean);
}

/**
 * Puntúa una capa contra los términos de la pregunta.
 *
 * Pesos:
 *   - display_name: 3 (nombre visible)
 *   - layer_id: 2 (nombre técnico)
 *   - dimension: 1 (categoría)
 *   - attributes: 0.5 (columnas)
 */
function scoreLayer(terms, layer) {
  const displayName = normalize(layer.display_name || "");
  const layerId = normalize(layer.layer_id || "");
  const dimension = normalize(layer.dimension || "");
  const attrs = Array.isArray(layer.attributes)
    ? layer.attributes.flatMap((a) =>
        normalize(typeof a === "string" ? a : a?.name || "")
      )
    : [];

  let score = 0;
  for (const term of terms) {
    if (displayName.includes(term)) score += 3;
    if (layerId.includes(term)) score += 2;
    if (dimension.includes(term)) score += 1;
    if (attrs.some((a) => a.includes(term))) score += 0.5;
  }
  return score;
}

/**
 * Retrieval de capas.
 *
 * @param {string} text - Pregunta del usuario.
 * @param {Array} catalog - Catálogo completo (chat_catalog).
 * @param {number} topK - Cantidad de capas a devolver.
 * @param {number} minScore - Puntaje mínimo para considerar confiable.
 * @returns {{ layers: Array<{layer_id: string, score: number}>, confident: boolean }}
 */
export function retrieveLayers(text, catalog, topK = 6, minScore = 2) {
  if (!Array.isArray(catalog) || catalog.length === 0) {
    return { layers: [], confident: false };
  }

  const terms = normalize(text);
  if (terms.length === 0) {
    return { layers: [], confident: false };
  }

  const scored = catalog
    .map((layer) => ({
      layer_id: layer.layer_id,
      score: scoreLayer(terms, layer),
    }))
    .filter((l) => l.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const confident = scored.length > 0 && scored[0].score >= minScore;

  return { layers: scored, confident };
}

/**
 * Dado el catálogo y las capas recuperadas, devuelve:
 *   - Las capas recuperadas completas (con attributes).
 *   - La lista de nombres de las demás (sin attributes).
 */
export function splitCatalog(catalog, retrievedIds) {
  const retrievedSet = new Set(retrievedIds);
  const retrieved = [];
  const others = [];
  for (const layer of catalog) {
    if (retrievedSet.has(layer.layer_id)) {
      retrieved.push(layer);
    } else {
      others.push({ layer_id: layer.layer_id, display_name: layer.display_name });
    }
  }
  return { retrieved, others };
}