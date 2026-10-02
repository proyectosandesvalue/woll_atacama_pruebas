/**
 * Runners: ejecutan cada tool contra Supabase (vía el pool).
 *
 * Los argumentos del LLM se normalizan defensivamente en `runTool`
 * antes de invocar el runner.
 */

import { getDB } from "../db/pool.js";

const RPC_TIMEOUT_MS = 6000;

// ── Runners individuales ───────────────────────────────────────

async function runGetLayerStats({ layer_id }) {
  const db = await getDB();
  return db.rpc("chat_layer_stats", { p_layer: layer_id });
}

async function runGetLayerSchema({ layer_id }) {
  const db = await getDB();
  return db.rpc("chat_layer_schema", { p_layer: layer_id });
}

async function runQueryLayer({ layer_id, filters, limit }) {
  const db = await getDB();
  return db.rpc("chat_query", {
    p_layer: layer_id,
    p_filters: filters ?? {},
    p_limit: limit ?? 20,
  });
}

async function runAggregateLayer({ layer_id, group_by, metric, field, filters }) {
  const db = await getDB();
  return db.rpc("chat_aggregate", {
    p_layer: layer_id,
    p_group_by: group_by,
    p_metric: metric ?? "count",
    p_field: field ?? null,
    p_filters: filters ?? {},
  });
}

async function runAggregateByAdmin({ layer_id, admin_level, metric, field, filters }) {
  const db = await getDB();
  return db.rpc("chat_aggregate_by_admin", {
    p_layer: layer_id,
    p_admin_level: admin_level,
    p_metric: metric ?? "count",
    p_field: field ?? null,
    p_filters: filters ?? {},
  });
}

async function runAggregateByAdminAndColumn({ layer_id, admin_level, group_by, metric, field, filters }) {
  const db = await getDB();
  return db.rpc("chat_aggregate_by_admin_and_column", {
    p_layer: layer_id,
    p_admin_level: admin_level,
    p_group_by: group_by,
    p_metric: metric ?? "count",
    p_field: field ?? null,
    p_filters: filters ?? {},
  });
}

async function runCountNearLayer({ layer_id_source, layer_id_targets, distance_m, filters }) {
  const db = await getDB();
  return db.rpc("chat_count_near_layer", {
    p_layer_source: layer_id_source,
    p_layer_targets: layer_id_targets,
    p_distance_m: distance_m,
    p_filters: filters ?? {},
  });
}

async function runAggregateNearLayer({ layer_id_source, layer_id_targets, distance_m, admin_level, filters }) {
  const db = await getDB();
  return db.rpc("chat_aggregate_near_layer", {
    p_layer_source: layer_id_source,
    p_layer_targets: layer_id_targets,
    p_distance_m: distance_m,
    p_admin_level: admin_level,
    p_filters: filters ?? {},
  });
}

export const TOOL_RUNNERS = {
  get_layer_stats: runGetLayerStats,
  get_layer_schema: runGetLayerSchema,
  query_layer: runQueryLayer,
  aggregate_layer: runAggregateLayer,
  aggregate_by_admin: runAggregateByAdmin,
  aggregate_by_admin_and_column: runAggregateByAdminAndColumn,
  count_near_layer: runCountNearLayer,
  aggregate_near_layer: runAggregateNearLayer,
};

// ── Normalización defensiva de argumentos ─────────────────────
const METRICS = new Set(["count", "avg", "sum", "min", "max"]);
const ADMIN_LEVELS = new Set(["comuna", "provincia", "region"]);
const MAX_LIMIT = 50;

function normalizeArgs(name, raw) {
  const args = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};

  if (args.layer_id !== undefined) args.layer_id = String(args.layer_id);
  if (args.group_by !== undefined) args.group_by = String(args.group_by);
  if (args.field !== undefined && args.field !== null) args.field = String(args.field);

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

  // limit
  if (name === "query_layer") {
    const n = Number(args.limit);
    args.limit = Number.isFinite(n)
      ? Math.min(Math.max(1, Math.floor(n)), MAX_LIMIT)
      : 20;
  }

  // filters
  if (args.filters !== undefined) {
    if (!args.filters || typeof args.filters !== "object" || Array.isArray(args.filters)) {
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
    if (args.metric !== "count" && (args.field === undefined || args.field === null)) {
      args.metric = "count";
    }
  }

  // distance_m + layer_id_targets (proximidad)
  if (name === "count_near_layer" || name === "aggregate_near_layer") {
    const d = Number(args.distance_m);
    args.distance_m = Number.isFinite(d) && d > 0 ? d : 500;

    if (!Array.isArray(args.layer_id_targets)) {
      args.layer_id_targets = args.layer_id_targets ? [String(args.layer_id_targets)] : [];
    } else {
      args.layer_id_targets = args.layer_id_targets.map(String);
    }

    // El campo layer_id (que usa la validación común) es layer_id_source
    if (args.layer_id_source !== undefined) args.layer_id = String(args.layer_id_source);
  }

  return args;
}

/**
 * Ejecuta una tool por nombre con sus argumentos.
 */
export async function runTool(name, rawArgs) {
  const fn = TOOL_RUNNERS[name];
  if (!fn) {
    return { ok: false, error: `Tool desconocida: ${name}` };
  }

  const args = normalizeArgs(name, rawArgs);

  if (!args.layer_id) {
    return { ok: false, error: "Falta 'layer_id' en los argumentos de la tool." };
  }

  try {
    const result = await withTimeout(fn(args), RPC_TIMEOUT_MS);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`La RPC excedió el timeout de ${ms}ms.`)),
      ms
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}