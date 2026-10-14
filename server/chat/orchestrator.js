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

REGLAS (21):

1. ACTÚA DIRECTO. La primera acción SIEMPRE es llamar a la tool
   correcta. NO revises el esquema ni hagas consultas exploratorias
   antes de actuar.

2. Para "¿cuántos X por comuna?" llama a aggregate_by_admin
   DIRECTAMENTE. Sin pasos intermedios.

3. Usa las columnas que aparecen en el catálogo entre {}. Están
   verificadas contra la base de datos real.

4. SOLO usa get_layer_schema si TODAS las tools fallaron por
   columna inválida. NO la uses antes de intentar.

5. Responde en español, con nivel de detalle según la pregunta:
   - Pregunta simple (conteo, ubicación): 2-4 frases.
   - Pregunta compleja (comparación, cruce de capas): hasta 10
     frases, con análisis estructurado.

6. Cita cifras concretas. Nunca inventes números.

7. Si el frontend dibuja un gráfico (agregaciones simples), NO repitas
   la tabla markdown. Escribe solo el análisis.

8. Presentación tabular:
   - Si NO hay gráfico (query_layer, get_layer_stats), muestra tabla
     markdown con máximo 6 filas.
   - Si la tool fue aggregate_by_admin_and_column (doble agrupación),
     presenta los datos como tabla markdown agrupada.
   - Si la pregunta es de análisis multi-capa, combina:
     (a) tabla markdown con datos clave,
     (b) análisis en 4-8 frases.

9. Número de tool calls:
   - Preguntas simples: hasta 2 tools.
   - Preguntas complejas (comparaciones, cruces): hasta 4 tools.
   - Si necesitas más de 4, pidele al usuario que acote.

10. Si una tool falla, dilo explícitamente y sugiere alternativa.

11. NO menciones nombres técnicos de tools ni layer_ids internos.
    Usa los nombres visibles de las capas.

12. Habla como analista territorial: directo, claro, con conclusiones.

13. GEOMETRÍAS PARA EL MAPA — get_layer_features:
    - Úsala cuando la pregunta pida VER elementos ubicados:
      "¿dónde están X?", "muéstrame X en el mapa", "ubicación de X".
    - SIEMPRE que uses get_layer_features, llamá TAMBIÉN a
      aggregate_by_admin con group_by="comuna" para generar el
      gráfico de distribución.
    - Acepta filtros: {"comuna": "Copiapó"}.
    - Máximo 500 features (por defecto).
    - La herramienta devuelve las geometrías; el SISTEMA las pintará
      automáticamente en el mapa.
    - SÍ debes mencionar que los elementos están disponibles en el mapa,
      pero SIN decir "he pintado" ni "he cargado" (eso lo hace el sistema).
    - Ejemplo de respuesta:
      ✅ "Recuperé las 7 plantas desaladoras de la región. Podés ver
         su ubicación exacta en el mapa."
      ✅ "Las 7 plantas están disponibles en el mapa para su
         visualización."
      ❌ "He cargado las 7 plantas en el mapa."
      ❌ "He pintado los puntos en el mapa."

14. DIFERENCIA query_layer vs get_layer_features:
    - query_layer: LISTADO para análisis tabular. No pinta mapa.
    - get_layer_features: UBICACIÓN visual. Pinta en el mapa.
    - "¿cuáles son los X?" → query_layer.
    - "¿dónde están los X?" → get_layer_features.

15. Cuando uses get_layer_features, el reply debe:
    - Describir cuántos elementos se pintaron.
    - Mencionar filtros aplicados (comuna, provincia, etc.).
    - NO listar coordenadas.

16. Los nombres de columnas son CASE-SENSITIVE y están en MAYÚSCULAS.
    Usa "TIPO" no "tipo". Usa "COMUNA" no "comuna".

