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
// Detección de geojson (agnóstica de la tool)
// ─────────────────────────────────────────────────────────────────

const MAX_GEOJSON_FEATURES = 500;

/**
 * Recorre el historial de tools buscando FeatureCollections.
 * Fusiona múltiples colecciones respetando el tope de 500 features.
 * Devuelve { geojson, total, shown, truncated } o null si no hay ninguna.
 */
function buildGeojsonFromHistory(history) {
  if (!CHAT_GEOJSON_ENABLED) return null;

  const allFeatures = [];

  for (const m of history) {
    if (m.role !== "tool") continue;

    let parsed;
    try {
      parsed = typeof m.content === "string" ? JSON.parse(m.content) : m.content;
    } catch {
      continue;
    }

    // Desenvolver wrappers de PostgREST
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).length === 1
    ) {
      const key = Object.keys(parsed)[0];
      if (parsed[key] && typeof parsed[key] === "object") {
        parsed = parsed[key];
      }
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.type === "FeatureCollection" &&
      Array.isArray(parsed.features)
    ) {
      for (const f of parsed.features) {
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
  const charts = [];

  for (const m of history) {
    if (m.role !== "tool") continue;

    let parsed;
    try {
      parsed = typeof m.content === "string" ? JSON.parse(m.content) : m.content;
    } catch {
      continue;
    }

    // LOG DE DIAGNÓSTICO
    if (DEBUG) {
      console.log(
        `[charts] tool="${m.name}" | tipo=${Array.isArray(parsed) ? "array" : typeof parsed} | ` +
        `preview=${JSON.stringify(parsed).slice(0, 300)}`
      );
    }
    // FIN LOG

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "error" in parsed) {
      continue;
    }

    const toolCharts = extractChartableData(parsed, m.name);

    // LOG DE DIAGNÓSTICO
    if (DEBUG) {
      console.log(`[charts] ${m.name} → ${toolCharts.length} chart(s) generado(s)`);
    }
    // FIN LOG

    for (const chart of toolCharts) {
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
    if (data.length >= 3 && isRowArray(data)) {
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
    if (Array.isArray(data.columns)) {
      for (const col of data.columns) {
        if (!Array.isArray(col.top_values) || col.top_values.length < 2) continue;
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
    const t1 = Date.now();
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
        const l1Ms = Date.now() - t1;
    console.log(
      `[orchestrator] L1: ${l1Ms}ms | ` +
      `content_len=${(response.content || "").length} | ` +
      `tool_calls=${response.toolCalls?.length || 0} | ` +
      `content_preview=${JSON.stringify((response.content || "").slice(0, 100))}`
    );

    if (!response.toolCalls || response.toolCalls.length === 0) {
      dbg(`iteración ${iterations}: respuesta directa (sin tool_calls)`);
      const reply = (response.content || "Sin respuesta.").trim();

      const geojsonMeta = buildGeojsonFromHistory(messages);
      return {
        reply,
        charts: buildChartsFromHistory(messages),
        geojson: geojsonMeta ? geojsonMeta.geojson : null,
        notice: buildNoticeFromGeojson(geojsonMeta),
      };
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

      // ── CA-10: el LLM NO debe ver las geometrías ──────────
      // El geojson viaja en la respuesta final al frontend, pero
      // NO se envía al LLM: infla tokens y no aporta al razonamiento.
      // Los metadatos (total/shown/truncated) sí se conservan para
      // que el LLM pueda informar el recorte.
      let contentForLLM = payload;
      if (
        payload &&
        typeof payload === "object" &&
        !Array.isArray(payload)
      ) {
        const { geojson, ...rest } = payload;
        if (geojson) {
          
          contentForLLM = rest;
          if (Array.isArray(geojson.features)) {
            contentForLLM._geojson_hidden = {
              feature_count: geojson.features.length,
            };
          }
        }
      }

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        name: tc.name,
        content: JSON.stringify(contentForLLM),
      });
    }

  if (Date.now() < deadline) {
    try {
      const remaining = Math.max(500, deadline - Date.now());
      dbg(`síntesis forzada: timeout=${remaining}ms`);

      const t2 = Date.now();
      const final = await llm.chat({
        system: SYNTHESIS_SYSTEM_PROMPT,
        messages: buildSynthesisMessages(messages),
        signal: AbortSignal.timeout(remaining),
        sessionId,
      });
      const l2Ms = Date.now() - t2;

      // ── Instrumentación temporal: L2 ────────────────────────
      console.log(
        `[orchestrator] L2: ${l2Ms}ms | content_len=${(final.content || "").length}`
      );
      // ────────────────────────────────────────────────────────

      const reply = (final.content || "").trim();
      if (reply) {
        dbg(`síntesis forzada OK: ${reply.slice(0, 120)}...`);

        const geojsonMeta = buildGeojsonFromHistory(messages);
        return {
          reply,
          charts: buildChartsFromHistory(messages),
          geojson: geojsonMeta ? geojsonMeta.geojson : null,
          notice: buildNoticeFromGeojson(geojsonMeta),
        };
      }
    } catch (err) {
      dbg("síntesis forzada FALLÓ:", err?.message || err);
    }
  } else {
    console.log(
      `[orchestrator] L2 SALTED: presupuesto agotado antes de la síntesis`
    );
    dbg("presupuesto agotado antes de la síntesis forzada");
  }

  const geojsonMeta = buildGeojsonFromHistory(messages);
  return {
    reply:
      "No pude generar la respuesta a tiempo. Reformula con una pregunta más específica.",
    charts: buildChartsFromHistory(messages),
    geojson: geojsonMeta ? geojsonMeta.geojson : null,
    notice: buildNoticeFromGeojson(geojsonMeta),
  };
}
}