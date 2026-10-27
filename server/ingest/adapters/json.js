/**
 * Este es el Motor. Adapter genérico para endpoints JSON.
 *
 * Lee la config de ingest.endpoints, hace la request HTTP, extrae
 * los registros del JSON, y hace UPSERT en ingest.indicator_values.
 *
 * Soporta:
 *   - JSONPath simple: '$.datosEstaciones[*]', '$.data', '$'
 *   - Mapping de campos: 'estacion.codigoNacional', 'datos[0].temperatura'
 *   - Auth: none, query_params, headers, bearer
 *
 * Sprint 42-B (2026-10-24).
 */

const DEBUG = /^(1|true|yes)$/i.test(process.env.ORCHESTRATOR_DEBUG || "");
function dbg(...args) {
  if (DEBUG) console.log("[ingest:json]", ...args);
}

/**
 * Resuelve un path simple en un objeto.
 * Soporta: 'a.b.c', 'a[0].b', 'a[*]', '$' (raíz).
 *
 * @param {object} obj
 * @param {string} path
 * @returns {any}
 */
function resolvePath(obj, path) {
  if (!path || path === "$" || path === "") return obj;

  // Quitar el prefijo '$.'
  let p = path.startsWith("$.") ? path.slice(2) : path;

  // Si termina en [*], devolver el array directamente
  const isArrayWildcard = p.endsWith("[*]");
  if (isArrayWildcard) p = p.slice(0, -3);

  const parts = p.split(".").filter(Boolean);
  let current = obj;

  for (const part of parts) {
    if (current == null) return isArrayWildcard ? [] : undefined;

    // Soportar 'key[0]' o 'key[*]' o 'key'
    const match = part.match(/^([^\[]+)(\[(\d+|\*)\])?$/);
    if (!match) return isArrayWildcard ? [] : undefined;

    const key = match[1];
    const indexRaw = match[3];

    current = current[key];

    if (indexRaw !== undefined) {
      if (current == null || !Array.isArray(current)) return isArrayWildcard ? [] : undefined;
      if (indexRaw === "*") {
        // Devolver el array completo (el caller lo maneja)
        continue;
      }
      current = current[Number(indexRaw)];
    }
  }

  if (isArrayWildcard) {
    return Array.isArray(current) ? current : [];
  }
  return current;
}

/**
 * Resuelve el auth_config, reemplazando $ENV_VAR por el valor del env.
 */
function resolveAuthConfig(authConfig) {
  if (!authConfig || typeof authConfig !== "object") return {};
  const resolved = {};
  for (const [key, value] of Object.entries(authConfig)) {
    if (typeof value === "string" && value.startsWith("$")) {
      const envVar = value.slice(1);
      resolved[key] = process.env[envVar] || "";
      if (!resolved[key]) {
        dbg(`Advertencia: env var ${envVar} no configurada`);
      }
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

/**
 * Construye la URL completa del endpoint.
 */
function buildUrl(source, endpoint) {
  const base = (source.url_base || "").replace(/\/$/, "");
  const path = (endpoint.path || "").replace(/^\//, "");
  let url = `${base}/${path}`;

  // Auth por query params
  const auth = resolveAuthConfig(endpoint.auth_config);
  const queryParams = { ...(endpoint.params || {}) };

  if (endpoint.auth_type === "query_params") {
    Object.assign(queryParams, auth);
  }

  const qs = new URLSearchParams(queryParams).toString();
  if (qs) url += `?${qs}`;

  return url;
}

/**
 * Construye los headers del request.
 */
function buildHeaders(endpoint) {
  const headers = { Accept: "application/json" };
  const auth = resolveAuthConfig(endpoint.auth_config);

  if (endpoint.auth_type === "headers") {
    Object.assign(headers, auth);
  } else if (endpoint.auth_type === "bearer") {
    headers.Authorization = `Bearer ${auth.token || ""}`;
  }

  return headers;
}

/**
 * Parsea un valor numérico, tolerando strings con unidades.
 * Ej: '20.2 °C' → 20.2, '1011.6 hPas' → 1011.6, '0.0 mm' → 0.0
 */
function parseNumeric(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;

  const match = value.trim().match(/^-?\d+(?:[.,]\d+)?/);
  if (!match) return null;

  // Quitar coma decimal (Chile usa coma en algunos casos)
  const cleaned = match[0].replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parsea una fecha en el formato indicado.
 * Soporta: 'YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD', 'DD-MM-YYYY'
 */
function parseDate(value, format) {
  if (!value) return null;
  let s = String(value).trim();
  
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    s = s.replace(" ", "T") + "Z";
  }
  
  const direct = new Date(s);
  if (!isNaN(direct.getTime())) {
    return direct.toISOString();
  }
  
  if (format === "DD-MM-YYYY") {
    const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
    if (m) {
      return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T00:00:00.000Z`;
    }
  }
  return null;
}

/**
 * Ejecuta un endpoint JSON y hace UPSERT en indicator_values.
 *
 * @param {object} db - DB pool.
 * @param {object} source - Fila de ingest.sources.
 * @param {object} endpoint - Fila de ingest.endpoints.
 * @returns {Promise<{loaded: number, skipped: number, errors: string[]}>}
 */
export async function runJsonEndpoint(db, source, endpoint) {
  const url = buildUrl(source, endpoint);
  const headers = buildHeaders(endpoint);

  // Pre-cargar el set de estaciones permitidas si el filtro está activo.
  let allowedEntities = null;
  if (endpoint.entity_filter === "stations_only") {
    try {
      const stations = await db.rpc("admin_list_stations", { p_comuna: null });
      allowedEntities = new Set(
        (stations || []).map((s) => `estacion:${s.codigo_nacional}`)
      );
      dbg(`Filtro activo: ${allowedEntities.size} estaciones permitidas`);
    } catch (err) {
      dbg(`Error al cargar estaciones permitidas: ${err?.message}. Se omite el filtro.`);
    }
  }


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

  // Extraer el array de registros
    // Extraer el array de registros
  let records = resolvePath(data, endpoint.json_path);

  // Si el json_path devuelve un objeto (no un array), iterar como
  // {key: value} y enriquecer cada registro con `_key` (el key).
  // Ej: MeteoChile `getEmaResumenDiario` devuelve
  // `{estaciones: {"180005": {...}, "180017": {...}}}`.
  if (records && typeof records === "object" && !Array.isArray(records)) {
    records = Object.entries(records).map(([key, value]) => {
      if (value && typeof value === "object") {
        return { ...value, _key: key };
      }
      return { _key: key, _value: value };
    });
    dbg(`json_path "${endpoint.json_path}" era un objeto, convertido a ${records.length} registros`);
  }

  if (!Array.isArray(records)) {
    throw new Error(`json_path "${endpoint.json_path}" no devolvió un array ni un objeto iterable`);
  }

  dbg(`Registros: ${records.length}`);

  const entityMapping = endpoint.entity_mapping || {};
  const periodMapping = endpoint.period_mapping || {};
  const valueMapping = endpoint.value_mapping || {};

  let loaded = 0;
  let skipped = 0;
  const errors = [];

  for (const record of records) {
    try {
      // Construir entity_id
      const idTemplate = entityMapping.id_template || "{index}";
      const entityId = idTemplate.replace(/\{([^}]+)\}/g, (_, path) => {
        const val = resolvePath(record, path);
        return val != null ? String(val) : "";
      });

        if (!entityId || entityId.endsWith(":")) {
        skipped++;
        continue;
      }

      // Filtro por estación (si está activo).
      if (allowedEntities && !allowedEntities.has(entityId)) {
        skipped++;
        continue;
      }

      const entityName = entityMapping.name_field
        ? String(resolvePath(record, entityMapping.name_field) || "")
        : null;

      // Construir período
      let periodStart, periodEnd;
      if (periodMapping.format === "static") {
        periodStart = null;
        periodEnd = null;
      } else {
        const rawStart = resolvePath(record, periodMapping.start_field);
        const rawEnd = resolvePath(record, periodMapping.end_field);

        periodStart = parseDate(rawStart, periodMapping.format);
        periodEnd = parseDate(rawEnd, periodMapping.format);
      }

      // Procesar cada valor mapeado
      for (const [key, mapping] of Object.entries(valueMapping)) {
        const rawValue = resolvePath(record, mapping.field);
        const numValue = parseNumeric(rawValue);

        if (numValue === null) {
          skipped++;
          continue;
        }

        const indicatorId = mapping.indicator;
        const unit = mapping.unit || "";
        const scenario = mapping.scenario || null;

        // Para períodos estáticos, usar los del mapping
        const ps = periodMapping.format === "static"
          ? mapping.period_start
          : periodStart;
        const pe = periodMapping.format === "static"
          ? mapping.period_end
          : periodEnd;

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
      errors.push(`Registro: ${err.message}`);
      skipped++;
    }
  }

  return { loaded, skipped, errors };
}