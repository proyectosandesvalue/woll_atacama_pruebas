/**
 * Orquestador del chat IA.
 *
 * Recibe {text, history} del frontend y devuelve {reply, chart?, geojson?}.
 *
 * Diseño del ciclo (exactamente 2 llamadas LLM por respuesta, pensado
 * para el límite de tokens por minuto del tier gratuito de Groq):
 *
 *   L1 (con catálogo + columnas): el LLM decide las tool_calls y las
 *       ejecuta TODAS en paralelo contra Supabase.
 *   L2 (síntesis forzada): el LLM redacta la respuesta final.
 *
 * ORCHESTRATOR_MAX_ITERATIONS controla las rondas de tools (1 por defecto).
 */

import { getLLM } from "../llm/provider.js";
import { getDB } from "../db/pool.js";
import { TOOL_DEFINITIONS } from "./tools.js";
import { runTool } from "./runners.js";

const DEFAULT_BUDGET_MS = 8000;
const DEFAULT_MAX_ITERATIONS = 1;

/** Log de diagnóstico: activar con ORCHESTRATOR_DEBUG=1 */
const DEBUG = /^(1|true|yes)$/i.test(process.env.ORCHESTRATOR_DEBUG || "");
function dbg(...args) {
  if (DEBUG) console.log("[orchestrator]", ...args);
}

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

