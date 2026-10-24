/**
 * Adapter genérico para endpoints XML.
 *
 * Sprint 42-B (2026-10-24).
 *
 * Usa una implementación simple de XPath para extraer registros.
 * Para casos complejos (namespaces, etc.), usar un adapter específico.
 *
 * Nota: BCN devuelve texto, no números. Los endpoints XML de BCN
 * alimentan el RAG, no `indicator_values`. Este adapter sirve para
 * otros XML numéricos.
 */

const DEBUG = /^(1|true|yes)$/i.test(process.env.ORCHESTRATOR_DEBUG || "");
function dbg(...args) {
  if (DEBUG) console.log("[ingest:xml]", ...args);
}

/**
 * Parser XML simple (sin dependencias).
 * Convierte el XML en un objeto JS. Para XML muy anidados o con
 * namespaces, usar un parser real.
 */
function parseXmlSimple(xmlString) {
  // Esta implementación es mínima. Para producción, usar 'fast-xml-parser'.
  // La dejo como stub para que compile, pero no es funcional.
  throw new Error(
    "Adapter XML no implementado. Usar 'fast-xml-parser' o un adapter específico."
  );
}

export async function runXmlEndpoint(db, source, endpoint) {
  throw new Error("Adapter XML no implementado todavía");
}