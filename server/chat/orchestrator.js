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
import { getDB } from "../db/pool.js";
import { TOOL_DEFINITIONS } from "./tools.js";
import { runTool } from "./runners.js";

const DEFAULT_BUDGET_MS = 8000;
const DEFAULT_MAX_ITERATIONS = 3;

/** Log de diagnóstico: activar con ORCHESTRATOR_DEBUG=1 */
const DEBUG = /^(1|true|yes)$/i.test(process.env.ORCHESTRATOR_DEBUG || "");
function dbg(...args) {
  if (DEBUG) console.log("[orchestrator]", ...args);
}

/*
 * Killswitch de geojson en el chat.
 * En `0`, el orquestador nunca adjunta `geojson` a la respuesta.
 */
const CHAT_GEOJSON_ENABLED = /^(1|true|yes)$/i.test(
  process.env.CHAT_GEOJSON_ENABLED ?? "1"
);

/**
 * Modo verbose del chat.
 *   true  → el LLM puede mencionar tools, layer_ids y nombres técnicos.
 *           Útil en desarrollo para debug y trazabilidad.
 *   false → el LLM habla SOLO en lenguaje natural. No menciona tools,
 *           layer_ids ni nombres de columnas de la BD. Modo producción.
 *
 * Se controla con la variable de entorno CHAT_VERBOSE=1|0.
 */
const CHAT_VERBOSE = /^(1|true|yes)$/i.test(process.env.CHAT_VERBOSE || "");

/** Tope máximo de features en una respuesta geoespacial. */
const MAX_GEOJSON_FEATURES = 500;

const SYSTEM_PROMPT_BASE = `Eres un analista territorial de la Región de Atacama (Chile).
Tu trabajo es responder preguntas sobre datos territoriales usando tools que consultan la base de datos real.

TIENES 9 TOOLS. Elige la correcta según el TIPO de pregunta:

PREGUNTAS DE CONTEO CON AGRUPACIÓN ADMINISTRATIVA:
  "¿cuántos X por comuna?", "¿cuántos X por provincia?", "¿cuántos X por región?"
  → aggregate_by_admin

PREGUNTAS DE CONTEO POR COLUMNA:
  "¿cuántos X por [tipo/uso/clasificación/especie]?"
  → aggregate_layer

PREGUNTAS DE DOBLE AGRUPACIÓN:
  "¿cuántos X por comuna según tipo?"
  → aggregate_by_admin_and_column

PREGUNTAS DE PROXIMIDAD:
  "cerca de Y", "a menos de X metros de Y"
  → count_near_layer (solo total) o aggregate_near_layer (por comuna)

PREGUNTAS DE LISTADO:
  "¿cuáles son los X?", "muéstrame Y"
  → query_layer

GEOMETRÍAS PARA EL MAPA:
  "muéstrame en el mapa", "dónde están"
  → get_layer_features

ESTADÍSTICAS GENERALES DE UNA CAPA:
  → get_layer_stats

REGLAS (12):

1. ACTÚA DIRECTO. La primera acción SIEMPRE es llamar a la tool
   correcta. NO revises el esquema ni hagas consultas exploratorias
   antes de actuar.

2. Para "¿cuántos X por comuna?" llama a aggregate_by_admin
   DIRECTAMENTE. Sin pasos intermedios.

3. Usa las columnas que aparecen en el catálogo entre {}. Están
   verificadas contra la base de datos real.

4. SOLO usa get_layer_schema si TODAS las tools fallaron por
   columna inválida. NO la uses antes de intentar.

5. Responde en español, conciso: 2-4 frases de análisis.

6. Cita cifras concretas. Nunca inventes números.

7. Si el frontend dibuja un gráfico (agregaciones simples), NO repitas
   la tabla markdown. Escribe solo el análisis.

8. Si NO hay gráfico (query_layer, get_layer_stats), muestra tabla
   markdown con máximo 6 filas.

9. Máximo 2 tool calls por respuesta.

10. Si una tool falla, dilo explícitamente y sugiere alternativa.

11. NO menciones nombres técnicos de tools ni layer_ids internos.
    Usa los nombres visibles de las capas.

12. Habla como analista territorial: directo, claro, con conclusiones.

CATÁLOGO:
`;

// ── Reglas de lenguaje según modo verbose ─────────────────────
const VERBOSE_RULES = `
MODO DESARROLLO:
- Puedes mencionar los nombres técnicos de las tools entre corchetes 【】.
- Puedes mencionar layer_ids y nombres de columnas.
- Puedes explicar tu razonamiento paso a paso.
`;