const SYSTEM_PROMPT_BASE = `Eres el asistente experto de la Plataforma Territorial Water Oriented Living Lab Atacama (Chile).
Respondes consultas sobre datos territoriales de la Región de Atacama a partir de capas reales (agua, agricultura, minería, energía, clima, riesgos, suelo, planificación, otros).

Tienes 8 herramientas que consultan la base de datos real:

Consultas tabulares:
- get_layer_stats: estadísticas precalculadas de una capa (count, min, max, promedio, mediana, top valores por atributo).
- get_layer_schema: esquema REAL de una capa (columnas exactas, tipos, top 5 valores). Úsala SIEMPRE que dudes del nombre exacto de una columna.
- query_layer: filas concretas con filtros por columna=valor.
- aggregate_layer: agregación agrupada por una COLUMNA de la tabla.

Geoprocesos por división administrativa:
- aggregate_by_admin: agregación agrupada por COMUNA, PROVINCIA o REGIÓN (funciona aunque la capa no tenga esa columna).
- aggregate_by_admin_and_column: doble agrupación — por comuna/provincia/región Y por una columna adicional. Úsala para preguntas del tipo "¿cuántos X por comuna según Y?".

Geoprocesos de proximidad:
- count_near_layer: cuenta elementos de una capa que están a menos de X metros de los de otra(s) capa(s). Distancia en METROS.
- aggregate_near_layer: igual que count_near_layer pero agrupa por comuna/provincia/región.

Reglas de datos:
1. Debajo tienes el CATÁLOGO: "layer_id — nombre visible [dimensión] {columnas}". Usa el layer_id EXACTO.
2. Los nombres de las columnas del catálogo vienen del visor y PUEDEN NO COINCIDIR con las columnas reales de la BD.
3. Si vas a agrupar o filtrar por una columna que NO aparece explícitamente en el catálogo, llama ANTES a get_layer_schema para obtener los nombres exactos.
4. Para preguntas del tipo "¿cuántos X por comuna/provincia/región?", "¿en qué comuna hay más X?", usa SIEMPRE aggregate_by_admin (NO aggregate_layer).
5. Para preguntas del tipo "¿cuántos X por [otra columna]?", usa aggregate_layer.
6. Para preguntas del tipo "¿cuántos X por comuna según Y?" (doble agrupación), usa aggregate_by_admin_and_column.
7. Para preguntas de proximidad ("a menos de X metros de Y", "cerca de Y"):
   - Si solo quieres el total: count_near_layer.
   - Si quieres la distribución por comuna/provincia/región: aggregate_near_layer.
   - Convierte "metros", "km" a METROS: '1 km' → 1000, '500 m' → 500.
   - Cuando la pregunta mencione "fuente de agua", "cuerpo de agua" o similar SIN especificar tipo, usa la capa unificada "agua_superficial" (incluye ríos, lagunas, salares, humedales y glaciares en una sola).
     Ejemplo: layer_id_targets=['agua_superficial'].
   - Si el usuario pide un tipo específico ("ríos", "glaciares", "humedales"), usa la capa específica (ej: ['hidrografia'], ['glaciares'], ['humedales']).
8. Nunca inventes nombres de columnas. Si una tool falla por columna inválida, llama a get_layer_schema y reintenta.
9. Puedes invocar varias tools en la misma respuesta si la pregunta lo amerita.
10. SIEMPRE usa las tools para obtener datos reales. No inventes cifras.
11. Cita números concretos del resultado de las tools.

Reglas de formato de respuesta:
12. Responde en español, conciso.
13. Cuando el sistema te devuelva una agregación SIMPLE (resultado de aggregate_layer, aggregate_by_admin o aggregate_near_layer), el frontend YA dibuja un GRÁFICO con esos datos. En ese caso:
    - NO repitas la misma información como tabla markdown.
    - Redacta 2-4 frases de análisis: cuál es el máximo, el mínimo, la tendencia, y cualquier observación relevante.
    - Puedes mencionar los valores concretos en el texto, pero SIN volver a listarlos todos en formato tabla.
    IMPORTANTE: cuando la tool sea aggregate_by_admin_and_column (doble agrupación), el frontend NO dibuja gráfico. En ese caso, presenta los datos como tabla markdown agrupada por comuna, o como texto resumido con las categorías más relevantes.
14. Cuando los datos NO vengan de una agregación (por ejemplo, de get_layer_stats o query_layer) y quieras mostrarlos en formato tabular:
    - Usa tablas markdown estándar: | col1 | col2 |\\n|------|------|\\n| a | b |
    - NO uses tablas si son más de 6-7 filas; en su lugar, resume en texto.
15. NUNCA muestres la misma información como tabla Y como gráfico. Es redundante.
16. Cuando el resultado sea una lista simple, usa listas con viñetas (-) en lugar de tablas.
Reglas de gráficos:
17. IMPORTANTE: cuando la pregunta incluya "por comuna", "por provincia",
    "por región", "distribución por X", "cómo se distribuye", "en qué X
    hay más", "cuántos por X" (donde X es una columna o división admin),
    SIEMPRE usa aggregate_by_admin (o aggregate_by_admin_and_column si
    hay doble agrupación). NO uses get_layer_stats ni query_layer en
    esos casos.
18. Si la pregunta pide totales generales (ej: "¿cuántas lagunas hay en
    total?") pero además pide su distribución por algún campo, preferí
    hacer aggregate_by_admin o aggregate_layer. El frontend dibuja el
    gráfico automáticamente.
19. Si la pregunta pide múltiples análisis (ej: "distribución por provincia
    y por tipo"), podés llamar múltiples tools en una misma respuesta.
    El sistema genera un gráfico por cada agregación.
`;

// ── Reglas de lenguaje según modo verbose ─────────────────────
const VERBOSE_RULES = `
Reglas de estilo (MODO DESARROLLO — verbose activo):
15. Puedes mencionar los nombres técnicos de las herramientas (get_layer_stats, aggregate_by_admin, etc.) entre corchetes 【】.
16. Puedes mencionar los layer_id (ej: plantas_desaladoras_puntos) y nombres de columnas de la BD cuando aporten claridad.
17. Puedes explicar el razonamiento paso a paso: "primero consulté X, luego agrupé por Y".
`;

