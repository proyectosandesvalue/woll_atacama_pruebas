/**
 * Detección de charts desde el historial de tool_calls.
 *
 * Agnóstico de la tool: no importa QUÉ tool produjo los datos.
 * Importa la FORMA del resultado. Si es graficable, se genera un chart.
 */

const PIE_MAX_GROUPS = 6;
const BAR_MAX_GROUPS = 20;
const MAX_CHART_SLICE = 10;

export function buildChartsFromHistory(history) {
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

function extractChartableData(data, toolName) {
  if (data == null) return [];

  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data);
      return extractChartableData(parsed, toolName);
    } catch {
      return [];
    }
  }

  if (Array.isArray(data)) {
    if (data.length === 1 && Array.isArray(data[0])) {
      return extractChartableData(data[0], toolName);
    }

    if (data.length > 0 && isGroupValueArray(data)) {
      const first = data[0];
      const categoricalKeys = Object.keys(first).filter(
        (k) => k !== "value" && k !== "count" && k !== "total"
      );
      if (categoricalKeys.length >= 2) return [];
      const chart = buildChartFromGroupValue(data);
      return chart ? [chart] : [];
    }

    if (data.length > 1 && isValueCountArray(data)) {
      const first = data[0];
      const categoricalKeys = Object.keys(first).filter(
        (k) => k !== "value" && k !== "count" && k !== "total"
      );
      if (categoricalKeys.length >= 2) return [];
      const chart = buildChartFromValueCount(data, "distribución");
      return chart ? [chart] : [];
    }

    if (data.length >= 3 && isRowArray(data)) {
      const first = data[0];
      const categoricalKeys = Object.keys(first).filter(
        (k) => k !== "value" && k !== "count" && k !== "total"
      );
      if (categoricalKeys.length >= 2) return [];
      const chart = buildChartFromRows(data, toolName);
      return chart ? [chart] : [];
    }
    return [];
  }

  if (typeof data === "object") {
    const charts = [];

    const keys = Object.keys(data);
    if (keys.length === 1) {
      const onlyValue = data[keys[0]];
      if (Array.isArray(onlyValue) || (onlyValue && typeof onlyValue === "object")) {
        return extractChartableData(onlyValue, toolName);
      }
    }

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

          const firstCount = Number(col.top_values[0]?.count || 0);
          if (firstCount / total > 0.9) return false;

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

    if (Array.isArray(data.data)) {
      const nested = extractChartableData(data.data, toolName);
      for (const chart of nested) charts.push(chart);
    }

    if (Array.isArray(data[toolName])) {
      const nested = extractChartableData(data[toolName], toolName);
      for (const chart of nested) charts.push(chart);
    }

    return charts;
  }

  return [];
}

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
  if ("group" in first && "value" in first) return false;
  if ("value" in first && "count" in first) return false;
  return true;
}

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