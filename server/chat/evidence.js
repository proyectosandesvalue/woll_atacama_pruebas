/**
 * Compactador de resultados y armado de geojson_layers.
 *
 * Responsabilidades:
 *   - compact(): prepara el resultado de una tool para el LLM.
 *   - buildGeojsonLayersFromCtx(): arma las capas de geojson desde ctx.raw.
 */

import { getDB } from "../db/pool.js";
import { detectStyleHint } from "./style-hint.js";

const CHAT_GEOJSON_ENABLED = /^(1|true|yes)$/i.test(
  process.env.CHAT_GEOJSON_ENABLED ?? "1"
);

const MAX_GEOJSON_FEATURES = 500;

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