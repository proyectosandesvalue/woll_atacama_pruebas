/**
 * Handler puro del chat IA.
 *
 * Pipeline completo (excepto CORS y método HTTP, que son del adapter):
 *   1. Validar input.
 *   2. Detectar IP y país.
 *   3. Rate limit.
 *   4. Scope filter.
 *   5. Clasificador (dominio + intent + slots).
 *   6. Router determinístico (pipeline) o degradación al orquestador.
 */

import { runOrchestrator } from "../chat/orchestrator.js";
import { validateChatInput } from "../chat/input-validator.js";
import { checkRateLimit } from "../chat/rate-limiter.js";
import { isLatam } from "../chat/geo-filter.js";
import { scopeFilter } from "../chat/scope-filter.js";
import { classifyDomain } from "../chat/domain-classifier.js";
import { route } from "../chat/router.js";

const LATAM_LIMIT = { perMinute: 20, perBurst: 5 };
const NON_LATAM_LIMIT = { perMinute: 3, perBurst: 1 };

const MSG_OUT_OF_SCOPE =
  "No puedo responder esa pregunta. Soy un asistente especializado " +
  "en el Visor Territorial de Atacama y solo puedo ayudarte con " +
  "consultas sobre los datos geoespaciales del portal.";

export async function handleChat(body, ctx = {}) {
  try {
    // ── Paso 1: validar input ─────────────────────────────────
    const validation = validateChatInput(body);
    if (!validation.ok) {
      return { status: 400, body: { error: validation.error } };
    }

    const { text, history, sessionId } = validation;

    // ── Paso 2: detectar IP y país ────────────────────────────
    const ip = ctx.ip;
    const country = ctx.country;

    if (!ip) {
      return {
        status: 403,
        body: {
          error:
            "No se pudo identificar tu conexión. Verifica que no estés " +
            "usando un proxy que oculte tu IP.",
        },
      };
    }

    // ── Paso 3: rate limiting (saltable para tests) ───────────
    if (!ctx.skipRateLimit) {
      const limits = isLatam(country) ? LATAM_LIMIT : NON_LATAM_LIMIT;
      const rate = checkRateLimit(ip, limits.perMinute, limits.perBurst);

      if (!rate.ok) {
        return {
          status: 429,
          body: {
            error: `Demasiadas solicitudes. Intenta de nuevo en ${rate.retryAfterSeconds} segundos.`,
          },
          headers: { "Retry-After": String(rate.retryAfterSeconds) },
        };
      }
    }

    // ── Paso 4: scope filter ──────────────────────────────────
    const scope = scopeFilter(text);
    if (scope.blocked) {
      return { status: 403, body: { error: MSG_OUT_OF_SCOPE } };
    }

    // ── Paso 5: clasificador (dominio + intent + slots) ───────
    const classification = await classifyDomain(text, sessionId);
    if (classification.domain === "OUT") {
      return { status: 403, body: { error: MSG_OUT_OF_SCOPE } };
    }

    // ── Paso 6: router determinístico ─────────────────────────
    const routed = await route(classification, text);
    if (routed) {
      const payload = buildPayloadFromPipeline(routed, text);
      if (ctx.includeTrace) {
        payload.trace = routed.results.map((r) => ({
          tool: r.tool,
          args: r.args,
          ok: r.ok,
        }));
      }
      return { status: 200, body: payload };
    }

    // ── Paso 7: orquestador (fallback) ────────────────────────
    const payload = await runOrchestrator({ text, history, sessionId });
    const charts = Array.isArray(payload?.charts) ? payload.charts : [];
    const normalized = {
      reply: payload?.reply || "Sin respuesta.",
      notice: payload?.notice ?? null,
      geojson: payload?.geojson ?? null,
      geojson_meta: payload?.geojson_meta ?? null,
      geojson_layers: Array.isArray(payload?.geojson_layers)
        ? payload.geojson_layers
        : [],
      chart: charts.length === 1 ? charts[0] : null,
      charts,
    };

    if (ctx.includeTrace) {
      normalized.trace = payload?.trace || [];
    }

    return { status: 200, body: normalized };

  } catch (err) {
    const errInfo = {
      message: err?.message || String(err),
      name: err?.name || "Error",
      stack: err?.stack
        ? String(err.stack).split("\n").slice(0, 3).join(" | ")
        : "",
    };
    console.error("[/api/chat] ERROR:", JSON.stringify(errInfo));

    const isConfigError =
      typeof err?.message === "string" &&
      err.message.includes("Variable de entorno");
    const status = isConfigError ? 503 : 500;
    return { status, body: { error: errInfo.message } };
  }
}