const NON_VERBOSE_RULES = `
MODO PRODUCCIÓN:
- NUNCA menciones nombres técnicos de tools.
- NUNCA menciones layer_ids internos (usa el nombre visible).
- NUNCA menciones nombres de columnas de la BD.
- Habla como analista territorial: directo, claro, con datos y conclusiones.
`;

const SYSTEM_PROMPT =
  SYSTEM_PROMPT_BASE + (CHAT_VERBOSE ? VERBOSE_RULES : NON_VERBOSE_RULES);


/** Caché del system prompt (el catálogo cambia raramente). */
let _cachedSystem = null;
let _cachedAt = 0;
const SYSTEM_TTL_MS = 5 * 60 * 1000;

async function buildSystemPrompt() {
  if (_cachedSystem && Date.now() - _cachedAt < SYSTEM_TTL_MS) {
    dbg("system prompt servido desde caché");
    return _cachedSystem;
  }
  const db = await getDB();
  let catalog = [];
  try {
    catalog = (await db.rpc("chat_catalog")) ?? [];
  } catch {
    catalog = [];
  }

  const lines = catalog.slice(0, 80).map((c) => {
    const attrs = Array.isArray(c.attributes)
      ? c.attributes
          .map((a) => (typeof a === "string" ? a : a?.name))
          .filter(Boolean)
          .slice(0, 15)
      : [];
    const attrStr = attrs.length ? ` {${attrs.join(", ")}}` : "";
    return `- ${c.layer_id} — ${c.display_name} [${c.dimension}]${attrStr}`;
  });

  const catalogBlock = lines.join("\n").slice(0, 12000);
  const full = SYSTEM_PROMPT + "\nCATÁLOGO DE CAPAS:\n" + catalogBlock;
  _cachedSystem = full;
  _cachedAt = Date.now();


  const baseChars = SYSTEM_PROMPT.length;
  const catalogChars = catalogBlock.length;
  const totalChars = full.length;
  console.log(
    `[orchestrator] system prompt: ` +
    `base=${baseChars} chars (~${Math.round(baseChars / 4)} tokens) | ` +
    `catalogo=${catalogChars} chars (~${Math.round(catalogChars / 4)} tokens) | ` +
    `total=${totalChars} chars (~${Math.round(totalChars / 4)} tokens) | ` +
    `capas=${catalog.length}`
  );
  

  dbg(`system prompt regenerado (${catalog.length} capas)`);
  return full;
}


/**
 * Genera el `notice` determinístico cuando el geojson fue truncado.
 */
function buildNoticeFromGeojson(geojsonMeta) {
  if (!geojsonMeta || !geojsonMeta.truncated) return null;
  return `Mostrando ${geojsonMeta.shown} de ${geojsonMeta.total} resultados en el mapa.`;
}

// ─────────────────────────────────────────────────────────────────
// Detección de charts (agnóstica de la tool)
// ─────────────────────────────────────────────────────────────────

const PIE_MAX_GROUPS = 6;
const BAR_MAX_GROUPS = 20;
const MAX_CHART_SLICE = 10;

/**
 * Extrae TODOS los charts posibles desde el historial de tool_calls.
 *
 * Principio: no importa QUÉ tool produjo los datos. Importa la FORMA
 * del resultado. Si es graficable, se genera un chart.
 *
 * Formas reconocidas:
 *   1. [{group, value}, ...]                → chart de distribución.
 *   2. [{value, count}, ...]                → chart de top values.
 *   3. { attributes: [{attr, top_values}] } → 1 chart por atributo.
 *   4. { columns: [{name, top_values}] }    → 1 chart por columna.
 *   5. [{row}, {row}, ...]                  → conteo por columna categórica.
 *
 * Los escalares (count, total) NO son graficables.
 *
 * Al agregar una tool nueva, no hay que tocar este código: si su
 * resultado tiene alguna de esas formas, el chart se genera solo.
 */
function buildChartsFromHistory(history) {
  const MAX_TOTAL_CHARTS = 3;
  const charts = [];

  for (const m of history) {
    if (m.role !== "tool") continue;
    if (charts.length >= MAX_TOTAL_CHARTS) break;

    let parsed;
    try {
      parsed = typeof m.content === "string" ? JSON.parse(m.content) : m.content;
    } catch {
      continue;
    }

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "error" in parsed) {
      continue;
    }

    const toolCharts = extractChartableData(parsed, m.name);

    for (const chart of toolCharts) {
      if (charts.length >= MAX_TOTAL_CHARTS) break;
      charts.push(chart);
    }
  }

  return charts;
}

