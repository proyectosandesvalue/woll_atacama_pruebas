/**
 * Ejecutor de ingesta.
 *
 * Lee la config de ingest.endpoints y ejecuta el adapter correspondiente.
 *
 * Sprint 42-B (2026-10-24).
 */

import { getDB } from "../db/pool.js";
import { runJsonEndpoint } from "./adapters/json.js";

const DEBUG = /^(1|true|yes)$/i.test(process.env.ORCHESTRATOR_DEBUG || "");
function dbg(...args) {
  if (DEBUG) console.log("[ingest:runner]", ...args);
}

/**
 * Ejecuta un endpoint por su ID.
 *
 * @param {string} endpointId - ej. 'meteochile:getDatosRecientesRedEma'
 * @returns {Promise<{loaded, skipped, errors}>}
 */
export async function runEndpoint(endpointId) {
  const db = await getDB();

  // Cargar config del endpoint
  const endpoints = await db.rpc("chat_list_endpoints", { p_source_id: null });
  const endpointList = Array.isArray(endpoints) ? endpoints : [];
  const endpoint = endpointList.find((e) => e.id === endpointId);

  if (!endpoint) {
    throw new Error(`Endpoint ${endpointId} no encontrado o inactivo`);
  }

  // Cargar la fuente
  const sources = await db.rpc("admin_list_sources");
  const sourceList = Array.isArray(sources) ? sources : [];
  const source = sourceList.find((s) => s.id === endpoint.source_id);

  if (!source) {
    throw new Error(`Fuente ${endpoint.source_id} no encontrada`);
  }

  // Cargar el endpoint completo (con auth, mapping, etc.)
  // chat_list_endpoints devuelve solo metadata. Para el detalle, leer la tabla.
  // Como no tenemos RPC de detalle, leemos directo (solo para runner).
  const { data: fullEndpoint, error } = await db
    .from ? null : null; // placeholder; en la práctica, agregar RPC chat_get_endpoint

  throw new Error("Falta RPC chat_get_endpoint (pendiente de implementar).");
}