const NON_VERBOSE_RULES = `
Reglas de estilo (MODO PRODUCCIÓN — obligatorias):
15. NUNCA menciones los nombres técnicos de las herramientas (get_layer_stats, aggregate_by_admin, query_layer, etc.) ni uses notación con corchetes 【】.
16. NUNCA menciones los layer_id internos (ej: plantas_desaladoras_puntos, derechos_agua_2025). Usa SIEMPRE el nombre visible de la capa (ej: "Plantas Desaladoras", "Derechos de Agua").
17. NUNCA menciones nombres de columnas de la base de datos (ej: nom_comuna, COMUNA, POTENCIAMW). Usa etiquetas en español legibles (ej: "comuna", "potencia en MW").
18. NUNCA menciones "resultados de herramientas", "consultas a la base de datos", "RPCs", "PostGIS" ni términos técnicos de implementación.
19. Habla como un analista territorial: directo, claro, con los datos y las conclusiones. Como si hubieras consultado los datos manualmente.
20. Si necesitas referirte a una capa, usa su nombre visible del catálogo (columna display_name), no el layer_id.
`;

const SYSTEM_PROMPT =
  SYSTEM_PROMPT_BASE + (CHAT_VERBOSE ? VERBOSE_RULES : NON_VERBOSE_RULES);

  const SYNTHESIS_SYSTEM_PROMPT_BASE =
  "Eres el asistente del Visor Territorial Atacama. Redacta ahora la respuesta final al usuario " +
  "usando SOLO los resultados de las herramientas que aparecen en el historial. " +
  "Responde en español, conciso, citando cifras concretas. " +
  "Si una herramienta falló o no hay datos, explícalo y sugiere una capa alternativa.";

const SYNTHESIS_VERBOSE_RULES =
  " Puedes mencionar los nombres técnicos de las herramientas y los layer_id cuando aporten claridad.";

const SYNTHESIS_NON_VERBOSE_RULES =
  " IMPORTANTE: NO menciones herramientas, layer_id, nombres de columnas de la BD ni términos técnicos. " +
  "Usa los nombres visibles de las capas. Habla como un analista territorial.";

const SYNTHESIS_SYSTEM_PROMPT =
  SYNTHESIS_SYSTEM_PROMPT_BASE +
  (CHAT_VERBOSE ? SYNTHESIS_VERBOSE_RULES : SYNTHESIS_NON_VERBOSE_RULES);



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

  const full =
    SYSTEM_PROMPT + "\nCATÁLOGO DE CAPAS:\n" + lines.join("\n").slice(0, 12000);
  _cachedSystem = full;
  _cachedAt = Date.now();
  dbg(`system prompt regenerado (${catalog.length} capas)`);
  return full;
}


function buildSynthesisMessages(history) {
  const out = [];
  const toolResults = [];

  const flushTools = () => {
    if (toolResults.length === 0) return;
    out.push({
      role: "user",
      content: `Resultados de herramientas:\n\n${toolResults.join("\n\n")}`,
    });
    toolResults.length = 0;
  };

  for (const m of history) {
    if (m.role === "tool") {
      toolResults.push(`### ${m.name || "tool"}\n${m.content}`);
    } else if (m.role === "assistant") {
      if (m.tool_calls && m.tool_calls.length > 0) continue;
      flushTools();
      out.push({ role: "assistant", content: m.content || "" });
    } else if (m.role === "user") {
      flushTools();
      out.push({ role: "user", content: m.content || "" });
    }
  }
  flushTools();
  return out;
}

// ─────────────────────────────────────────────────────────────────
// Detección de chart
// ─────────────────────────────────────────────────────────────────

const PIE_MAX_GROUPS = 6;
const BAR_MAX_GROUPS = 20;
const MAX_CHART_SLICE = 10;

function deriveChartTitle(parsed, metric, groupBy) {
  const n = Math.min(MAX_CHART_SLICE, parsed.length);
  if (metric === "count") {
    return `Distribución por ${groupBy} (top ${n})`;
  }
  const metricLabel = { avg: "Promedio", sum: "Suma", min: "Mínimo", max: "Máximo" };
  const label = metricLabel[metric] || metric.toUpperCase();
  return `${label} por ${groupBy} (top ${n})`;
}

