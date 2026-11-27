/**
 * Helpers compartidos por todas las tools del chat.
 *
 * Contiene:
 *   - Normalización defensiva de argumentos del LLM (normalizeArgs).
 *   - Timeout de RPCs (withTimeout).
 *   - Constantes compartidas (METRICS, ADMIN_LEVELS, MAX_LIMIT).
 *
 * Los runners de cada tool importan lo que necesitan desde aquí.
 */

const RPC_TIMEOUT_MS = 6000;

/**
 * Timeouts por tool. Las tools que salen a servicios externos o hacen
 * geoprocesos pesados necesitan más que el timeout estándar de RPC.
 */
const TOOL_TIMEOUTS = Object.freeze({
  get_wms_statistics: 25000,
  get_wms_available_dates: 15000,
  get_wms_pixel: 12000,
  get_arclim_forecast: 12000,
  get_historical_series: 10000,
  spatial_overlay: 10000,
  nearest_distance: 10000,
  rank_multicriteria: 15000,
});

function timeoutForTool(name) {
  return TOOL_TIMEOUTS[name] || RPC_TIMEOUT_MS;
}


const METRICS = new Set(["count", "avg", "sum", "min", "max"]);
const ADMIN_LEVELS = new Set(["comuna", "provincia", "region"]);
const FILTER_OPS = new Set([
  "match",
  "eq",
  "in",
  "ilike",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
]);
const MAX_FILTER_CONDITIONS = 20;
const MAX_LIMIT = 50;

/**
 * Normaliza una condición de filtro avanzada.
 *
 * Formato aceptado:
 *   { field: "caudal", op: "gt", value: 100 }
 *   { field: "comuna", op: "in", values: ["Copiapó", "Vallenar"] }
 *   { field: "fecha", op: "between", values: ["2020-01-01", "2024-12-31"] }
 *
 * @param {unknown} condition
 * @returns {{field: string, op: string, value?: string, values?: string[]} | null}
 */
function normalizeCondition(condition) {
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) {
    return null;
  }

  const field =
    typeof condition.field === "string" ? condition.field.trim() : "";
  if (!field) return null;

  const op =
    typeof condition.op === "string"
      ? condition.op.toLowerCase().trim()
      : "match";
  if (!FILTER_OPS.has(op)) return null;

  const out = { field, op };
  const needsValues = op === "in" || op === "between";

  if (needsValues) {
    if (!Array.isArray(condition.values) || condition.values.length === 0) {
      return null;
    }
    out.values = condition.values.map((value) => String(value));
    if (op === "between" && out.values.length !== 2) return null;
  } else {
    if (condition.value === undefined || condition.value === null) return null;
    out.value = String(condition.value);
  }

  return out;
}

/**
 * Normaliza filtros simples y avanzados a la forma que espera la RPC.
 *
 * - `filters` objeto: { comuna: "Copiapó" } → condición match.
 * - `filters` array: [{ field, op, value|values }] → se conserva.
 * - `conditions` array: se agrega a los filtros anteriores.
 *
 * La RPC `chat_build_where` acepta objeto o array. Devolvemos array cuando
 * hay condiciones avanzadas para no perder operadores como gt/in/between.
 *
 * @param {unknown} rawFilters
 * @param {unknown} rawConditions
 * @returns {object|Array<object>}
 */
function normalizeFilters(rawFilters, rawConditions) {
  const conditions = [];

  if (
    rawFilters &&
    typeof rawFilters === "object" &&
    !Array.isArray(rawFilters)
  ) {
    for (const [field, value] of Object.entries(rawFilters)) {
      if (value === undefined || value === null || value === "") continue;
      if (Array.isArray(value)) {
        if (value.length === 0) continue;
        conditions.push({
          field,
          op: "in",
          values: value.map((item) => String(item)),
        });
      } else {
        conditions.push({ field, op: "match", value: String(value) });
      }
    }
  } else if (Array.isArray(rawFilters)) {
    for (const condition of rawFilters) {
      const normalized = normalizeCondition(condition);
      if (normalized) conditions.push(normalized);
    }
  }

  if (Array.isArray(rawConditions)) {
    for (const condition of rawConditions) {
      const normalized = normalizeCondition(condition);
      if (normalized) conditions.push(normalized);
    }
  }

  if (conditions.length === 0) return {};
  return conditions.slice(0, MAX_FILTER_CONDITIONS);
}


/**
 * Envuelve una promesa con un timeout.
 * @param {Promise<any>} promise
 * @param {number} ms
 * @param {AbortController|null} [controller] Se aborta al vencer el timeout.
 * @returns {Promise<any>}
 */
