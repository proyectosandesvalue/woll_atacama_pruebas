/**
 * Registro cerrado de RPCs que usa el backend.
 *
 * El LLM nunca escribe SQL: solo invoca tools, y cada tool llama a una RPC de
 * esta lista. El driver `postgres` usa este registro para construir la llamada
 * con parámetros nombrados y casts explícitos:
 *
 *   SELECT public.chat_query(p_layer => $1::text, p_filters => $2::jsonb)
 *
 * Reglas:
 *   - Un nombre no registrado es un error (no se permite SQL libre).
 *   - Un parámetro no declarado para esa RPC es un error (evita typos).
 *   - Los parámetros ausentes usan el DEFAULT de PostgreSQL.
 *   - Todas las funciones viven en `public`; las de `chat.*` tienen wrapper
 *     público estable. `admin.*` e `ingest.*` no se exponen al LLM.
 *
 * Sprint 26-B.
 */

const text = "text";
const jsonb = "jsonb";
const int = "int";
const uuid = "uuid";
const date = "date";
const numeric = "numeric";
const boolean = "boolean";
const double = "double precision";
const textArray = "text[]";

/**
 * @typedef {{
 *   schema: string,
 *   params: Record<string, string>,
 *   returns: "value"|"rows"
 * }} RpcSignature
 */