/**
 * Infiere el nombre "bonito" del campo de agrupación desde el tool_call
 * original: si fue `aggregate_by_admin`, es el admin_level; si fue
 * `aggregate_layer`, es el group_by.
 */
function inferAggregateMeta(history) {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== "assistant" || !Array.isArray(m.tool_calls)) continue;
    for (const tc of m.tool_calls) {
      const name = tc?.function?.name;
      if (name !== "aggregate_layer" && name !== "aggregate_by_admin") continue;
      try {
        const args =
          typeof tc.function.arguments === "string"
            ? JSON.parse(tc.function.arguments)
            : tc.function.arguments || {};
        const groupBy = name === "aggregate_by_admin"
          ? (args.admin_level || "grupo")
          : (args.group_by || "grupo");
        return {
          metric: args.metric || "count",
          groupBy,
        };
      } catch {
        /* ignore malformed args */
      }
    }
  }
  return { metric: "count", groupBy: "grupo" };
}

/**
 * Detecta TODOS los charts posibles desde el historial de tool_calls.
 *
 * Devuelve un array de charts (puede haber 0, 1 o varios).
 * Reconoce:
 *   - aggregate_layer: {group, value} → chart directo.
 *   - aggregate_by_admin: {group, value} → chart directo.
 *   - aggregate_near_layer: {group, value} → chart directo.
 *   - get_layer_stats: {attributes: [{attr, top_values}]} → charts de distribuciones.
 *   - get_layer_schema: {columns: [{name, top_values}]} → charts de distribuciones.
 *   - query_layer: filas con campos numéricos → chart de conteo simple.
 *
 * Cada tool puede generar 0, 1 o varios charts.
 */
// NOTA (Fase 3): este orquestador puede devolver MÚLTIPLES charts
// en el campo `charts` (array). El cliente HTTP (`api/chat.js`)
// normaliza a `chart` (singular) cuando hay exactamente 1, para
// compatibilidad con clientes antiguos.
function buildChartsFromHistory(history) {
  const charts = [];

  for (let i = 0; i < history.length; i++) {
    const m = history[i];
    if (m.role !== "tool") continue;

    const toolName = m.name;

    let parsed;
    try {
      parsed = typeof m.content === "string" ? JSON.parse(m.content) : m.content;
    } catch {
      continue;
    }

    // ── Tools de agregación directa: {group, value} ──
    if (
      toolName === "aggregate_layer" ||
      toolName === "aggregate_by_admin" ||
      toolName === "aggregate_near_layer"
    ) {
      const chart = buildChartFromAggregate(toolName, parsed, history);
      if (chart) charts.push(chart);
      continue;
    }

    // ── get_layer_stats: atributos con top_values ──
    if (toolName === "get_layer_stats" && parsed && typeof parsed === "object") {
      const stats = Array.isArray(parsed) ? parsed[0] : parsed;
      if (stats?.attributes && Array.isArray(stats.attributes)) {
        // Tomamos el atributo con más top_values (el más informativo)
        const bestAttr = stats.attributes
          .filter((a) => Array.isArray(a.top_values) && a.top_values.length >= 2)
          .sort((a, b) => (b.top_values?.length || 0) - (a.top_values?.length || 0))[0];

        if (bestAttr) {
          const chart = buildChartFromTopValues(
            bestAttr.attr,
            bestAttr.top_values,
            stats.display_name
          );
          if (chart) charts.push(chart);
        }
      }
      continue;
    }

    // ── get_layer_schema: columnas con top_values ──
    if (toolName === "get_layer_schema" && parsed && typeof parsed === "object") {
      const schema = Array.isArray(parsed) ? parsed[0] : parsed;
      if (schema?.columns && Array.isArray(schema.columns)) {
        const bestCol = schema.columns
          .filter((c) => Array.isArray(c.top_values) && c.top_values.length >= 2)
          .sort((a, b) => (b.top_values?.length || 0) - (a.top_values?.length || 0))[0];

        if (bestCol) {
          const chart = buildChartFromTopValues(
            bestCol.name,
            bestCol.top_values,
            schema.layer_id
          );
          if (chart) charts.push(chart);
        }
      }
      continue;
    }

    // ── query_layer: muchas filas → contar por el campo más repetido ──
    if (toolName === "query_layer" && Array.isArray(parsed) && parsed.length >= 3) {
      const chart = buildChartFromRows(parsed);
      if (chart) charts.push(chart);
      continue;
    }
  }

  return charts;
}

