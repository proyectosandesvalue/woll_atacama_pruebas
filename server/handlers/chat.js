/**
 * Handler puro del chat IA.
 *
 * Pipeline completo (excepto CORS y método HTTP, que son del adapter):
 *   1. Validar input.
 *   2. Detectar IP y país.
 *   3. Rate limit.
 *   4. Scope filter.
 *   5. Clasificador (dominio + intent + slots).
 *   6. Detección de datos no disponibles (40-D.2).
 *   7. Router determinístico (pipeline) o degradación al orquestador.
 */

import { runOrchestrator } from "../chat/orchestrator.js";
import { validateChatInput } from "../chat/input-validator.js";
import { checkRateLimit } from "../chat/rate-limiter.js";
import { isLatam } from "../chat/geo-filter.js";
import { scopeFilter } from "../chat/scope-filter.js";
import { classifyDomain } from "../chat/domain-classifier.js";
import { route } from "../chat/router.js";
import { getDB } from "../db/pool.js";
import { retrieveLayers } from "../chat/layer-retrieval.js";
import { detectUnavailable, buildUnavailableNotice,} from "../chat/unavailable.js";
import { checkCostGuard, recordLLMCall } from "../chat/cost-guard.js";
import { randomBytes } from "node:crypto";

/**
 * Genera un ID corto y legible para correlacionar errores con logs.
 * 8 caracteres hex (4 bytes). Ej: "a1b2c3d4".
 */
function generateErrorId() {
  return randomBytes(4).toString("hex");
}

const LATAM_LIMIT = { perMinute: 20, perBurst: 5 };
const NON_LATAM_LIMIT = { perMinute: 3, perBurst: 1 };

const MSG_OUT_OF_SCOPE =
  "No puedo responder esa pregunta. Soy un asistente especializado " +
  "en el Visor Territorial de Atacama y solo puedo ayudarte con " +
  "consultas sobre los datos geoespaciales del portal.";