/**
 * Analiza un resultado y devuelve 0, 1 o varios charts según su forma.
 *
 * @param {*} data - Resultado de la tool.
 * @param {string} toolName - Nombre de la tool (solo para logs).
 * @returns {Array<object>} Lista de charts.
 */
function extractChartableData(data, toolName) {
  if (data == null) return [];

  // ── Caso 0: si es un string, intentar parsear como JSON ──
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data);
      return extractChartableData(parsed, toolName);
    } catch {
      return [];
    }
  }

  // ── Caso A: array plano ──
  if (Array.isArray(data)) {
    // Desenvolver si es un array con un único elemento que es array
    if (data.length === 1 && Array.isArray(data[0])) {
      return extractChartableData(data[0], toolName);
    }

    // A.1 — [{group, value}, ...] → chart de distribución
    if (data.length > 0 && isGroupValueArray(data)) {
      const chart = buildChartFromGroupValue(data);
      return chart ? [chart] : [];
    }

    // A.2 — [{value, count}, ...] → chart de top values
    if (data.length > 1 && isValueCountArray(data)) {
      const chart = buildChartFromValueCount(data, "distribución");
      return chart ? [chart] : [];
    }

        // A.3 — [{row}, {row}, ...] → conteo por columna categórica
    // Doble agrupación (2+ columnas categóricas): NO generar chart.
    // El LLM presenta los datos como tabla (regla 13 del prompt).
    if (data.length >= 3 && isRowArray(data)) {
      const first = data[0];
      const categoricalKeys = Object.keys(first).filter(
        (k) => k !== "value" && k !== "count" && k !== "total"
      );
      if (categoricalKeys.length >= 2) {
        return [];
      }
      const chart = buildChartFromRows(data, toolName);
      return chart ? [chart] : [];
    }
    return [];
  }

  // ── Caso B: objeto ──
  if (typeof data === "object") {
    const charts = [];

    // B.0 — Desenvolver wrappers: {"func_name": [...]} o {"data": [...]}
    const keys = Object.keys(data);
    if (keys.length === 1) {
      const onlyValue = data[keys[0]];
      // Si el único valor es un array u objeto, desenvolver
      if (Array.isArray(onlyValue) || (onlyValue && typeof onlyValue === "object")) {
        return extractChartableData(onlyValue, toolName);
      }
    }

    // B.1 — { attributes: [{attr, top_values}, ...] }
    if (Array.isArray(data.attributes)) {
      for (const attr of data.attributes) {
        if (!Array.isArray(attr.top_values) || attr.top_values.length < 2) continue;
        const chart = buildChartFromValueCount(
          attr.top_values,
          attr.attr || attr.name || "atributo",
          data.display_name
        );
        if (chart) charts.push(chart);
      }
    }

        // B.2 — { columns: [{name, top_values}, ...] }
    // Solo tomamos hasta 2 columnas relevantes para no inundar con charts.
    // Criterio: descartar columnas con valores únicos (IDs, nombres, coords)
    // y columnas con un valor que concentra >90% (columnas "planas").
    if (Array.isArray(data.columns)) {
      const candidates = data.columns
        .filter((col) => {
          if (!Array.isArray(col.top_values)) return false;
          if (col.top_values.length < 2) return false;
          if (col.top_values.length > 20) return false;

          const total = col.top_values.reduce(
            (acc, t) => acc + Number(t.count || 0),
            0
          );
          if (total === 0) return false;

          // Descartar si el primer valor concentra >90% (columna plana)
          const firstCount = Number(col.top_values[0]?.count || 0);
          if (firstCount / total > 0.9) return false;

          // Descartar si la mayoría son únicos (IDs, nombres)
          const uniqueRatio = col.top_values.length / total;
          if (uniqueRatio > 0.5) return false;

          return true;
        })
        .sort((a, b) => a.top_values.length - b.top_values.length)
        .slice(0, 2);

      for (const col of candidates) {
        const chart = buildChartFromValueCount(
          col.top_values,
          col.name || "columna",
          data.layer_id
        );
        if (chart) charts.push(chart);
      }
    }

    // B.3 — { data: [...] } → recursión
    if (Array.isArray(data.data)) {
      const nested = extractChartableData(data.data, toolName);
      for (const chart of nested) charts.push(chart);
    }

    // B.4 — Resultado de RPC envuelto con el nombre de la función
    if (Array.isArray(data[toolName])) {
      const nested = extractChartableData(data[toolName], toolName);
      for (const chart of nested) charts.push(chart);
    }

    return charts;
  }

  return [];
}