/**
 * Construye un chart desde el resultado de una tool de agregación
 * (aggregate_layer, aggregate_by_admin, aggregate_near_layer).
 *
 * Formato esperado: [{group, value}, ...]
 */
function buildChartFromAggregate(toolName, parsed, history) {
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  if (typeof parsed[0] !== "object" || !("group" in parsed[0]) || !("value" in parsed[0])) {
    return null;
  }

  const { metric, groupBy } = inferAggregateMeta(history);
  const totalGroups = parsed.length;
  const sliced = parsed.slice(0, MAX_CHART_SLICE);

  let type = "bar";
  if (totalGroups <= PIE_MAX_GROUPS) type = "pie";
  else if (totalGroups > BAR_MAX_GROUPS) type = "horizontalBar";

  return {
    type,
    title: deriveChartTitle(parsed, metric, groupBy),
    labels: sliced.map((r) => String(r.group)),
    values: sliced.map((r) => Number(r.value)),
    totalGroups,
  };
}

/**
 * Construye un chart desde top_values de un atributo.
 *
 * Formato esperado: [{value, count, pct}, ...]
 *
 * @param {string} attrName - Nombre del atributo.
 * @param {Array} topValues - Lista de top values.
 * @param {string} [contextName] - Nombre visible de la capa (para el título).
 */
function buildChartFromTopValues(attrName, topValues, contextName = null) {
  if (!Array.isArray(topValues) || topValues.length < 2) return null;

  const labels = topValues.map((t) => String(t.value ?? t.group ?? "?"));
  const values = topValues.map((t) => Number(t.count ?? t.value ?? 0));

  if (values.every((v) => v === 0)) return null;

  const totalGroups = topValues.length;
  let type = "bar";
  if (totalGroups <= PIE_MAX_GROUPS) type = "pie";
  else if (totalGroups > BAR_MAX_GROUPS) type = "horizontalBar";

  const titlePrefix = contextName ? `${contextName}: ` : "";
  const title = `${titlePrefix}Distribución por ${attrName} (top ${totalGroups})`;

  return {
    type,
    title,
    labels,
    values,
    totalGroups,
  };
}

/**
 * Construye un chart desde filas concretas de query_layer.
 *
 * Idea: encontrar la columna categórica con más repeticiones y contar.
 * Si no hay categórica clara, devolver null.
 */
function buildChartFromRows(rows) {
  if (!Array.isArray(rows) || rows.length < 3) return null;

  // Detectar columnas del primer row
  const first = rows[0];
  if (!first || typeof first !== "object") return null;

  const columns = Object.keys(first);

  // Para cada columna, calcular "cuántas veces se repite el valor más común".
  // La columna con mejor ratio (más repetida y con pocos valores únicos) gana.
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

    // Criterio: al menos 2 valores únicos, y el más común aparece ≥ 2 veces.
    // Preferimos columnas con pocos valores únicos (categóricas).
    if (uniqueCount < 2 || maxCount < 2) continue;
    if (uniqueCount > 20) continue; // demasiado única (es un ID)

    const score = maxCount / uniqueCount; // cuánto "concentra" la moda
    if (!best || score > best.score) {
      best = { col, valueCounts, score };
    }
  }

  if (!best) return null;

  const entries = Array.from(best.valueCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CHART_SLICE);

  const labels = entries.map(([v]) => v);
  const values = entries.map(([, c]) => c);
  const totalGroups = best.valueCounts.size;

  let type = "bar";
  if (totalGroups <= PIE_MAX_GROUPS) type = "pie";
  else if (totalGroups > BAR_MAX_GROUPS) type = "horizontalBar";

  return {
    type,
    title: `Distribución por ${best.col} (top ${labels.length})`,
    labels,
    values,
    totalGroups,
  };
}

