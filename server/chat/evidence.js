/**
 * Compactador de resultados, armado de geojson_layers y paquete de evidencia.
 *
 * Responsabilidades:
 *   - compact(): prepara el resultado de una tool para el LLM.
 *   - buildGeojsonLayersFromCtx(): arma las capas de geojson desde ctx.raw.
 *   - buildEvidence(): calcula advertencias de cobertura y citations.
 */

import { getDB } from "../db/pool.js";
import { detectStyleHint } from "./style-hint.js";
import { detectUnavailable, buildUnavailableNotice } from "./unavailable.js";

const CHAT_GEOJSON_ENABLED = /^(1|true|yes)$/i.test(
  process.env.CHAT_GEOJSON_ENABLED ?? "1"
);

const MAX_GEOJSON_FEATURES = 500;
const COVERAGE_THRESHOLD = 0.95;

const DEBUG = /^(1|true|yes)$/i.test(process.env.ORCHESTRATOR_DEBUG || "");
function dbg(...args) {
  if (DEBUG) console.log("[evidence]", ...args);
}

// ─────────────────────────────────────────────────────────────────
// Compactador
// ─────────────────────────────────────────────────────────────────

export function compact(name, out, ctx) {
  if (!out.ok) return { error: out.error };

  const r = out.result;

  if (r && r.type === "FeatureCollection" && Array.isArray(r.features)) {
    const ref = `fc_${ctx.raw.size + 1}`;
    ctx.raw.set(ref, {
      ...r,
      _layer_id: r._layer_id || null,
    });
    return {
      ref,
      total: r.features.length,
      sample: r.features.slice(0, 15).map((f) => f.properties),
      _hint: "Geometrías guardadas. Se pintan en el mapa, no se analizan acá.",
    };
  }

  if (name === "get_layer_schema" && r && Array.isArray(r.columns)) {
    return {
      layer_id: r.layer_id,
      columns: r.columns.map((c) => ({
        name: c.name,
        type: c.type,
        is_numeric: c.is_numeric === true,
      })),
      _hint:
        "Para ver valores concretos de una columna, usa get_layer_stats.",
    };
  }

  if (name === "get_layer_stats" && r && Array.isArray(r.attributes)) {
    return {
      ...r,
      attributes: r.attributes.map((a) => ({
        attr: a.attr || a.name,
        top_values: Array.isArray(a.top_values) ? a.top_values.slice(0, 5) : [],
      })),
    };
  }

  if (Array.isArray(r)) {
    const ROWS_MAX = 40;
    if (r.length > ROWS_MAX) {
      return {
        rows: r.slice(0, ROWS_MAX),
        rows_total: r.length,
        _hint: `Mostrando ${ROWS_MAX} de ${r.length} filas.`,
      };
    }
    return r;
  }

  if (r && typeof r === "object" && Array.isArray(r.rows)) {
    const ROWS_MAX = 40;
    if (r.rows.length > ROWS_MAX) {
      return {
        ...r,
        rows: r.rows.slice(0, ROWS_MAX),
        rows_total: r.rows.length,
      };
    }
    return r;
  }

  return r;
}

// ─────────────────────────────────────────────────────────────────
// Geojson layers
// ─────────────────────────────────────────────────────────────────

export async function buildGeojsonLayersFromCtx(ctx, userText) {
  if (!CHAT_GEOJSON_ENABLED) return { layers: [], truncated: null };
  if (!ctx.raw || ctx.raw.size === 0) return { layers: [], truncated: null };

  const layers = [];
  const seen = new Set();
  const styleHint = detectStyleHint(userText, ctx);
  let truncatedInfo = null;

  let catalogMap = new Map();
  try {
    const db = await getDB();
    const catalog = (await db.rpc("chat_catalog")) ?? [];
    catalogMap = new Map(
      catalog.map((c) => [c.layer_id, c.display_name || c.layer_id])
    );
  } catch {
    catalogMap = new Map();
  }

  for (const fc of ctx.raw.values()) {
    if (fc?.type !== "FeatureCollection" || !Array.isArray(fc.features)) {
      continue;
    }
    const layerId = fc._layer_id || null;
    if (!layerId || seen.has(layerId)) continue;
    seen.add(layerId);

    const totalCount = fc.total_count || fc.features.length;
    const shown = fc.features.length;

    if (totalCount > shown && !truncatedInfo) {
      truncatedInfo = { total: totalCount, shown, layerId };
    }

    const features = fc.features.slice(0, MAX_GEOJSON_FEATURES);
    layers.push({
      layer_id: layerId,
      layer_label: catalogMap.get(layerId) || layerId,
      geojson: { type: "FeatureCollection", features },
      style_hint: styleHint,
    });
  }

  return { layers, truncated: truncatedInfo };
}