function withTimeout(promise, ms, controller = null) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => {
        controller?.abort();
        reject(new Error(`La RPC excedió el timeout de ${ms}ms.`));
      },
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
    name === "aggregate_near_layer" ||
    name === "compare_layers" ||
    name === "rank_multicriteria"
  ) {
    if (typeof args.admin_level === "string") {
      args.admin_level = args.admin_level.toLowerCase().trim();
    }
    if (!ADMIN_LEVELS.has(args.admin_level)) {
      args.admin_level = "comuna";
    }
  }

  // layer_ids para comparación multi-capa
  if (name === "compare_layers") {
    if (Array.isArray(args.layer_ids)) {
      args.layer_ids = [
        ...new Set(
          args.layer_ids
            .filter((id) => typeof id === "string" && id.trim())
            .map((id) => id.trim())
        ),
      ].slice(0, 4);
    } else {
      args.layer_ids = [];
    }
  }


  // criteria para ranking multicriterio
  if (name === "rank_multicriteria") {
    if (Array.isArray(args.criteria)) {
      args.criteria = args.criteria
        .filter(
          (criterion) =>
            criterion &&
            typeof criterion === "object" &&
            typeof criterion.layer_id === "string" &&
            criterion.layer_id.trim()
        )
        .map((criterion) => {
          const metric = METRICS.has(criterion.metric)
            ? criterion.metric
            : "count";
          const weight = Number(criterion.weight);
          return {
            layer_id: criterion.layer_id.trim(),
            field:
              criterion.field !== undefined && criterion.field !== null
                ? String(criterion.field)
                : null,
            metric,
            direction: criterion.direction === "asc" ? "asc" : "desc",
            weight: Number.isFinite(weight) && weight > 0 ? weight : 1,
          };
        })
        .slice(0, 6);
    } else {
      args.criteria = [];
    }
  }

  // limit para query_layer (tope 50, default 20)
  if (name === "query_layer" && args.limit !== undefined) {
    const n = Number(args.limit);
    args.limit = Number.isFinite(n)
      ? Math.min(Math.max(1, Math.floor(n)), MAX_LIMIT)
      : 20;
  }

  // orden y top-N para query_layer
  if (name === "query_layer") {
    if (args.order_by !== undefined) {
      args.order_by =
        typeof args.order_by === "string" && args.order_by.trim()
          ? args.order_by.trim()
          : null;
    }
    if (args.order_dir !== undefined) {
      args.order_dir =
        typeof args.order_dir === "string" &&
        args.order_dir.toLowerCase().trim() === "asc"
          ? "asc"
          : "desc";
    }
  }

  // limit para get_layer_features (tope 1000, default 500)
  if (name === "get_layer_features" && args.limit !== undefined) {
    const n = Number(args.limit);
    args.limit = Number.isFinite(n)
      ? Math.min(Math.max(1, Math.floor(n)), 1000)
      : 500;
  }

  // filters / conditions
  if (args.filters !== undefined || args.conditions !== undefined) {
    args.filters = normalizeFilters(args.filters, args.conditions);
    delete args.conditions;
  }

  // metric
  if (
    name === "aggregate_layer" ||
    name === "aggregate_by_admin" ||
    name === "aggregate_by_admin_and_column" ||
    name === "compare_layers"
  ) {
    if (!METRICS.has(args.metric)) args.metric = "count";
    if (
      args.metric !== "count" &&
      (args.field === undefined || args.field === null)
    ) {
      args.metric = "count";
    }
  }

  // search_documents (RAG)
  if (name === "search_documents") {
    if (typeof args.query === "string") {
      args.query = args.query.trim().slice(0, 500);
    }
    if (args.limit !== undefined && args.limit !== null) {
      const n = Number(args.limit);
      args.limit = Number.isFinite(n)
        ? Math.min(Math.max(1, Math.floor(n)), 8)
        : 5;
    }
    if (args.year !== undefined && args.year !== null && String(args.year).trim() !== "") {
      const n = Number(args.year);
      args.year = Number.isInteger(n) && n >= 1900 && n <= 2100 ? n : null;
    } else {
      args.year = null;
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

export {
  RPC_TIMEOUT_MS,
  TOOL_TIMEOUTS,
  timeoutForTool,
  METRICS,
  ADMIN_LEVELS,
  FILTER_OPS,
  MAX_FILTER_CONDITIONS,
  MAX_LIMIT,
  withTimeout,
  normalizeCondition,
  normalizeFilters,
  normalizeArgs,
};