/** @type {Record<string, RpcSignature>} */
export const RPC_SIGNATURES = Object.freeze({
  // ── Catálogo y capas ──────────────────────────────────────────────
  chat_catalog: {
    schema: "public",
    params: {},
    returns: "value",
  },
  chat_catalog_all: {
    schema: "public",
    params: {},
    returns: "value",
  },
  chat_layer_stats: {
    schema: "public",
    params: { p_layer: text },
    returns: "value",
  },
  chat_layer_schema: {
    schema: "public",
    params: { p_layer: text },
    returns: "value",
  },
  chat_query: {
    schema: "public",
    params: {
      p_layer: text,
      p_filters: jsonb,
      p_limit: int,
      p_offset: int,
    },
    returns: "value",
  },
  chat_layer_features: {
    schema: "public",
    params: { p_layer: text, p_filters: jsonb, p_limit: int },
    returns: "value",
  },
  chat_aggregate: {
    schema: "public",
    params: {
      p_layer: text,
      p_group_by: text,
      p_metric: text,
      p_field: text,
      p_filters: jsonb,
    },
    returns: "value",
  },
  chat_aggregate_by_admin: {
    schema: "public",
    params: {
      p_layer: text,
      p_admin_level: text,
      p_metric: text,
      p_field: text,
      p_filters: jsonb,
    },
    returns: "value",
  },
  chat_aggregate_by_admin_and_column: {
    schema: "public",
    params: {
      p_layer: text,
      p_admin_level: text,
      p_group_by: text,
      p_metric: text,
      p_field: text,
      p_filters: jsonb,
    },
    returns: "value",
  },
  chat_count_near_layer: {
    schema: "public",
    params: {
      p_layer_source: text,
      p_layer_targets: textArray,
      p_distance_m: double,
      p_filters: jsonb,
    },
    returns: "value",
  },
  chat_aggregate_near_layer: {
    schema: "public",
    params: {
      p_layer_source: text,
      p_layer_targets: textArray,
      p_distance_m: double,
      p_admin_level: text,
      p_filters: jsonb,
    },
    returns: "value",
  },
  chat_column_coverage: {
    schema: "public",
    params: { p_layer: text },
    returns: "value",
  },
  chat_columns_for_table: {
    schema: "public",
    params: { p_schema: text, p_table: text },
    returns: "value",
  },
  chat_table_exists: {
    schema: "public",
    params: { p_schema: text, p_table: text },
    returns: "value",
  },
  chat_upsert_layer: {
    schema: "public",
    params: {
      p_layer_id: text,
      p_physical_table: text,
      p_display_name: text,
      p_dimension: text,
      p_geometry_type: text,
      p_srid: int,
      p_description: text,
      p_attributes: jsonb,
      p_enabled: boolean,
    },
    returns: "value",
  },
  chat_refresh_stats: {
    schema: "public",
    params: {},
    returns: "value",
  },

  // ── Auditoría / catálogo interno ──────────────────────────────────
  chat_audit_start_run: {
    schema: "public",
    params: { p_trigger: text, p_thresholds_version: text },
    returns: "value",
  },
  chat_audit_save_layer: {
    schema: "public",
    params: { p_run: uuid, p_layer: text, p_result: jsonb },
    returns: "value",
  },
  chat_audit_finish_run: {
    schema: "public",
    params: { p_run: uuid, p_status: text, p_error: text, p_keep: int },
    returns: "value",
  },

  // ── Configuración del chat ────────────────────────────────────────
  chat_get_prompt: {
    schema: "public",
    params: { p_id: text },
    returns: "value",
  },
  chat_get_setting: {
    schema: "public",
    params: { p_key: text, p_default: jsonb },
    returns: "value",
  },
  chat_unavailable_data: {
    schema: "public",
    params: {},
    returns: "value",
  },
  chat_log_unanswered: {
    schema: "public",
    params: {
      p_question: text,
      p_context: jsonb,
      p_classification: jsonb,
      p_route: jsonb,
      p_user_role: text,
      p_user_email: text,
      p_session_id: text,
      p_reason: text,
      p_reason_detail: text,
    },
    returns: "value",
  },

  // ── Admin / ingestas (solo backend, nunca el LLM) ─────────────────
  admin_ingest_stats: {
    schema: "public",
    params: {},
    returns: "value",
  },
  admin_list_stations: {
    schema: "public",
    params: { p_comuna: text },
    returns: "value",
  },
  admin_upsert_station: {
    schema: "public",
    params: {
      p_codigo_nacional: text,
      p_nombre_estacion: text,
      p_latitud: numeric,
      p_longitud: numeric,
      p_altitud: numeric,
      p_region: text,
      p_provincia: text,
      p_comuna: text,
      p_tipo_estacion: text,
      p_propietario: text,
      p_estado_operativo: text,
      p_activo: boolean,
    },
    returns: "value",
  },
  admin_list_unanswered: {
    schema: "public",
    params: { p_status: text, p_reason: text, p_limit: int },
    returns: "value",
  },
  admin_resolve_unanswered: {
    schema: "public",
    params: {
      p_id: uuid,
      p_resolution_type: text,
      p_resolution_note: text,
      p_resolved_by: text,
    },
    returns: "value",
  },
  admin_unanswered_stats: {
    schema: "public",
    params: {},
    returns: "value",
  },
  admin_set_prompt: {
    schema: "public",
    params: {
      p_id: text,
      p_content: text,
      p_description: text,
      p_by: text,
    },
    returns: "value",
  },

  // ── Ingestas ─────────────────────────────────────────────────────
  chat_get_endpoint: {
    schema: "public",
    params: { p_endpoint_id: text },
    returns: "value",
  },
  chat_list_endpoints: {
    schema: "public",
    params: { p_source_id: text },
    returns: "value",
  },
  ingest_log_run: {
    schema: "public",
    params: {
      p_source_id: text,
      p_endpoint_id: text,
      p_job_name: text,
      p_status: text,
      p_records_loaded: int,
      p_records_skipped: int,
      p_error_message: text,
      p_metadata: jsonb,
    },
    returns: "value",
  },
  ingest_update_run: {
    schema: "public",
    params: {
      p_run_id: uuid,
      p_status: text,
      p_records_loaded: int,
      p_records_skipped: int,
      p_error_message: text,
      p_metadata: jsonb,
    },
    returns: "value",
  },
  ingest_upsert_value: {
    schema: "public",
    params: {
      p_indicator_id: text,
      p_source_id: text,
      p_entity_id: text,
      p_entity_type: text,
      p_entity_name: text,
      p_period_start: date,
      p_period_end: date,
      p_value: numeric,
      p_unit: text,
      p_scenario: text,
      p_metadata: jsonb,
    },
    returns: "value",
  },
  ingest_bulk_upsert_values: {
    schema: "public",
    params: { p_values: jsonb },
    returns: "value",
  },
  refresh_variable_availability: {
    schema: "public",
    params: {},
    returns: "value",
  },

  // ── Estaciones y clima (API + tools) ─────────────────────────────
  chat_stations_map_data: {
    schema: "public",
    params: { p_variable: text, p_period: text },
    returns: "value",
  },
  chat_stations_map_data_at_date: {
    schema: "public",
    params: { p_variable: text, p_date: date, p_estado: text },
    returns: "value",
  },
  chat_station_details: {
    schema: "public",
    params: { p_codigo_nacional: text },
    returns: "value",
  },
  chat_station_series: {
    schema: "public",
    params: {
      p_codigo: text,
      p_indicator: text,
      p_granularity: text,
      p_year_start: int,
      p_year_end: int,
      p_month: int,
      p_day: int,
    },
    returns: "value",
  },
  chat_station_available_dates: {
    schema: "public",
    params: { p_codigo: text, p_indicator: text },
    returns: "value",
  },
  chat_variable_availability: {
    schema: "public",
    params: { p_variable: text },
    returns: "value",
  },
  chat_variable_available_dates: {
    schema: "public",
    params: { p_variable: text },
    returns: "value",
  },
  chat_historical_stations: {
    schema: "public",
    params: { p_tipo: text },
    returns: "value",
  },
  chat_historical_climate: {
    schema: "public",
    params: {
      p_codigo: text,
      p_indicator: text,
      p_year_start: int,
      p_year_end: int,
    },
    returns: "value",
  },
  chat_list_climate_stations: {
    schema: "public",
    params: { p_estado: text, p_comuna: text },
    returns: "value",
  },
  chat_station_weather: {
    schema: "public",
    params: { p_comuna: text, p_codigo: text },
    returns: "value",
  },
});

