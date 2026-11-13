/**
 * Features de una capa desde PostGIS (Sprint 08-B/08-D).
 *
 * `GET /api/layer-features?layer_id=...&limit=&offset=&search=&search_field=&sort=&order=&filter=`
 *
 * Devuelve una FeatureCollection GeoJSON con las propiedades de la tabla
 * física. La usa el visor para la tabla de atributos y los filtros de una capa
 * servida por tiles, sin descargar el GeoJSON estático completo.
 *
 * - `filter`: especificación validada de 08-D (ver `layer-export.js`).
 * - `search`: ILIKE sobre todas las columnas (o `search_field`).
 * - `sort`/`order`: orden server-side con allowlist de columnas.
 * - `total`: conteo del conjunto filtrado (para la tabla).
 * - Sin geometría por defecto (`include_geometry=1` para pedirla).
 */

import { getDB as defaultGetDB } from "../db/pool.js";
import { parseFilter } from "./layer-export.js";

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;
const LAYER_RE = /^[\p{L}\p{N}_-]+$/u;
const MAX_LIMIT = 5000;
const DEFAULT_LIMIT = 500;
const MAX_SEARCH = 200;

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function jsonProperties(columns) {
  if (columns.length === 0) return "'{}'::jsonb";
  return `jsonb_build_object(${columns
    .map((column) => `${quoteLiteral(column)}, t.${quoteIdent(column)}`)
    .join(", ")})`;
}

function pickOrderColumn(columns) {
  for (const candidate of ["fid", "gid", "id"]) {
    if (columns.includes(candidate)) return candidate;
  }
  return null;
}

