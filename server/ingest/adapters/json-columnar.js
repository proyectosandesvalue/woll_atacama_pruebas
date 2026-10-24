/**
 * Adapter genérico para endpoints JSON en formato columnar.
 *
 * Formato esperado:
 *   {
 *     "index": ["1401", "1403", ...],
 *     "columns": ["NOM_COMUNA", "SCLIMAShot_days$annual$present", ...],
 *     "values": [
 *       ["POZO_ALMONTE", 28.6255, ...],
 *       ["COLCHANE", 0.0, ...]
 *     ]
 *   }
 *
 * Sprint 42-C (2026-10-24).
 */

const DEBUG = /^(1|true|yes)$/i.test(process.env.ORCHESTRATOR_DEBUG || "");
function dbg(...args) {
  if (DEBUG) console.log("[ingest:json-columnar]", ...args);
}

function resolveAuthConfig(authConfig) {
  if (!authConfig || typeof authConfig !== "object") return {};
  const resolved = {};
  for (const [key, value] of Object.entries(authConfig)) {
    if (typeof value === "string" && value.startsWith("$")) {
      resolved[key] = process.env[value.slice(1)] || "";
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

function buildUrl(source, endpoint) {
  const base = (source.url_base || "").replace(/\/$/, "");
  const path = (endpoint.path || "").replace(/^\//, "");
  let url = `${base}/${path}`;

  const auth = resolveAuthConfig(endpoint.auth_config);
  const queryParams = { ...(endpoint.params || {}) };
  if (endpoint.auth_type === "query_params") Object.assign(queryParams, auth);

  const qs = new URLSearchParams(queryParams).toString();
  if (qs) url += `?${qs}`;
  return url;
}

function buildHeaders(endpoint) {
  const headers = { Accept: "application/json" };
  const auth = resolveAuthConfig(endpoint.auth_config);
  if (endpoint.auth_type === "headers") Object.assign(headers, auth);
  else if (endpoint.auth_type === "bearer") headers.Authorization = `Bearer ${auth.token || ""}`;
  return headers;
}

function parseNumeric(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  return Number(match[0].replace(",", "."));
}

export async function runJsonColumnarEndpoint(db, source, endpoint) {
  const url = buildUrl(source, endpoint);
  const headers = buildHeaders(endpoint);

  const SENSITIVE_PARAMS =
    "token|secret|api_key|apikey|api-key|access_token|refresh_token|" +
    "usuario|user|username|login|email|correo|mail|" +
    "password|passwd|pass|pwd|" +
    "auth|authorization|bearer|key|clave";
  const urlForLog = url.replace(
    new RegExp(`([?&](?:${SENSITIVE_PARAMS})=)[^&]+`, "gi"),
    "$1***"
  );

  const res = await fetch(url, { method: endpoint.method, headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const data = await res.json();
  const columns = data.columns || [];
  const values = data.values || [];

  if (!Array.isArray(columns) || !Array.isArray(values)) {
    throw new Error("Formato columnar inválido: faltan 'columns' o 'values'");
  }

  dbg(`Filas: ${values.length}, columnas: ${columns.length}`);

  const entityMapping = endpoint.entity_mapping || {};
  const valueMapping = endpoint.value_mapping || {};

  let loaded = 0;
  let skipped = 0;
  const errors = [];

  for (const row of values) {
    try {
      const record = {};
      for (let i = 0; i < columns.length; i++) {
        record[columns[i]] = row[i];
      }

      const idTemplate = entityMapping.id_template || "{index}";
      const entityId = idTemplate.replace(/\{([^}]+)\}/g, (_, key) => {
        const val = record[key];
        return val != null ? String(val) : "";
      });

      if (!entityId || entityId.endsWith(":")) {
        skipped++;
        continue;
      }

      const entityName = entityMapping.name_field
        ? String(record[entityMapping.name_field] || "")
        : null;

      for (const [key, mapping] of Object.entries(valueMapping)) {
        const colName = mapping.column || mapping.field;
        if (!colName) {
          skipped++;
          continue;
        }

        const rawValue = record[colName];
        const numValue = parseNumeric(rawValue);
        if (numValue === null) {
          skipped++;
          continue;
        }

        const indicatorId = mapping.indicator;
        const unit = mapping.unit || "";
        const scenario = mapping.scenario || null;
        const ps = mapping.period_start;
        const pe = mapping.period_end;

        if (!ps || !pe) {
          skipped++;
          continue;
        }

        await db.rpc("ingest_upsert_value", {
          p_indicator_id: indicatorId,
          p_source_id: source.id,
          p_entity_id: entityId,
          p_entity_type: entityMapping.type || "otro",
          p_entity_name: entityName,
          p_period_start: ps,
          p_period_end: pe,
          p_value: numValue,
          p_unit: unit,
          p_scenario: scenario,
          p_metadata: null,
        });
        loaded++;
      }
    } catch (err) {
      errors.push(`Fila: ${err.message}`);
      skipped++;
    }
  }

  return { loaded, skipped, errors };
}