17. PRECISIÓN EN EL CONTEO:
    Las filas de la base de datos son REGISTROS o GEOMETRÍAS, no
    necesariamente objetos únicos.

    Ejemplo:
    - ❌ "Hay 380 glaciares en Alto del Carmen"
    - ✅ "Hay 380 polígonos de glaciares en Alto del Carmen"

    Aplica "puntos", "líneas", "polígonos" o "registros" según la
    geometría. Si el usuario pide un conteo exacto de objetos,
    aclará: "La base registra N polígonos; el número de objetos
    únicos puede ser menor".

18. CONTEXTO DEL HISTORIAL:
    Si el historial muestra que intentaste responder una pregunta
    fuera de dominio (con un mensaje como "No puedo responder esa
    pregunta"), NO respondas esa pregunta en el turno actual. Ignorá
    ese turno previo. Respondé SOLO la pregunta actual del usuario.

19. PREGUNTAS "POR <CAMPO>" CON ELEMENTOS:
    Si el usuario pregunta "¿cuántos X por <campo>?" o "muéstrame
    los X por <campo>", llama a DOS tools:
      (a) Para el conteo:
          - aggregate_by_admin si <campo> es comuna/provincia/región.
          - aggregate_layer si <campo> es otro (tipo, uso, estado, etc.).
      (b) get_layer_features con layer_id Y color_by=<campo>
          (para pintar los elementos, coloreados por ese campo).
    Ejemplos:
      "¿Cuántos glaciares por comuna?"  → color_by="COMUNA"
      "¿Cuántos glaciares por tipo?"    → color_by="TIPO"
      "Distribución de humedales por clasificación"
                                        → color_by="CLASIFICACION"
      "Muéstrame los yacimientos por estado"
                                        → color_by="ESTADO"
    El frontend coloreará cada elemento según ese campo.

20. LISTADOS CON PINTADO EN MAPA:
    Cuando el usuario pregunte "¿cuáles son los X?" o "lista
    los X" o "muéstrame los X" y la respuesta incluya elementos
    concretos (nombres, IDs, ubicaciones), llama a DOS tools:
      (a) query_layer para obtener la tabla/lista.
      (b) get_layer_features con el mismo layer_id para pintar
          los elementos en el mapa.
    Ejemplos:
      "¿Cuáles son los yacimientos?"         → query_layer + get_layer_features
      "¿Cuáles son las plantas desaladoras?" → query_layer + get_layer_features
      "¿Cuáles son los humedales?"           → query_layer + get_layer_features
      "Lista los derechos de agua"            → query_layer + get_layer_features
    El usuario espera VER los elementos en el mapa además de la lista.
    - Si la pregunta incluye FILTROS explícitos ("solo los consuntivos",
      "de la cuenca Copiapó", "en la comuna de Caldera"), pasá esos
      filtros a get_layer_features en el parámetro 'filters'.
    - Ejemplo: "Dame los derechos de agua de la cuenca Copiapó pero
      solo los consuntivos" → get_layer_features con
      filters={"Cuenca": "Copiapó", "Tipo Derecho": "Consuntivo"}.

  21. VOCABULARIO:
    - Usa "desaladora" (no "desalinizadora") cuando hables de plantas
      desaladoras.
    - Usa "derechos de agua" (no "derechos de aprovechamiento" en el
      cuerpo principal; podés mencionarlo una vez).
    - Usa "glaciares" (no "cuerpos de hielo").

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

  const catalogBlock = lines.join("\n")
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
 * Detecta si el usuario pidió colorear los elementos por algún campo.
 *
 * Prioridad:
 *   1. Si el LLM pasó color_by a get_layer_features, usar ese campo.
 *   2. Si la pregunta menciona "por comuna/provincia/región", usar el
 *      campo administrativo correspondiente.
 *   3. Si la pregunta menciona "por <campo>" con un campo del catálogo,
 *      usar ese campo (heurística por regex).
 *   4. Si nada matchea, null.
 *
 * Devuelve { attribute, kind, palette } o null.
 */
function detectStyleHint(userText, ctx) {
  // 1. Prioridad: color_by que el LLM ya pasó a la tool.
  if (ctx && ctx.lastColorBy) {
    return {
      attribute: ctx.lastColorBy,
      kind: "choropleth-points",
      palette: null,
    };
  }

  if (!userText || typeof userText !== "string") return null;
  const t = userText.toLowerCase();

  // 2. Fallback determinístico: "por comuna/provincia/región".
  const adminMatch = t.match(
    /\bpor\s+(comuna|comunas|provincia|provincias|regi[oó]n|regiones)\b/
  );
  if (adminMatch) {
    const word = adminMatch[1];
    const attribute =
      word.startsWith("comun") ? "COMUNA"
      : word.startsWith("provinc") ? "PROVINCIA"
      : "REGION";
    return { attribute, kind: "choropleth-points", palette: null };
  }

  // 3. Fallback genérico: "por <campo>" (cualquier campo).
  const genericMatch = t.match(/\bpor\s+([a-záéíóúñ_]{3,30})\b/);
  if (genericMatch) {
    const raw = genericMatch[1];
    // Ignorar palabras comunes que no son campos.
    const stopwords = new Set([
      "favor", "ejemplo", "ahora", "favor", "default",
      "comuna", "provincia", "region", "parte", "tipo",
    ]);
    if (!stopwords.has(raw)) {
      // Convertir a mayúsculas (los campos del catálogo están en mayúsculas).
      const attribute = raw.toUpperCase();
      return { attribute, kind: "choropleth-points", palette: null };
    }
  }

  return null;
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
    // Si hay 2+ columnas categóricas (ej. {admin, group, value})
    if (data.length > 0 && isGroupValueArray(data)) {
      const first = data[0];
      const categoricalKeys = Object.keys(first).filter(
        (k) => k !== "value" && k !== "count" && k !== "total"
      );
      if (categoricalKeys.length >= 2) {
        return [];
      }
      const chart = buildChartFromGroupValue(data);
      return chart ? [chart] : [];
    }

        // A.2 — [{value, count}, ...] → chart de top values
    if (data.length > 1 && isValueCountArray(data)) {
      const first = data[0];
      const categoricalKeys = Object.keys(first).filter(
        (k) => k !== "value" && k !== "count" && k !== "total"
      );
      if (categoricalKeys.length >= 2) {
        return [];
      }
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


  let step = 0;
  while (true) {
    step += 1;
    const isLast =
      step >= maxSteps || Date.now() > deadline - RESERVE_MS;

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
        break; // OK, salir del retry.
      } catch (err) {
        const isRetryable = err?.retryable === true;
        const hasRetriesLeft = attempt < MAX_RETRIES;

        if (isRetryable && hasRetriesLeft) {
          const delayMs = 1000 * Math.pow(2, attempt); // 1s, 2s
          console.warn(
            `[orchestrator] LLM 503 (intento ${attempt + 1}/${MAX_RETRIES + 1}). ` +
              `Reintentando en ${delayMs}ms...`
          );
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        // No retryable o sin reintentos: fallar.
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

        // ── Salida: el LLM no pidió más tools ─────────────────────
    if (!response.toolCalls || response.toolCalls.length === 0) {
      dbg(`step ${step}: sin tool_calls → salida`);

      // Post-procesamiento determinístico: si el usuario pidió
      // "por comuna + elementos" y el LLM no llamó a
      // get_layer_features, la llamamos nosotros.
      await maybeFetchFeaturesForStyle(ctx, text);

      return await finish(response.content, ctx, messages, text);
    }

    // ── Tool calls: guardar turno del asistente ───────────────
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

        // ── Ejecutar tools en paralelo ────────────────────────────
    const toolResults = await Promise.all(
      response.toolCalls.map(async (tc) => ({
        tc,
        out: await runTool(tc.name, tc.arguments),
      }))
    );

for (const { tc, out } of toolResults) {
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
  if (tc.name === "aggregate_by_admin_and_column" && out.ok) {  // ← AGREGAR
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

/**
 * Detecta si la pregunta requiere forzar get_layer_features.
 * Casos:
 *   - "por comuna/provincia/región" + elementos → detectStyleHint.
 *   - "¿cuáles son los X?" / "lista los X" → listado con pintado.
 */
function shouldFetchFeatures(userText, ctx) {
  if (!userText || typeof userText !== "string") return false;

  // Caso A: color_by explícito en una tool previa.
  if (ctx && ctx.lastColorBy) return true;

  const t = userText.toLowerCase();

  // Caso B: verbos explícitos de visualización.
  if (/\bmu[eé]strame\b|\bd[oó]nde\s+est[aá]n\b|\bubicaci[oó]n\s+de\b|\ben\s+el\s+mapa\b/.test(t)) {
    return true;
  }

  // Caso C: "por <campo>" categórico (tipo, clasificación, uso, estado, etc.).
  if (/\bpor\s+(tipo|clasificaci[oó]n|uso|estado|categor[ií]a|naturaleza|fuente)\b/.test(t)) {
    return true;
  }

  // Caso D: "por comuna/provincia/región" PERO con historial previo
  // (acumulación de capas, no pregunta aislada).
  if (/\bpor\s+(comuna|provincia|regi[oó]n)\b/.test(t)) {
    if (ctx && (ctx.lastAggregateLayerId || ctx.lastQueryLayerId)) {
      return true;
    }
  }

  return false;
}

function inferLayerIdFromText(userText) {
  if (!userText || typeof userText !== "string") return null;
  const t = userText.toLowerCase();

  // Mapeo de palabras clave a layer_id.
  const mappings = [
    { keywords: ["humedal", "humedales"], layerId: "humedales" },
    { keywords: ["glaciar", "glaciares"], layerId: "glaciares" },
    { keywords: ["derecho", "derechos de agua"], layerId: "derechos_agua_2025" },
    { keywords: ["yacimiento", "yacimientos"], layerId: "yacimientos" },
    { keywords: ["volcán", "volcanes"], layerId: "volcanes_activos" },
    { keywords: ["planta desaladora", "plantas desaladoras", "desaladora", "desaladoras"], layerId: "plantas_desaladoras_puntos" },
    { keywords: ["laguna", "lagunas"], layerId: "lagunas_embalses" },
    { keywords: ["salar", "salares"], layerId: "salares" },
    { keywords: ["relave", "relaves"], layerId: "relaves_mineros_sernageomin" },
  ];

  for (const { keywords, layerId } of mappings) {
    if (keywords.some((kw) => t.includes(kw))) {
      return layerId;
    }
  }
  return null;
}

async function maybeFetchFeaturesForStyle(ctx, userText) {
  const shouldFetch = shouldFetchFeatures(userText, ctx);
  if (!shouldFetch) return;

  // Fallback: si no hay lastLayerId, inferirlo del texto.
  let lastLayerId = ctx.lastAggregateLayerId || ctx.lastQueryLayerId;
  if (!lastLayerId) {
    lastLayerId = inferLayerIdFromText(userText);
    if (lastLayerId) {
      dbg(`maybeFetchFeaturesForStyle: lastLayerId inferido del texto = ${lastLayerId}`);
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

  dbg(`maybeFetchFeaturesForStyle: forzando get_layer_features(${lastLayerId}, color_by=${colorBy})`);

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
      dbg(`maybeFetchFeaturesForStyle: OK, ${r.features.length} features guardadas`);
      
      // ← AGREGAR: setear ctx.lastColorBy para que detectStyleHint lo use.
      if (colorBy) {
        ctx.lastColorBy = colorBy;
        dbg(`maybeFetchFeaturesForStyle: ctx.lastColorBy = ${colorBy}`);
      }
    }
  } catch (err) {
    dbg(`maybeFetchFeaturesForStyle: excepción: ${err?.message || err}`);
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

async function finish(reply, ctx, messages, userText = "") {
  const { layers: geojsonLayers, truncated } = await buildGeojsonLayersFromCtx(ctx, userText);
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
        }
      : null,
    geojson_layers: geojsonLayers,
    notice: truncated ? `Mostrando ${truncated.shown} de ${truncated.total} resultados en el mapa.` : null,
  };
}

async function buildGeojsonLayersFromCtx(ctx, userText) {
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

    // ← USAR total_count si está disponible.
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