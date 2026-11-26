/**
 * Post-procesamiento determinístico.
 *
 * Si el usuario pidió "por comuna + elementos" o "listado + pintado",
 * y el LLM no llamó a get_layer_features, lo forzamos.
 */

import { getCatalog } from "./catalog.js";
import { runTool } from "./runners.js";
import { retrieveLayers } from "./layer-retrieval.js";

const DEBUG = /^(1|true|yes)$/i.test(process.env.ORCHESTRATOR_DEBUG || "");
function dbg(...args) {
  if (DEBUG) console.log("[post-process]", ...args);
}

const MAX_GEOJSON_LAYERS = 4;

// Capas auxiliares que no deben agregarse por una mención genérica
// ("por comuna", "límites"). El mapa ya pinta los límites comunales.
const RETRIEVAL_EXCLUDE = new Set([
  "comunas_poligonos",
  "limite_comunal_linea",
]);

/**
 * Capas nombradas en la traza de tools, en orden y sin duplicados.
 * Incluye layer_id, layer_id_source y layer_id_targets.
 *
 * @param {{trace?: Array<object>}} ctx
 * @returns {string[]}
 */
export function collectTraceLayerIds(ctx) {
  const ids = [];
  const seen = new Set();

  const add = (value) => {
    if (typeof value !== "string") return;
    const id = value.trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };

  for (const entry of ctx?.trace || []) {
    if (!entry?.ok) continue;
    const args =
      entry.args && typeof entry.args === "object" ? entry.args : {};
    add(args.layer_id);
    add(args.layer_id_source);
    if (Array.isArray(args.layer_id_targets)) {
      for (const target of args.layer_id_targets) add(target);
    } else if (typeof args.layer_id_targets === "string") {
      for (const target of args.layer_id_targets.split(",")) add(target);
    }
  }

  return ids;
}

/**
 * Capas nombradas explícitamente en la pregunta, según el catálogo.
 * Excluye las capas auxiliares de límites y solo acepta coincidencias
 * fuertes con el nombre visible (score >= 3).
 *
 * @param {string} userText
 * @param {Array<object>} catalog
 * @returns {string[]}
 */
export function collectRequestedLayerIds(userText, catalog) {
  const retrievalText = String(userText || "").replace(
    /\bpor\s+(comuna|comunas|provincia|provincias|regi[oó]n|regiones)\b/gi,
    " "
  );
  const { layers } = retrieveLayers(retrievalText, catalog, 6);
  return layers
    .filter(
      (item) =>
        item.score >= 3 && !RETRIEVAL_EXCLUDE.has(item.layer_id)
    )
    .map((item) => item.layer_id);
}

export function shouldFetchFeatures(userText, ctx) {
  if (!userText || typeof userText !== "string") return false;

  if (ctx && ctx.lastColorBy) return true;

  const t = userText.toLowerCase();

  if (/\bmu[eé]strame\b|\bd[oó]nde\s+est[aá]n\b|\bubicaci[oó]n\s+de\b|\ben\s+el\s+mapa\b/.test(t)) {
    return true;
  }

  if (/\bpor\s+(tipo|clasificaci[oó]n|uso|estado|categor[ií]a|naturaleza|fuente)\b/.test(t)) {
    return true;
  }

  if (/\bpor\s+(comuna|provincia|regi[oó]n)\b/.test(t)) {
    if (ctx && (ctx.lastAggregateLayerId || ctx.lastQueryLayerId)) {
      return true;
    }
  }

  return false;
}

export async function maybeFetchFeaturesForStyle(ctx, userText) {
  const shouldFetch = shouldFetchFeatures(userText, ctx);
  if (!shouldFetch) return;

  let layerIds = collectTraceLayerIds(ctx);

  // Complementa con las capas nombradas en la pregunta. Así no depende
  // de que el LLM haya consultado todas las capas pedidas.
  try {
    const catalog = await getCatalog();
    for (const layerId of collectRequestedLayerIds(userText, catalog)) {
      if (!layerIds.includes(layerId)) layerIds.push(layerId);
    }
  } catch (err) {
    dbg(
      `maybeFetchFeaturesForStyle: retrieval complementario falló: ${err?.message}`
    );
  }

  if (layerIds.length === 0) {
    const fallback = ctx.lastAggregateLayerId || ctx.lastQueryLayerId;
    if (fallback) {
      layerIds = [fallback];
    }
  }

  layerIds = layerIds.slice(0, MAX_GEOJSON_LAYERS);

  if (layerIds.length === 0) {
    dbg("maybeFetchFeaturesForStyle: no hay capas, skip");
    return;
  }

  const present = new Set();
  if (ctx.raw) {
    for (const fc of ctx.raw.values()) {
      if (fc?._layer_id) present.add(fc._layer_id);
    }
  }

  const missing = layerIds.filter((layerId) => !present.has(layerId));
  if (missing.length === 0) {
    dbg("maybeFetchFeaturesForStyle: todas las capas ya están en ctx.raw");
    return;
  }

  const colorBy = ctx.lastColorBy || ctx.lastAggregateGroupBy || null;
  dbg(
    `maybeFetchFeaturesForStyle: capas=${layerIds.join(",")} ` +
      `faltantes=${missing.join(",")} color_by=${colorBy || "null"}`
  );

  const fetched = await Promise.all(
    missing.map(async (layerId) => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const args = { layer_id: layerId };
          if (colorBy) args.color_by = colorBy;

          const out = await runTool("get_layer_features", args);
          if (out.ok) {
            const fc = out.result;
            if (
              !fc ||
              fc.type !== "FeatureCollection" ||
              !Array.isArray(fc.features) ||
              fc.features.length === 0
            ) {
              return null;
            }
            return { layerId, fc };
          }

          const isTimeout = /timeout|excedi/i.test(out.error || "");
          if (isTimeout && attempt === 0) {
            dbg(
              `maybeFetchFeaturesForStyle: ${layerId} timeout, reintentando`
            );
            continue;
          }

          dbg(`maybeFetchFeaturesForStyle: ${layerId} falló: ${out.error}`);
          return null;
        } catch (err) {
          dbg(
            `maybeFetchFeaturesForStyle: ${layerId} excepción: ${err?.message || err}`
          );
          return null;
        }
      }
      return null;
    })
  );

  let added = 0;
  for (const item of fetched) {
    if (!item) continue;
    const { layerId, fc } = item;
    const ref = `fc_forced_${ctx.raw.size + 1}`;

    ctx.raw.set(ref, {
      ...fc,
      _layer_id: fc._layer_id || layerId,
    });

    if (Array.isArray(ctx.trace)) {
      ctx.trace.push({
        tool: "get_layer_features",
        args: { layer_id: layerId },
        ok: true,
        forced: true,
      });
    }

    added += 1;
    dbg(
      `maybeFetchFeaturesForStyle: ${layerId} OK, ${fc.features.length} features`
    );
  }

  if (added > 0 && colorBy) {
    ctx.lastColorBy = colorBy;
    dbg(`maybeFetchFeaturesForStyle: ctx.lastColorBy = ${colorBy}`);
  }
}