async function resolveLayer(db, layerId) {
  const catalog = await db.query(
    `SELECT physical_table
       FROM chat.chat_catalog
      WHERE layer_id = $1 AND enabled = true`,
    [layerId]
  );
  if (catalog.length === 0) {
    return { error: { status: 404, body: { error: "Capa no encontrada." } } };
  }

  const physicalTable = String(catalog[0].physical_table || "");
  if (!IDENT_RE.test(physicalTable)) {
    return {
      error: { status: 500, body: { error: "Tabla física inválida en el catálogo." } },
    };
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
    return {
      error: { status: 400, body: { error: "La capa no tiene geometría registrada." } },
    };
  }

  const geomColumn = String(geometry[0].f_geometry_column || "");
  if (!geomColumn) {
    return { error: { status: 500, body: { error: "Columna de geometría inválida." } } };
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

function buildWhere(meta, query) {
  const conditions = [];
  const params = [];

  if (query.filter) {
    let filter;
    try {
      filter = parseFilter(String(query.filter), meta.columns);
    } catch (err) {
      err.status = 400;
      throw err;
    }
    if (filter.where) {
      conditions.push(filter.where.replace(/^WHERE /, ""));
      params.push(...filter.params);
    }
  }

  const search = query.search ? String(query.search).trim() : "";
  if (search) {
    if (search.length > MAX_SEARCH) {
      throw Object.assign(new Error(`search admite hasta ${MAX_SEARCH} caracteres.`), {
        status: 400,
      });
    }
    const field = query.search_field ? String(query.search_field) : "";
    if (field && !meta.columns.includes(field)) {
      throw Object.assign(new Error(`Columna de búsqueda no permitida: ${field}`), {
        status: 400,
      });
    }
    params.push(search);
    if (field) {
      conditions.push(
        `t.${quoteIdent(field)}::text ILIKE '%' || $${params.length}::text || '%'`
      );
    } else {
      const searchable = meta.columns.map(
        (column) =>
          `t.${quoteIdent(column)}::text ILIKE '%' || $${params.length}::text || '%'`
      );
      conditions.push(`(${searchable.join(" OR ")})`);
    }
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

function buildOrder(meta, query) {
  const sort = query.sort ? String(query.sort) : "";
  const order = String(query.order || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";

  if (sort) {
    if (!meta.columns.includes(sort)) {
      throw Object.assign(new Error(`Columna de orden no permitida: ${sort}`), {
        status: 400,
      });
    }
    return `ORDER BY t.${quoteIdent(sort)} ${order}`;
  }

  const idColumn = pickOrderColumn(meta.columns);
  return idColumn ? `ORDER BY t.${quoteIdent(idColumn)}` : "ORDER BY t.ctid";
}

/**
 * @param {Record<string, unknown>} query
 * @param {{getDB?: () => Promise<object>}} [opts]
 */
export async function handleLayerFeatures(query = {}, opts = {}) {
  const { getDB = defaultGetDB } = opts;
  const layerId = query.layer_id ? String(query.layer_id) : "";

  if (!layerId) {
    return { status: 400, body: { error: "Falta layer_id." } };
  }
  if (!LAYER_RE.test(layerId)) {
    return { status: 400, body: { error: "layer_id inválido." } };
  }

  const limit = Math.min(
    Math.max(parseInteger(query.limit, DEFAULT_LIMIT), 1),
    MAX_LIMIT
  );
  const offset = Math.max(parseInteger(query.offset, 0), 0);
  // La tabla, los filtros y el CSV solo necesitan propiedades. La geometría
  // se pide explícitamente (`include_geometry=1`) para no transferir 30 MB.
  const includeGeometry =
    query.include_geometry === "1" || query.include_geometry === "true";

  try {
    const db = await getDB();
    const meta = await resolveLayer(db, layerId);
    if (meta.error) return meta.error;

    const { where, params } = buildWhere(meta, query);
    const order = buildOrder(meta, query);
    const table = `${quoteIdent(meta.schema)}.${quoteIdent(meta.table)}`;

    const countRows = await db.query(
      `SELECT count(*)::bigint AS n FROM ${table} t ${where}`,
      params
    );
    const total = Number(countRows[0]?.n || 0);

    const dataParams = [...params, limit, offset];
    const sql = `
      SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', coalesce(jsonb_agg(
          jsonb_build_object(
            'type', 'Feature',
            'geometry', ${
              includeGeometry
                ? `ST_AsGeoJSON(t.${quoteIdent(meta.geomColumn)})::jsonb`
                : "NULL::jsonb"
            },
            'properties', ${jsonProperties(meta.columns)}
          )
        ), '[]'::jsonb)
      ) AS collection
      FROM (
        SELECT *
          FROM ${table} t
          ${where}
          ${order}
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      ) t`;

    const result = await db.query(sql, dataParams);
    const collection = result[0]?.collection || {
      type: "FeatureCollection",
      features: [],
    };

    return {
      status: 200,
      body: {
        ...collection,
        layer_id: layerId,
        total,
        limit,
        offset,
        include_geometry: includeGeometry,
        returned: collection.features.length,
        sort: query.sort ? String(query.sort) : null,
        order: query.sort ? String(query.order || "asc") : null,
      },
    };
  } catch (err) {
    const status = err?.status || 500;
    if (status >= 500) console.error("[layer-features] Error:", err?.message || err);
    return { status, body: { error: status >= 500 ? "Error interno" : err.message } };
  }
}

/**
 * Feature puntual con geometría (08-D). La usa la tabla para zoom/highlight.
 *
 * `GET /api/layer-feature?layer_id=...&id=...&id_column=fid`
 *
 * @param {Record<string, unknown>} query
 * @param {{getDB?: () => Promise<object>}} [opts]
 */
export async function handleLayerFeature(query = {}, opts = {}) {
  const { getDB = defaultGetDB } = opts;
  const layerId = query.layer_id ? String(query.layer_id) : "";
  const rawId = query.id;

  if (!layerId || !LAYER_RE.test(layerId)) {
    return { status: 400, body: { error: "layer_id inválido o faltante." } };
  }
  if (rawId === undefined || rawId === null || rawId === "") {
    return { status: 400, body: { error: "Falta id." } };
  }

  try {
    const db = await getDB();
    const meta = await resolveLayer(db, layerId);
    if (meta.error) return meta.error;

    const idColumn = query.id_column
      ? String(query.id_column)
      : pickOrderColumn(meta.columns);
    if (!idColumn || !meta.columns.includes(idColumn)) {
      return { status: 400, body: { error: "Columna de id no permitida." } };
    }

    const table = `${quoteIdent(meta.schema)}.${quoteIdent(meta.table)}`;
    const rows = await db.query(
      `SELECT jsonb_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(t.${quoteIdent(meta.geomColumn)})::jsonb,
                'properties', ${jsonProperties(meta.columns)}
              ) AS feature
         FROM ${table} t
        WHERE t.${quoteIdent(idColumn)}::text = $1::text
        LIMIT 1`,
      [String(rawId)]
    );

    if (rows.length === 0) {
      return { status: 404, body: { error: "Feature no encontrado." } };
    }
    return { status: 200, body: rows[0].feature };
  } catch (err) {
    const status = err?.status || 500;
    if (status >= 500) console.error("[layer-feature] Error:", err?.message || err);
    return { status, body: { error: status >= 500 ? "Error interno" : err.message } };
  }
}
