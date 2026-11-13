/**
 * Exportación GeoJSON/CSV de una capa desde PostGIS (Sprint 08-E).
 *
 * `GET /api/layer-export?layer_id=...&format=geojson|csv&filter=...`
 *
 * - Lee por lotes y escribe la respuesta en streaming (no arma 30 MB en memoria).
 * - Aplica el mismo filtro validado que la tabla (`dataFilter` del visor).
 * - GeoJSON incluye geometría; CSV exporta solo las columnas pedidas.
 * - El filtro se valida contra las columnas reales de la tabla y se parametriza.
 */

import { Readable } from "node:stream";

import { getDB as defaultGetDB } from "../db/pool.js";

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;
const LAYER_RE = /^[\p{L}\p{N}_-]+$/u;
const GEOJSON_BATCH_SIZE = 40;
const CSV_BATCH_SIZE = 200;
const MAX_CONDITIONS = 20;
const MAX_COLUMNS = 100;
const ALLOWED_OPERATORS = new Set(["=", "!=", ">", ">=", "<", "<=", "in", "contains"]);

export function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

export function quoteLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Compila un filtro `{ op:"and", conditions:[...] }` a SQL parametrizado.
 * @param {string|undefined} raw
 * @param {string[]} columns
 * @returns {{where: string, params: unknown[]}}
 */
