/**
 * Orquestador del chat IA.
 *
 * Bucle ReAct: hasta N pasos (ORCHESTRATOR_MAX_ITERATIONS, default 3).
 * En cada paso el LLM decide si llamar tools o responder.
 * En el último paso, toolChoice: "none" fuerza la respuesta de texto.
 *
 * El geojson y las filas completas van a `ctx.raw` (almacén por invocación)
 * y NO se envían al LLM. El LLM ve solo metadatos + muestra reducida.
 */

import { getLLM } from "../llm/provider.js";
import { TOOL_DEFINITIONS } from "./tools.js";
import { runTool } from "./runners.js";
import { buildSystemPrompt } from "./prompts.js";
import { buildChartsFromHistory } from "./charts.js";
import { compact, buildGeojsonLayersFromCtx } from "./evidence.js";
import { maybeFetchFeaturesForStyle } from "./post-process.js";
import { buildEvidence } from "./evidence.js";

const DEFAULT_BUDGET_MS = 8000;
const DEFAULT_MAX_ITERATIONS = 3;

/** Log de diagnóstico: activar con ORCHESTRATOR_DEBUG=1 */
const DEBUG = /^(1|true|yes)$/i.test(process.env.ORCHESTRATOR_DEBUG || "");
function dbg(...args) {
  if (DEBUG) console.log("[orchestrator]", ...args);
}