// ── Helpers de detección de forma ────────────────────────────────

function isGroupValueArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  const first = arr[0];
  return (
    first != null &&
    typeof first === "object" &&
    !Array.isArray(first) &&
    "group" in first &&
    "value" in first
  );
}

function isValueCountArray(arr) {
  if (!Array.isArray(arr) || arr.length < 2) return false;
  const first = arr[0];
  return (
    first != null &&
    typeof first === "object" &&
    !Array.isArray(first) &&
    "value" in first &&
    "count" in first
  );
}

function isRowArray(arr) {
  if (!Array.isArray(arr) || arr.length < 3) return false;
  const first = arr[0];
  if (first == null || typeof first !== "object" || Array.isArray(first)) return false;
  const keys = Object.keys(first);
  if (keys.length < 2) return false;
  // Excluir formas conocidas
  if ("group" in first && "value" in first) return false;
  if ("value" in first && "count" in first) return false;
  return true;
}

// ── Constructores de charts ──────────────────────────────────────

function classifyChartType(totalGroups) {
  if (totalGroups <= PIE_MAX_GROUPS) return "pie";
  if (totalGroups > BAR_MAX_GROUPS) return "horizontalBar";
  return "bar";
}

function buildChartFromGroupValue(arr) {
  const totalGroups = arr.length;
  const sliced = arr.slice(0, MAX_CHART_SLICE);
  return {
    type: classifyChartType(totalGroups),
    title: `Distribución (top ${sliced.length} de ${totalGroups})`,
    labels: sliced.map((r) => String(r.group)),
    values: sliced.map((r) => Number(r.value)),
    totalGroups,
  };
}

function buildChartFromValueCount(arr, contextLabel, layerLabel = null) {
  const totalGroups = arr.length;
  const sliced = arr.slice(0, MAX_CHART_SLICE);
  const prefix = layerLabel ? `${layerLabel}: ` : "";
  return {
    type: classifyChartType(totalGroups),
    title: `${prefix}Distribución por ${contextLabel} (top ${sliced.length})`,
    labels: sliced.map((t) => String(t.value)),
    values: sliced.map((t) => Number(t.count ?? t.value ?? 0)),
    totalGroups,
  };
}