/**
 * Ejecuta el ciclo: rondas de tools + síntesis forzada.
 */
export async function runOrchestrator({ text, history = [], sessionId = null }) {
  const budgetMs =
    Number(process.env.ORCHESTRATOR_BUDGET_MS) || DEFAULT_BUDGET_MS;
  const maxIterations =
    Number(process.env.ORCHESTRATOR_MAX_ITERATIONS) || DEFAULT_MAX_ITERATIONS;

  if (maxIterations < 1) {
    throw new Error("ORCHESTRATOR_MAX_ITERATIONS debe ser >= 1");
  }

  const deadline = Date.now() + budgetMs;

  const llm = await getLLM();
  const system = await buildSystemPrompt();

  dbg(
    `budget=${budgetMs}ms maxIterations=${maxIterations} model=${process.env.LLM_MODEL}`
  );

  const messages = [];
  for (const h of history.slice(-3)) {
    if (h && (h.role === "user" || h.role === "assistant")) {
      messages.push({ role: h.role, content: String(h.content || "") });
    }
  }
  messages.push({ role: "user", content: String(text || "").trim() });

  let iterations = 0;

  while (iterations < maxIterations && Date.now() < deadline) {
  iterations += 1;

  let response;
  try {
    response = await llm.chat({
      system,
      messages,
      tools: TOOL_DEFINITIONS,
      toolChoice: "auto",
      sessionId,
    });
  } catch (err) {
    console.error(
      `[orchestrator] LLM call failed (iteración ${iterations}):`,
      err?.message || err,
      err?.stack || ""
    );
    throw err;
  }

    if (!response.toolCalls || response.toolCalls.length === 0) {
      dbg(`iteración ${iterations}: respuesta directa (sin tool_calls)`);
      const reply = (response.content || "Sin respuesta.").trim();
      return { reply, chart: buildChartsFromHistory(messages), geojson: null };
    }

    dbg(
      `iteración ${iterations}: ${response.toolCalls.length} tool_call(s):`,
      response.toolCalls
        .map((tc) => `${tc.name}(${JSON.stringify(tc.arguments)})`)
        .join(" | ")
    );

    messages.push({
      role: "assistant",
      content: response.content || "",
      tool_calls: response.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    });

    const toolResults = await Promise.all(
      response.toolCalls.map(async (tc) => ({
        tc,
        out: await runTool(tc.name, tc.arguments),
      }))
    );

    for (const { tc, out } of toolResults) {
      const payload = out.ok ? out.result : { error: out.error };
      dbg(
        `tool ${tc.name} → ${out.ok ? "ok" : "ERROR: " + out.error} | ` +
          `resultado: ${JSON.stringify(payload).slice(0, 200)}`
      );
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        name: tc.name,
        content: JSON.stringify(payload),
      });
    }
  }

  if (Date.now() < deadline) {
    try {
      const remaining = Math.max(500, deadline - Date.now());
      dbg(
        `síntesis forzada: timeout=${remaining}ms`
      );
      const final = await llm.chat({
        system: SYNTHESIS_SYSTEM_PROMPT,
        messages: buildSynthesisMessages(messages),
        signal: AbortSignal.timeout(remaining),
        sessionId,
      });
      const reply = (final.content || "").trim();
      if (reply) {
        dbg(`síntesis forzada OK: ${reply.slice(0, 120)}...`);
        return {
          reply,
          chart: buildChartsFromHistory(messages),
          geojson: null,
        };
      }
    } catch (err) {
      dbg("síntesis forzada FALLÓ:", err?.message || err);
    }
  } else {
    dbg("presupuesto agotado antes de la síntesis forzada");
  }

    return {
    reply:
      "No pude generar la respuesta a tiempo. Reformula con una pregunta más específica.",
    charts: buildChartsFromHistory(messages),
    geojson: null,
  };
}