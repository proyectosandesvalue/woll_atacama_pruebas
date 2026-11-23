/**
 * Taxonomía nativa (Sprint 46-C).
 *
 * `GET /api/taxonomy` compila las tablas normalizadas (`admin.dimensions`,
 * `groups`, `subgroups`, `layers`, `placements`, `dimension_initial_items`) al
 * mismo shape de `allTemasConfig` que consume el sidebar. No escribe nada.
 *
 * Feature flag: `TAXONOMY_API_ENABLED=1`. Sin el flag devuelve 404 para que el
 * cliente caiga a `/api/config`. La config compilada se valida antes de servir.
 */

import { getDB as defaultGetDB } from "../db/pool.js";
import { checksum } from "../../scripts/config-snapshot.mjs";
import { compileConfigFromRows } from "../../scripts/taxonomy-compile.mjs";
import { validarConfiguracionGlobal } from "../../js/utils/configValidator.js";

const MAX_AGE_SECONDS = 60;

function enabled(env) {
  return String(env?.TAXONOMY_API_ENABLED || "0") === "1";
}

function baseHeaders() {
  return {
    "Cache-Control": `public, max-age=${MAX_AGE_SECONDS}`,
    Vary: "Accept-Encoding",
  };
}

function unavailable(message) {
  return {
    status: 503,
    body: { error: message },
    headers: {
      ...baseHeaders(),
      "Cache-Control": "no-store",
      "Retry-After": "30",
    },
  };
}

/**
 * @param {{ env?: NodeJS.ProcessEnv, req?: import("node:http").IncomingMessage }} ctx
 * @param {{ getDB?: () => Promise<object> }} [opts]
 */
export async function handleTaxonomy(ctx, { getDB = defaultGetDB } = {}) {
  const headers = baseHeaders();

  if (!enabled(ctx.env)) {
    return {
      status: 404,
      body: { error: "Taxonomía no habilitada." },
      headers: { ...headers, "Cache-Control": "no-store" },
    };
  }

  let rows;
  try {
    const db = await getDB();
    const [dimensions, groups, subgroups, layers, placements, initial] =
      await Promise.all([
        db.query(
          "SELECT id, key, nombre, icono, extra, orden FROM admin.dimensions WHERE activo ORDER BY orden, key"
        ),
        db.query(
          `SELECT g.id, g.key, g.nombre, g.extra, g.orden, d.key AS dimension_key
             FROM admin.groups g
             JOIN admin.dimensions d ON d.id = g.dimension_id
            WHERE g.activo AND d.activo
            ORDER BY g.orden, g.key`
        ),
        db.query(
          `SELECT s.id, s.key, s.nombre, s.extra, s.orden, g.key AS group_key,
                  d.key AS dimension_key
             FROM admin.subgroups s
             JOIN admin.groups g ON g.id = s.group_id
             JOIN admin.dimensions d ON d.id = g.dimension_id
            WHERE s.activo AND g.activo AND d.activo
            ORDER BY s.orden, s.key`
        ),
        db.query(
          "SELECT id, layer_key, nombre, tipo, source_type, has_tiles, config FROM admin.layers WHERE activo"
        ),
        db.query(
          `SELECT p.id, p.scope, p.config, p.orden, p.layer_id,
                  l.layer_key, d.key AS dimension_key,
                  g.key AS group_key, s.key AS subgroup_key
             FROM admin.layer_placements p
             JOIN admin.layers l ON l.id = p.layer_id
             JOIN admin.dimensions d ON d.id = p.dimension_id
             LEFT JOIN admin.groups g ON g.id = p.group_id
             LEFT JOIN admin.subgroups s ON s.id = p.subgroup_id
            WHERE p.activo AND l.activo AND d.activo
            ORDER BY p.orden, p.id`
        ),
        db.query(
          `SELECT i.id, i.kind, i.orden, d.key AS dimension_key,
                  g.key AS group_key, l.layer_key
             FROM admin.dimension_initial_items i
             JOIN admin.dimensions d ON d.id = i.dimension_id
             LEFT JOIN admin.groups g ON g.id = i.group_id
             LEFT JOIN admin.layers l ON l.id = i.layer_id
            WHERE d.activo
            ORDER BY i.orden, i.id`
        ),
      ]);
    rows = { dimensions, groups, subgroups, layers, placements, initial };
  } catch (err) {
    console.error("[taxonomy] no se pudieron leer las tablas:", err?.message || err);
    return unavailable("Taxonomía no disponible.");
  }

  const { config, warnings } = compileConfigFromRows(rows);
  const validation = validarConfiguracionGlobal(config);
  if (validation.errores > 0) {
    console.error(`[taxonomy] configuración inválida: ${validation.errores} error(es).`);
    return unavailable("Taxonomía no disponible.");
  }

  const hash = checksum(config);
  const etag = `"taxonomy-${hash}"`;
  const ifNoneMatch = String(ctx.req?.headers?.["if-none-match"] || "");
  if (
    ifNoneMatch
      .split(",")
      .map((tag) => tag.trim())
      .includes(etag)
  ) {
    return { status: 304, headers: { ...headers, ETag: etag } };
  }

  return {
    status: 200,
    headers: { ...headers, ETag: etag },
    body: {
      source: "taxonomy",
      generated_at: new Date().toISOString(),
      checksum: hash,
      warnings,
      config,
    },
  };
}