/**
 * Arma el payload del frontend a partir de los resultados de un pipeline.
 *
 * - query_layer → reply (tabla markdown).
 * - get_layer_features → geojson_layers + geojson_meta.
 * - aggregate_by_admin / aggregate_layer → charts.
 * - citations: fuentes de cada tool.
 */
function buildPayloadFromPipeline(routed, userText = "") {
  const { results } = routed;
  const charts = [];
  const geojsonLayers = [];
  let truncated = null;
  let reply = "";

  for (const r of results) {
    if (!r.ok || !r.result) continue;

    // ── query_layer: filas → tabla markdown ─────────────────
    if (r.tool === "query_layer") {
      const rows = Array.isArray(r.result) ? r.result : [];
      if (rows.length > 0) {
        const sample = rows.slice(0, 5);
        const props = Object.keys(sample[0]?.row || sample[0] || {});
        const cols = props.slice(0, 5);
        reply += `Se recuperaron ${rows.length} registros.\n\n`;
        reply += "| " + cols.join(" | ") + " |\n";
        reply += "| " + cols.map(() => "---").join(" | ") + " |\n";
        for (const row of sample) {
          const data = row?.row || row;
          reply += "| " + cols.map((c) => String(data[c] ?? "")).join(" | ") + " |\n";
        }
      }
    }

    // ── get_layer_features: geojson_layers ────────────────────
    if (r.tool === "get_layer_features") {
      const fc = r.result;
      if (fc && fc.type === "FeatureCollection" && Array.isArray(fc.features)) {
        const layerId = fc._layer_id || r.args?.layer_id || null;
        const totalCount = fc.total_count || fc.features.length;
        const shown = fc.features.length;
        if (totalCount > shown && !truncated) {
          truncated = { total: totalCount, shown, layerId };
        }
        geojsonLayers.push({
          layer_id: layerId,
          layer_label: layerId,
          geojson: { type: "FeatureCollection", features: fc.features.slice(0, 500) },
          style_hint: null,
        });
      }
    }

    // ── aggregate_by_admin / aggregate_layer: charts ──────────
    if (
      (r.tool === "aggregate_by_admin" || r.tool === "aggregate_layer") &&
      Array.isArray(r.result)
    ) {
      const data = r.result;
      if (data.length > 0 && data[0]?.group !== undefined) {
        const totalGroups = data.length;
        const sliced = data.slice(0, 10);
        charts.push({
          type: totalGroups <= 6 ? "pie" : "bar",
          title: `Distribución (top ${sliced.length} de ${totalGroups})`,
          labels: sliced.map((d) => String(d.group)),
          values: sliced.map((d) => Number(d.value)),
          totalGroups,
        });
      }
    }
  }

  if (!reply) {
    reply =
      "Recuperé la información solicitada. Podés ver los resultados en el mapa y los gráficos.";
  }

  // ── citations: fuentes de cada tool ─────────────────────────
  const citations = [];
  const seen = new Set();
  for (const r of results) {
    if (!r.ok || !r.args?.layer_id) continue;
    const key = `${r.args.layer_id}:${r.tool}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({
      layer_id: r.args.layer_id,
      tool: r.tool,
      label: r.args.layer_id,
    });
  }

  return {
    reply: reply.trim(),
    charts,
    geojson: geojsonLayers.length > 0 ? geojsonLayers[0].geojson : null,
    geojson_meta:
      geojsonLayers.length > 0
        ? {
            layer_id: geojsonLayers[0].layer_id,
            layer_ids: geojsonLayers.map((l) => l.layer_id).filter(Boolean),
            feature_count: geojsonLayers.reduce(
              (acc, l) => acc + (l.geojson?.features?.length || 0),
              0
            ),
            style_hint: null,
            truncated: truncated ? true : false,
            total: truncated ? truncated.total : null,
            shown: truncated ? truncated.shown : null,
          }
        : null,
    geojson_layers: geojsonLayers,
    notice: truncated
      ? `Mostrando ${truncated.shown} de ${truncated.total} resultados en el mapa.`
      : null,
    citations: citations.length > 0 ? citations : null,
    chart: charts.length === 1 ? charts[0] : null,
  };
}