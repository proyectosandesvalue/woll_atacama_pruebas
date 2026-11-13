/**
 * Features de una capa desde PostGIS (Sprint 08-B/08-D, versión mínima).
 *
 * `GET /api/layer-features?layer_id=...&limit=&offset=`
 *
 * Devuelve una FeatureCollection GeoJSON con las propiedades de la tabla
 * física. La usa el visor para la tabla de atributos y los filtros de una capa
 * servida por tiles, sin descargar el GeoJSON estático completo.
 *
 * Limitaciones del piloto 08-B:
 *  - Sin búsqueda, orden ni filtros server-side (se agregan en 08-D).
 *  - Máximo 1.000 features por request; las capas más grandes se paginan en 08-D.
 *  - Solo lectura sobre tablas del catálogo habilitadas.
 */

import { getDB as defaultGetDB } from "../db/pool.js";

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;
const LAYER_RE = /^[\p{L}\p{N}_-]+$/u;
const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 500;

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
    const catalog = await db.query(
      `SELECT physical_table
         FROM chat.chat_catalog
        WHERE layer_id = $1 AND enabled = true`,
      [layerId]
    );

    if (catalog.length === 0) {
      return { status: 404, body: { error: "Capa no encontrada." } };
    }

    const physicalTable = String(catalog[0].physical_table || "");
    if (!IDENT_RE.test(physicalTable)) {
      return { status: 500, body: { error: "Tabla física inválida en el catálogo." } };
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
      return { status: 400, body: { error: "La capa no tiene geometría registrada." } };
    }

    const geomColumn = String(geometry[0].f_geometry_column || "");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(geomColumn)) {
      return { status: 500, body: { error: "Columna de geometría inválida." } };
    }

    const sql = `
      SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', coalesce(jsonb_agg(
          jsonb_build_object(
            'type', 'Feature',
            'geometry', ${
              includeGeometry
                ? `ST_AsGeoJSON(t.${quoteIdent(geomColumn)})::jsonb`
                : "NULL::jsonb"
            },
            'properties', to_jsonb(t) - ${quoteLiteral(geomColumn)}
          )
        ), '[]'::jsonb)
      ) AS collection
      FROM (
        SELECT *
          FROM ${quoteIdent(schema)}.${quoteIdent(table)}
         LIMIT $1 OFFSET $2
      ) t`;

    const result = await db.query(sql, [limit, offset]);
    const collection = result[0]?.collection || {
      type: "FeatureCollection",
      features: [],
    };

    return {
      status: 200,
      body: {
        ...collection,
        layer_id: layerId,
        limit,
        offset,
        include_geometry: includeGeometry,
        returned: collection.features.length,
      },
    };
  } catch (err) {
    console.error("[layer-features] Error:", err?.message || err);
    return { status: 500, body: { error: "Error interno" } };
  }
}