function buildChartFromRows(rows, toolName) {
  // Buscar la columna categórica más "concentrada"
  const first = rows[0];
  const columns = Object.keys(first);

  let best = null;
  for (const col of columns) {
    const valueCounts = new Map();
    for (const row of rows) {
      const v = row[col];
      if (v === null || v === undefined) continue;
      const key = String(v);
      valueCounts.set(key, (valueCounts.get(key) || 0) + 1);
    }
    const uniqueCount = valueCounts.size;
    const maxCount = Math.max(...valueCounts.values());

    // Criterio: al menos 2 valores únicos, y el más común ≥2 veces,
    // y no demasiado único (parece categórica, no un ID).
    if (uniqueCount < 2 || maxCount < 2 || uniqueCount > 20) continue;

    const score = maxCount / uniqueCount;
    if (!best || score > best.score) {
      best = { col, valueCounts, score };
    }
  }

  if (!best) return null;

  const entries = Array.from(best.valueCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CHART_SLICE);

  const totalGroups = best.valueCounts.size;
  return {
    type: classifyChartType(totalGroups),
    title: `Distribución por ${best.col} (top ${entries.length})`,
    labels: entries.map(([v]) => v),
    values: entries.map(([, c]) => c),
    totalGroups,
  };
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
  const system = await buildSystemPrompt();

  dbg(
    `budget=${budgetMs}ms maxSteps=${maxSteps} model=${process.env.LLM_MODEL}`
  );

  // ── Almacén por invocación (geojson, filas completas) ──────
  // El LLM NUNCA ve esto. Va directo al frontend en `finish`.
  const ctx = { raw: new Map() };

  // ── Mensajes iniciales ─────────────────────────────────────
  const messages = [];
  for (const h of history.slice(-3)) {
    if (h && (h.role === "user" || h.role === "assistant")) {
      messages.push({ role: h.role, content: String(h.content || "") });
    }
  }
  messages.push({ role: "user", content: String(text || "").trim() });

  // ── Bucle ReAct ────────────────────────────────────────────
  // Sale SOLO por `finish()`. Sin returns internos.
  // En el último paso, `toolChoice: "none"` fuerza texto plano → salida.
  let step = 0;
  while (true) {
    step += 1;
    const isLast =
      step >= maxSteps || Date.now() > deadline - RESERVE_MS;

    let response;
    const t1 = Date.now();
    try {
      response = await llm.chat({
        system,
        messages,
        tools: TOOL_DEFINITIONS,
        toolChoice: isLast ? "none" : "auto",
        sessionId,
      });
    } catch (err) {
      console.error(
        `[orchestrator] LLM call failed (step ${step}):`,
        err?.message || err,
        err?.stack || ""
      );
      throw err;
    }
    const stepMs = Date.now() - t1;

    console.log(
      `[orchestrator] step=${step} isLast=${isLast} ms=${stepMs} | ` +
      `tool_calls=${response.toolCalls?.length || 0} | ` +
      `content_len=${(response.content || "").length} | ` +
      `content_preview=${JSON.stringify((response.content || "").slice(0, 100))}`
    );

    // ── Salida: el LLM no pidió más tools ─────────────────────
    if (!response.toolCalls || response.toolCalls.length === 0) {
      dbg(`step ${step}: sin tool_calls → salida`);
      return finish(response.content, ctx, messages);
    }

    // ── Tool calls: guardar turno del asistente ───────────────
    messages.push({
      role: "assistant",
      content: response.content || "",
      tool_calls: response.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    });

    // ── Ejecutar tools en paralelo ────────────────────────────
    const toolResults = await Promise.all(
      response.toolCalls.map(async (tc) => ({
        tc,
        out: await runTool(tc.name, tc.arguments),
      }))
    );

    // ── Compactar cada resultado y agregarlo al historial ─────
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

// ─────────────────────────────────────────────────────────────────
// Compactador: prepara el resultado de una tool para el LLM
// ─────────────────────────────────────────────────────────────────

function compact(name, out, ctx) {
  if (!out.ok) return { error: out.error };

  const r = out.result;

  // ── FeatureCollection directa ──────────────────────────────
  if (r && r.type === "FeatureCollection" && Array.isArray(r.features)) {
    const ref = `fc_${ctx.raw.size + 1}`;
    ctx.raw.set(ref, r);
    return {
      ref,
      total: r.features.length,
      sample: r.features.slice(0, 15).map((f) => f.properties),
      _hint: "Geometrías guardadas. Se pintan en el mapa, no se analizan acá.",
    };
  }

  // ── get_layer_schema: solo nombres de columnas ─────────────
  // El payload completo (con max/min/mean/top_values) colapsa al LLM.
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

  // ── get_layer_stats: recortar top_values ───────────────────
  if (name === "get_layer_stats" && r && Array.isArray(r.attributes)) {
    return {
      ...r,
      attributes: r.attributes.map((a) => ({
        attr: a.attr || a.name,
        top_values: Array.isArray(a.top_values) ? a.top_values.slice(0, 5) : [],
      })),
    };
  }

  // ── Array de filas ─────────────────────────────────────────
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

  // ── Objeto con .rows ───────────────────────────────────────
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

  // ── Default: agregados, stats sin attributes, otros ────────
  return r;
}

// ─────────────────────────────────────────────────────────────────
// Salida: arma el payload final al frontend
// ─────────────────────────────────────────────────────────────────

function finish(reply, ctx, messages) {
  const geojsonMeta = buildGeojsonFromCtx(ctx);
  return {
    reply: String(reply || "").trim() || "Sin respuesta.",
    charts: buildChartsFromHistory(messages),
    geojson: geojsonMeta ? geojsonMeta.geojson : null,
    notice: buildNoticeFromGeojson(geojsonMeta),
  };
}

// ─────────────────────────────────────────────────────────────────
// Fusión de geojson desde ctx.raw
// ─────────────────────────────────────────────────────────────────

/**
 * Fusiona todos los FeatureCollections de ctx.raw, respetando el tope de 500.
 * Devuelve { geojson, total, shown, truncated } o null.
 */
function buildGeojsonFromCtx(ctx) {
  if (!CHAT_GEOJSON_ENABLED) return null;
  if (!ctx.raw || ctx.raw.size === 0) return null;

  const allFeatures = [];
  for (const fc of ctx.raw.values()) {
    if (fc?.type === "FeatureCollection" && Array.isArray(fc.features)) {
      for (const f of fc.features) {
        allFeatures.push(f);
        if (allFeatures.length >= MAX_GEOJSON_FEATURES * 2) break;
      }
    }
  }

  if (allFeatures.length === 0) return null;

  const total = allFeatures.length;
  const shown = Math.min(total, MAX_GEOJSON_FEATURES);
  const features = allFeatures.slice(0, shown);

  return {
    geojson: { type: "FeatureCollection", features },
    total,
    shown,
    truncated: total > shown,
  };
}