/**
 * @param {string} name
 * @returns {RpcSignature}
 */
export function getRpcSignature(name) {
  const signature = RPC_SIGNATURES[name];
  if (!signature) {
    throw new Error(
      `RPC no registrada: "${name}". Agrega la firma en server/db/rpc-signatures.js.`
    );
  }
  return signature;
}

/**
 * Construye la llamada con parámetros nombrados y casts explícitos.
 *
 * @param {string} name
 * @param {Record<string, unknown>} [params]
 * @returns {{sql: string, values: unknown[], signature: RpcSignature}}
 */
export function buildRpcCall(name, params = {}) {
  const signature = getRpcSignature(name);
  const input = params && typeof params === "object" ? params : {};

  const unknown = Object.keys(input).filter(
    (key) => !Object.prototype.hasOwnProperty.call(signature.params, key)
  );
  if (unknown.length > 0) {
    throw new Error(
      `Parámetros no permitidos para ${name}: ${unknown.join(", ")}.`
    );
  }

  const entries = Object.entries(signature.params).filter(
    ([param]) => input[param] !== undefined
  );

  const args = entries.map(
    ([param, type], index) => `${param} => $${index + 1}::${type}`
  );
  const values = entries.map(([param, type]) => {
    const value = input[param];
    // `pg` serializa arrays como arrays de PostgreSQL, no como JSON. Para
    // jsonb hay que enviar el JSON como texto; los objetos ya los serializa,
    // pero homogeneizamos para evitar diferencias.
    if (type === "jsonb" && value !== null && typeof value !== "string") {
      return JSON.stringify(value);
    }
    return value;
  });

  return {
    sql: `SELECT ${signature.schema}.${name}(${args.join(", ")}) AS result`,
    values,
    signature,
  };
}

export function listRpcNames() {
  return Object.keys(RPC_SIGNATURES).sort();
}
