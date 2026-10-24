/**
 * Ejecutor de ingesta.
 *
 * Lee la config de ingest.endpoints y ejecuta el adapter correspondiente.
 *
 * Sprint 42-B (2026-10-24).
 */

import { getDB } from "../db/pool.js";
import { runJsonEndpoint } from "./adapters/json.js";
import { runJsonColumnarEndpoint } from "./adapters/json-columnar.js";

const DEBUG = /^(1|true|yes)$/i.test(process.env.ORCHESTRATOR_DEBUG || "");
function dbg(...args) {
  if (DEBUG) console.log("[ingest:runner]", ...args);
}

/**
 * Ejecuta un endpoint por su ID.
 *
 * @param {string} endpointId
 * @returns {Promise<{loaded, skipped, errors, runId}>}
 */
export async function runEndpoint(endpointId) {
  const db = await getDB();

  // 1. Cargar detalle del endpoint
  const endpoint = await db.rpc("chat_get_endpoint", {
    p_endpoint_id: endpointId,
  });

  if (!endpoint || !endpoint.id) {
    throw new Error(`Endpoint ${endpointId} no encontrado o inactivo`);
  }

    // 2. Construir la source desde el endpoint.
  // chat_get_endpoint ya incluye url_base, licencia y source_name,
  // así que no hace falta consultar admin_list_sources.
  const source = {
    id: endpoint.source_id,
    url_base: endpoint.url_base,
    nombre: endpoint.source_name,
    licencia: endpoint.licencia,
  };

  if (!source.url_base) {
    throw new Error(
      `La fuente ${endpoint.source_id} no tiene url_base configurada`
    );
  }

  // 3. Registrar el inicio de la corrida
  const runId = await db.rpc("ingest_log_run", {
    p_source_id: endpoint.source_id,
    p_endpoint_id: endpointId,
    p_job_name: `run:${endpointId}`,
    p_status: "running",
    p_records_loaded: 0,
    p_records_skipped: 0,
    p_error_message: null,
    p_metadata: null,
  });

  dbg(`Run ${runId} iniciada para ${endpointId}`);

  // 4. Ejecutar el adapter
  let result;
  try {
    if (endpoint.format === "json") {
      // Detectar formato columnar vs array de objetos.
      // - Array de objetos: json_path termina en [*] (MeteoChile).
      // - Columnar: json_path es '$.data' o '$' (ARClim).
      const isColumnar =
        endpoint.json_path === "$.data" ||
        endpoint.json_path === "$" ||
        !endpoint.json_path?.includes("[*]");

      if (isColumnar) {
        result = await runJsonColumnarEndpoint(db, source, endpoint);
      } else {
        result = await runJsonEndpoint(db, source, endpoint);
      }
    } else if (endpoint.format === "xml") {
      throw new Error("Adapter XML no implementado todavía");
    } else if (endpoint.format === "csv") {
      throw new Error("Adapter CSV no implementado todavía");
    } else {
      throw new Error(`Formato ${endpoint.format} no soportado`);
    }
  } catch (err) {
    await db.rpc("ingest_update_run", {
      p_run_id: runId,
      p_status: "failed",
      p_records_loaded: 0,
      p_records_skipped: 0,
      p_error_message: err?.message || String(err),
      p_metadata: null,
    });
    throw err;
  }

  // 5. Actualizar el run con el resultado
  const finalStatus =
    result.errors.length === 0
      ? "success"
      : result.loaded > 0
        ? "partial"
        : "failed";

  await db.rpc("ingest_update_run", {
    p_run_id: runId,
    p_status: finalStatus,
    p_records_loaded: result.loaded,
    p_records_skipped: result.skipped,
    p_error_message:
      result.errors.length > 0 ? result.errors.slice(0, 5).join("; ") : null,
    p_metadata: { errors_count: result.errors.length },
  });

  return { ...result, runId };
}

/**
 * Ejecuta todos los endpoints de una fuente.
 *
 * @param {string} sourceId
 * @returns {Promise<Array<{endpointId, loaded, skipped, errors}>>}
 */
export async function runSource(sourceId) {
  const db = await getDB();
  const endpoints = await db.rpc("chat_list_endpoints", {
    p_source_id: sourceId,
  });

  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    return [];
  }

  const results = [];
  for (const ep of endpoints) {
    try {
      const r = await runEndpoint(ep.id);
      results.push({ endpointId: ep.id, ...r });
    } catch (err) {
      results.push({
        endpointId: ep.id,
        loaded: 0,
        skipped: 0,
        errors: [err?.message || String(err)],
      });
    }
  }
  return results;
}