export function parseFilter(raw, columns) {
  if (!raw) return { where: "", params: [] };

  let spec;
  try {
    spec = JSON.parse(String(raw));
  } catch {
    throw new Error("filter no es JSON válido.");
  }

  if (!spec || spec.op !== "and" || !Array.isArray(spec.conditions)) {
    throw new Error("filter debe ser { op: 'and', conditions: [] }.");
  }
  if (spec.conditions.length > MAX_CONDITIONS) {
    throw new Error(`filter admite hasta ${MAX_CONDITIONS} condiciones.`);
  }

  const allowed = new Set(columns);
  const params = [];
  const clauses = [];

  for (const condition of spec.conditions) {
    const column = String(condition?.column || "");
    const operator = String(condition?.operator || "");
    if (!allowed.has(column)) {
      throw new Error(`Columna no permitida: ${column}`);
    }
    if (!ALLOWED_OPERATORS.has(operator)) {
      throw new Error(`Operador no permitido: ${operator}`);
    }

    const quoted = quoteIdent(column);
    if (operator === "in") {
      if (!Array.isArray(condition.value)) {
        throw new Error(`'in' requiere un array en ${column}.`);
      }
      params.push(condition.value.map((value) => String(value)));
      clauses.push(`${quoted}::text = ANY($${params.length}::text[])`);
    } else if (operator === "contains") {
      params.push(String(condition.value ?? ""));
      clauses.push(`${quoted}::text ILIKE '%' || $${params.length}::text || '%'`);
    } else if ([">", ">=", "<", "<="].includes(operator)) {
      const value = Number(condition.value);
      if (!Number.isFinite(value)) {
        throw new Error(`'${operator}' requiere un valor numérico en ${column}.`);
      }
      params.push(value);
      clauses.push(`${quoted}::numeric ${operator} $${params.length}::numeric`);
    } else {
      params.push(String(condition.value ?? ""));
      clauses.push(`${quoted}::text ${operator} $${params.length}::text`);
    }
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

/**
 * Normaliza las columnas a exportar y sus encabezados.
 * @param {string|undefined} rawColumns JSON array o lista separada por comas.
 * @param {string|undefined} rawLabels JSON array.
 * @param {string[]} available
 * @returns {{columns: string[], labels: string[]}}
 */
export function parseColumns(rawColumns, rawLabels, available) {
  const allowed = new Set(available);
  let columns = available;

  if (rawColumns) {
    let parsed;
    try {
      parsed = rawColumns.trim().startsWith("[")
        ? JSON.parse(rawColumns)
        : rawColumns.split(",").map((value) => value.trim());
    } catch {
      throw new Error("columns no es válido.");
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("columns debe ser un array no vacío.");
    }
    if (parsed.length > MAX_COLUMNS) {
      throw new Error(`columns admite hasta ${MAX_COLUMNS} columnas.`);
    }
    columns = parsed.map((value) => String(value));
  }

  for (const column of columns) {
    if (!allowed.has(column)) {
      throw new Error(`Columna no permitida: ${column}`);
    }
  }

  let labels = columns;
  if (rawLabels) {
    let parsed;
    try {
      parsed = JSON.parse(rawLabels);
    } catch {
      throw new Error("labels no es válido.");
    }
    if (!Array.isArray(parsed) || parsed.length !== columns.length) {
      throw new Error("labels debe tener el mismo largo que columns.");
    }
    labels = parsed.map((value) => String(value));
  }

  return { columns, labels };
}

export function escapeCSV(value) {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/\r/g, "").replace(/\n/g, " ");
  return `"${str.replace(/"/g, '""')}"`;
}

export function pickOrderColumn(columns) {
  for (const candidate of ["fid", "gid", "id"]) {
    if (columns.includes(candidate)) return candidate;
  }
  return null;
}

export async function resolveLayer(db, layerId) {
  const catalog = await db.query(
    `SELECT physical_table
       FROM chat.chat_catalog
      WHERE layer_id = $1 AND enabled = true`,
    [layerId]
  );
  if (catalog.length === 0) throw Object.assign(new Error("Capa no encontrada."), { status: 404 });

  const physicalTable = String(catalog[0].physical_table || "");
  if (!IDENT_RE.test(physicalTable)) {
    throw Object.assign(new Error("Tabla física inválida en el catálogo."), { status: 500 });
  }

  const [schema, table] = physicalTable.includes(".")
    ? physicalTable.split(".")
    : ["public", physicalTable];

  const geometry = await db.query(
    `SELECT f_geometry_column
       FROM geometry_columns
      WHERE f_table_schema = $1 AND f_table_name = $2
      LIMIT 1`,
    [schema, table]
  );
  if (geometry.length === 0) {
    throw Object.assign(new Error("La capa no tiene geometría registrada."), { status: 400 });
  }

  const geomColumn = String(geometry[0].f_geometry_column || "");
  if (!geomColumn) {
    throw Object.assign(new Error("Columna de geometría inválida."), { status: 500 });
  }

  const columnRows = await db.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
        AND column_name <> $3
      ORDER BY ordinal_position`,
    [schema, table, geomColumn]
  );

  return {
    schema,
    table,
    geomColumn,
    columns: columnRows.map((row) => row.column_name),
  };
}

function geojsonBatches(db, meta, filter) {
  const orderColumn = pickOrderColumn(meta.columns);
  const order = orderColumn ? `ORDER BY t.${quoteIdent(orderColumn)}` : "ORDER BY t.ctid";
  const table = `${quoteIdent(meta.schema)}.${quoteIdent(meta.table)}`;

  return async function* generate() {
    yield '{"type":"FeatureCollection","features":[';
    let first = true;
    let offset = 0;

    for (;;) {
      const params = [...filter.params, GEOJSON_BATCH_SIZE, offset];
      const rows = await db.query(
        `SELECT jsonb_build_object(
                  'type', 'Feature',
                  'geometry', ST_AsGeoJSON(t.${quoteIdent(meta.geomColumn)})::jsonb,
                  'properties', to_jsonb(t) - ${quoteLiteral(meta.geomColumn)}
                ) AS feature
           FROM ${table} t
           ${filter.where}
           ${order}
          LIMIT $${filter.params.length + 1} OFFSET $${filter.params.length + 2}`,
        params
      );

      for (const row of rows) {
        if (!first) yield ",";
        yield JSON.stringify(row.feature);
        first = false;
      }

      offset += rows.length;
      if (rows.length < GEOJSON_BATCH_SIZE) break;
    }

    yield "]}";
  };
}

function csvBatches(db, meta, filter, columns, labels) {
  const orderColumn = pickOrderColumn(meta.columns);
  const order = orderColumn ? `ORDER BY t.${quoteIdent(orderColumn)}` : "ORDER BY t.ctid";
  const table = `${quoteIdent(meta.schema)}.${quoteIdent(meta.table)}`;
  const select = columns.map((column) => `t.${quoteIdent(column)}`).join(", ");

  return async function* generate() {
    yield "\uFEFF" + labels.map(escapeCSV).join(";") + "\r\n";
    let offset = 0;

    for (;;) {
      const params = [...filter.params, CSV_BATCH_SIZE, offset];
      const rows = await db.query(
        `SELECT ${select}
           FROM ${table} t
           ${filter.where}
           ${order}
          LIMIT $${filter.params.length + 1} OFFSET $${filter.params.length + 2}`,
        params
      );

      for (const row of rows) {
        yield columns.map((column) => escapeCSV(row[column])).join(";") + "\r\n";
      }

      offset += rows.length;
      if (rows.length < CSV_BATCH_SIZE) break;
    }
  };
}

/**
 * @param {Record<string, unknown>} query
 * @param {{getDB?: () => Promise<object>}} [opts]
 */
export async function handleLayerExport(query = {}, opts = {}) {
  const { getDB = defaultGetDB } = opts;
  const layerId = query.layer_id ? String(query.layer_id) : "";
  if (!layerId || !LAYER_RE.test(layerId)) {
    return { status: 400, body: { error: "layer_id inválido o faltante." } };
  }

  const format = query.format === "csv" ? "csv" : "geojson";

  try {
    const db = await getDB();
    const meta = await resolveLayer(db, layerId);
    const filter = parseFilter(query.filter, meta.columns);
    const { columns, labels } = parseColumns(
      query.columns,
      query.labels,
      meta.columns
    );

    const stream =
      format === "csv"
        ? Readable.from(csvBatches(db, meta, filter, columns, labels)())
        : Readable.from(geojsonBatches(db, meta, filter)());

    return {
      status: 200,
      stream,
      headers: {
        "Content-Type":
          format === "csv"
            ? "text/csv; charset=utf-8"
            : "application/geo+json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${layerId}.${
          format === "csv" ? "csv" : "geojson"
        }"`,
        "Cache-Control": "no-store",
      },
    };
  } catch (err) {
    const status = err?.status || 400;
    if (status >= 500) console.error("[layer-export] Error:", err?.message || err);
    return { status, body: { error: err?.message || "Error interno" } };
  }
}