export async function runOrchestrator({ text, history = [], sessionId = null }) {
  const budgetMs =
    Number(process.env.ORCHESTRATOR_BUDGET_MS) || DEFAULT_BUDGET_MS;
  const maxSteps =
    Number(process.env.ORCHESTRATOR_MAX_ITERATIONS) || DEFAULT_MAX_ITERATIONS;

  if (maxSteps < 1) {
    throw new Error("ORCHESTRATOR_MAX_ITERATIONS debe ser >= 1");
  }

  const RESERVE_MS = 500;
  const deadline = Date.now() + budgetMs;

  const llm = await getLLM();
  const system = await buildSystemPrompt(text);

  dbg(
    `budget=${budgetMs}ms maxSteps=${maxSteps} model=${process.env.LLM_MODEL}`
  );

  const ctx = { raw: new Map(), trace: [] };

  const messages = [];
  for (const h of history.slice(-3)) {
    if (h && (h.role === "user" || h.role === "assistant")) {
      messages.push({ role: h.role, content: String(h.content || "") });
    }
  }
  messages.push({ role: "user", content: String(text || "").trim() });

  let step = 0;
  while (true) {
    step += 1;
    const isLast = step >= maxSteps || Date.now() > deadline - RESERVE_MS;

    let response;
    const t1 = Date.now();
    const MAX_RETRIES = 2;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        response = await llm.chat({
          system,
          messages,
          tools: TOOL_DEFINITIONS,
          toolChoice: isLast ? "none" : "auto",
          reasoningEffort: "low",
          sessionId,
        });
        break;
      } catch (err) {
        const isRetryable = err?.retryable === true;
        const hasRetriesLeft = attempt < MAX_RETRIES;

        if (isRetryable && hasRetriesLeft) {
          const delayMs = 1000 * Math.pow(2, attempt);
          console.warn(
            `[orchestrator] LLM 503 (intento ${attempt + 1}/${MAX_RETRIES + 1}). ` +
              `Reintentando en ${delayMs}ms...`
          );
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        console.error(
          `[orchestrator] LLM call failed (step ${step}):`,
          err?.message || err,
          err?.stack || ""
        );
        throw err;
      }
    }

    const stepMs = Date.now() - t1;

    console.log(
      `[orchestrator] step=${step} isLast=${isLast} ms=${stepMs} | ` +
        `tool_calls=${response.toolCalls?.length || 0} | ` +
        `content_len=${(response.content || "").length} | ` +
        `content_preview=${JSON.stringify((response.content || "").slice(0, 100))}`
    );

    if (!response.toolCalls || response.toolCalls.length === 0) {
      dbg(`step ${step}: sin tool_calls → salida`);

      await maybeFetchFeaturesForStyle(ctx, text);

      return await finish(response.content, ctx, messages, text);
    }

    messages.push({
      role: "assistant",
      content: response.content || "",
      tool_calls: response.toolCalls.map((tc) => {
        const mapped = {
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        };
        if (tc.extra_content) {
          mapped.extra_content = tc.extra_content;
        }
        return mapped;
      }),
    });

    const toolResults = await Promise.all(
      response.toolCalls.map(async (tc) => ({
        tc,
        out: await runTool(tc.name, tc.arguments),
      }))
    );

    for (const { tc, out } of toolResults) {
      ctx.trace.push({ tool: tc.name, args: tc.arguments, ok: out.ok });

      if (tc.name === "aggregate_by_admin" && out.ok) {
        const lid = tc.arguments?.layer_id;
        if (typeof lid === "string" && lid.length > 0) {
          ctx.lastAggregateLayerId = lid;
          dbg(`ctx.lastAggregateLayerId = ${lid}`);
        }
      }
      if (tc.name === "aggregate_layer" && out.ok) {
        const lid = tc.arguments?.layer_id;
        const gb = tc.arguments?.group_by;
        if (typeof lid === "string" && lid.length > 0) {
          ctx.lastAggregateLayerId = lid;
          dbg(`ctx.lastAggregateLayerId = ${lid}`);
        }
        if (typeof gb === "string" && gb.length > 0) {
          ctx.lastAggregateGroupBy = gb;
          dbg(`ctx.lastAggregateGroupBy = ${gb}`);
        }
      }
      if (tc.name === "aggregate_by_admin_and_column" && out.ok) {
        const lid = tc.arguments?.layer_id;
        if (typeof lid === "string" && lid.length > 0) {
          ctx.lastAggregateLayerId = lid;
          dbg(`ctx.lastAggregateLayerId = ${lid}`);
        }
      }
      if (tc.name === "query_layer" && out.ok) {
        const lid = tc.arguments?.layer_id;
        if (typeof lid === "string" && lid.length > 0) {
          ctx.lastQueryLayerId = lid;
          dbg(`ctx.lastQueryLayerId = ${lid}`);
        }
      }
      if (tc.name === "get_layer_features" && out.ok) {
        const cb = tc.arguments?.color_by;
        if (typeof cb === "string" && cb.length > 0) {
          ctx.lastColorBy = cb;
          dbg(`ctx.lastColorBy = ${cb}`);
        }
      }
    }

    for (const { tc, out } of toolResults) {
      const compacted = compact(tc.name, out, ctx);
      dbg(
        `tool ${tc.name} → ${out.ok ? "ok" : "ERROR: " + out.error} | ` +
          `compactado: ${JSON.stringify(compacted).slice(0, 200)}`
      );
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        name: tc.name,
        content: JSON.stringify(compacted),
      });
    }
  }
}

async function finish(reply, ctx, messages, userText = "") {
  const { layers: geojsonLayers, truncated } = await buildGeojsonLayersFromCtx(ctx, userText);

  // Paquete de evidencia.
  let citations = [];
  let coverageWarnings = [];
  try {
    const db = await getDB();
    const catalog = (await db.rpc("chat_catalog")) ?? [];
    const evidence = await buildEvidence(ctx, userText, catalog);
    citations = evidence.citations;
    coverageWarnings = evidence.coverageWarnings;
  } catch (err) {
    // Fail-open: sin evidencia, seguimos.
  }

  // Unir avisos en notice.
  const notices = [];
  if (truncated) {
    notices.push(`Mostrando ${truncated.shown} de ${truncated.total} resultados en el mapa.`);
  }
  for (const w of coverageWarnings) {
    notices.push(w);
  }

  return {
    reply: String(reply || "").trim() || "Sin respuesta.",
    charts: buildChartsFromHistory(messages),
    geojson: geojsonLayers.length > 0 ? geojsonLayers[0].geojson : null,
    geojson_meta: geojsonLayers.length > 0
      ? {
          layer_id: geojsonLayers[0].layer_id || null,
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
    trace: ctx.trace || [],
  };
}

export function _resetSystemPrompt() {
  // No-op: el prompt ahora se genera por pregunta.
}