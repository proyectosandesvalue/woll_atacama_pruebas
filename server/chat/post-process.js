/**
 * Post-procesamiento determinístico.
 *
 * Si el usuario pidió "por comuna + elementos" o "listado + pintado",
 * y el LLM no llamó a get_layer_features, lo forzamos.
 */

import { getDB } from "../db/pool.js";
import { runTool } from "./runners.js";
import { retrieveLayers } from "./layer-retrieval.js";

const DEBUG = /^(1|true|yes)$/i.test(process.env.ORCHESTRATOR_DEBUG || "");
function dbg(...args) {
  if (DEBUG) console.log("[post-process]", ...args);
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

  let lastLayerId = ctx.lastAggregateLayerId || ctx.lastQueryLayerId;
  if (!lastLayerId) {
    try {
      const db = await getDB();
      const catalog = (await db.rpc("chat_catalog")) ?? [];
      const { layers: retrieved } = retrieveLayers(userText, catalog, 1);
      if (retrieved.length > 0) {
        lastLayerId = retrieved[0].layer_id;
        dbg(
          `maybeFetchFeaturesForStyle: lastLayerId inferido por retrieval = ${lastLayerId}`
        );
      }
    } catch (err) {
      dbg(`maybeFetchFeaturesForStyle: retrieval falló: ${err?.message}`);
    }
  }

  if (!lastLayerId) {
    dbg("maybeFetchFeaturesForStyle: no hay lastLayerId, skip");
    return;
  }

  if (ctx.raw && ctx.raw.size > 0) {
    for (const fc of ctx.raw.values()) {
      if (fc._layer_id === lastLayerId) {
        dbg(`maybeFetchFeaturesForStyle: ${lastLayerId} ya está en ctx.raw, skip`);
        return;
      }
    }
  }

  const colorBy = ctx.lastColorBy || ctx.lastAggregateGroupBy || null;

  dbg(
    `maybeFetchFeaturesForStyle: forzando get_layer_features(${lastLayerId}, color_by=${colorBy})`
  );

  try {
    const args = { layer_id: lastLayerId };
    if (colorBy) args.color_by = colorBy;

    const out = await runTool("get_layer_features", args);
    if (!out.ok) {
      dbg(`maybeFetchFeaturesForStyle: get_layer_features falló: ${out.error}`);
      return;
    }
    const r = out.result;
    if (r && r.type === "FeatureCollection" && Array.isArray(r.features)) {
      const ref = `fc_forced_${ctx.raw.size + 1}`;
      ctx.raw.set(ref, {
        ...r,
        _layer_id: r._layer_id || lastLayerId,
      });
      dbg(
        `maybeFetchFeaturesForStyle: OK, ${r.features.length} features guardadas`
      );

      if (colorBy) {
        ctx.lastColorBy = colorBy;
        dbg(`maybeFetchFeaturesForStyle: ctx.lastColorBy = ${colorBy}`);
      }
    }
  } catch (err) {
    dbg(`maybeFetchFeaturesForStyle: excepción: ${err?.message || err}`);
  }
}