export async function handleChat(body, ctx = {}) {
  try {
    // ── Paso 0: cost guard (killswitch + tope diario) ─────────
    // Se verifica ANTES de validar input, para no gastar ciclos
    // si el chat está apagado.
    const guard = checkCostGuard();
    if (!guard.ok) {
      return {
        status: guard.status,
        body: { error: guard.message },
      };
    }

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

    // ── Paso 5a: construir contexto de columnas para el clasificador ─
    let catalogContext = null;
    try {
      const db = await getDB();
      const catalog = (await db.rpc("chat_catalog")) ?? [];
      const { layers: retrieved } = retrieveLayers(text, catalog, 6);
      if (retrieved.length > 0) {
        const relevantIds = retrieved.map((r) => r.layer_id);
        const lines = [];
        for (const c of catalog) {
          if (!relevantIds.includes(c.layer_id)) continue;
          const attrs = Array.isArray(c.attributes)
            ? c.attributes
                .map((a) => (typeof a === "string" ? a : a?.name))
                .filter(Boolean)
            : [];
          if (attrs.length > 0) {
            lines.push(`- ${c.layer_id}: ${attrs.join(", ")}`);
          }
        }
        catalogContext = lines.join("\n");
      }
    } catch (err) {
      // Fail-open: sin contexto, el clasificador usa solo el texto.
    }

    // ── Paso 5b: clasificador (dominio + intent + pipeline + slots) ─
    // Si hay historial, concatenar el último turno del usuario para
    // que el clasificador resuelva correcciones ("No, esos no. Solo los consuntivos.").
    const lastUserTurn = Array.isArray(history)
      ? [...history].reverse().find((h) => h.role === "user")?.content || ""
      : "";
    const classifierText = lastUserTurn
      ? `${lastUserTurn}\n\n[Turno actual] ${text}`
      : text;

      const classification = await classifyDomain(classifierText, sessionId, catalogContext);
    recordLLMCall();  // ← 1ra llamada al LLM (NO TOCAR)
    if (classification.domain === "OUT") {
      return { status: 403, body: { error: MSG_OUT_OF_SCOPE } };
    }

    // ── Paso 6: detección de datos no disponibles (40-D.2) ────
    // Flag CHAT_UNAVAILABLE_ENABLED (default 0 = apagado).
    let unavailableMatches = [];
    let unavailableNotice = null;
    try {
      unavailableMatches = await detectUnavailable(text);
      unavailableNotice = buildUnavailableNotice(unavailableMatches);
    } catch (err) {
      // Fail-open: sin detección, seguimos con el pipeline normal.
    }

    // ── Paso 7: router determinístico ─────────────────────────
    const routed = await route(classification, text);
    if (routed) {
      const payload = buildPayloadFromPipeline(
        routed,
        text,
        unavailableNotice
      );
      if (unavailableMatches.length > 0) {
        payload.no_disponible = unavailableMatches;
      }
      if (ctx.includeTrace) {
        payload.trace = routed.results.map((r) => ({
          tool: r.tool,
          args: r.args,
          ok: r.ok,
        }));
      }
      return { status: 200, body: payload };
    }

    // ── Paso 8: orquestador (fallback) ────────────────────────
    const payload = await runOrchestrator({ text, history, sessionId });
    recordLLMCall();
    const charts = Array.isArray(payload?.charts) ? payload.charts : [];

    await maybeLogUnanswered({
      text, history, sessionId, ctx, classification, routed,
      reply: payload?.reply, unavailableMatches,
    });

    // Unir notice del orquestador con el de datos no disponibles.
    const notices = [];
    if (payload?.notice) notices.push(payload.notice);
    if (unavailableNotice) notices.push(unavailableNotice);

    const normalized = {
      reply: payload?.reply || "Sin respuesta.",
      notice: notices.length > 0 ? notices.join("\n") : null,
      geojson: payload?.geojson ?? null,
      geojson_meta: payload?.geojson_meta ?? null,
      geojson_layers: Array.isArray(payload?.geojson_layers)
        ? payload.geojson_layers
        : [],
      chart: charts.length === 1 ? charts[0] : null,
      charts,
    };

    if (unavailableMatches.length > 0) {
      normalized.no_disponible = unavailableMatches;
    }

    if (ctx.includeTrace) {
      normalized.trace = payload?.trace || [];
    }

    return { status: 200, body: normalized };
    } catch (err) {
    // ── Error inesperado: mensaje genérico + errorId ─────────
    // El detalle va solo a los logs, nunca al cliente.
    const errorId = generateErrorId();
    const errInfo = {
      errorId,
      message: err?.message || String(err),
      name: err?.name || "Error",
      stack: err?.stack
        ? String(err.stack).split("\n").slice(0, 5).join(" | ")
        : "",
    };

    const isConfigError =
      typeof err?.message === "string" &&
      err.message.includes("Variable de entorno");
    const status = isConfigError ? 503 : 500;
    return {
      status,
      body: {
        error:
          "Ocurrió un error procesando tu consulta. " +
          "Intentá de nuevo en unos segundos. " +
          "Si persiste, reportá el código de error al equipo.",
        errorId,
      },
    };
  }

/**
 * Arma el payload del frontend a partir de los resultados de un pipeline.
 *
 * - query_layer → reply (tabla markdown).
 * - get_layer_features → geojson_layers + geojson_meta.
 * - aggregate_by_admin / aggregate_layer → charts.
 * - citations: fuentes de cada tool.
 * - notice: truncamiento + datos no disponibles (40-D.2).
 *
 * El reply SIEMPRE menciona las capas involucradas y los filtros aplicados,
 * haya o no tabla (fix F2 del 40-C).
 */
function buildPayloadFromPipeline(
  routed,
  userText = "",
  unavailableNotice = null
) {
  const { results, slots = {} } = routed;
  const charts = [];
  const geojsonLayers = [];
  const layersInvolved = new Set();
  let truncated = null;
  let replyTable = "";

  for (const r of results) {
    if (!r.ok || !r.result) continue;
    const layerId = r.args?.layer_id || null;
    if (layerId) layersInvolved.add(layerId);

    // query_layer: tolerar array Y {rows: [...]}
    if (r.tool === "query_layer") {
      let rows = [];
      if (Array.isArray(r.result)) rows = r.result;
      else if (r.result && Array.isArray(r.result.rows)) rows = r.result.rows;

      if (rows.length > 0) {
        const sample = rows.slice(0, 5);
        const props = Object.keys(sample[0]?.row || sample[0] || {});
        const cols = props.slice(0, 5);
        replyTable += `Se recuperaron ${rows.length} registros de **${layerId || "la capa"}**.\n\n`;
        replyTable += "| " + cols.join(" | ") + " |\n";
        replyTable += "| " + cols.map(() => "---").join(" | ") + " |\n";
        for (const row of sample) {
          const data = row?.row || row;
          replyTable +=
            "| " + cols.map((c) => String(data[c] ?? "")).join(" | ") + " |\n";
        }
        replyTable += "\n";
      }
    }

    // get_layer_features: geojson_layers
    if (r.tool === "get_layer_features") {
      const fc = r.result;
      if (fc && fc.type === "FeatureCollection" && Array.isArray(fc.features)) {
        const lid = fc._layer_id || r.args?.layer_id || null;
        const totalCount = fc.total_count || fc.features.length;
        const shown = fc.features.length;
        if (totalCount > shown && !truncated) {
          truncated = { total: totalCount, shown, layerId: lid };
        }
        const colorBy = r.args?.color_by || null;
        const styleHint = colorBy
          ? { attribute: colorBy, kind: "choropleth-points", palette: null }
          : null;
        geojsonLayers.push({
          layer_id: lid,
          layer_label: lid,
          geojson: {
            type: "FeatureCollection",
            features: fc.features.slice(0, 500),
          },
          style_hint: styleHint,
        });
      }
    }

    // aggregate_*: charts
    if (
      (r.tool === "aggregate_by_admin" || r.tool === "aggregate_layer") &&
      Array.isArray(r.result) &&
      r.result.length > 0 &&
      r.result[0]?.group !== undefined
    ) {
      const data = r.result;
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

  // reply enriquecido (siempre menciona capas y filtros) — fix F2
  const summaryParts = [];
  if (layersInvolved.size > 0) {
    summaryParts.push(
      `Recuperé información de **${Array.from(layersInvolved).join(", ")}**.`
    );
  }
  if (slots.filters && Object.keys(slots.filters).length > 0) {
    const f = Object.entries(slots.filters)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    summaryParts.push(`Filtros aplicados: ${f}.`);
  }
  if (geojsonLayers.length > 0) {
    summaryParts.push("Los resultados están en el mapa.");
  }
  if (charts.length > 0) {
    summaryParts.push("También generé gráficos de distribución.");
  }
  const summary = summaryParts.join(" ");

  const reply = replyTable ? `${summary}\n\n${replyTable}`.trim() : summary;

  // citations
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

  // notice: truncamiento + datos no disponibles (40-D.2)
  const notices = [];
  if (truncated) {
    notices.push(
      `Mostrando ${truncated.shown} de ${truncated.total} resultados en el mapa.`
    );
  }
  if (unavailableNotice) {
    notices.push(unavailableNotice);
  }

  return {
    reply: reply || "Recuperé la información solicitada.",
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
            style_hint: geojsonLayers[0].style_hint || null,
            truncated: truncated ? true : false,
            total: truncated ? truncated.total : null,
            shown: truncated ? truncated.shown : null,
          }
        : null,
    geojson_layers: geojsonLayers,
    notice: notices.length > 0 ? notices.join("\n") : null,
    citations: citations.length > 0 ? citations : null,
    chart: charts.length === 1 ? charts[0] : null,
  };
}
}

/**
 * Registra una pregunta que el chat no pudo responder.
 *
 * Solo registra si:
 *   - La pregunta es del dominio (classification.domain === "IN").
 *   - El chat no pudo responder (intent "fuera_de_alcance" o reply de límite).
 *
 * NO registra:
 *   - Consultas fuera de dominio (OUT), porque son basura.
 *   - Errores técnicos (rate limit, cost guard, etc.).
 *
 * Fire-and-forget: si falla, no afecta la respuesta al usuario.
 */
async function maybeLogUnanswered({
  text,
  history,
  sessionId,
  ctx,
  classification,
  routed,
  reply,
  unavailableMatches,
}) {
  try {
    // No registrar si es OUT (fuera de dominio).
    if (classification?.domain === "OUT") return null;

    // Determinar si hay que registrar.
    const isFueraDeAlcance =
      classification?.intent === "fuera_de_alcance";

    const replyStr = String(reply || "").toLowerCase();
    const replyIndicaLimite =
      replyStr.includes("no puedo responder") ||
      replyStr.includes("no tengo informaci") ||
      replyStr.includes("no cuento con") ||
      replyStr.includes("no dispongo de") ||
      replyStr.includes("no hay datos") ||
      replyStr === "sin respuesta." ||
      replyStr === "";

    if (!isFueraDeAlcance && !replyIndicaLimite) return null;

    // Determinar el motivo.
    let reason = "unknown";
    let reasonDetail = null;

    if (Array.isArray(unavailableMatches) && unavailableMatches.length > 0) {
      const first = unavailableMatches[0];
      reason = first.motivo === "sin_receta" ? "no_recipe" : "no_data";
      reasonDetail = first.descripcion || first.existe || null;
    } else if (isFueraDeAlcance) {
      reason = "no_data";
      reasonDetail = "El clasificador devolvió fuera_de_alcance sin match en unavailable_data.";
    } else if (replyIndicaLimite) {
      reason = "no_tool";
      reasonDetail = "El orquestador no encontró una tool para responder.";
    }

    // Armar contexto (últimos 2 turnos del historial).
    const context =
      Array.isArray(history) && history.length > 0
        ? history.slice(-2)
        : null;

    // Armar la clasificación (sin los slots crudos, por privacidad).
    const classificationSafe = classification
      ? {
          domain: classification.domain,
          intent: classification.intent,
          pipeline: classification.pipeline,
          confidence: classification.confidence,
        }
      : null;

    const routeSafe = routed?.pipeline
      ? { pipeline: routed.pipeline.id, slots: routed.slots }
      : null;

    const db = await getDB();
    const id = await db.rpc("chat_log_unanswered", {
      p_question: text.slice(0, 1000),
      p_context: context ? JSON.stringify(context) : null,
      p_classification: classificationSafe
        ? JSON.stringify(classificationSafe)
        : null,
      p_route: routeSafe ? JSON.stringify(routeSafe) : null,
      p_user_role: ctx?.userRole || "publico",
      p_user_email: ctx?.userEmail || null,
      p_session_id: sessionId || null,
      p_reason: reason,
      p_reason_detail: reasonDetail,
    });

    if (id) {
      console.log(`[unanswered] Registrada ${id} (reason=${reason})`);
    }
    return id;
  } catch (err) {
    // Fail-open: si falla, no afecta la respuesta.
    console.warn(
      `[unanswered] Error al registrar: ${err?.message || err}`
    );
    return null;
  }
}