// ─────────────────────────────────────────────────────────────────
// Paquete de evidencia
// ─────────────────────────────────────────────────────────────────

async function getColumnCoverage(layerId) {
  try {
    const db = await getDB();
    const rows = (await db.rpc("chat_column_coverage", { p_layer: layerId })) ?? [];
    const map = new Map();
    for (const r of rows) {
      if (r && typeof r.column === "string") {
        map.set(r.column, {
          coverage: Number(r.coverage) || 0,
          rowCount: Number(r.row_count) || 0,
          nullCount: Number(r.null_count) || 0,
          emptyCount: Number(r.empty_count) || 0,
          suspiciousCount: Number(r.suspicious_count) || 0,
        });
      }
    }
    return map;
  } catch (err) {
    dbg(`getColumnCoverage falló: ${err?.message || err}`);
    return new Map();
  }
}

function detectUsedColumns(userText, catalogAttrs) {
  if (!userText || !Array.isArray(catalogAttrs)) return [];
  const t = String(userText).toLowerCase();
  const used = [];
  for (const attr of catalogAttrs) {
    const name = typeof attr === "string" ? attr : attr?.name;
    if (!name) continue;
    const normalized = String(name).toLowerCase();
    if (t.includes(normalized)) {
      used.push(name);
    }
  }
  return used;
}

export async function buildEvidence(ctx, userText, catalog) {
  const citations = [];
  const coverageWarnings = [];

  if (!ctx || !Array.isArray(ctx.trace)) {
    return { citations, coverageWarnings, unavailable: [] };
  }

  const layerIds = new Set();
  for (const t of ctx.trace) {
    if (!t.ok) continue;
    const lid = t.args?.layer_id;
    if (typeof lid === "string" && lid.length > 0) {
      layerIds.add(lid);
      citations.push({
        layer_id: lid,
        tool: t.tool,
        label: lid,
      });
    }
  }

  const seenCitations = new Set();
  const uniqueCitations = [];
  for (const c of citations) {
    const key = `${c.layer_id}:${c.tool}`;
    if (seenCitations.has(key)) continue;
    seenCitations.add(key);
    uniqueCitations.push(c);
  }

  const catalogMap = new Map();
  if (Array.isArray(catalog)) {
    for (const c of catalog) {
      catalogMap.set(c.layer_id, c.display_name || c.layer_id);
    }
  }
  for (const c of uniqueCitations) {
    c.label = catalogMap.get(c.layer_id) || c.layer_id;
  }

  for (const lid of layerIds) {
    const coverage = await getColumnCoverage(lid);
    if (coverage.size === 0) continue;

    const layerCatalog = catalog.find((c) => c.layer_id === lid);
    const attrs = Array.isArray(layerCatalog?.attributes)
      ? layerCatalog.attributes
      : [];

    const usedColumns = detectUsedColumns(userText, attrs);

    for (const col of usedColumns) {
      const cov = coverage.get(col);
      if (!cov) continue;
      if (cov.coverage < COVERAGE_THRESHOLD && cov.rowCount > 0) {
        const missing = cov.rowCount - Math.round(cov.coverage * cov.rowCount);
        coverageWarnings.push(
          `De los ${cov.rowCount} registros de "${layerCatalog?.display_name || lid}", ` +
            `${missing} no tienen valor en "${col}".`
        );
      }
    }
  }

   // 40-D.2: datos no disponibles en el visor.
  let unavailable = [];
  try {
    unavailable = await detectUnavailable(userText);
  } catch (err) {
    dbg(`detectUnavailable falló: ${err?.message || err}`);
  }

  return { citations: uniqueCitations, coverageWarnings, unavailable };
}

    export { buildUnavailableNotice };