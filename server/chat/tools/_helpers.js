/**
 * Helpers compartidos por todas las tools del chat.
 *
 * Contiene:
 *   - Normalización defensiva de argumentos del LLM (normalizeArgs).
 *   - Timeout de RPCs (withTimeout).
 *   - Constantes compartidas (METRICS, ADMIN_LEVELS, MAX_LIMIT).
 *
 * Los runners de cada tool importan lo que necesitan desde acá.
 */

const RPC_TIMEOUT_MS = 6000;

const METRICS = new Set(["count", "avg", "sum", "min", "max"]);
const ADMIN_LEVELS = new Set(["comuna", "provincia", "region"]);
const MAX_LIMIT = 50;

/**
 * Envuelve una promesa con un timeout.
 * @param {Promise<any>} promise
 * @param {number} ms
 * @returns {Promise<any>}
 */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`La RPC excedió el timeout de ${ms}ms.`)),
      ms
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/**
 * Normaliza los argumentos que envía el LLM.
 *
 * Es defensivo a propósito: el LLM puede alucinar tipos, valores inválidos,
 * campos faltantes, etc. Antes de tocar Supabase, coaccionamos todo a lo que
 * espera cada RPC.
 *
 * @param {string} name - Nombre de la tool
 * @param {object} raw - Argumentos crudos del LLM
 * @returns {object} Argumentos normalizados
 */
function normalizeArgs(name, raw) {
  const args =
    raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};

  if (args.layer_id !== undefined) args.layer_id = String(args.layer_id);
  if (args.group_by !== undefined) args.group_by = String(args.group_by);
  if (args.field !== undefined && args.field !== null)
    args.field = String(args.field);

  // admin_level: normalizar a minúsculas y validar
  if (
    name === "aggregate_by_admin" ||
    name === "aggregate_by_admin_and_column" ||
    name === "aggregate_near_layer"
  ) {
    if (typeof args.admin_level === "string") {
      args.admin_level = args.admin_level.toLowerCase().trim();
    }
    if (!ADMIN_LEVELS.has(args.admin_level)) {
      args.admin_level = "comuna";
    }
  }


    // limit para query_layer (tope 50, default 20)
  if (name === "query_layer" && args.limit !== undefined) {
    const n = Number(args.limit);
    args.limit = Number.isFinite(n)
      ? Math.min(Math.max(1, Math.floor(n)), MAX_LIMIT)
      : 20;
  }

  // limit para get_layer_features (tope 1000, default 500)
  if (name === "get_layer_features" && args.limit !== undefined) {
    const n = Number(args.limit);
    args.limit = Number.isFinite(n)
      ? Math.min(Math.max(1, Math.floor(n)), 1000)
      : 500;
  }

  // filters
  if (args.filters !== undefined) {
    if (
      !args.filters ||
      typeof args.filters !== "object" ||
      Array.isArray(args.filters)
    ) {
      args.filters = {};
    }
  }

  // metric
  if (
    name === "aggregate_layer" ||
    name === "aggregate_by_admin" ||
    name === "aggregate_by_admin_and_column"
  ) {
    if (!METRICS.has(args.metric)) args.metric = "count";
    if (
      args.metric !== "count" &&
      (args.field === undefined || args.field === null)
    ) {
      args.metric = "count";
    }
  }

  // distance_m + layer_id_targets (proximidad)
  if (name === "count_near_layer" || name === "aggregate_near_layer") {
    const d = Number(args.distance_m);
    args.distance_m = Number.isFinite(d) && d > 0 ? d : 500;

    if (!Array.isArray(args.layer_id_targets)) {
      args.layer_id_targets = args.layer_id_targets
        ? [String(args.layer_id_targets)]
        : [];
    } else {
      args.layer_id_targets = args.layer_id_targets.map(String);
    }

    // El campo layer_id (que usa la validación común) es layer_id_source
    if (args.layer_id_source !== undefined)
      args.layer_id = String(args.layer_id_source);
  }

  return args;
}

export { RPC_TIMEOUT_MS, METRICS, ADMIN_LEVELS, MAX_LIMIT, withTimeout, normalizeArgs };